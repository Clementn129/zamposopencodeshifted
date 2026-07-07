
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_payment_code TEXT;
  new_business_id UUID;
  affiliate_id_found UUID;
  affiliate_code_value TEXT;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.email);
  
  -- Check if this user's email is in the super_admins_allowlist
  IF EXISTS (SELECT 1 FROM public.super_admins_allowlist WHERE email = NEW.email) THEN
    -- Assign super_admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin');
  ELSE
    -- Assign business_owner role by default
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'business_owner');
    
    -- Generate payment code and create business (only for business owners)
    new_payment_code := public.generate_payment_code();
    
    INSERT INTO public.businesses (
      user_id, 
      name, 
      payment_code, 
      subscription_status,
      trial_started_at,
      subscription_expires_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'business_name', 'My Business'),
      new_payment_code,
      'trial',
      now(),
      now() + INTERVAL '3 days'
    )
    RETURNING id INTO new_business_id;

    -- Handle affiliate referral if affiliate_code is provided in metadata
    affiliate_code_value := NEW.raw_user_meta_data ->> 'affiliate_code';
    IF affiliate_code_value IS NOT NULL AND affiliate_code_value != '' THEN
      affiliate_id_found := public.get_affiliate_by_code(affiliate_code_value);
      IF affiliate_id_found IS NOT NULL THEN
        INSERT INTO public.affiliate_referrals (affiliate_id, business_id)
        VALUES (affiliate_id_found, new_business_id);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
