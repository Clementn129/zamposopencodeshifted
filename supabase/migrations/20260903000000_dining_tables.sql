-- Phase D: Dining tables / floor management.
-- 1) dining_tables table so restaurants can run a floor plan.
-- 2) sales.table_id links a completed sale (and its kitchen ticket) to a table.
-- 3) kitchen_orders gains table_id + table_name so the KDS and floor plan can
--    show exactly which table each ticket belongs to.
-- 4) sync_offline_sale gains an optional p_table_id (new overload, old 18-arg
--    signature kept for previously-installed clients).
-- 5) The kitchen ticket trigger resolves the table name when a sale is created.
-- Additive and backwards-compatible for existing retail/service businesses.

-- ---------------------------------------------------------------------------
-- 1. dining_tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dining_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floor TEXT,
  capacity INTEGER NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE INDEX IF NOT EXISTS idx_dining_tables_business_floor
  ON public.dining_tables (business_id, floor);

DROP TRIGGER IF EXISTS trg_dining_tables_updated_at ON public.dining_tables;
CREATE TRIGGER trg_dining_tables_updated_at
  BEFORE UPDATE ON public.dining_tables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.dining_tables TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.dining_tables TO service_role;

ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members can view dining tables"
  ON public.dining_tables FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY "Owners can manage dining tables"
  ON public.dining_tables FOR ALL
  TO authenticated
  USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));

-- ---------------------------------------------------------------------------
-- 2. sales.table_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS table_id UUID
  REFERENCES public.dining_tables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_business_table
  ON public.sales (business_id, table_id) WHERE table_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. kitchen_orders.table_id + table_name
-- ---------------------------------------------------------------------------
ALTER TABLE public.kitchen_orders
  ADD COLUMN IF NOT EXISTS table_id UUID,
  ADD COLUMN IF NOT EXISTS table_name TEXT;

CREATE INDEX IF NOT EXISTS idx_kitchen_orders_business_table_status
  ON public.kitchen_orders (business_id, table_id);

-- ---------------------------------------------------------------------------
-- 4. Kitchen ticket trigger resolves the table name at creation time.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kitchen_ticket_on_sale_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_business_type TEXT;
  v_table_id UUID;
  v_table_name TEXT;
BEGIN
  BEGIN
    SELECT business_type INTO v_business_type
    FROM public.businesses
    WHERE id = NEW.business_id;

    IF v_business_type = 'restaurant'
       AND jsonb_array_length(COALESCE(NEW.items, '[]'::jsonb)) > 0 THEN
      IF NEW.table_id IS NOT NULL THEN
        SELECT id, name INTO v_table_id, v_table_name
        FROM public.dining_tables
        WHERE id = NEW.table_id;
      END IF;

      INSERT INTO public.kitchen_orders (business_id, sale_id, items, table_id, table_name)
      VALUES (NEW.business_id, NEW.id, COALESCE(NEW.items, '[]'::jsonb), v_table_id, v_table_name);
    END IF;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'skipped kitchen ticket for sale %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. sync_offline_sale with optional table id (new 19-arg overload).
--    Old 18-arg overload stays for devices running the previous build.
-- ---------------------------------------------------------------------------
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

  -- Cashier accounts use display_name, not full_name.
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