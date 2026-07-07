-- Performance indexes for scalable multi-cashier, high-inventory POS
-- Target: 20+ cashiers, 20,000+ inventory items

-- Products: speed up business-scoped queries (the most common query pattern)
CREATE INDEX IF NOT EXISTS idx_products_business_id_active
  ON public.products (business_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_business_id_category
  ON public.products (business_id, category);

CREATE INDEX IF NOT EXISTS idx_products_business_id_barcode
  ON public.products (business_id, barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_parent_id
  ON public.products (parent_id)
  WHERE parent_id IS NOT NULL;

-- Sales: fast lookups by business, date range, and cashier
CREATE INDEX IF NOT EXISTS idx_sales_business_id_created_at
  ON public.sales (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_cashier_id
  ON public.sales (cashier_id)
  WHERE cashier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_payment_status
  ON public.sales (business_id, payment_status);

-- Sale payments: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_sale_payments_business_id
  ON public.sale_payments (business_id, created_at DESC);

-- Debtors: fast lookups by business
CREATE INDEX IF NOT EXISTS idx_debtors_business_id_status
  ON public.debtors (business_id, status);

CREATE INDEX IF NOT EXISTS idx_debtors_due_date
  ON public.debtors (business_id, due_date)
  WHERE due_date IS NOT NULL;

-- Expenses: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_expenses_business_id_date
  ON public.expenses (business_id, expense_date DESC);

-- Audit logs: fast business-scoped lookups with time ordering
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id_created_at
  ON public.audit_logs (business_id, created_at DESC)
  WHERE business_id IS NOT NULL;

-- Quotations: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_quotations_business_id_status
  ON public.quotations (business_id, status);

-- Stock adjustment requests: fast pending lookups
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_requests_business_id_status
  ON public.stock_adjustment_requests (business_id, status);

-- Product categories: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_product_categories_business_id
  ON public.product_categories (business_id, sort_order);

-- Business cashiers: fast business-scoped lookups
CREATE INDEX IF NOT EXISTS idx_business_cashiers_business_id
  ON public.business_cashiers (business_id, is_active)
  WHERE is_active = true;

-- Security: add rate-limiting helper function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_requests INTEGER DEFAULT 60,
  p_window_seconds INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Simple leaky-bucket rate limiter using a deduplicated audit_log pattern
  -- Count requests by this user for this action in the last N seconds
  SELECT COUNT(*)
  INTO v_count
  FROM public.audit_logs
  WHERE actor_id = p_user_id::text
    AND action = p_action
    AND created_at > now() - (p_window_seconds || ' seconds')::INTERVAL;
  
  RETURN v_count < p_max_requests;
END;
$$;

-- Add trigger-based audit logging for critical tables
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id UUID;
  v_actor_id TEXT;
  v_actor_label TEXT;
BEGIN
  -- Try to determine business_id from the row
  v_business_id := COALESCE(
    NEW.business_id,
    OLD.business_id,
    (SELECT business_id FROM public.sales WHERE id = COALESCE(NEW.id, OLD.id)),
    NULL
  );
  
  v_actor_id := auth.uid()::text;
  v_actor_label := (SELECT email FROM auth.users WHERE id = auth.uid());
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, actor_label, business_id, changes)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'created', v_actor_id, v_actor_label, v_business_id, 
            to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, actor_label, business_id, changes)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'updated', v_actor_id, v_actor_label, v_business_id,
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_id, actor_label, business_id, changes)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'deleted', v_actor_id, v_actor_label, v_business_id,
            to_jsonb(OLD));
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;
