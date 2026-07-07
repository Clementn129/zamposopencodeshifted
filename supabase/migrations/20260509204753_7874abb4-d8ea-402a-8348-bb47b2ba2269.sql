
-- 1) Prevent business owners from changing subscription/lock fields directly
CREATE OR REPLACE FUNCTION public.protect_business_subscription_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow super admins to change anything
  IF public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- Lock down sensitive subscription/billing fields for normal owners
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.payment_code IS DISTINCT FROM OLD.payment_code
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Not allowed to modify subscription or billing fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_business_subscription_fields_trg ON public.businesses;
CREATE TRIGGER protect_business_subscription_fields_trg
BEFORE UPDATE ON public.businesses
FOR EACH ROW EXECUTE FUNCTION public.protect_business_subscription_fields();

-- 2) Tighten affiliate_referrals INSERT: business owner cannot self-refer; affiliate user cannot be the same user
DROP POLICY IF EXISTS "Users can create referrals for own business" ON public.affiliate_referrals;
CREATE POLICY "Users can create referrals for own business"
ON public.affiliate_referrals
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  AND affiliate_id IN (
    SELECT id FROM public.affiliates
    WHERE status = 'active' AND user_id <> auth.uid()
  )
);

-- 3) Limit data affiliates can see about referred businesses to minimal columns via a view
DROP POLICY IF EXISTS "Affiliates can view referred businesses" ON public.businesses;

CREATE OR REPLACE VIEW public.affiliate_referred_businesses
WITH (security_invoker = true)
AS
SELECT
  b.id,
  b.name,
  b.subscription_status,
  b.created_at
FROM public.businesses b
WHERE b.id IN (
  SELECT ar.business_id
  FROM public.affiliate_referrals ar
  JOIN public.affiliates a ON ar.affiliate_id = a.id
  WHERE a.user_id = auth.uid()
);

GRANT SELECT ON public.affiliate_referred_businesses TO authenticated;
