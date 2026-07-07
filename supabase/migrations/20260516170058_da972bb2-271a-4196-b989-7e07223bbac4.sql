
-- business_cashiers table
CREATE TABLE IF NOT EXISTS public.business_cashiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  auth_user_id UUID NOT NULL UNIQUE,
  username TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, username)
);

ALTER TABLE public.business_cashiers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_business_cashiers_business ON public.business_cashiers(business_id);
CREATE INDEX IF NOT EXISTS idx_business_cashiers_auth_user ON public.business_cashiers(auth_user_id);

CREATE POLICY "Owners view own cashiers" ON public.business_cashiers FOR SELECT
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Owners delete own cashiers" ON public.business_cashiers FOR DELETE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Owners update own cashiers" ON public.business_cashiers FOR UPDATE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Cashiers view own row" ON public.business_cashiers FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Super admins manage cashiers" ON public.business_cashiers FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Cap 3 active cashiers per business
CREATE OR REPLACE FUNCTION public.enforce_cashier_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE active_count INT;
BEGIN
  IF NEW.is_active THEN
    SELECT COUNT(*) INTO active_count FROM public.business_cashiers
    WHERE business_id = NEW.business_id AND is_active = true
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
    IF active_count >= 3 THEN
      RAISE EXCEPTION 'CASHIER_LIMIT_REACHED' USING HINT = 'You have reached the 3 active cashier limit. Contact support to upgrade.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_cashier_cap
  BEFORE INSERT OR UPDATE OF is_active, business_id ON public.business_cashiers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cashier_cap();

CREATE TRIGGER trg_business_cashiers_updated_at
  BEFORE UPDATE ON public.business_cashiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpers
CREATE OR REPLACE FUNCTION public.is_business_member(_business_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = _business_id AND b.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.business_cashiers c
                  WHERE c.business_id = _business_id AND c.auth_user_id = auth.uid() AND c.is_active = true);
$$;

CREATE OR REPLACE FUNCTION public.get_my_business_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT id FROM public.businesses WHERE user_id = auth.uid() LIMIT 1),
    (SELECT business_id FROM public.business_cashiers WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.lookup_business_by_code(_code TEXT)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.businesses WHERE payment_code = upper(_code) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'super_admin') THEN 'super_admin'
    WHEN EXISTS (SELECT 1 FROM public.business_cashiers WHERE auth_user_id = auth.uid() AND is_active = true) THEN 'cashier'
    WHEN EXISTS (SELECT 1 FROM public.businesses WHERE user_id = auth.uid()) THEN 'owner'
    ELSE 'unknown'
  END;
$$;

-- Tighten products: cashiers SELECT, owners mutate
DROP POLICY IF EXISTS "Users can manage own products" ON public.products;

CREATE POLICY "Members can view products" ON public.products FOR SELECT
  USING (public.is_business_member(business_id));
CREATE POLICY "Owners can insert products" ON public.products FOR INSERT
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
CREATE POLICY "Owners can update products" ON public.products FOR UPDATE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
CREATE POLICY "Owners can delete products" ON public.products FOR DELETE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- Sales: members can read & create; owners can update/delete
DROP POLICY IF EXISTS "Users can manage own sales" ON public.sales;

CREATE POLICY "Members can view sales" ON public.sales FOR SELECT
  USING (public.is_business_member(business_id));
CREATE POLICY "Members can create sales" ON public.sales FOR INSERT
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "Owners can update sales" ON public.sales FOR UPDATE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
CREATE POLICY "Owners can delete sales" ON public.sales FOR DELETE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- Update sync_offline_sale to allow cashiers
CREATE OR REPLACE FUNCTION public.sync_offline_sale(p_business_id uuid, p_offline_id text, p_items jsonb, p_subtotal numeric, p_total numeric, p_discount_amount numeric DEFAULT 0, p_discount_type text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text, p_created_at timestamp with time zone DEFAULT now())
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_sale_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;
  SELECT id INTO v_sale_id FROM public.sales
    WHERE business_id = p_business_id AND offline_id = p_offline_id LIMIT 1;
  IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;
  INSERT INTO public.sales (business_id, items, subtotal, total, discount_amount, discount_type, payment_method, synced, offline_id, created_at)
    VALUES (p_business_id, p_items, p_subtotal, p_total, COALESCE(p_discount_amount, 0), p_discount_type, p_payment_method, true, p_offline_id, COALESCE(p_created_at, now()))
    RETURNING id INTO v_sale_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'productId', '')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products SET stock = GREATEST(stock - v_quantity, 0), updated_at = now()
        WHERE id = v_product_id AND business_id = p_business_id;
    END IF;
  END LOOP;
  RETURN v_sale_id;
END; $function$;
