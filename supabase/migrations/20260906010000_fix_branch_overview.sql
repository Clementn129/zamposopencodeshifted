-- =====================================================
-- Fix get_branch_overview: PL/pgSQL OUT-parameter shadowing.
-- The RETURNS TABLE (business_id, ...) declarations created
-- variables matching table columns, so bare column references
-- inside the JOIN subqueries became ambiguous (42702). Every
-- column reference is now fully qualified with its table alias.
-- =====================================================

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
    b.id,
    b.name,
    COALESCE(s.sales_count, 0),
    COALESCE(s.sales_total, 0),
    COALESCE(e.expenses_total, 0),
    COALESCE(d.debtors_owed, 0),
    COALESCE(p.stock_value, 0),
    COALESCE(p.stock_items, 0)
  FROM public.businesses b
  LEFT JOIN (
    SELECT sales.business_id, COUNT(*) AS sales_count, COALESCE(SUM(sales.total), 0) AS sales_total
    FROM public.sales
    WHERE sales.business_id = ANY(p_business_ids)
    GROUP BY sales.business_id
  ) s ON s.business_id = b.id
  LEFT JOIN (
    SELECT expenses.business_id, COALESCE(SUM(expenses.amount), 0) AS expenses_total
    FROM public.expenses
    WHERE expenses.business_id = ANY(p_business_ids)
    GROUP BY expenses.business_id
  ) e ON e.business_id = b.id
  LEFT JOIN (
    SELECT debtors.business_id, COALESCE(SUM(debtors.amount_owed - debtors.amount_paid), 0) AS debtors_owed
    FROM public.debtors
    WHERE debtors.business_id = ANY(p_business_ids)
      AND debtors.status <> 'paid'
    GROUP BY debtors.business_id
  ) d ON d.business_id = b.id
  LEFT JOIN (
    SELECT products.business_id,
           COALESCE(SUM(products.stock * COALESCE(products.cost_price, products.price)), 0) AS stock_value,
           SUM(products.stock) AS stock_items
    FROM public.products
    WHERE products.business_id = ANY(p_business_ids)
    GROUP BY products.business_id
  ) p ON p.business_id = b.id
  WHERE b.id = ANY(p_business_ids)
  ORDER BY b.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_overview(uuid[]) TO authenticated;