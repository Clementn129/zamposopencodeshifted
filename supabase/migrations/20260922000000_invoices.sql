-- =====================================================
-- Invoicing feature
-- =====================================================

-- 1. Status enum
DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Delivery notes get an 'invoiced' status so converting a delivery note to an
-- invoice marks the source (PG12+: enum values can be added; only referenced
-- inside function bodies below, not used in this same transaction).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'delivery_note_status' AND e.enumlabel = 'invoiced'
  ) THEN
    ALTER TYPE public.delivery_note_status ADD VALUE 'invoiced';
  END IF;
END $$;

-- 2. invoices table
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  offline_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_tpin TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  issued_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_method TEXT,
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  delivery_note_id UUID REFERENCES public.delivery_notes(id) ON DELETE SET NULL,
  converted_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 3. invoice_items table
CREATE TABLE public.invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Indexes
CREATE INDEX idx_invoices_business ON public.invoices(business_id, created_at DESC);
CREATE INDEX idx_invoices_status ON public.invoices(business_id, status);
CREATE INDEX idx_invoices_number ON public.invoices(business_id, invoice_number);
CREATE INDEX idx_invoices_offline_id ON public.invoices(business_id, offline_id);
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- 5. Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies — invoices (member select/insert/update, owner delete)
DROP POLICY IF EXISTS "Members can view invoices" ON public.invoices;
CREATE POLICY "Members can view invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can insert invoices" ON public.invoices;
CREATE POLICY "Members can insert invoices"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can update invoices" ON public.invoices;
CREATE POLICY "Members can update invoices"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Owners can delete invoices" ON public.invoices;
CREATE POLICY "Owners can delete invoices"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

-- 7. RLS policies — invoice_items (scoped via parent invoice -> business_id)
DROP POLICY IF EXISTS "Members can view invoice items" ON public.invoice_items;
CREATE POLICY "Members can view invoice items"
  ON public.invoice_items FOR SELECT
  TO authenticated
  USING (public.is_business_member((
    SELECT i.business_id FROM public.invoices i WHERE i.id = invoice_id
  )));

DROP POLICY IF EXISTS "Members can insert invoice items" ON public.invoice_items;
CREATE POLICY "Members can insert invoice items"
  ON public.invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_member((
    SELECT i.business_id FROM public.invoices i WHERE i.id = invoice_id
  )));

DROP POLICY IF EXISTS "Members can update invoice items" ON public.invoice_items;
CREATE POLICY "Members can update invoice items"
  ON public.invoice_items FOR UPDATE
  TO authenticated
  USING (public.is_business_member((
    SELECT i.business_id FROM public.invoices i WHERE i.id = invoice_id
  )))
  WITH CHECK (public.is_business_member((
    SELECT i.business_id FROM public.invoices i WHERE i.id = invoice_id
  )));

DROP POLICY IF EXISTS "Owners can delete invoice items" ON public.invoice_items;
CREATE POLICY "Owners can delete invoice items"
  ON public.invoice_items FOR DELETE
  TO authenticated
  USING (public.owns_business((
    SELECT i.business_id FROM public.invoices i WHERE i.id = invoice_id
  )));

