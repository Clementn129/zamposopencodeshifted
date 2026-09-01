-- Auto-create ONE-TIME affiliate commissions of 20% of the referred shop's
-- first approved subscription payment, when the referred business first becomes
-- 'active'. One commission per referral (never re-created on re-activation).
--
-- This replaces the old manual 'Generate Commissions' flow as the primary path
-- (the manual button is kept as an idempotent safety net).

-- 1. Trigger on businesses: when a referred business transitions to 'active'
--    for the first time, create the commission (if it has an approved payment).
CREATE OR REPLACE FUNCTION public.auto_create_affiliate_commission_on_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_id UUID;
  v_affiliate_id UUID;
  v_first_amount NUMERIC;
BEGIN
  -- Only act when the business becomes active (and wasn't already active).
  IF NEW.subscription_status <> 'active' OR OLD.subscription_status = 'active' THEN
    RETURN NEW;
  END IF;

  -- Is this business a referred one?
  SELECT id, affiliate_id INTO v_referral_id, v_affiliate_id
  FROM public.affiliate_referrals
  WHERE business_id = NEW.id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- One-time only: skip if a commission already exists for this referral.
  IF EXISTS (SELECT 1 FROM public.affiliate_commissions WHERE referral_id = v_referral_id) THEN
    RETURN NEW;
  END IF;

  -- Commission base = the first approved subscription payment for this business.
  SELECT amount INTO v_first_amount
  FROM public.payments
  WHERE business_id = NEW.id
    AND status = 'approved'
  ORDER BY approved_at ASC NULLS LAST, created_at ASC
  LIMIT 1;

  -- No approved payment yet → defer; the payments trigger / backfill will catch up.
  IF v_first_amount IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.affiliate_commissions
    (affiliate_id, referral_id, amount, commission_month, status)
  VALUES
    (v_affiliate_id, v_referral_id, ROUND(v_first_amount * 0.20, 2),
     date_trunc('month', NEW.updated_at)::date, 'pending');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_affiliate_commission_on_active ON public.businesses;
CREATE TRIGGER trg_auto_affiliate_commission_on_active
AFTER UPDATE OF subscription_status ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_affiliate_commission_on_active();

-- 2. Trigger on payments: when a payment is APPROVED for a referred business
--    that is currently active but has no commission yet, create it. This covers
--    the case where the shop became active before the payment was approved.
CREATE OR REPLACE FUNCTION public.auto_create_affiliate_commission_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_id UUID;
  v_affiliate_id UUID;
  v_first_amount NUMERIC;
  v_approved BOOLEAN;
  v_active BOOLEAN;
BEGIN
  -- Only act when a payment becomes approved.
  IF NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  -- Referred?
  SELECT id, affiliate_id INTO v_referral_id, v_affiliate_id
  FROM public.affiliate_referrals
  WHERE business_id = NEW.business_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- One-time only.
  IF EXISTS (SELECT 1 FROM public.affiliate_commissions WHERE referral_id = v_referral_id) THEN
    RETURN NEW;
  END IF;

  -- Is the business active now?
  SELECT (subscription_status = 'active') INTO v_active
  FROM public.businesses
  WHERE id = NEW.business_id;

  IF v_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Earliest approved payment overall (first = the new one if it's earliest).
  SELECT amount INTO v_first_amount
  FROM public.payments
  WHERE business_id = NEW.business_id
    AND status = 'approved'
  ORDER BY approved_at ASC NULLS LAST, created_at ASC
  LIMIT 1;

  INSERT INTO public.affiliate_commissions
    (affiliate_id, referral_id, amount, commission_month, status)
  VALUES
    (v_affiliate_id, v_referral_id, ROUND(COALESCE(v_first_amount, NEW.amount) * 0.20, 2),
     date_trunc('month', COALESCE(NEW.approved_at, now()))::date, 'pending');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_affiliate_commission_on_payment ON public.payments;
CREATE TRIGGER trg_auto_affiliate_commission_on_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_affiliate_commission_on_payment();

-- 3. Backfill: create commissions for referred businesses that are ALREADY
--    active today and have an approved payment but no commission yet.
INSERT INTO public.affiliate_commissions
  (affiliate_id, referral_id, amount, commission_month, status)
SELECT
  r.affiliate_id,
  r.id AS referral_id,
  ROUND(p.amount * 0.20, 2) AS amount,
  date_trunc('month', p.approved_at)::date AS commission_month,
  'pending' AS status
FROM public.affiliate_referrals r
JOIN public.businesses b ON b.id = r.business_id
JOIN LATERAL (
  SELECT amount, approved_at
  FROM public.payments
  WHERE business_id = b.id
    AND status = 'approved'
  ORDER BY approved_at ASC NULLS LAST, created_at ASC
  LIMIT 1
) p ON true
WHERE b.subscription_status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.affiliate_commissions c WHERE c.referral_id = r.id
  );
