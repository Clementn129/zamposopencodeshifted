-- =====================================================
-- Multi-branch support (Option B: branches = businesses
-- grouped under a parent). Additive + non-destructive:
-- existing businesses keep parent_business_id = NULL and
-- behave exactly as before.
-- =====================================================

-- 1. Add nullable parent column (NULL = standalone/head office)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS parent_business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_parent ON public.businesses(parent_business_id);
CREATE INDEX IF NOT EXISTS idx_businesses_user_parent ON public.businesses(user_id, parent_business_id);

-- 2. Get the owner's entire business group (head office + branches).
--    Returns all businesses owned by the current user, tagged with a
--    branch_kind so the client can distinguish the root from children.
CREATE OR REPLACE FUNCTION public.get_my_business_group()
RETURNS TABLE (
  id UUID,
  name TEXT,
  payment_code TEXT,
  business_type TEXT,
  parent_business_id UUID,
  subscription_status public.subscription_status,
  is_locked BOOLEAN,
  branch_kind TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.payment_code,
    b.business_type,
    b.parent_business_id,
    b.subscription_status,
    b.is_locked,
    CASE
      WHEN b.parent_business_id IS NULL THEN 'root'
      ELSE 'branch'
    END::TEXT AS branch_kind
  FROM public.businesses b
  WHERE b.user_id = auth.uid()
  ORDER BY
    (b.parent_business_id IS NOT NULL),   -- root(s) first
    b.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_business_group() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_business_group() FROM PUBLIC, anon;

-- 3. Create a new blank branch under an owned parent business.
--    The new branch is a fresh business with its own (blank) catalog.
CREATE OR REPLACE FUNCTION public.create_branch(
  p_parent_id UUID,
  p_name TEXT,
  p_business_type TEXT DEFAULT 'retail'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_payment_code TEXT;
  v_new_business_id UUID;
  v_owner_id UUID;
  v_hq_id UUID;
BEGIN
  -- Only the owner of the parent may create branches
  SELECT user_id INTO v_owner_id
    FROM public.businesses
    WHERE id = p_parent_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  IF v_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Resolve the true root ancestor so all branches share one HQ.
  SELECT r.id INTO v_hq_id
  FROM (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_business_id
        FROM public.businesses
        WHERE id = p_parent_id
      UNION ALL
      SELECT b.id, b.parent_business_id
        FROM public.businesses b
        JOIN ancestors a ON b.id = a.parent_business_id
    )
    SELECT id, parent_business_id FROM ancestors
  ) r
  WHERE r.parent_business_id IS NULL
  LIMIT 1;

  IF v_hq_id IS NULL THEN
    v_hq_id := p_parent_id;
  END IF;

  v_new_payment_code := public.generate_payment_code();

  INSERT INTO public.businesses (
    user_id,
    name,
    payment_code,
    subscription_status,
    trial_started_at,
    subscription_expires_at,
    business_type,
    parent_business_id
  )
  VALUES (
    v_owner_id,
    COALESCE(NULLIF(trim(p_name), ''), 'New Branch'),
    v_new_payment_code,
    'trial',
    now(),
    now() + INTERVAL '3 days',
    COALESCE(NULLIF(p_business_type, ''), 'retail'),
    v_hq_id
  )
  RETURNING id INTO v_new_business_id;

  RETURN v_new_business_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_branch(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_branch(uuid, text, text) FROM PUBLIC, anon;

-- 4. Aggregate overview across a group of branches (head-office monitoring).
--    Returns per-business totals for sales, expenses, debtors and stock value.
CREATE OR REPLACE FUNCTION public.get_branch_overview(p_business_ids UUID[])
RETURNS TABLE (
  business_id UUID,
  business_name TEXT,
  sales_count BIGINT,
  sales_total NUMERIC,
  expenses_total NUMERIC,
  debtors_owed NUMERIC,
  stock_value NUMERIC,
  stock_items BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Security: caller must own every business in the set.
  IF EXISTS (
    SELECT 1
    FROM public.businesses b
    WHERE b.id = ANY(p_business_ids)
      AND b.user_id <> auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id AS business_id,
    b.name AS business_name,
    COALESCE(s.sales_count, 0) AS sales_count,
    COALESCE(s.sales_total, 0) AS sales_total,
    COALESCE(e.expenses_total, 0) AS expenses_total,
    COALESCE(d.debtors_owed, 0) AS debtors_owed,
    COALESCE(p.stock_value, 0) AS stock_value,
    COALESCE(p.stock_items, 0) AS stock_items
  FROM public.businesses b
  LEFT JOIN (
    SELECT business_id, COUNT(*) AS sales_count, COALESCE(SUM(total), 0) AS sales_total
    FROM public.sales
    WHERE business_id = ANY(p_business_ids)
    GROUP BY business_id
  ) s ON s.business_id = b.id
  LEFT JOIN (
    SELECT business_id, COALESCE(SUM(amount), 0) AS expenses_total
    FROM public.expenses
    WHERE business_id = ANY(p_business_ids)
    GROUP BY business_id
  ) e ON e.business_id = b.id
  LEFT JOIN (
    SELECT business_id, COALESCE(SUM(amount_owed - amount_paid), 0) AS debtors_owed
    FROM public.debtors
    WHERE business_id = ANY(p_business_ids)
      AND status <> 'paid'
    GROUP BY business_id
  ) d ON d.business_id = b.id
  LEFT JOIN (
    SELECT business_id,
           COALESCE(SUM(stock * COALESCE(cost_price, price)), 0) AS stock_value,
           SUM(stock) AS stock_items
    FROM public.products
    WHERE business_id = ANY(p_business_ids)
    GROUP BY business_id
  ) p ON p.business_id = b.id
  WHERE b.id = ANY(p_business_ids)
  ORDER BY b.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_overview(uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_branch_overview(uuid[]) FROM PUBLIC, anon;
