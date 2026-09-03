
-- =====================================================
-- Delivery Notes feature
-- =====================================================

-- 1. Status enum
DO $$ BEGIN
  CREATE TYPE public.delivery_note_status AS ENUM ('pending', 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. delivery_notes table
CREATE TABLE public.delivery_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  delivery_note_number TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_address TEXT,
  driver_name TEXT,
  car_plate TEXT,
  notes TEXT,
  status public.delivery_note_status NOT NULL DEFAULT 'pending',
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 3. delivery_note_items table
CREATE TABLE public.delivery_note_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_note_id UUID NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Indexes
CREATE INDEX idx_delivery_notes_business ON public.delivery_notes(business_id, created_at DESC);
CREATE INDEX idx_delivery_notes_status ON public.delivery_notes(business_id, status);
CREATE INDEX idx_delivery_notes_number ON public.delivery_notes(business_id, delivery_note_number);
CREATE INDEX idx_delivery_note_items_dn ON public.delivery_note_items(delivery_note_id);

-- 5. Enable RLS
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies — delivery_notes (matches newer quotation pattern: is_business_member / owns_business)
DROP POLICY IF EXISTS "Members can view delivery notes" ON public.delivery_notes;
CREATE POLICY "Members can view delivery notes"
  ON public.delivery_notes FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can insert delivery notes" ON public.delivery_notes;
CREATE POLICY "Members can insert delivery notes"
  ON public.delivery_notes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can update delivery notes" ON public.delivery_notes;
CREATE POLICY "Members can update delivery notes"
  ON public.delivery_notes FOR UPDATE
  TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Owners can delete delivery notes" ON public.delivery_notes;
CREATE POLICY "Owners can delete delivery notes"
  ON public.delivery_notes FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

-- 7. RLS policies — delivery_note_items (scoped via parent delivery_note → business_id)
DROP POLICY IF EXISTS "Members can view delivery note items" ON public.delivery_note_items;
CREATE POLICY "Members can view delivery note items"
  ON public.delivery_note_items FOR SELECT
  TO authenticated
  USING (public.is_business_member((
    SELECT dn.business_id FROM public.delivery_notes dn WHERE dn.id = delivery_note_id
  )));

DROP POLICY IF EXISTS "Members can insert delivery note items" ON public.delivery_note_items;
CREATE POLICY "Members can insert delivery note items"
  ON public.delivery_note_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_business_member((
    SELECT dn.business_id FROM public.delivery_notes dn WHERE dn.id = delivery_note_id
  )));

DROP POLICY IF EXISTS "Owners can update delivery note items" ON public.delivery_note_items;
CREATE POLICY "Owners can update delivery note items"
  ON public.delivery_note_items FOR UPDATE
  TO authenticated
  USING (public.is_business_member((
    SELECT dn.business_id FROM public.delivery_notes dn WHERE dn.id = delivery_note_id
  )))
  WITH CHECK (public.is_business_member((
    SELECT dn.business_id FROM public.delivery_notes dn WHERE dn.id = delivery_note_id
  )));

DROP POLICY IF EXISTS "Owners can delete delivery note items" ON public.delivery_note_items;
CREATE POLICY "Owners can delete delivery note items"
  ON public.delivery_note_items FOR DELETE
  TO authenticated
  USING (public.owns_business((
    SELECT dn.business_id FROM public.delivery_notes dn WHERE dn.id = delivery_note_id
  )));

-- 8. updated_at trigger
DROP TRIGGER IF EXISTS trg_delivery_notes_updated_at ON public.delivery_notes;
CREATE TRIGGER trg_delivery_notes_updated_at
  BEFORE UPDATE ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Generate delivery note number (DN-YYYY-NNNN, per business, per year)
CREATE OR REPLACE FUNCTION public.generate_delivery_note_number(biz_id UUID)
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
    CAST(SUBSTRING(delivery_note_number FROM 'DN-' || current_year || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM public.delivery_notes
  WHERE business_id = biz_id
    AND delivery_note_number LIKE 'DN-' || current_year || '-%';

  new_number := 'DN-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
  RETURN new_number;
END;
$$;

-- 10. Atomic create delivery note with items (single RPC)
CREATE OR REPLACE FUNCTION public.create_delivery_note_with_items(
  p_business_id UUID,
  p_header JSONB,
  p_items JSONB
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

  v_number := public.generate_delivery_note_number(p_business_id);

  INSERT INTO public.delivery_notes (
    business_id, delivery_note_number,
    customer_name, customer_phone, delivery_address,
    driver_name, car_plate, notes, status, quotation_id
  ) VALUES (
    p_business_id, v_number,
    NULLIF(trim(p_header->>'customer_name'), ''),
    NULLIF(trim(p_header->>'customer_phone'), ''),
    NULLIF(trim(p_header->>'delivery_address'), ''),
    NULLIF(trim(p_header->>'driver_name'), ''),
    NULLIF(trim(p_header->>'car_plate'), ''),
    p_header->>'notes',
    COALESCE((p_header->>'status')::delivery_note_status, 'pending'::delivery_note_status),
    NULLIF(p_header->>'quotation_id', '')::uuid
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.delivery_note_items (
      delivery_note_id, product_id, product_name, quantity, unit_price, line_total
    ) VALUES (
      v_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_delivery_note_with_items(uuid, jsonb, jsonb) TO authenticated;

-- 11. Update delivery note status RPC
CREATE OR REPLACE FUNCTION public.update_delivery_note_status(
  p_delivery_note_id UUID,
  p_status public.delivery_note_status
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_business_id UUID;
BEGIN
  SELECT business_id INTO v_business_id
    FROM public.delivery_notes
    WHERE id = p_delivery_note_id AND deleted_at IS NULL;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Delivery note not found';
  END IF;

  IF NOT public.is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.delivery_notes
    SET status = p_status, updated_at = now()
    WHERE id = p_delivery_note_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_delivery_note_status(uuid, delivery_note_status) TO authenticated;
