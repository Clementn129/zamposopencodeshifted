-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('business_owner', 'super_admin');

-- Create enum for subscription status
CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'expired', 'locked');

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('pending', 'approved', 'rejected');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'business_owner',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Create businesses table
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  payment_code TEXT NOT NULL UNIQUE,
  subscription_status subscription_status DEFAULT 'trial' NOT NULL,
  trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  is_locked BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  price DECIMAL(12, 2) NOT NULL,
  stock INTEGER DEFAULT 0 NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create sales table
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  items JSONB NOT NULL,
  subtotal DECIMAL(12, 2) NOT NULL,
  total DECIMAL(12, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  synced BOOLEAN DEFAULT false NOT NULL,
  offline_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create payments table (for subscription payments)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  status payment_status DEFAULT 'pending' NOT NULL,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create app_settings table for global settings
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_price DECIMAL(12, 2) DEFAULT 50.00 NOT NULL,
  trial_days INTEGER DEFAULT 3 NOT NULL,
  max_offline_days INTEGER DEFAULT 35 NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Insert default app settings
INSERT INTO public.app_settings (subscription_price, trial_days, max_offline_days) 
VALUES (50.00, 3, 35);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to generate unique payment code
CREATE OR REPLACE FUNCTION public.generate_payment_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'POS-' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 4));
    SELECT EXISTS(SELECT 1 FROM public.businesses WHERE payment_code = new_code) INTO code_exists;
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
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
  
  -- Assign business_owner role by default
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'business_owner');
  
  -- Generate payment code and create business
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
  
  RETURN NEW;
END;
$$;

-- Trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for businesses
CREATE POLICY "Users can view own business"
  ON public.businesses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own business"
  ON public.businesses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all businesses"
  ON public.businesses FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update all businesses"
  ON public.businesses FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for products
CREATE POLICY "Users can manage own products"
  ON public.products FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for sales
CREATE POLICY "Users can manage own sales"
  ON public.sales FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for payments
CREATE POLICY "Users can view own payments"
  ON public.payments FOR SELECT
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create payments"
  ON public.payments FOR INSERT
  WITH CHECK (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can manage all payments"
  ON public.payments FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for app_settings
CREATE POLICY "Anyone can view app settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Super admins can update app settings"
  ON public.app_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();-- Fix function search path for generate_payment_code
CREATE OR REPLACE FUNCTION public.generate_payment_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'POS-' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 4));
    SELECT EXISTS(SELECT 1 FROM public.businesses WHERE payment_code = new_code) INTO code_exists;
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

-- Fix function search path for update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;-- Create or replace trigger function to auto-assign super_admin role for specific email
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
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();-- Add business contact details columns
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

-- Create notices table for admin notifications
CREATE TABLE public.notices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ends_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on notices
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage notices
CREATE POLICY "Super admins can manage notices"
ON public.notices
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Anyone authenticated can view active notices
CREATE POLICY "Authenticated users can view active notices"
ON public.notices
FOR SELECT
USING (auth.uid() IS NOT NULL AND is_active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

-- Update app_settings to use 100 as subscription price
UPDATE public.app_settings SET subscription_price = 100;

-- Add trigger for updated_at on notices
CREATE TRIGGER update_notices_updated_at
  BEFORE UPDATE ON public.notices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();-- Create super_admins_allowlist table to replace hardcoded email check
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
$$;-- 1. Add minimum_stock column to products table for low stock alerts
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS minimum_stock integer NOT NULL DEFAULT 5;

-- 2. Add status column to sales table for refund tracking (completed, refunded, partially_refunded)
-- Create the enum type first
DO $$ BEGIN
  CREATE TYPE public.sale_status AS ENUM ('completed', 'refunded', 'partially_refunded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS status public.sale_status NOT NULL DEFAULT 'completed';

-- 3. Add discount columns to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_type text DEFAULT NULL; -- 'percentage' or 'amount'

-- 4. Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- RLS policy for expenses - users can manage their own business expenses
CREATE POLICY "Users can manage own expenses"
  ON public.expenses
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- 5. Create debtors table for credit sales
CREATE TABLE IF NOT EXISTS public.debtors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  amount_owed NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on debtors
ALTER TABLE public.debtors ENABLE ROW LEVEL SECURITY;

-- RLS policy for debtors
CREATE POLICY "Users can manage own debtors"
  ON public.debtors
  FOR ALL
  TO authenticated
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- 6. Create debtor_payments table for tracking payments
CREATE TABLE IF NOT EXISTS public.debtor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id UUID NOT NULL REFERENCES public.debtors(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on debtor_payments
ALTER TABLE public.debtor_payments ENABLE ROW LEVEL SECURITY;

-- RLS policy for debtor_payments
CREATE POLICY "Users can manage own debtor payments"
  ON public.debtor_payments
  FOR ALL
  TO authenticated
  USING (debtor_id IN (
    SELECT d.id FROM public.debtors d 
    JOIN public.businesses b ON d.business_id = b.id 
    WHERE b.user_id = auth.uid()
  ));

-- Add trigger for updated_at on expenses
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on debtors
CREATE TRIGGER update_debtors_updated_at
  BEFORE UPDATE ON public.debtors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();-- Add cost_price column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT NULL;-- Add target_business_id column to notices for targeted notices to specific businesses
ALTER TABLE public.notices 
ADD COLUMN target_business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;

-- Add index for faster lookups
CREATE INDEX idx_notices_target_business ON public.notices(target_business_id);

-- Update RLS policy for notices to include targeted notices
DROP POLICY IF EXISTS "Authenticated users can view active notices" ON public.notices;

CREATE POLICY "Authenticated users can view active notices" 
ON public.notices 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL 
  AND is_active = true 
  AND starts_at <= now() 
  AND (ends_at IS NULL OR ends_at > now())
  AND (
    target_business_id IS NULL 
    OR target_business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
    )
  )
);-- Allow super admins to delete businesses
CREATE POLICY "Super admins can delete businesses"
ON public.businesses
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Also need to handle cascade deletes for related tables
-- When a business is deleted, related records should be cleaned up

-- Add ON DELETE CASCADE to products table foreign key
ALTER TABLE public.products 
DROP CONSTRAINT IF EXISTS products_business_id_fkey;

ALTER TABLE public.products
ADD CONSTRAINT products_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to sales table foreign key
ALTER TABLE public.sales 
DROP CONSTRAINT IF EXISTS sales_business_id_fkey;

ALTER TABLE public.sales
ADD CONSTRAINT sales_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to debtors table foreign key
ALTER TABLE public.debtors 
DROP CONSTRAINT IF EXISTS debtors_business_id_fkey;

ALTER TABLE public.debtors
ADD CONSTRAINT debtors_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to expenses table foreign key
ALTER TABLE public.expenses 
DROP CONSTRAINT IF EXISTS expenses_business_id_fkey;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to payments table foreign key
ALTER TABLE public.payments 
DROP CONSTRAINT IF EXISTS payments_business_id_fkey;

ALTER TABLE public.payments
ADD CONSTRAINT payments_business_id_fkey 
FOREIGN KEY (business_id) 
REFERENCES public.businesses(id) 
ON DELETE CASCADE;

-- Add ON DELETE CASCADE to notices table foreign key (for targeted notices)
ALTER TABLE public.notices 
DROP CONSTRAINT IF EXISTS notices_target_business_id_fkey;

ALTER TABLE public.notices
ADD CONSTRAINT notices_target_business_id_fkey 
FOREIGN KEY (target_business_id) 
REFERENCES public.businesses(id) 
ON DELETE SET NULL;-- Create affiliate status enum
CREATE TYPE public.affiliate_status AS ENUM ('pending', 'active', 'suspended');

-- Create commission status enum
CREATE TYPE public.commission_status AS ENUM ('pending', 'paid');

-- Create affiliates table
CREATE TABLE public.affiliates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_code TEXT NOT NULL UNIQUE,
  status affiliate_status NOT NULL DEFAULT 'active',
  total_earnings NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create affiliate_referrals table to track which businesses were referred
CREATE TABLE public.affiliate_referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(business_id)
);

