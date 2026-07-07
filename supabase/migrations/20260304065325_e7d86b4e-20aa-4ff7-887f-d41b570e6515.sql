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