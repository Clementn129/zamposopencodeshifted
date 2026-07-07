-- ============================================================
-- Health Check Fixes: grants, foreign keys, indexes, policies
-- ============================================================

-- 1. GRANT EXECUTE on security-definer functions used in RLS
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cashier_of_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- 2. GRANT EXECUTE on user-facing RPCs
GRANT EXECUTE ON FUNCTION public.lookup_business_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_payment_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_stock_adjustment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_stock_adjustment(uuid, text) TO authenticated;

-- 2b. GRANT EXECUTE on RPCs called directly from frontend (SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.record_sale_payment(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_affiliate_code() TO authenticated;

-- 3. Add foreign key constraints to business_cashiers
DO $$ BEGIN
  ALTER TABLE public.business_cashiers
    ADD CONSTRAINT business_cashiers_business_id_fkey
    FOREIGN KEY (business_id) REFERENCES public.businesses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.business_cashiers
    ADD CONSTRAINT business_cashiers_auth_user_id_fkey
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Add foreign key to notices.created_by
DO $$ BEGIN
  ALTER TABLE public.notices
    ADD CONSTRAINT notices_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Add RLS INSERT policy for business_cashiers (used by edge function with service_role)
DROP POLICY IF EXISTS "Service role can insert cashiers" ON public.business_cashiers;
CREATE POLICY "Service role can insert cashiers" ON public.business_cashiers
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_business(business_id));

-- 6. Add missing indexes
CREATE INDEX IF NOT EXISTS idx_debtors_sale_id ON public.debtors(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON public.affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_business_id ON public.affiliate_referrals(business_id);
CREATE INDEX IF NOT EXISTS idx_quotations_converted_sale_id ON public.quotations(converted_sale_id) WHERE converted_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotation_items_product_id ON public.quotation_items(product_id);

-- 7. Clean up duplicate indexes (drop the older/inferior ones)
DROP INDEX IF EXISTS public.products_business_barcode_idx;
DROP INDEX IF EXISTS public.idx_sales_business_created;
DROP INDEX IF EXISTS public.idx_business_cashiers_auth_user;
DROP INDEX IF EXISTS public.idx_business_cashiers_business;

-- 8. Fix storage policies to be idempotent
DO $$ BEGIN
  DROP POLICY IF EXISTS "Give authenticated users access to folder" ON storage.objects;
  DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
  DROP POLICY IF EXISTS "Owners can insert business logos" ON storage.objects;
  DROP POLICY IF EXISTS "Give anon users access to business logos" ON storage.objects;
  DROP POLICY IF EXISTS "Give authenticated users delete access" ON storage.objects;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Give authenticated users access to folder"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'business-logos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Give users access to own folder"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'business-logos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Owners can insert business logos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'business-logos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Give anon users access to business logos"
    ON storage.objects FOR SELECT TO anon
    USING (bucket_id = 'business-logos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Give authenticated users delete access"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'business-logos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
