-- Phase B: restaurant menu modifiers.
-- Modifier groups (e.g. Size, Extra toppings), individual modifiers with an
-- optional price adjustment, and a junction table linking menu items
-- (products) to modifier groups. Mirrors the product_categories RLS pattern.

-- 1. Modifier groups
CREATE TABLE IF NOT EXISTS public.menu_modifier_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_selections INTEGER NOT NULL DEFAULT 0,
  max_selections INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

-- 2. Individual modifiers within a group
CREATE TABLE IF NOT EXISTS public.menu_modifiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.menu_modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_adjustment NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, name)
);

-- 3. Junction: which menu items (products) offer which modifier groups
CREATE TABLE IF NOT EXISTS public.menu_item_modifiers (
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  modifier_group_id UUID NOT NULL REFERENCES public.menu_modifier_groups(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, modifier_group_id)
);

CREATE INDEX IF NOT EXISTS idx_menu_modifier_groups_business ON public.menu_modifier_groups(business_id);
CREATE INDEX IF NOT EXISTS idx_menu_modifiers_group ON public.menu_modifiers(group_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_product ON public.menu_item_modifiers(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_modifier_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_modifiers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_modifiers TO authenticated;
GRANT ALL ON public.menu_modifier_groups TO service_role;
GRANT ALL ON public.menu_modifiers TO service_role;
GRANT ALL ON public.menu_item_modifiers TO service_role;

ALTER TABLE public.menu_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;

-- Business members can view
CREATE POLICY "Business members can view modifier groups"
  ON public.menu_modifier_groups FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY "Business members can view modifiers"
  ON public.menu_modifiers FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

CREATE POLICY "Business members can view menu item modifiers"
  ON public.menu_item_modifiers FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

-- Owners can write
CREATE POLICY "Owners can insert modifier groups"
  ON public.menu_modifier_groups FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can update modifier groups"
  ON public.menu_modifier_groups FOR UPDATE
  TO authenticated
  USING (public.owns_business(business_id))
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can delete modifier groups"
  ON public.menu_modifier_groups FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

-- owner policies on menu_modifiers check the group belongs to their business
CREATE POLICY "Owners can insert modifiers"
  ON public.menu_modifiers FOR INSERT
  TO authenticated
  WITH CHECK (
    public.owns_business(business_id)
    AND EXISTS (SELECT 1 FROM public.menu_modifier_groups g WHERE g.id = group_id AND g.business_id = business_id)
  );

CREATE POLICY "Owners can update modifiers"
  ON public.menu_modifiers FOR UPDATE
  TO authenticated
  USING (public.owns_business(business_id))
  WITH CHECK (
    public.owns_business(business_id)
    AND EXISTS (SELECT 1 FROM public.menu_modifier_groups g WHERE g.id = group_id AND g.business_id = business_id)
  );

CREATE POLICY "Owners can delete modifiers"
  ON public.menu_modifiers FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

CREATE POLICY "Owners can link menu item modifiers"
  ON public.menu_item_modifiers FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_business(business_id));

CREATE POLICY "Owners can unlink menu item modifiers"
  ON public.menu_item_modifiers FOR DELETE
  TO authenticated
  USING (public.owns_business(business_id));

DROP TRIGGER IF EXISTS trg_menu_modifier_groups_updated_at ON public.menu_modifier_groups;
CREATE TRIGGER trg_menu_modifier_groups_updated_at
  BEFORE UPDATE ON public.menu_modifier_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_menu_modifiers_updated_at ON public.menu_modifiers;
CREATE TRIGGER trg_menu_modifiers_updated_at
  BEFORE UPDATE ON public.menu_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();