-- 8. updated_at trigger
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Generate invoice number (INV-YYYY-NNNN, per business, per year)
CREATE OR REPLACE FUNCTION public.generate_invoice_number(biz_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_year TEXT;
  next_seq INTEGER;
  new_number TEXT;
BEGIN
  current_year := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(invoice_number FROM 'INV-' || current_year || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM public.invoices
  WHERE business_id = biz_id
    AND invoice_number LIKE 'INV-' || current_year || '-%';

  new_number := 'INV-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
  RETURN new_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invoice_number(uuid) TO authenticated;

-- 10. Atomic create invoice with items (single RPC)
CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
  p_business_id UUID,
  p_header JSONB,
  p_items JSONB,
  p_offline_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
  v_number TEXT;
  v_item JSONB;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_number := public.generate_invoice_number(p_business_id);

  INSERT INTO public.invoices (
    business_id, invoice_number, offline_id,
    customer_name, customer_phone, customer_email, customer_tpin,
    subtotal, discount_type, discount_value, discount_amount, tax_amount, total,
    status, issued_date, due_date, notes,
    quotation_id, delivery_note_id
  ) VALUES (
    p_business_id, v_number, NULLIF(trim(p_offline_id), ''),
    NULLIF(trim(p_header->>'customer_name'), ''),
    NULLIF(trim(p_header->>'customer_phone'), ''),
    NULLIF(trim(p_header->>'customer_email'), ''),
    NULLIF(trim(p_header->>'customer_tpin'), ''),
    COALESCE((p_header->>'subtotal')::numeric, 0),
    NULLIF(p_header->>'discount_type', ''),
    COALESCE((p_header->>'discount_value')::numeric, 0),
    COALESCE((p_header->>'discount_amount')::numeric, 0),
    COALESCE((p_header->>'tax_amount')::numeric, 0),
    COALESCE((p_header->>'total')::numeric, 0),
    COALESCE((p_header->>'status')::invoice_status, 'draft'::invoice_status),
    COALESCE(NULLIF(p_header->>'issued_date', '')::date, CURRENT_DATE),
    NULLIF(p_header->>'due_date', '')::date,
    p_header->>'notes',
    NULLIF(p_header->>'quotation_id', '')::uuid,
    NULLIF(p_header->>'delivery_note_id', '')::uuid
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, quantity, unit_price,
      discount_type, discount_value, line_total
    ) VALUES (
      v_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      NULLIF(v_item->>'discount_type', ''),
      COALESCE((v_item->>'discount_value')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(uuid, jsonb, jsonb, text) TO authenticated;

-- 11. Update invoice status (void / sent, etc.)
CREATE OR REPLACE FUNCTION public.update_invoice_status(
  p_invoice_id TEXT,
  p_status public.invoice_status
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_real UUID;
  v_business_id UUID;
BEGIN
  BEGIN
    SELECT id INTO v_real FROM public.invoices WHERE id = p_invoice_id::uuid AND deleted_at IS NULL;
  EXCEPTION WHEN invalid_text_representation THEN
    v_real := NULL;
  END;
  IF v_real IS NULL THEN
    SELECT id INTO v_real FROM public.invoices WHERE offline_id = p_invoice_id AND deleted_at IS NULL;
  END IF;
  IF v_real IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT business_id INTO v_business_id FROM public.invoices WHERE id = v_real;
  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.invoices
    SET status = p_status, updated_at = now()
    WHERE id = v_real;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_status(text, public.invoice_status) TO authenticated;

-- 12. Pay invoice -> create a completed sale (stock deduction + revenue), mark
--     invoice paid, and mark the source (quotation/delivery note) as converted.
--     Idempotent: paying an already-paid invoice returns its sale id.
CREATE OR REPLACE FUNCTION public.pay_invoice(
  p_invoice_id TEXT,
  p_payment_method TEXT DEFAULT 'cash'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_real UUID;
  v_biz UUID;
  v_status public.invoice_status;
  v_sale_id UUID;
  v_subtotal NUMERIC;
  v_total NUMERIC;
  v_discount_amount NUMERIC;
  v_discount_type TEXT;
  v_tax_amount NUMERIC;
  v_customer_name TEXT;
  v_customer_tpin TEXT;
  v_customer_phone TEXT;
  v_quotation_id UUID;
  v_delivery_note_id UUID;
  v_items JSONB;
  v_offline_id TEXT;
BEGIN
  BEGIN
    SELECT id INTO v_real FROM public.invoices WHERE id = p_invoice_id::uuid AND deleted_at IS NULL;
  EXCEPTION WHEN invalid_text_representation THEN
    v_real := NULL;
  END;
  IF v_real IS NULL THEN
    SELECT id INTO v_real FROM public.invoices WHERE offline_id = p_invoice_id AND deleted_at IS NULL;
  END IF;
  IF v_real IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT business_id, status, converted_sale_id, subtotal, total,
         COALESCE(discount_amount, 0), discount_type, COALESCE(tax_amount, 0),
         customer_name, customer_tpin, customer_phone, quotation_id, delivery_note_id
    INTO v_biz, v_status, v_sale_id, v_subtotal, v_total,
         v_discount_amount, v_discount_type, v_tax_amount,
         v_customer_name, v_customer_tpin, v_customer_phone, v_quotation_id, v_delivery_note_id
    FROM public.invoices WHERE id = v_real;

  IF v_biz IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_status = 'paid' AND v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  IF NOT public.is_business_member(v_biz) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'productId', product_id,
    'name', product_name,
    'price', unit_price,
    'quantity', quantity,
    'discountType', discount_type,
    'discountValue', discount_value,
    'lineTotal', line_total
  )), '[]'::jsonb) INTO v_items
  FROM public.invoice_items WHERE invoice_id = v_real;

  v_offline_id := 'inv_' || v_real::text;

  v_sale_id := public.sync_offline_sale(
    v_biz, v_offline_id, v_items, v_subtotal, v_total,
    v_discount_amount, v_discount_type, v_payment_method, now(),
    v_tax_amount, 0, 0, 0, v_customer_name, v_customer_tpin,
    v_total, NULL, v_customer_phone
  );

  UPDATE public.invoices
    SET status = 'paid', payment_method = v_payment_method,
        converted_sale_id = v_sale_id, updated_at = now()
    WHERE id = v_real;

  IF v_quotation_id IS NOT NULL THEN
    UPDATE public.quotations
      SET status = 'converted', converted_sale_id = v_sale_id, updated_at = now()
      WHERE id = v_quotation_id;
  END IF;

  IF v_delivery_note_id IS NOT NULL THEN
    UPDATE public.delivery_notes
      SET status = 'invoiced', updated_at = now()
      WHERE id = v_delivery_note_id;
  END IF;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_invoice(text, text) TO authenticated;

-- 13. Realtime for invoices (mirrors quotations)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.invoices REPLICA IDENTITY FULL;