-- Create super_admins_allowlist table to replace hardcoded email check
CREATE TABLE IF NOT EXISTS public.super_admins_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on the allowlist table
ALTER TABLE public.super_admins_allowlist ENABLE ROW LEVEL SECURITY;

-- Only super admins can view/manage the allowlist
CREATE POLICY "Super admins can manage allowlist"
  ON public.super_admins_allowlist
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Insert the existing super admin email
INSERT INTO public.super_admins_allowlist (email)
VALUES ('clementmwila005@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- Update the handle_new_user function to check against the allowlist table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_payment_code TEXT;
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
    );
  END IF;
  
  RETURN NEW;
END;
$$;