-- Create or replace trigger function to auto-assign super_admin role for specific email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_payment_code TEXT;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.email);
  
  -- Check if this is the super admin email
  IF NEW.email = 'clementmwila005@gmail.com' THEN
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
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();