-- Create affiliate_commissions table to track monthly commissions
CREATE TABLE public.affiliate_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referral_id UUID NOT NULL REFERENCES public.affiliate_referrals(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  commission_month DATE NOT NULL,
  status commission_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(referral_id, commission_month)
);

-- Enable RLS on all affiliate tables
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

-- Affiliates policies
CREATE POLICY "Users can view own affiliate profile"
ON public.affiliates FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own affiliate profile"
ON public.affiliates FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own affiliate profile"
ON public.affiliates FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all affiliates"
ON public.affiliates FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can manage all affiliates"
ON public.affiliates FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

-- Referrals policies
CREATE POLICY "Affiliates can view own referrals"
ON public.affiliate_referrals FOR SELECT
USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all referrals"
ON public.affiliate_referrals FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can manage referrals"
ON public.affiliate_referrals FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

-- Commissions policies
CREATE POLICY "Affiliates can view own commissions"
ON public.affiliate_commissions FOR SELECT
USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));

CREATE POLICY "Super admins can view all commissions"
ON public.affiliate_commissions FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can manage commissions"
ON public.affiliate_commissions FOR ALL
USING (has_role(auth.uid(), 'super_admin'));

-- Function to generate unique affiliate code
CREATE OR REPLACE FUNCTION public.generate_affiliate_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'ZAM-' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.affiliates WHERE affiliate_code = new_code) INTO code_exists;
    IF NOT code_exists THEN
      RETURN new_code;
    END IF;
  END LOOP;
END;
$$;

-- Function to validate affiliate code and get affiliate_id (for registration)
CREATE OR REPLACE FUNCTION public.get_affiliate_by_code(code TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.affiliates WHERE affiliate_code = code AND status = 'active'
$$;

-- Trigger to update updated_at on affiliates
CREATE TRIGGER update_affiliates_updated_at
BEFORE UPDATE ON public.affiliates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster affiliate code lookups
CREATE INDEX idx_affiliates_code ON public.affiliates(affiliate_code);
CREATE INDEX idx_affiliate_referrals_affiliate ON public.affiliate_referrals(affiliate_id);
CREATE INDEX idx_affiliate_commissions_affiliate ON public.affiliate_commissions(affiliate_id);
CREATE INDEX idx_affiliate_commissions_status ON public.affiliate_commissions(status);
-- Add payout fields to affiliates table
ALTER TABLE public.affiliates
  ADD COLUMN payout_method text,
  ADD COLUMN payout_number text,
  ADD COLUMN payout_name text;

-- Add phone and full_name directly for affiliate-only users (who may not have a business)
ALTER TABLE public.affiliates
  ADD COLUMN phone text,
  ADD COLUMN full_name text;

-- Super admins can delete affiliates
CREATE POLICY "Super admins can delete affiliates"
ON public.affiliates
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Also allow cascade delete of referrals when affiliate is deleted
ALTER TABLE public.affiliate_referrals
  DROP CONSTRAINT affiliate_referrals_affiliate_id_fkey,
  ADD CONSTRAINT affiliate_referrals_affiliate_id_fkey
    FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE CASCADE;

-- Cascade delete commissions when affiliate is deleted
ALTER TABLE public.affiliate_commissions
  DROP CONSTRAINT affiliate_commissions_affiliate_id_fkey,
  ADD CONSTRAINT affiliate_commissions_affiliate_id_fkey
    FOREIGN KEY (affiliate_id) REFERENCES public.affiliates(id) ON DELETE CASCADE;

-- Create quotation status enum
DO $$ BEGIN
  CREATE TYPE quotation_status AS ENUM ('draft', 'sent', 'approved', 'rejected', 'expired', 'converted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create quotations table
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  quotation_number TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT,
  discount_value NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status quotation_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  expiry_date DATE,
  converted_sale_id UUID REFERENCES public.sales(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create quotation_items table
CREATE TABLE public.quotation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  discount_type TEXT,
  discount_value NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for quotations
CREATE POLICY "Users can manage own quotations"
ON public.quotations
FOR ALL
USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- RLS policies for quotation_items
CREATE POLICY "Users can manage own quotation items"
ON public.quotation_items
FOR ALL
USING (quotation_id IN (
  SELECT id FROM quotations WHERE business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  )
));

-- Auto-generate quotation number function
CREATE OR REPLACE FUNCTION public.generate_quotation_number(biz_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_year TEXT;
  next_seq INTEGER;
  new_number TEXT;
BEGIN
  current_year := to_char(now(), 'YYYY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(quotation_number FROM 'QT-' || current_year || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO next_seq
  FROM public.quotations
  WHERE business_id = biz_id
    AND quotation_number LIKE 'QT-' || current_year || '-%';
  
  new_number := 'QT-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
  RETURN new_number;
END;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_quotations_updated_at
BEFORE UPDATE ON public.quotations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add logo_url column to businesses
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create storage bucket for business logos
INSERT INTO storage.buckets (id, name, public) VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own logos
CREATE POLICY "Users can upload their business logo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'business-logos' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to update their logo
CREATE POLICY "Users can update their business logo"
ON storage.objects FOR UPDATE
USING (bucket_id = 'business-logos' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to delete their logo
CREATE POLICY "Users can delete their business logo"
ON storage.objects FOR DELETE
USING (bucket_id = 'business-logos' AND auth.uid() IS NOT NULL);

-- Allow public read access to logos
CREATE POLICY "Business logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'business-logos');

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
-- Allow affiliates to view businesses they referred
CREATE POLICY "Affiliates can view referred businesses"
ON public.businesses
FOR SELECT
USING (
  id IN (
    SELECT ar.business_id 
    FROM public.affiliate_referrals ar
    JOIN public.affiliates a ON ar.affiliate_id = a.id
    WHERE a.user_id = auth.uid()
  )
);
-- Fix privilege escalation: prevent non-super-admins from inserting into user_roles
CREATE POLICY "Restrict role insertion to super admins only"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Also restrict UPDATE to super admins only
CREATE POLICY "Restrict role updates to super admins only"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Restrict DELETE to super admins only
CREATE POLICY "Restrict role deletion to super admins only"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_business_offline_id_unique
ON public.sales (business_id, offline_id)
WHERE offline_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_offline_sale(
  p_business_id uuid,
  p_offline_id text,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_created_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = p_business_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;

  SELECT id INTO v_sale_id
  FROM public.sales
  WHERE business_id = p_business_id
    AND offline_id = p_offline_id
  LIMIT 1;

  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  INSERT INTO public.sales (
    business_id,
    items,
    subtotal,
    total,
    discount_amount,
    discount_type,
    payment_method,
    synced,
    offline_id,
    created_at
  ) VALUES (
    p_business_id,
    p_items,
    p_subtotal,
    p_total,
    COALESCE(p_discount_amount, 0),
    p_discount_type,
    p_payment_method,
    true,
    p_offline_id,
    COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'productId', '')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products
      SET stock = GREATEST(stock - v_quantity, 0),
          updated_at = now()
      WHERE id = v_product_id
        AND business_id = p_business_id;
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamptz) TO authenticated;REVOKE EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamptz) TO authenticated;-- Add INSERT policy for affiliate_referrals so authenticated users registering with an affiliate code can create their referral row
CREATE POLICY "Users can create referrals for own business"
ON public.affiliate_referrals
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
  AND affiliate_id IN (SELECT id FROM public.affiliates WHERE status = 'active')
);

-- Tighten business-logos storage policies: keep public read, restrict write to owners
DROP POLICY IF EXISTS "Users can upload their business logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their business logo" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their business logo" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload business logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update business logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete business logos" ON storage.objects;

CREATE POLICY "Business owners can upload their logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.businesses WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Business owners can update their logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.businesses WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Business owners can delete their logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.businesses WHERE user_id = auth.uid()
  )
);
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

-- 1. Extend role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cashier';

-- business_cashiers table
CREATE TABLE IF NOT EXISTS public.business_cashiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  auth_user_id UUID NOT NULL UNIQUE,
  username TEXT NOT NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, username)
);

