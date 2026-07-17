-- Add product expiry tracking
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS track_expiry boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS expiry_date date;

CREATE INDEX IF NOT EXISTS idx_products_expiry ON public.products(business_id, expiry_date);
