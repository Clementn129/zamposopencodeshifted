-- Add target_business_id column to notices for targeted notices to specific businesses
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
);