ALTER TABLE public.business_cashiers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_business_cashiers_business ON public.business_cashiers(business_id);
CREATE INDEX IF NOT EXISTS idx_business_cashiers_auth_user ON public.business_cashiers(auth_user_id);

CREATE POLICY "Owners view own cashiers" ON public.business_cashiers FOR SELECT
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Owners delete own cashiers" ON public.business_cashiers FOR DELETE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Owners update own cashiers" ON public.business_cashiers FOR UPDATE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

CREATE POLICY "Cashiers view own row" ON public.business_cashiers FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Super admins manage cashiers" ON public.business_cashiers FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Cap 3 active cashiers per business
CREATE OR REPLACE FUNCTION public.enforce_cashier_cap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE active_count INT;
BEGIN
  IF NEW.is_active THEN
    SELECT COUNT(*) INTO active_count FROM public.business_cashiers
    WHERE business_id = NEW.business_id AND is_active = true
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
    IF active_count >= 3 THEN
      RAISE EXCEPTION 'CASHIER_LIMIT_REACHED' USING HINT = 'You have reached the 3 active cashier limit. Contact support to upgrade.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_enforce_cashier_cap
  BEFORE INSERT OR UPDATE OF is_active, business_id ON public.business_cashiers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cashier_cap();

CREATE TRIGGER trg_business_cashiers_updated_at
  BEFORE UPDATE ON public.business_cashiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helpers
CREATE OR REPLACE FUNCTION public.is_business_member(_business_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = _business_id AND b.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.business_cashiers c
                  WHERE c.business_id = _business_id AND c.auth_user_id = auth.uid() AND c.is_active = true);
$$;

CREATE OR REPLACE FUNCTION public.get_my_business_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT id FROM public.businesses WHERE user_id = auth.uid() LIMIT 1),
    (SELECT business_id FROM public.business_cashiers WHERE auth_user_id = auth.uid() AND is_active = true LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.lookup_business_by_code(_code TEXT)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.businesses WHERE payment_code = upper(_code) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'super_admin') THEN 'super_admin'
    WHEN EXISTS (SELECT 1 FROM public.business_cashiers WHERE auth_user_id = auth.uid() AND is_active = true) THEN 'cashier'
    WHEN EXISTS (SELECT 1 FROM public.businesses WHERE user_id = auth.uid()) THEN 'owner'
    ELSE 'unknown'
  END;
$$;

-- Tighten products: cashiers SELECT, owners mutate
DROP POLICY IF EXISTS "Users can manage own products" ON public.products;

CREATE POLICY "Members can view products" ON public.products FOR SELECT
  USING (public.is_business_member(business_id));
CREATE POLICY "Owners can insert products" ON public.products FOR INSERT
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
CREATE POLICY "Owners can update products" ON public.products FOR UPDATE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
CREATE POLICY "Owners can delete products" ON public.products FOR DELETE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- Sales: members can read & create; owners can update/delete
DROP POLICY IF EXISTS "Users can manage own sales" ON public.sales;

CREATE POLICY "Members can view sales" ON public.sales FOR SELECT
  USING (public.is_business_member(business_id));
CREATE POLICY "Members can create sales" ON public.sales FOR INSERT
  WITH CHECK (public.is_business_member(business_id));
CREATE POLICY "Owners can update sales" ON public.sales FOR UPDATE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
CREATE POLICY "Owners can delete sales" ON public.sales FOR DELETE
  USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

-- Update sync_offline_sale to allow cashiers
CREATE OR REPLACE FUNCTION public.sync_offline_sale(p_business_id uuid, p_offline_id text, p_items jsonb, p_subtotal numeric, p_total numeric, p_discount_amount numeric DEFAULT 0, p_discount_type text DEFAULT NULL::text, p_payment_method text DEFAULT 'cash'::text, p_created_at timestamp with time zone DEFAULT now())
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_sale_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;
  SELECT id INTO v_sale_id FROM public.sales
    WHERE business_id = p_business_id AND offline_id = p_offline_id LIMIT 1;
  IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;
  INSERT INTO public.sales (business_id, items, subtotal, total, discount_amount, discount_type, payment_method, synced, offline_id, created_at)
    VALUES (p_business_id, p_items, p_subtotal, p_total, COALESCE(p_discount_amount, 0), p_discount_type, p_payment_method, true, p_offline_id, COALESCE(p_created_at, now()))
    RETURNING id INTO v_sale_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'productId', '')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products SET stock = GREATEST(stock - v_quantity, 0), updated_at = now()
        WHERE id = v_product_id AND business_id = p_business_id;
    END IF;
  END LOOP;
  RETURN v_sale_id;
END; $function$;

CREATE POLICY "Cashiers can view their business"
  ON public.businesses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.business_cashiers c
    WHERE c.business_id = businesses.id
      AND c.auth_user_id = auth.uid()
      AND c.is_active = true
  ));

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

-- ============================================================
-- Phase 1: Sale sync hardening (dedupe + realtime)
-- ============================================================

-- Dedupe offline sales: same offline_id can't insert twice
CREATE UNIQUE INDEX IF NOT EXISTS sales_business_offline_id_uniq
  ON public.sales (business_id, offline_id)
  WHERE offline_id IS NOT NULL;

