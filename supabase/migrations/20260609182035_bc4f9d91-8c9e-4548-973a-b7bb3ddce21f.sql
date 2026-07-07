
-- 1) businesses tax/TPIN fields
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS tpin text,
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS custom_tax_name text,
  ADD COLUMN IF NOT EXISTS custom_tax_rate numeric(5,2);

-- 2) products tax category
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_category text NOT NULL DEFAULT 'taxable';

-- 3) sales tax + customer fields
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_tpin text,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zero_rated_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exempt_amount numeric(12,2) NOT NULL DEFAULT 0;

-- 4) quotations tax + customer TPIN
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS customer_tpin text,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0;

-- 5) update sync_offline_sale RPC to accept new tax/customer fields (backwards compatible — all optional)
CREATE OR REPLACE FUNCTION public.sync_offline_sale(
  p_business_id uuid,
  p_offline_id text,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_created_at timestamp with time zone DEFAULT now(),
  p_tax_amount numeric DEFAULT 0,
  p_taxable_amount numeric DEFAULT 0,
  p_zero_rated_amount numeric DEFAULT 0,
  p_exempt_amount numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL,
  p_customer_tpin text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;
  SELECT id INTO v_sale_id FROM public.sales
    WHERE business_id = p_business_id AND offline_id = p_offline_id LIMIT 1;
  IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;
  INSERT INTO public.sales (
    business_id, items, subtotal, total, discount_amount, discount_type,
    payment_method, synced, offline_id, created_at,
    tax_amount, taxable_amount, zero_rated_amount, exempt_amount,
    customer_name, customer_tpin
  ) VALUES (
    p_business_id, p_items, p_subtotal, p_total, COALESCE(p_discount_amount, 0), p_discount_type,
    p_payment_method, true, p_offline_id, COALESCE(p_created_at, now()),
    COALESCE(p_tax_amount, 0), COALESCE(p_taxable_amount, 0),
    COALESCE(p_zero_rated_amount, 0), COALESCE(p_exempt_amount, 0),
    NULLIF(trim(p_customer_name), ''), NULLIF(trim(p_customer_tpin), '')
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'productId', '')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products SET stock = GREATEST(stock - v_quantity, 0), updated_at = now()
        WHERE id = v_product_id AND business_id = p_business_id;
    END IF;
  END LOOP;
  RETURN v_sale_id;
END; $$;

-- 6) update create_quotation_with_items to support customer_tpin + tax_amount
CREATE OR REPLACE FUNCTION public.create_quotation_with_items(p_business_id uuid, p_header jsonb, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    customer_name, customer_phone, customer_email, customer_tpin,
    subtotal, discount_type, discount_value, discount_amount, tax_amount, total,
    status, notes, expiry_date
  ) VALUES (
    p_business_id, v_number,
    p_header->>'customer_name', p_header->>'customer_phone', p_header->>'customer_email', p_header->>'customer_tpin',
    COALESCE((p_header->>'subtotal')::numeric, 0),
    p_header->>'discount_type',
    COALESCE((p_header->>'discount_value')::numeric, 0),
    COALESCE((p_header->>'discount_amount')::numeric, 0),
    COALESCE((p_header->>'tax_amount')::numeric, 0),
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
