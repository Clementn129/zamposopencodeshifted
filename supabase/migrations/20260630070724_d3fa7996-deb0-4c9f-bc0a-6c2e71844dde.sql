
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS plan_tier text;

-- Extend the guard so plan_tier joins the list of fields owners can't change themselves.
CREATE OR REPLACE FUNCTION public.protect_business_subscription_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
     OR NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at
     OR NEW.payment_code IS DISTINCT FROM OLD.payment_code
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.plan_tier IS DISTINCT FROM OLD.plan_tier THEN
    RAISE EXCEPTION 'Not allowed to modify subscription or billing fields';
  END IF;

  RETURN NEW;
END;
$function$;
