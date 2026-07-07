-- Add business contact details columns
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
  EXECUTE FUNCTION public.update_updated_at_column();