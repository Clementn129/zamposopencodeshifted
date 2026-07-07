
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE INDEX IF NOT EXISTS products_business_barcode_idx ON public.products(business_id, barcode) WHERE barcode IS NOT NULL;

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'business';
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_check CHECK (category IN ('business','personal'));
