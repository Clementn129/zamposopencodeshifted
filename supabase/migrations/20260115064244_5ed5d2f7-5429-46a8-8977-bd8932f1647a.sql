-- Add cost_price column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric DEFAULT NULL;