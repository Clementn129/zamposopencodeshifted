
-- ============================================================
-- Phase 1: Sale sync hardening (dedupe + realtime)
-- ============================================================

-- Dedupe offline sales: same offline_id can't insert twice
CREATE UNIQUE INDEX IF NOT EXISTS sales_business_offline_id_uniq
  ON public.sales (business_id, offline_id)
  WHERE offline_id IS NOT NULL;

-- Enable realtime for sales and products (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sales'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sales';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='products'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.products';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='quotations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.quotations';
  END IF;
END $$;

-- Ensure full row data flows in realtime payloads
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.quotations REPLICA IDENTITY FULL;

-- ============================================================
-- Phase 1b: Allow cashiers to create debtors (credit sales)
-- ============================================================

DROP POLICY IF EXISTS "Users can manage own debtors" ON public.debtors;

CREATE POLICY "Members can view debtors"
  ON public.debtors FOR SELECT
  USING (public.is_business_member(business_id));

CREATE POLICY "Members can insert debtors"
  ON public.debtors FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Owners can update debtors"
  ON public.debtors FOR UPDATE
  USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can delete debtors"
  ON public.debtors FOR DELETE
  USING (public.owns_business(business_id));

-- ============================================================
-- Phase 2: Quotation system — allow cashiers + atomic RPCs
-- ============================================================

DROP POLICY IF EXISTS "Users can manage own quotations" ON public.quotations;

CREATE POLICY "Members can view quotations"
  ON public.quotations FOR SELECT
  USING (public.is_business_member(business_id));

CREATE POLICY "Members can insert quotations"
  ON public.quotations FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Members can update quotations"
  ON public.quotations FOR UPDATE
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Owners can delete quotations"
  ON public.quotations FOR DELETE
  USING (public.owns_business(business_id));

DROP POLICY IF EXISTS "Users can manage own quotation items" ON public.quotation_items;

CREATE POLICY "Members can view quotation items"
  ON public.quotation_items FOR SELECT
  USING (quotation_id IN (SELECT id FROM public.quotations WHERE public.is_business_member(business_id)));

CREATE POLICY "Members can insert quotation items"
  ON public.quotation_items FOR INSERT
  WITH CHECK (quotation_id IN (SELECT id FROM public.quotations WHERE public.is_business_member(business_id)));

CREATE POLICY "Members can update quotation items"
  ON public.quotation_items FOR UPDATE
  USING (quotation_id IN (SELECT id FROM public.quotations WHERE public.is_business_member(business_id)));

CREATE POLICY "Members can delete quotation items"
  ON public.quotation_items FOR DELETE
  USING (quotation_id IN (SELECT id FROM public.quotations WHERE public.is_business_member(business_id)));

-- Atomic create quotation + items
CREATE OR REPLACE FUNCTION public.create_quotation_with_items(
  p_business_id uuid,
  p_header jsonb,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_item jsonb;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_number := public.generate_quotation_number(p_business_id);

  INSERT INTO public.quotations (
    business_id, quotation_number,
    customer_name, customer_phone, customer_email,
    subtotal, discount_type, discount_value, discount_amount, total,
    status, notes, expiry_date
  ) VALUES (
    p_business_id, v_number,
    p_header->>'customer_name', p_header->>'customer_phone', p_header->>'customer_email',
    COALESCE((p_header->>'subtotal')::numeric, 0),
    p_header->>'discount_type',
    COALESCE((p_header->>'discount_value')::numeric, 0),
    COALESCE((p_header->>'discount_amount')::numeric, 0),
    COALESCE((p_header->>'total')::numeric, 0),
    COALESCE((p_header->>'status')::quotation_status, 'draft'::quotation_status),
    p_header->>'notes',
    NULLIF(p_header->>'expiry_date','')::date
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.quotation_items (
      quotation_id, product_id, product_name, quantity, unit_price,
      discount_type, discount_value, line_total
    ) VALUES (
      v_id,
      NULLIF(v_item->>'product_id','')::uuid,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      v_item->>'discount_type',
      COALESCE((v_item->>'discount_value')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;

-- Atomic convert quotation → sale (decrements stock via sales path)
CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale(
  p_quotation_id uuid,
  p_payment_method text DEFAULT 'cash'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid;
  v_subtotal numeric;
  v_total numeric;
  v_discount_amount numeric;
  v_discount_type text;
  v_items jsonb;
  v_sale_id uuid;
  v_offline_id text;
BEGIN
  SELECT business_id, subtotal, total, discount_amount, discount_type
    INTO v_biz, v_subtotal, v_total, v_discount_amount, v_discount_type
    FROM public.quotations WHERE id = p_quotation_id;

  IF v_biz IS NULL THEN RAISE EXCEPTION 'Quotation not found'; END IF;
  IF NOT public.is_business_member(v_biz) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'productId', product_id,
    'name', product_name,
    'price', unit_price,
    'quantity', quantity,
    'discountType', discount_type,
    'discountValue', discount_value
  )) INTO v_items
  FROM public.quotation_items WHERE quotation_id = p_quotation_id;

  v_offline_id := 'qt_' || p_quotation_id::text;

  v_sale_id := public.sync_offline_sale(
    v_biz, v_offline_id, COALESCE(v_items, '[]'::jsonb),
    v_subtotal, v_total, COALESCE(v_discount_amount, 0),
    v_discount_type, p_payment_method, now()
  );

  UPDATE public.quotations
    SET status = 'converted', converted_sale_id = v_sale_id, updated_at = now()
    WHERE id = p_quotation_id;

  RETURN v_sale_id;
END;
$$;

-- ============================================================
-- Phase 1c: Harden sync_offline_sale (already SECURITY DEFINER,
-- already dedupes, already decrements stock — leave it as-is)
-- but explicit GRANT EXECUTE so cashiers can call it
-- ============================================================

GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_with_items(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_sale(uuid, text) TO authenticated;
