
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