-- Enable realtime for sales and products (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sales'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sales';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='products'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.products';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='quotations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.quotations';
  END IF;
END $$;

-- Ensure full row data flows in realtime payloads
ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.quotations REPLICA IDENTITY FULL;

-- ============================================================
-- Phase 1b: Allow cashiers to create debtors (credit sales)
-- ============================================================

DROP POLICY IF EXISTS "Users can manage own debtors" ON public.debtors;

CREATE POLICY "Members can view debtors"
  ON public.debtors FOR SELECT
  USING (public.is_business_member(business_id));

CREATE POLICY "Members can insert debtors"
  ON public.debtors FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Owners can update debtors"
  ON public.debtors FOR UPDATE
  USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can delete debtors"
  ON public.debtors FOR DELETE
  USING (public.owns_business(business_id));

-- ============================================================
-- Phase 2: Quotation system — allow cashiers + atomic RPCs
-- ============================================================

DROP POLICY IF EXISTS "Users can manage own quotations" ON public.quotations;

CREATE POLICY "Members can view quotations"
  ON public.quotations FOR SELECT
  USING (public.is_business_member(business_id));

CREATE POLICY "Members can insert quotations"
  ON public.quotations FOR INSERT
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Members can update quotations"
  ON public.quotations FOR UPDATE
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

CREATE POLICY "Owners can delete quotations"
  ON public.quotations FOR DELETE
  USING (public.owns_business(business_id));

DROP POLICY IF EXISTS "Users can manage own quotation items" ON public.quotation_items;

CREATE POLICY "Members can view quotation items"
  ON public.quotation_items FOR SELECT
  USING (quotation_id IN (SELECT id FROM public.quotations WHERE public.is_business_member(business_id)));

CREATE POLICY "Members can insert quotation items"
  ON public.quotation_items FOR INSERT
  WITH CHECK (quotation_id IN (SELECT id FROM public.quotations WHERE public.is_business_member(business_id)));

CREATE POLICY "Members can update quotation items"
  ON public.quotation_items FOR UPDATE
  USING (quotation_id IN (SELECT id FROM public.quotations WHERE public.is_business_member(business_id)));

CREATE POLICY "Members can delete quotation items"
  ON public.quotation_items FOR DELETE
  USING (quotation_id IN (SELECT id FROM public.quotations WHERE public.is_business_member(business_id)));

-- Atomic create quotation + items
CREATE OR REPLACE FUNCTION public.create_quotation_with_items(
  p_business_id uuid,
  p_header jsonb,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_item jsonb;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_number := public.generate_quotation_number(p_business_id);

  INSERT INTO public.quotations (
    business_id, quotation_number,
    customer_name, customer_phone, customer_email,
    subtotal, discount_type, discount_value, discount_amount, total,
    status, notes, expiry_date
  ) VALUES (
    p_business_id, v_number,
    p_header->>'customer_name', p_header->>'customer_phone', p_header->>'customer_email',
    COALESCE((p_header->>'subtotal')::numeric, 0),
    p_header->>'discount_type',
    COALESCE((p_header->>'discount_value')::numeric, 0),
    COALESCE((p_header->>'discount_amount')::numeric, 0),
    COALESCE((p_header->>'total')::numeric, 0),
    COALESCE((p_header->>'status')::quotation_status, 'draft'::quotation_status),
    p_header->>'notes',
    NULLIF(p_header->>'expiry_date','')::date
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.quotation_items (
      quotation_id, product_id, product_name, quantity, unit_price,
      discount_type, discount_value, line_total
    ) VALUES (
      v_id,
      NULLIF(v_item->>'product_id','')::uuid,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      v_item->>'discount_type',
      COALESCE((v_item->>'discount_value')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;

-- Atomic convert quotation → sale (decrements stock via sales path)
CREATE OR REPLACE FUNCTION public.convert_quotation_to_sale(
  p_quotation_id uuid,
  p_payment_method text DEFAULT 'cash'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid;
  v_subtotal numeric;
  v_total numeric;
  v_discount_amount numeric;
  v_discount_type text;
  v_items jsonb;
  v_sale_id uuid;
  v_offline_id text;
BEGIN
  SELECT business_id, subtotal, total, discount_amount, discount_type
    INTO v_biz, v_subtotal, v_total, v_discount_amount, v_discount_type
    FROM public.quotations WHERE id = p_quotation_id;

  IF v_biz IS NULL THEN RAISE EXCEPTION 'Quotation not found'; END IF;
  IF NOT public.is_business_member(v_biz) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'productId', product_id,
    'name', product_name,
    'price', unit_price,
    'quantity', quantity,
    'discountType', discount_type,
    'discountValue', discount_value
  )) INTO v_items
  FROM public.quotation_items WHERE quotation_id = p_quotation_id;

  v_offline_id := 'qt_' || p_quotation_id::text;

  v_sale_id := public.sync_offline_sale(
    v_biz, v_offline_id, COALESCE(v_items, '[]'::jsonb),
    v_subtotal, v_total, COALESCE(v_discount_amount, 0),
    v_discount_type, p_payment_method, now()
  );

  UPDATE public.quotations
    SET status = 'converted', converted_sale_id = v_sale_id, updated_at = now()
    WHERE id = p_quotation_id;

  RETURN v_sale_id;
END;
$$;

-- ============================================================
-- Phase 1c: Harden sync_offline_sale (already SECURITY DEFINER,
-- already dedupes, already decrements stock — leave it as-is)
-- but explicit GRANT EXECUTE so cashiers can call it
-- ============================================================

GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_quotation_with_items(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_sale(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_quotation_with_items(uuid, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.convert_quotation_to_sale(uuid, text) FROM PUBLIC, anon;
-- Scalability indexes for frequently queried columns
-- Sales: filtered by business_id + ordered by created_at + offline_id dedupe + status
CREATE INDEX IF NOT EXISTS idx_sales_business_created ON public.sales (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_business_status ON public.sales (business_id, status) WHERE status <> 'completed';

-- Products: filtered by business_id + is_active, lookups by id within business
CREATE INDEX IF NOT EXISTS idx_products_business_active ON public.products (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_business_updated ON public.products (business_id, updated_at DESC);

-- Quotations
CREATE INDEX IF NOT EXISTS idx_quotations_business_created ON public.quotations (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_business_status ON public.quotations (business_id, status);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items (quotation_id);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_business_date ON public.expenses (business_id, expense_date DESC);

-- Debtors / debtor_payments
CREATE INDEX IF NOT EXISTS idx_debtors_business_created ON public.debtors (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_business_status ON public.debtors (business_id, status);
CREATE INDEX IF NOT EXISTS idx_debtor_payments_debtor_date ON public.debtor_payments (debtor_id, payment_date DESC);

-- Cashiers (lookup by auth_user_id is hot path on every request via is_business_member)
CREATE INDEX IF NOT EXISTS idx_business_cashiers_auth_user ON public.business_cashiers (auth_user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_business_cashiers_business ON public.business_cashiers (business_id) WHERE is_active = true;

-- Businesses: owner lookup
CREATE INDEX IF NOT EXISTS idx_businesses_user ON public.businesses (user_id);

-- User roles: hot path for has_role()
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

-- Notices: active windowed scan
CREATE INDEX IF NOT EXISTS idx_notices_active_window ON public.notices (is_active, starts_at, ends_at) WHERE is_active = true;CREATE OR REPLACE FUNCTION public.expire_business_if_due(_business_id uuid)
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
-- 1) businesses tax/TPIN fields
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS tpin text,
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 16,
  ADD COLUMN IF NOT EXISTS custom_tax_name text,
  ADD COLUMN IF NOT EXISTS custom_tax_rate numeric(5,2);

-- 2) products tax category
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_category text NOT NULL DEFAULT 'taxable';

-- 3) sales tax + customer fields
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_tpin text,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zero_rated_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exempt_amount numeric(12,2) NOT NULL DEFAULT 0;

-- 4) quotations tax + customer TPIN
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS customer_tpin text,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0;

-- 5) update sync_offline_sale RPC to accept new tax/customer fields (backwards compatible — all optional)
CREATE OR REPLACE FUNCTION public.sync_offline_sale(
  p_business_id uuid,
  p_offline_id text,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_created_at timestamp with time zone DEFAULT now(),
  p_tax_amount numeric DEFAULT 0,
  p_taxable_amount numeric DEFAULT 0,
  p_zero_rated_amount numeric DEFAULT 0,
  p_exempt_amount numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL,
  p_customer_tpin text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;
  SELECT id INTO v_sale_id FROM public.sales
    WHERE business_id = p_business_id AND offline_id = p_offline_id LIMIT 1;
  IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;
  INSERT INTO public.sales (
    business_id, items, subtotal, total, discount_amount, discount_type,
    payment_method, synced, offline_id, created_at,
    tax_amount, taxable_amount, zero_rated_amount, exempt_amount,
    customer_name, customer_tpin
  ) VALUES (
    p_business_id, p_items, p_subtotal, p_total, COALESCE(p_discount_amount, 0), p_discount_type,
    p_payment_method, true, p_offline_id, COALESCE(p_created_at, now()),
    COALESCE(p_tax_amount, 0), COALESCE(p_taxable_amount, 0),
    COALESCE(p_zero_rated_amount, 0), COALESCE(p_exempt_amount, 0),
    NULLIF(trim(p_customer_name), ''), NULLIF(trim(p_customer_tpin), '')
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'productId', '')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products SET stock = GREATEST(stock - v_quantity, 0), updated_at = now()
        WHERE id = v_product_id AND business_id = p_business_id;
    END IF;
  END LOOP;
  RETURN v_sale_id;
END; $$;

-- 6) update create_quotation_with_items to support customer_tpin + tax_amount
CREATE OR REPLACE FUNCTION public.create_quotation_with_items(p_business_id uuid, p_header jsonb, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_item jsonb;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  v_number := public.generate_quotation_number(p_business_id);

  INSERT INTO public.quotations (
    business_id, quotation_number,
    customer_name, customer_phone, customer_email, customer_tpin,
    subtotal, discount_type, discount_value, discount_amount, tax_amount, total,
    status, notes, expiry_date
  ) VALUES (
    p_business_id, v_number,
    p_header->>'customer_name', p_header->>'customer_phone', p_header->>'customer_email', p_header->>'customer_tpin',
    COALESCE((p_header->>'subtotal')::numeric, 0),
    p_header->>'discount_type',
    COALESCE((p_header->>'discount_value')::numeric, 0),
    COALESCE((p_header->>'discount_amount')::numeric, 0),
    COALESCE((p_header->>'tax_amount')::numeric, 0),
    COALESCE((p_header->>'total')::numeric, 0),
    COALESCE((p_header->>'status')::quotation_status, 'draft'::quotation_status),
    p_header->>'notes',
    NULLIF(p_header->>'expiry_date','')::date
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.quotation_items (
      quotation_id, product_id, product_name, quantity, unit_price,
      discount_type, discount_value, line_total
    ) VALUES (
      v_id,
      NULLIF(v_item->>'product_id','')::uuid,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      v_item->>'discount_type',
      COALESCE((v_item->>'discount_value')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0)
    );
  END LOOP;

  RETURN v_id;
END;
$$;

-- 1. Payment status enum
DO $$ BEGIN
  CREATE TYPE public.sale_payment_status AS ENUM ('paid','pending','partially_paid','overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add columns to sales
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS amount_paid numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status public.sale_payment_status NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS customer_phone text;

-- 3. Backfill existing rows as fully paid
UPDATE public.sales
SET amount_paid = total,
    balance_due = 0,
    payment_status = 'paid'
WHERE amount_paid = 0 AND payment_status = 'paid';

-- 4. Trigger to auto-maintain balance & status
CREATE OR REPLACE FUNCTION public.set_sale_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount_paid IS NULL THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid < 0 THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid > NEW.total THEN NEW.amount_paid := NEW.total; END IF;

  NEW.balance_due := GREATEST(NEW.total - NEW.amount_paid, 0);

  IF NEW.balance_due = 0 THEN
    NEW.payment_status := 'paid';
  ELSIF NEW.amount_paid = 0 THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'pending';
    END IF;
  ELSE
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'partially_paid';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_set_payment_status ON public.sales;
CREATE TRIGGER trg_sales_set_payment_status
  BEFORE INSERT OR UPDATE OF amount_paid, total, due_date ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_payment_status();

-- 5. Sale payments ledger
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL DEFAULT 'cash',
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  payment_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_payments TO authenticated;
GRANT ALL ON public.sale_payments TO service_role;
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON public.sale_payments(sale_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_sale_payments_business_date ON public.sale_payments(business_id, payment_date DESC);

DROP POLICY IF EXISTS "Members can view sale payments" ON public.sale_payments;
CREATE POLICY "Members can view sale payments" ON public.sale_payments
  FOR SELECT USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members can insert sale payments" ON public.sale_payments;
CREATE POLICY "Members can insert sale payments" ON public.sale_payments
  FOR INSERT WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Owners can delete sale payments" ON public.sale_payments;
CREATE POLICY "Owners can delete sale payments" ON public.sale_payments
  FOR DELETE USING (public.owns_business(business_id));

-- 6. Atomic record_sale_payment RPC
CREATE OR REPLACE FUNCTION public.record_sale_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'cash',
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_total numeric;
  v_paid numeric;
  v_remaining numeric;
  v_apply numeric;
  v_payment_id uuid;
BEGIN
  SELECT business_id, total, amount_paid INTO v_business_id, v_total, v_paid
    FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Sale not found'; END IF;
  IF NOT public.is_business_member(v_business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  v_remaining := GREATEST(v_total - v_paid, 0);
  v_apply := LEAST(p_amount, v_remaining);
  IF v_apply <= 0 THEN RAISE EXCEPTION 'Sale already fully paid'; END IF;

  INSERT INTO public.sale_payments (sale_id, business_id, amount, payment_method, notes, recorded_by)
    VALUES (p_sale_id, v_business_id, v_apply, COALESCE(p_payment_method,'cash'), p_notes, auth.uid())
    RETURNING id INTO v_payment_id;

  UPDATE public.sales SET amount_paid = v_paid + v_apply WHERE id = p_sale_id;

  RETURN v_payment_id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_sale_payment(uuid, numeric, text, text) TO authenticated;

-- 7. Extend sync_offline_sale with payment fields (new overload)
CREATE OR REPLACE FUNCTION public.sync_offline_sale(
  p_business_id uuid,
  p_offline_id text,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_created_at timestamptz DEFAULT now(),
  p_tax_amount numeric DEFAULT 0,
  p_taxable_amount numeric DEFAULT 0,
  p_zero_rated_amount numeric DEFAULT 0,
  p_exempt_amount numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL,
  p_customer_tpin text DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_customer_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer; v_paid numeric;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;
  SELECT id INTO v_sale_id FROM public.sales
    WHERE business_id = p_business_id AND offline_id = p_offline_id LIMIT 1;
  IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;

  v_paid := COALESCE(p_amount_paid, p_total);

  INSERT INTO public.sales (
    business_id, items, subtotal, total, discount_amount, discount_type,
    payment_method, synced, offline_id, created_at,
    tax_amount, taxable_amount, zero_rated_amount, exempt_amount,
    customer_name, customer_tpin, customer_phone, amount_paid, due_date
  ) VALUES (
    p_business_id, p_items, p_subtotal, p_total, COALESCE(p_discount_amount,0), p_discount_type,
    p_payment_method, true, p_offline_id, COALESCE(p_created_at, now()),
    COALESCE(p_tax_amount,0), COALESCE(p_taxable_amount,0),
    COALESCE(p_zero_rated_amount,0), COALESCE(p_exempt_amount,0),
    NULLIF(trim(p_customer_name),''), NULLIF(trim(p_customer_tpin),''),
    NULLIF(trim(p_customer_phone),''), v_paid, p_due_date
  ) RETURNING id INTO v_sale_id;

  -- If credit/partial sale, log the upfront payment in the ledger
  IF v_paid > 0 AND v_paid < p_total THEN
    INSERT INTO public.sale_payments (sale_id, business_id, amount, payment_method, notes, recorded_by)
      VALUES (v_sale_id, p_business_id, v_paid, COALESCE(p_payment_method,'cash'), 'Initial deposit', auth.uid());
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'productId','')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products SET stock = GREATEST(stock - v_quantity, 0), updated_at = now()
        WHERE id = v_product_id AND business_id = p_business_id;
    END IF;
  END LOOP;
  RETURN v_sale_id;
END $$;

-- 8. Realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.debtors;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.debtor_payments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Extend products with image, variant linkage, and variant label
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS variant_label TEXT;

CREATE INDEX IF NOT EXISTS idx_products_parent_id ON public.products(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_business_active ON public.products(business_id, is_active);

-- Prevent nested variants (variant of a variant)
CREATE OR REPLACE FUNCTION public.prevent_nested_variants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_parent UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT parent_id INTO v_parent_parent FROM public.products WHERE id = NEW.parent_id;
  IF v_parent_parent IS NOT NULL THEN
    RAISE EXCEPTION 'NESTED_VARIANT_NOT_ALLOWED' USING HINT = 'A variant cannot itself have variants.';
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'SELF_PARENT_NOT_ALLOWED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_nested_variants ON public.products;
CREATE TRIGGER trg_prevent_nested_variants
  BEFORE INSERT OR UPDATE OF parent_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.prevent_nested_variants();

-- Block deactivating / deleting a parent while it has active variants
CREATE OR REPLACE FUNCTION public.guard_parent_with_active_variants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_active = false AND OLD.is_active = true THEN
      SELECT COUNT(*) INTO v_count FROM public.products
        WHERE parent_id = NEW.id AND is_active = true;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'PARENT_HAS_ACTIVE_VARIANTS'
          USING HINT = 'Remove or deactivate all variants before deactivating this product.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_parent_with_active_variants ON public.products;
CREATE TRIGGER trg_guard_parent_with_active_variants
  BEFORE UPDATE OF is_active ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_parent_with_active_variants();

-- 2. Categories table
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Owners and cashiers can read categories of their business
CREATE POLICY "Business members can view categories"
  ON public.product_categories FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

-- Only owners can write categories
CREATE POLICY "Owners can insert categories"
  ON public.product_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can update categories"
  ON public.product_categories FOR UPDATE
  TO authenticated
  USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can delete categories"
  ON public.product_categories FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

DROP TRIGGER IF EXISTS trg_product_categories_updated_at ON public.product_categories;
CREATE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill categories from existing free-text product.category values
INSERT INTO public.product_categories (business_id, name)
SELECT DISTINCT business_id, TRIM(category)
  FROM public.products
  WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (business_id, name) DO NOTHING;

-- Files are stored at: product-images/{business_id}/{filename}
-- First path segment is the business id.

CREATE POLICY "Business members can view product images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_business_member((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Owners can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.owns_business((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Owners can update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.owns_business((storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.owns_business((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Owners can delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.owns_business((storage.foldername(name))[1]::uuid)
  );

-- 1. Stock adjustment requests table
CREATE TABLE public.stock_adjustment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  requester_name text,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('add','remove')),
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sar_business_status ON public.stock_adjustment_requests(business_id, status);
CREATE INDEX idx_sar_product ON public.stock_adjustment_requests(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustment_requests TO authenticated;
GRANT ALL ON public.stock_adjustment_requests TO service_role;

ALTER TABLE public.stock_adjustment_requests ENABLE ROW LEVEL SECURITY;

-- Anyone in the business can view their requests
CREATE POLICY "Business members can view adjustment requests"
  ON public.stock_adjustment_requests FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

-- Anyone in the business can create a request (forced to pending + requested_by = self)
CREATE POLICY "Business members can create adjustment requests"
  ON public.stock_adjustment_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_business_member(business_id)
    AND requested_by = auth.uid()
    AND status = 'pending'
  );

-- Only owners can update (approve/reject) requests for their business
CREATE POLICY "Owners can update adjustment requests"
  ON public.stock_adjustment_requests FOR UPDATE
  TO authenticated
  USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));

-- Only owners can delete requests
CREATE POLICY "Owners can delete adjustment requests"
  ON public.stock_adjustment_requests FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

CREATE TRIGGER update_sar_updated_at
  BEFORE UPDATE ON public.stock_adjustment_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Approve RPC: owner-only, applies delta and marks approved atomically
CREATE OR REPLACE FUNCTION public.approve_stock_adjustment(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid;
  v_product uuid;
  v_variant uuid;
  v_type text;
  v_qty integer;
  v_status text;
  v_target uuid;
  v_delta integer;
BEGIN
  SELECT business_id, product_id, variant_id, adjustment_type, quantity, status
    INTO v_biz, v_product, v_variant, v_type, v_qty, v_status
    FROM public.stock_adjustment_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF v_biz IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.owns_business(v_biz) THEN RAISE EXCEPTION 'Only the business owner can approve'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Request already %', v_status; END IF;

  v_target := COALESCE(v_variant, v_product);
  v_delta := CASE WHEN v_type = 'add' THEN v_qty ELSE -v_qty END;

  UPDATE public.products
    SET stock = GREATEST(stock + v_delta, 0), updated_at = now()
    WHERE id = v_target AND business_id = v_biz;

  UPDATE public.stock_adjustment_requests
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = p_note
    WHERE id = p_request_id;

  RETURN p_request_id;
END;
$$;

-- 3. Reject RPC
CREATE OR REPLACE FUNCTION public.reject_stock_adjustment(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid;
  v_status text;
BEGIN
  SELECT business_id, status INTO v_biz, v_status
    FROM public.stock_adjustment_requests
    WHERE id = p_request_id
    FOR UPDATE;

  IF v_biz IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.owns_business(v_biz) THEN RAISE EXCEPTION 'Only the business owner can reject'; END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'Request already %', v_status; END IF;

  UPDATE public.stock_adjustment_requests
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = p_note
    WHERE id = p_request_id;

  RETURN p_request_id;
END;
$$;

-- 1. Add the missing trigger on auth.users so signups create profile/role/business
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Seed the super admin allowlist
INSERT INTO public.super_admins_allowlist (email)
VALUES ('zampos129@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- 3. Backfill any existing auth users that were created before the trigger existed
DO $$
DECLARE u RECORD; new_payment_code TEXT; new_business_id UUID;
BEGIN
  FOR u IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (u.id, u.raw_user_meta_data->>'full_name', u.email)
    ON CONFLICT (user_id) DO NOTHING;

    IF EXISTS (SELECT 1 FROM public.super_admins_allowlist WHERE email = u.email) THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'business_owner')
      ON CONFLICT (user_id, role) DO NOTHING;

      IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE user_id = u.id) THEN
        new_payment_code := public.generate_payment_code();
        INSERT INTO public.businesses (
          user_id, name, payment_code, subscription_status,
          trial_started_at, subscription_expires_at
        ) VALUES (
          u.id,
          COALESCE(u.raw_user_meta_data->>'business_name', 'My Business'),
          new_payment_code,
          'trial',
          now(),
          now() + INTERVAL '3 days'
        );
      END IF;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE INDEX IF NOT EXISTS products_business_barcode_idx ON public.products(business_id, barcode) WHERE barcode IS NOT NULL;

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'business';
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (category IN ('business','personal'));

-- Phase A: Cashier attribution on sales + overdue debtor status (additive)

-- 1. Add cashier attribution columns to sales (nullable for backward compat)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cashier_id uuid,
  ADD COLUMN IF NOT EXISTS cashier_name text,
  ADD COLUMN IF NOT EXISTS cashier_username text;

-- 2. Extend debtor status check to support 'overdue'
ALTER TABLE public.debtors DROP CONSTRAINT IF EXISTS debtors_status_check;
ALTER TABLE public.debtors ADD CONSTRAINT debtors_status_check
  CHECK (status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text, 'overdue'::text]));

-- 3. Add a due_date to debtors so we can compute overdue
ALTER TABLE public.debtors
  ADD COLUMN IF NOT EXISTS due_date date;

-- 4. Trigger to auto-maintain debtor status
CREATE OR REPLACE FUNCTION public.set_debtor_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount_paid IS NULL THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid < 0 THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid > NEW.amount_owed THEN NEW.amount_paid := NEW.amount_owed; END IF;

  IF NEW.amount_paid >= NEW.amount_owed THEN
    NEW.status := 'paid';
  ELSIF NEW.amount_paid = 0 THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.status := 'overdue';
    ELSE
      NEW.status := 'unpaid';
    END IF;
  ELSE
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.status := 'overdue';
    ELSE
      NEW.status := 'partially_paid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_debtor_status ON public.debtors;
CREATE TRIGGER trg_set_debtor_status
  BEFORE INSERT OR UPDATE OF amount_paid, amount_owed, due_date
  ON public.debtors
  FOR EACH ROW EXECUTE FUNCTION public.set_debtor_status();

-- 5. Update sync_offline_sale (latest overload) to also record cashier
CREATE OR REPLACE FUNCTION public.sync_offline_sale(
  p_business_id uuid,
  p_offline_id text,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_created_at timestamp with time zone DEFAULT now(),
  p_tax_amount numeric DEFAULT 0,
  p_taxable_amount numeric DEFAULT 0,
  p_zero_rated_amount numeric DEFAULT 0,
  p_exempt_amount numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL,
  p_customer_tpin text DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_customer_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sale_id uuid; v_item jsonb; v_product_id uuid; v_quantity integer; v_paid numeric;
  v_cashier_id uuid; v_cashier_name text; v_cashier_username text;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;

  SELECT id INTO v_sale_id FROM public.sales
    WHERE business_id = p_business_id AND offline_id = p_offline_id LIMIT 1;
  IF v_sale_id IS NOT NULL THEN RETURN v_sale_id; END IF;

  v_paid := COALESCE(p_amount_paid, p_total);
  v_cashier_id := auth.uid();

  -- Resolve cashier display name: prefer business_cashiers entry, fall back to profile, fall back to owner
  SELECT bc.full_name, bc.username INTO v_cashier_name, v_cashier_username
    FROM public.business_cashiers bc
    WHERE bc.business_id = p_business_id AND bc.auth_user_id = v_cashier_id AND bc.is_active = true
    LIMIT 1;

  IF v_cashier_name IS NULL THEN
    SELECT COALESCE(pr.full_name, pr.email, 'Owner'), pr.email
      INTO v_cashier_name, v_cashier_username
      FROM public.profiles pr
      WHERE pr.user_id = v_cashier_id;
  END IF;

  INSERT INTO public.sales (
    business_id, items, subtotal, total, discount_amount, discount_type,
    payment_method, synced, offline_id, created_at,
    tax_amount, taxable_amount, zero_rated_amount, exempt_amount,
    customer_name, customer_tpin, customer_phone, amount_paid, due_date,
    cashier_id, cashier_name, cashier_username
  ) VALUES (
    p_business_id, p_items, p_subtotal, p_total, COALESCE(p_discount_amount,0), p_discount_type,
    p_payment_method, true, p_offline_id, COALESCE(p_created_at, now()),
    COALESCE(p_tax_amount,0), COALESCE(p_taxable_amount,0),
    COALESCE(p_zero_rated_amount,0), COALESCE(p_exempt_amount,0),
    NULLIF(trim(p_customer_name),''), NULLIF(trim(p_customer_tpin),''),
    NULLIF(trim(p_customer_phone),''), v_paid, p_due_date,
    v_cashier_id, v_cashier_name, v_cashier_username
  ) RETURNING id INTO v_sale_id;

  IF v_paid > 0 AND v_paid < p_total THEN
    INSERT INTO public.sale_payments (sale_id, business_id, amount, payment_method, notes, recorded_by)
      VALUES (v_sale_id, p_business_id, v_paid, COALESCE(p_payment_method,'cash'), 'Initial deposit', v_cashier_id);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := NULLIF(v_item->>'productId','')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products SET stock = GREATEST(stock - v_quantity, 0), updated_at = now()
        WHERE id = v_product_id AND business_id = p_business_id;
    END IF;
  END LOOP;
  RETURN v_sale_id;
END $$;

-- 6. Backfill cashier_name for existing sales using the business owner's profile (best-effort, non-destructive)
UPDATE public.sales s
   SET cashier_id = b.user_id,
       cashier_name = COALESCE(pr.full_name, pr.email, 'Owner'),
       cashier_username = pr.email
  FROM public.businesses b
  LEFT JOIN public.profiles pr ON pr.user_id = b.user_id
 WHERE s.business_id = b.id
   AND s.cashier_name IS NULL;
-- Keep one unambiguous sale-sync RPC and fix cashier display name lookup.
-- Existing sales/products/data are not deleted or changed by this migration.

DROP FUNCTION IF EXISTS public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone);
DROP FUNCTION IF EXISTS public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text);

CREATE OR REPLACE FUNCTION public.sync_offline_sale(
  p_business_id uuid,
  p_offline_id text,
  p_items jsonb,
  p_subtotal numeric,
  p_total numeric,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL,
  p_payment_method text DEFAULT 'cash',
  p_created_at timestamp with time zone DEFAULT now(),
  p_tax_amount numeric DEFAULT 0,
  p_taxable_amount numeric DEFAULT 0,
  p_zero_rated_amount numeric DEFAULT 0,
  p_exempt_amount numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL,
  p_customer_tpin text DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_customer_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_paid numeric;
  v_cashier_id uuid;
  v_cashier_name text;
  v_cashier_username text;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'Not allowed to sync this sale';
  END IF;

  SELECT id INTO v_sale_id
  FROM public.sales
  WHERE business_id = p_business_id
    AND offline_id = p_offline_id
  LIMIT 1;

  IF v_sale_id IS NOT NULL THEN
    RETURN v_sale_id;
  END IF;

  v_paid := LEAST(GREATEST(COALESCE(p_amount_paid, p_total), 0), COALESCE(p_total, 0));
  v_cashier_id := auth.uid();

  -- Cashier accounts use display_name, not full_name.
  SELECT COALESCE(NULLIF(trim(bc.display_name), ''), bc.username), bc.username
    INTO v_cashier_name, v_cashier_username
  FROM public.business_cashiers bc
  WHERE bc.business_id = p_business_id
    AND bc.auth_user_id = v_cashier_id
    AND bc.is_active = true
  LIMIT 1;

  IF v_cashier_name IS NULL THEN
    SELECT COALESCE(NULLIF(trim(pr.full_name), ''), pr.email, 'Owner'), pr.email
      INTO v_cashier_name, v_cashier_username
    FROM public.profiles pr
    WHERE pr.user_id = v_cashier_id
    LIMIT 1;
  END IF;

  INSERT INTO public.sales (
    business_id, items, subtotal, total, discount_amount, discount_type,
    payment_method, synced, offline_id, created_at,
    tax_amount, taxable_amount, zero_rated_amount, exempt_amount,
    customer_name, customer_tpin, customer_phone, amount_paid, due_date,
    cashier_id, cashier_name, cashier_username
  ) VALUES (
    p_business_id,
    COALESCE(p_items, '[]'::jsonb),
    COALESCE(p_subtotal, 0),
    COALESCE(p_total, 0),
    COALESCE(p_discount_amount, 0),
    p_discount_type,
    COALESCE(NULLIF(trim(p_payment_method), ''), 'cash'),
    true,
    p_offline_id,
    COALESCE(p_created_at, now()),
    COALESCE(p_tax_amount, 0),
    COALESCE(p_taxable_amount, 0),
    COALESCE(p_zero_rated_amount, 0),
    COALESCE(p_exempt_amount, 0),
    NULLIF(trim(p_customer_name), ''),
    NULLIF(trim(p_customer_tpin), ''),
    NULLIF(trim(p_customer_phone), ''),
    v_paid,
    p_due_date,
    v_cashier_id,
    COALESCE(v_cashier_name, 'Staff'),
    v_cashier_username
  ) RETURNING id INTO v_sale_id;

  IF v_paid > 0 AND v_paid < COALESCE(p_total, 0) THEN
    INSERT INTO public.sale_payments (sale_id, business_id, amount, payment_method, notes, recorded_by)
    VALUES (v_sale_id, p_business_id, v_paid, COALESCE(NULLIF(trim(p_payment_method), ''), 'cash'), 'Initial deposit', v_cashier_id);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_product_id := NULLIF(v_item->>'productId', '')::uuid;
    v_quantity := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      UPDATE public.products
      SET stock = GREATEST(stock - v_quantity, 0),
          updated_at = now()
      WHERE id = v_product_id
        AND business_id = p_business_id;
    END IF;
  END LOOP;

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text) TO service_role;REVOKE EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_offline_sale(uuid, text, jsonb, numeric, numeric, numeric, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, text, text, numeric, date, text) TO service_role;-- Restore production payment-status triggers that should exist for sales and debtors.

CREATE OR REPLACE FUNCTION public.set_sale_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.amount_paid IS NULL THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid < 0 THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid > NEW.total THEN NEW.amount_paid := NEW.total; END IF;

  NEW.balance_due := GREATEST(NEW.total - NEW.amount_paid, 0);

  IF NEW.balance_due = 0 THEN
    NEW.payment_status := 'paid';
  ELSIF NEW.amount_paid = 0 THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'pending';
    END IF;
  ELSE
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'partially_paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_set_payment_status ON public.sales;
CREATE TRIGGER trg_sales_set_payment_status
  BEFORE INSERT OR UPDATE OF total, amount_paid, due_date
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sale_payment_status();

CREATE OR REPLACE FUNCTION public.set_debtor_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.amount_paid IS NULL THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid < 0 THEN NEW.amount_paid := 0; END IF;
  IF NEW.amount_paid > NEW.amount_owed THEN NEW.amount_paid := NEW.amount_owed; END IF;

  IF NEW.amount_paid >= NEW.amount_owed THEN
    NEW.status := 'paid';
  ELSIF NEW.amount_paid = 0 THEN
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.status := 'overdue';
    ELSE
      NEW.status := 'unpaid';
    END IF;
  ELSE
    IF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
      NEW.status := 'overdue';
    ELSE
      NEW.status := 'partially_paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_debtor_status ON public.debtors;
CREATE TRIGGER trg_set_debtor_status
  BEFORE INSERT OR UPDATE OF amount_owed, amount_paid, due_date
  ON public.debtors
  FOR EACH ROW
  EXECUTE FUNCTION public.set_debtor_status();

-- Recalculate existing rows in place so old data displays correctly.
UPDATE public.sales
SET amount_paid = amount_paid
WHERE true;

UPDATE public.debtors
SET amount_paid = amount_paid
WHERE true;

REVOKE EXECUTE ON FUNCTION public.set_sale_payment_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_sale_payment_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_debtor_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_debtor_status() FROM anon;
-- 1. Invoice numbers on sales (sequential per business)
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoice_number text;

CREATE OR REPLACE FUNCTION public.set_sale_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::int), 0) + 1
    INTO next_num
  FROM public.sales
  WHERE business_id = NEW.business_id;
  NEW.invoice_number := 'INV-' || lpad(next_num::text, 6, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sale_invoice_number ON public.sales;
CREATE TRIGGER trg_set_sale_invoice_number
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_sale_invoice_number();

-- Backfill existing sales without invoice numbers
DO $$
DECLARE
  r RECORD;
  counters jsonb := '{}'::jsonb;
  c int;
BEGIN
  FOR r IN SELECT id, business_id FROM public.sales WHERE invoice_number IS NULL ORDER BY created_at ASC LOOP
    c := COALESCE((counters ->> r.business_id::text)::int, 0) + 1;
    counters := counters || jsonb_build_object(r.business_id::text, c);
    UPDATE public.sales SET invoice_number = 'INV-' || lpad(c::text, 6, '0') WHERE id = r.id;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales(business_id, invoice_number);

-- 2. Audit log
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  actor_id uuid,
  actor_label text,
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners view own audit logs" ON public.audit_logs;
CREATE POLICY "Owners view own audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE INDEX IF NOT EXISTS idx_audit_logs_biz_time ON public.audit_logs(business_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_biz uuid;
  v_actor uuid := auth.uid();
  v_label text;
  v_rec text;
  v_changes jsonb;
BEGIN
  -- Pick business_id from the row
  IF TG_OP = 'DELETE' THEN
    v_biz := (to_jsonb(OLD) ->> 'business_id')::uuid;
    v_rec := (to_jsonb(OLD) ->> 'id');
    v_changes := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_biz := (to_jsonb(NEW) ->> 'business_id')::uuid;
    v_rec := (to_jsonb(NEW) ->> 'id');
    v_changes := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    v_biz := (to_jsonb(NEW) ->> 'business_id')::uuid;
    v_rec := (to_jsonb(NEW) ->> 'id');
    v_changes := jsonb_build_object('new', to_jsonb(NEW));
  END IF;

  IF v_actor IS NOT NULL THEN
    SELECT COALESCE(p.full_name, p.email, v_actor::text) INTO v_label FROM public.profiles p WHERE p.id = v_actor;
  END IF;

  INSERT INTO public.audit_logs(business_id, actor_id, actor_label, table_name, record_id, action, changes)
  VALUES (v_biz, v_actor, v_label, TG_TABLE_NAME, v_rec, TG_OP, v_changes);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales','sale_payments','products','expenses','debtors','debtor_payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()', t, t);
  END LOOP;
END $$;
-- Remove the hard 3-cashier cap; pricing now scales with active cashier count.
DROP TRIGGER IF EXISTS enforce_cashier_cap_trigger ON public.business_cashiers;
DROP TRIGGER IF EXISTS trg_enforce_cashier_cap ON public.business_cashiers;
DROP FUNCTION IF EXISTS public.enforce_cashier_cap();
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

ALTER TABLE public.sales REPLICA IDENTITY FULL;
ALTER TABLE public.sale_payments REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.debtors REPLICA IDENTITY FULL;
ALTER TABLE public.quotations REPLICA IDENTITY FULL;
ALTER TABLE public.business_cashiers REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.debtors;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quotations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.business_cashiers;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'product' CHECK (item_type IN ('product','service'));-- Performance indexes for scalable multi-cashier, high-inventory POS
-- Target: 20+ cashiers, 20,000+ inventory items

-- Products: speed up business-scoped queries (the most common query pattern)
CREATE INDEX IF NOT EXISTS idx_products_business_id_active
  ON public.products (business_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_business_id_category
  ON public.products (business_id, category);

CREATE INDEX IF NOT EXISTS idx_products_business_id_barcode
  ON public.products (business_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_parent_id
  ON public.products (parent_id)
  WHERE parent_id IS NOT NULL;

-- Sales: fast lookups by business, date range, and cashier
CREATE INDEX IF NOT EXISTS idx_sales_business_id_created_at
  ON public.sales (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_cashier_id
  ON public.sales (cashier_id)
  WHERE cashier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_payment_status
  ON public.sales (business_id, payment_status);

-- Sale payments: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_sale_payments_business_id
  ON public.sale_payments (business_id, created_at DESC);

-- Debtors: fast lookups by business
CREATE INDEX IF NOT EXISTS idx_debtors_business_id_status
  ON public.debtors (business_id, status);

CREATE INDEX IF NOT EXISTS idx_debtors_due_date
  ON public.debtors (business_id, due_date)
  WHERE due_date IS NOT NULL;

-- Expenses: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_expenses_business_id_date
  ON public.expenses (business_id, expense_date DESC);

-- Audit logs: fast business-scoped lookups with time ordering
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id_created_at
  ON public.audit_logs (business_id, created_at DESC)
  WHERE business_id IS NOT NULL;

-- Quotations: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_quotations_business_id_status
  ON public.quotations (business_id, status);

-- Stock adjustment requests: fast pending lookups
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_requests_business_id_status
  ON public.stock_adjustment_requests (business_id, status);

-- Product categories: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_product_categories_business_id
  ON public.product_categories (business_id, sort_order);

-- Business cashiers: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_business_cashiers_business_id
  ON public.business_cashiers (business_id, is_active)
  WHERE is_active = true;

-- Security: add rate-limiting helper function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_requests INTEGER DEFAULT 60,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Simple leaky-bucket rate limiter using a deduplicated audit_log pattern
  -- Count requests by this user for this action in the last N seconds
  SELECT COUNT(*)
  INTO v_count
  FROM public.audit_logs
  WHERE actor_id = p_user_id::text
    AND action = p_action
    AND created_at > now() - (p_window_seconds || ' seconds')::INTERVAL;
  
  RETURN v_count < p_max_requests;
END;
$$;

-- Add trigger-based audit logging for critical tables
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_actor_id TEXT;
  v_actor_label TEXT;
BEGIN
  -- Try to determine business_id from the row
  v_business_id := COALESCE(
    NEW.business_id,
    OLD.business_id,
    (SELECT business_id FROM public.sales WHERE id = COALESCE(NEW.id, OLD.id)),
    NULL
  );
  
  v_actor_id := auth.uid()::text;
  v_actor_label := (SELECT email FROM auth.users WHERE id = auth.uid());
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, actor_label, business_id, changes)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'created', v_actor_id, v_actor_label, v_business_id, 
            to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, actor_label, business_id, changes)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'updated', v_actor_id, v_actor_label, v_business_id,
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, actor_label, business_id, changes)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'deleted', v_actor_id, v_actor_label, v_business_id,
            to_jsonb(OLD));
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;
