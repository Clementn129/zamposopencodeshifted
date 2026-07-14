-- Add Lipila payment tracking columns to sales table
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS lipila_identifier TEXT,
  ADD COLUMN IF NOT EXISTS lipila_external_id TEXT,
  ADD COLUMN IF NOT EXISTS lipila_status TEXT;

-- Create subscription_payments table for tracking Lipila subscription payments
CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reference_id TEXT NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL,
  months INTEGER NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  lipila_identifier TEXT,
  lipila_external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookups by reference_id (webhook)
CREATE INDEX IF NOT EXISTS idx_subscription_payments_reference_id ON subscription_payments(reference_id);

-- Index for quick lookups by business_id
CREATE INDEX IF NOT EXISTS idx_subscription_payments_business_id ON subscription_payments(business_id);

-- RLS policies
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY "Service role can manage subscription_payments" ON subscription_payments
  FOR ALL USING (auth.role() = 'service_role');

-- Note: Lipila API key for subscription payments is stored as a Supabase secret
-- (LIPILA_API_KEY, LIPILA_ENVIRONMENT) — not on the businesses table.
-- The platform (ZamPOS) collects subscription payments, not individual businesses.
