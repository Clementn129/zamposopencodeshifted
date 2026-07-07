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

GRANT EXECUTE ON FUNCTION public.expire_business_if_due(uuid) TO authenticated;