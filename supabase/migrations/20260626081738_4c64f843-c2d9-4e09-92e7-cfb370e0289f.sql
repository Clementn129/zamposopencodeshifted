
-- Phase A: Cashier attribution on sales + overdue debtor status (additive)

-- 1. Add cashier attribution columns to sales (nullable for backward compat)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cashier_id uuid,
  ADD COLUMN IF NOT EXISTS cashier_name text,
  ADD COLUMN IF NOT EXISTS cashier_username text;

-- 2. Extend debtor status check to support 'overdue'
ALTER TABLE public.debtors DROP CONSTRAINT IF EXISTS debtors_status_check;
ALTER TABLE public.debtors ADD CONSTRAINT debtors_status_check
  CHECK (status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'overdue'::text]));

-- 3. Add a due_date to debtors so we can compute overdue
ALTER TABLE public.debtors
  ADD COLUMN IF NOT EXISTS due_date date;

-- 4. Trigger to auto-maintain debtor status
CREATE OR REPLACE FUNCTION public.set_debtor_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount_paid IS NULL THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid < 0 THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid > NEW.amount_owed THEN NEW.amount_paid := NEW.amount_owed; END IF;

  IF NEW.amount_paid >= NEW.amount_owed THEN
    NEW.status := 'paid';
  ELSIF NEW.amount_paid = 0 THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.status := 'overdue';
    ELSE
      NEW.status := 'unpaid';
    END IF;
  ELSE
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.status := 'overdue';
    ELSE
      NEW.status := 'partially_paid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_debtor_status ON public.debtors;
CREATE TRIGGER trg_set_debtor_status
  BEFORE INSERT OR UPDATE OF amount_paid, amount_owed, due_date
  ON public.debtors
  FOR EACH ROW EXECUTE FUNCTION public.set_debtor_status();

-- 5. Update sync_offline_sale (latest overload) to also record cashier
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
  p_customer_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer; v_paid numeric;
  v_cashier_id uuid; v_cashier_name text; v_cashier_username text;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;

  SELECT id INTO v_sale_id FROM public.sales
    WHERE business_id = p_business_id AND offline_id = p_offline_id LIMIT 1;
  IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;

  v_paid := COALESCE(p_amount_paid, p_total);
  v_cashier_id := auth.uid();

  -- Resolve cashier display name: prefer business_cashiers entry, fall back to profile, fall back to owner
  SELECT bc.full_name, bc.username INTO v_cashier_name, v_cashier_username
    FROM public.business_cashiers bc
    WHERE bc.business_id = p_business_id AND bc.auth_user_id = v_cashier_id AND bc.is_active = true
    LIMIT 1;

  IF v_cashier_name IS NULL THEN
    SELECT COALESCE(pr.full_name, pr.email, 'Owner'), pr.email
      INTO v_cashier_name, v_cashier_username
      FROM public.profiles pr
      WHERE pr.user_id = v_cashier_id;
  END IF;

  INSERT INTO public.sales (
    business_id, items, subtotal, total, discount_amount, discount_type,
    payment_method, synced, offline_id, created_at,
    tax_amount, taxable_amount, zero_rated_amount, exempt_amount,
    customer_name, customer_tpin, customer_phone, amount_paid, due_date,
    cashier_id, cashier_name, cashier_username
  ) VALUES (
    p_business_id, p_items, p_subtotal, p_total, COALESCE(p_discount_amount,0), p_discount_type,
    p_payment_method, true, p_offline_id, COALESCE(p_created_at, now()),
    COALESCE(p_tax_amount,0), COALESCE(p_taxable_amount,0),
    COALESCE(p_zero_rated_amount,0), COALESCE(p_exempt_amount,0),
    NULLIF(trim(p_customer_name),''), NULLIF(trim(p_customer_tpin),''),
    NULLIF(trim(p_customer_phone),''), v_paid, p_due_date,
    v_cashier_id, v_cashier_name, v_cashier_username
  ) RETURNING id INTO v_sale_id;

  IF v_paid > 0 AND v_paid < p_total THEN
    INSERT INTO public.sale_payments (sale_id, business_id, amount, payment_method, notes, recorded_by)
      VALUES (v_sale_id, p_business_id, v_paid, COALESCE(p_payment_method,'cash'), 'Initial deposit', v_cashier_id);
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

-- 6. Backfill cashier_name for existing sales using the business owner's profile (best-effort, non-destructive)
UPDATE public.sales s
   SET cashier_id = b.user_id,
       cashier_name = COALESCE(pr.full_name, pr.email, 'Owner'),
       cashier_username = pr.email
  FROM public.businesses b
  LEFT JOIN public.profiles pr ON pr.user_id = b.user_id
 WHERE s.business_id = b.id
   AND s.cashier_name IS NULL;
