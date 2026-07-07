
-- 1. Payment status enum
DO $$ BEGIN
  CREATE TYPE public.sale_payment_status AS ENUM ('paid','pending','partially_paid','overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add columns to sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status public.sale_payment_status NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS customer_phone text;

-- 3. Backfill existing rows as fully paid
UPDATE public.sales
SET amount_paid = total,
    balance_due = 0,
    payment_status = 'paid'
WHERE amount_paid = 0 AND payment_status = 'paid';

-- 4. Trigger to auto-maintain balance & status
CREATE OR REPLACE FUNCTION public.set_sale_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount_paid IS NULL THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid < 0 THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid > NEW.total THEN NEW.amount_paid := NEW.total; END IF;

  NEW.balance_due := GREATEST(NEW.total - NEW.amount_paid, 0);

  IF NEW.balance_due = 0 THEN
    NEW.payment_status := 'paid';
  ELSIF NEW.amount_paid = 0 THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'pending';
    END IF;
  ELSE
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'partially_paid';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_set_payment_status ON public.sales;
CREATE TRIGGER trg_sales_set_payment_status
  BEFORE INSERT OR UPDATE OF amount_paid, total, due_date ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_payment_status();

-- 5. Sale payments ledger
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'cash',
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  payment_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON public.sale_payments(sale_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_payments_business_date ON public.sale_payments(business_id, payment_date DESC);

DROP POLICY IF EXISTS "Members can view sale payments" ON public.sale_payments;
CREATE POLICY "Members can view sale payments" ON public.sale_payments
  FOR SELECT USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can insert sale payments" ON public.sale_payments;
CREATE POLICY "Members can insert sale payments" ON public.sale_payments
  FOR INSERT WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Owners can delete sale payments" ON public.sale_payments;
CREATE POLICY "Owners can delete sale payments" ON public.sale_payments
  FOR DELETE USING (public.owns_business(business_id));

-- 6. Atomic record_sale_payment RPC
CREATE OR REPLACE FUNCTION public.record_sale_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_total numeric;
  v_paid numeric;
  v_remaining numeric;
  v_apply numeric;
  v_payment_id uuid;
BEGIN
  SELECT business_id, total, amount_paid INTO v_business_id, v_total, v_paid
    FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.is_business_member(v_business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  v_remaining := GREATEST(v_total - v_paid, 0);
  v_apply := LEAST(p_amount, v_remaining);
  IF v_apply <= 0 THEN RAISE EXCEPTION 'Sale already fully paid'; END IF;

  INSERT INTO public.sale_payments (sale_id, business_id, amount, payment_method, notes, recorded_by)
    VALUES (p_sale_id, v_business_id, v_apply, COALESCE(p_payment_method,'cash'), p_notes, auth.uid())
    RETURNING id INTO v_payment_id;

  UPDATE public.sales SET amount_paid = v_paid + v_apply WHERE id = p_sale_id;

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_sale_payment(uuid, numeric, text, text) TO authenticated;

-- 7. Extend sync_offline_sale with payment fields (new overload)
CREATE OR REPLACE FUNCTION public.sync_offline_sale(
  p_business_id uuid,
  p_offline_id text,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_created_at timestamptz DEFAULT now(),
  p_tax_amount numeric DEFAULT 0,
  p_taxable_amount numeric DEFAULT 0,
  p_zero_rated_amount numeric DEFAULT 0,
  p_exempt_amount numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL,
  p_customer_tpin text DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_customer_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer; v_paid numeric;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;
  SELECT id INTO v_sale_id FROM public.sales
    WHERE business_id = p_business_id AND offline_id = p_offline_id LIMIT 1;
  IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;

  v_paid := COALESCE(p_amount_paid, p_total);

  INSERT INTO public.sales (
    business_id, items, subtotal, total, discount_amount, discount_type,
    payment_method, synced, offline_id, created_at,
    tax_amount, taxable_amount, zero_rated_amount, exempt_amount,
    customer_name, customer_tpin, customer_phone, amount_paid, due_date
  ) VALUES (
    p_business_id, p_items, p_subtotal, p_total, COALESCE(p_discount_amount,0), p_discount_type,
    p_payment_method, true, p_offline_id, COALESCE(p_created_at, now()),
    COALESCE(p_tax_amount,0), COALESCE(p_taxable_amount,0),
    COALESCE(p_zero_rated_amount,0), COALESCE(p_exempt_amount,0),
    NULLIF(trim(p_customer_name),''), NULLIF(trim(p_customer_tpin),''),
    NULLIF(trim(p_customer_phone),''), v_paid, p_due_date
  ) RETURNING id INTO v_sale_id;

  -- If credit/partial sale, log the upfront payment in the ledger
  IF v_paid > 0 AND v_paid < p_total THEN
    INSERT INTO public.sale_payments (sale_id, business_id, amount, payment_method, notes, recorded_by)
      VALUES (v_sale_id, p_business_id, v_paid, COALESCE(p_payment_method,'cash'), 'Initial deposit', auth.uid());
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'productId','')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products SET stock = GREATEST(stock - v_quantity, 0), updated_at = now()
        WHERE id = v_product_id AND business_id = p_business_id;
    END IF;
  END LOOP;
  RETURN v_sale_id;
END $$;

-- 8. Realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.debtors;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.debtor_payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
