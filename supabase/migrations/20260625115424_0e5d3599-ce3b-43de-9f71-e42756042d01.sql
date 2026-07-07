
-- 1. Extend products with image, variant linkage, and variant label
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS variant_label TEXT;

CREATE INDEX IF NOT EXISTS idx_products_parent_id ON public.products(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_business_active ON public.products(business_id, is_active);

-- Prevent nested variants (variant of a variant)
CREATE OR REPLACE FUNCTION public.prevent_nested_variants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_parent UUID;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT parent_id INTO v_parent_parent FROM public.products WHERE id = NEW.parent_id;
  IF v_parent_parent IS NOT NULL THEN
    RAISE EXCEPTION 'NESTED_VARIANT_NOT_ALLOWED' USING HINT = 'A variant cannot itself have variants.';
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'SELF_PARENT_NOT_ALLOWED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_nested_variants ON public.products;
CREATE TRIGGER trg_prevent_nested_variants
  BEFORE INSERT OR UPDATE OF parent_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.prevent_nested_variants();

-- Block deactivating / deleting a parent while it has active variants
CREATE OR REPLACE FUNCTION public.guard_parent_with_active_variants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_active = false AND OLD.is_active = true THEN
      SELECT COUNT(*) INTO v_count FROM public.products
        WHERE parent_id = NEW.id AND is_active = true;
      IF v_count > 0 THEN
        RAISE EXCEPTION 'PARENT_HAS_ACTIVE_VARIANTS'
          USING HINT = 'Remove or deactivate all variants before deactivating this product.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_parent_with_active_variants ON public.products;
CREATE TRIGGER trg_guard_parent_with_active_variants
  BEFORE UPDATE OF is_active ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_parent_with_active_variants();

-- 2. Categories table
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Owners and cashiers can read categories of their business
CREATE POLICY "Business members can view categories"
  ON public.product_categories FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

-- Only owners can write categories
CREATE POLICY "Owners can insert categories"
  ON public.product_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can update categories"
  ON public.product_categories FOR UPDATE
  TO authenticated
  USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can delete categories"
  ON public.product_categories FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

DROP TRIGGER IF EXISTS trg_product_categories_updated_at ON public.product_categories;
CREATE TRIGGER trg_product_categories_updated_at
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill categories from existing free-text product.category values
INSERT INTO public.product_categories (business_id, name)
SELECT DISTINCT business_id, TRIM(category)
  FROM public.products
  WHERE category IS NOT NULL AND TRIM(category) <> ''
ON CONFLICT (business_id, name) DO NOTHING;
