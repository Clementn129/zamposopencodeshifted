-- Phase D added a 19-arg sync_offline_sale overload (with p_table_id) while
-- keeping the old 18-arg function. Because the new overload declares
--   p_table_id uuid DEFAULT NULL
-- a call that omits p_table_id (18 arguments) now matches BOTH the 18-arg and
-- the 19-arg function. PostgreSQL then raises:
--   "could not choose best candidate function between public.sync_offline_sale..."
-- which breaks sales on every client that does not send p_table_id.
--
-- Fix: converge on a SINGLE canonical function. Drop the old 18-arg overload
-- and keep only the 19-arg version (with the default). Old clients that call
-- with 18 arguments bind to it via the DEFAULT; new clients pass p_table_id
-- explicitly. No overload pair exists anymore, so resolution is never ambiguous.

DROP FUNCTION IF EXISTS public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text);

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
  p_customer_tpin text DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_table_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_paid numeric;
  v_cashier_id uuid;
  v_cashier_name text;
  v_cashier_username text;
  v_table_ok boolean;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;

  SELECT id INTO v_sale_id
  FROM public.sales
  WHERE business_id = p_business_id
    AND offline_id = p_offline_id
  LIMIT 1;

  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  IF p_table_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.dining_tables
      WHERE id = p_table_id AND business_id = p_business_id
    ) INTO v_table_ok;
    IF NOT v_table_ok THEN
      RAISE EXCEPTION 'Table does not belong to this business';
    END IF;
  END IF;

  v_paid := LEAST(GREATEST(COALESCE(p_amount_paid, p_total), 0), COALESCE(p_total, 0));
  v_cashier_id := auth.uid();

  SELECT COALESCE(NULLIF(trim(bc.display_name), ''), bc.username), bc.username
    INTO v_cashier_name, v_cashier_username
  FROM public.business_cashiers bc
  WHERE bc.business_id = p_business_id
    AND bc.auth_user_id = v_cashier_id
    AND bc.is_active = true
  LIMIT 1;

  IF v_cashier_name IS NULL THEN
    SELECT COALESCE(NULLIF(trim(pr.full_name), ''), pr.email, 'Owner'), pr.email
      INTO v_cashier_name, v_cashier_username
    FROM public.profiles pr
    WHERE pr.user_id = v_cashier_id
    LIMIT 1;
  END IF;

  INSERT INTO public.sales (
    business_id, items, subtotal, total, discount_amount, discount_type,
    payment_method, synced, offline_id, created_at,
    tax_amount, taxable_amount, zero_rated_amount, exempt_amount,
    customer_name, customer_tpin, customer_phone, amount_paid, due_date,
    cashier_id, cashier_name, cashier_username, table_id
  ) VALUES (
    p_business_id,
    COALESCE(p_items, '[]'::jsonb),
    COALESCE(p_subtotal, 0),
    COALESCE(p_total, 0),
    COALESCE(p_discount_amount, 0),
    p_discount_type,
    COALESCE(NULLIF(trim(p_payment_method), ''), 'cash'),
    true,
    p_offline_id,
    COALESCE(p_created_at, now()),
    COALESCE(p_tax_amount, 0),
    COALESCE(p_taxable_amount, 0),
    COALESCE(p_zero_rated_amount, 0),
    COALESCE(p_exempt_amount, 0),
    NULLIF(trim(p_customer_name), ''),
    NULLIF(trim(p_customer_tpin), ''),
    NULLIF(trim(p_customer_phone), ''),
    v_paid,
    p_due_date,
    v_cashier_id,
    COALESCE(v_cashier_name, 'Staff'),
    v_cashier_username,
    p_table_id
  ) RETURNING id INTO v_sale_id;

  IF v_paid > 0 AND v_paid < COALESCE(p_total, 0) THEN
    INSERT INTO public.sale_payments (sale_id, business_id, amount, payment_method, notes, recorded_by)
    VALUES (v_sale_id, p_business_id, v_paid, COALESCE(NULLIF(trim(p_payment_method), ''), 'cash'), 'Initial deposit', v_cashier_id);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    BEGIN
      v_product_id := NULLIF(v_item->>'productId', '')::uuid;
    EXCEPTION WHEN others THEN
      v_product_id := NULL;
    END;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products
      SET stock = GREATEST(stock - v_quantity, 0),
          updated_at = now()
      WHERE id = v_product_id
        AND business_id = p_business_id;
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text, uuid) TO service_role;