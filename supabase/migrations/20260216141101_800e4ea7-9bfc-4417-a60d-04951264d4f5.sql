
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
