-- expire_business_if_due sets a session flag before the UPDATE so the
-- protect_business_subscription_fields trigger can allow the bypass.

-- 1. Update expire_business_if_due to set the session flag
CREATE OR REPLACE FUNCTION public.expire_business_if_due(_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  IF NOT public.is_business_member(_business_id) THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.expire_business_if_due_active', 'true', true);

  UPDATE public.businesses
  SET subscription_status = 'expired',
      is_locked = true,
      updated_at = now()
  WHERE id = _business_id
    AND subscription_status NOT IN ('expired', 'locked')
    AND (subscription_expires_at IS NULL OR subscription_expires_at <= now());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- 2. Update the trigger to honour the session flag
CREATE OR REPLACE FUNCTION public.protect_business_subscription_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'super_admin') OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.expire_business_if_due_active', true) = 'true' THEN
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
