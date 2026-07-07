
-- Fix infinite recursion between businesses and business_cashiers RLS.
-- The cashier-visibility policy on businesses queried business_cashiers,
-- whose policies queried businesses again. Use a SECURITY DEFINER helper
-- to break the cycle.

CREATE OR REPLACE FUNCTION public.is_cashier_of_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_cashiers
    WHERE business_id = _business_id
      AND auth_user_id = auth.uid()
      AND is_active = true
  );
$$;

DROP POLICY IF EXISTS "Cashiers can view their business" ON public.businesses;
CREATE POLICY "Cashiers can view their business"
  ON public.businesses FOR SELECT
  USING (public.is_cashier_of_business(id));

-- Also rewrite the owner-side policies on business_cashiers to use a
-- SECURITY DEFINER helper, so they don't re-trigger businesses RLS.
CREATE OR REPLACE FUNCTION public.owns_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = _business_id AND user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Owners view own cashiers" ON public.business_cashiers;
DROP POLICY IF EXISTS "Owners delete own cashiers" ON public.business_cashiers;
DROP POLICY IF EXISTS "Owners update own cashiers" ON public.business_cashiers;

CREATE POLICY "Owners view own cashiers" ON public.business_cashiers
  FOR SELECT USING (public.owns_business(business_id));
CREATE POLICY "Owners delete own cashiers" ON public.business_cashiers
  FOR DELETE USING (public.owns_business(business_id));
CREATE POLICY "Owners update own cashiers" ON public.business_cashiers
  FOR UPDATE USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));
