
-- 1. Invoice numbers on sales (sequential per business)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoice_number text;

CREATE OR REPLACE FUNCTION public.set_sale_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::int), 0) + 1
    INTO next_num
  FROM public.sales
  WHERE business_id = NEW.business_id;
  NEW.invoice_number := 'INV-' || lpad(next_num::text, 6, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sale_invoice_number ON public.sales;
CREATE TRIGGER trg_set_sale_invoice_number
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_invoice_number();

-- Backfill existing sales without invoice numbers
DO $$
DECLARE
  r RECORD;
  counters jsonb := '{}'::jsonb;
  c int;
BEGIN
  FOR r IN SELECT id, business_id FROM public.sales WHERE invoice_number IS NULL ORDER BY created_at ASC LOOP
    c := COALESCE((counters ->> r.business_id::text)::int, 0) + 1;
    counters := counters || jsonb_build_object(r.business_id::text, c);
    UPDATE public.sales SET invoice_number = 'INV-' || lpad(c::text, 6, '0') WHERE id = r.id;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales(business_id, invoice_number);

-- 2. Audit log
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  actor_id uuid,
  actor_label text,
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own audit logs" ON public.audit_logs;
CREATE POLICY "Owners view own audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE INDEX IF NOT EXISTS idx_audit_logs_biz_time ON public.audit_logs(business_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid;
  v_actor uuid := auth.uid();
  v_label text;
  v_rec text;
  v_changes jsonb;
BEGIN
  -- Pick business_id from the row
  IF TG_OP = 'DELETE' THEN
    v_biz := (to_jsonb(OLD) ->> 'business_id')::uuid;
    v_rec := (to_jsonb(OLD) ->> 'id');
    v_changes := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_biz := (to_jsonb(NEW) ->> 'business_id')::uuid;
    v_rec := (to_jsonb(NEW) ->> 'id');
    v_changes := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    v_biz := (to_jsonb(NEW) ->> 'business_id')::uuid;
    v_rec := (to_jsonb(NEW) ->> 'id');
    v_changes := jsonb_build_object('new', to_jsonb(NEW));
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT COALESCE(p.full_name, p.email, v_actor::text) INTO v_label FROM public.profiles p WHERE p.id = v_actor;
  END IF;

  INSERT INTO public.audit_logs(business_id, actor_id, actor_label, table_name, record_id, action, changes)
  VALUES (v_biz, v_actor, v_label, TG_TABLE_NAME, v_rec, TG_OP, v_changes);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_payments','products','expenses','debtors','debtor_payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()', t, t);
  END LOOP;
END $$;
