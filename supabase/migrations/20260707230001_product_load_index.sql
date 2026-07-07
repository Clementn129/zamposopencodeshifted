-- Composite index to cover the common POS product query:
--   WHERE business_id = ? AND is_active = true ORDER BY created_at DESC
DROP INDEX IF EXISTS idx_products_business_created;
CREATE INDEX IF NOT EXISTS idx_products_business_created
  ON public.products (business_id, created_at DESC)
  WHERE is_active = true;
