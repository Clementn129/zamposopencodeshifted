-- Scalability indexes for frequently queried columns
-- Sales: filtered by business_id + ordered by created_at + offline_id dedupe + status
CREATE INDEX IF NOT EXISTS idx_sales_business_created ON public.sales (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_business_status ON public.sales (business_id, status) WHERE status <> 'completed';

-- Products: filtered by business_id + is_active, lookups by id within business
CREATE INDEX IF NOT EXISTS idx_products_business_active ON public.products (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_business_updated ON public.products (business_id, updated_at DESC);

-- Quotations
CREATE INDEX IF NOT EXISTS idx_quotations_business_created ON public.quotations (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_business_status ON public.quotations (business_id, status);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items (quotation_id);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_business_date ON public.expenses (business_id, expense_date DESC);

-- Debtors / debtor_payments
CREATE INDEX IF NOT EXISTS idx_debtors_business_created ON public.debtors (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debtors_business_status ON public.debtors (business_id, status);
CREATE INDEX IF NOT EXISTS idx_debtor_payments_debtor_date ON public.debtor_payments (debtor_id, payment_date DESC);

-- Cashiers (lookup by auth_user_id is hot path on every request via is_business_member)
CREATE INDEX IF NOT EXISTS idx_business_cashiers_auth_user ON public.business_cashiers (auth_user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_business_cashiers_business ON public.business_cashiers (business_id) WHERE is_active = true;

-- Businesses: owner lookup
CREATE INDEX IF NOT EXISTS idx_businesses_user ON public.businesses (user_id);

-- User roles: hot path for has_role()
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

-- Notices: active windowed scan
CREATE INDEX IF NOT EXISTS idx_notices_active_window ON public.notices (is_active, starts_at, ends_at) WHERE is_active = true;