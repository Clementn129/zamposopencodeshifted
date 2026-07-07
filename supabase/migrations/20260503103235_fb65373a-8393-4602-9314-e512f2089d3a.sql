-- Add INSERT policy for affiliate_referrals so authenticated users registering with an affiliate code can create their referral row
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