-- Add Smart Invoice fields to businesses table
-- These fields store ZRA Smart Invoice configuration per business
-- All fields are nullable/optional so existing businesses are unaffected

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS smart_invoice_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smart_invoice_branch_id text,
  ADD COLUMN IF NOT EXISTS smart_invoice_device_id text,
  ADD COLUMN IF NOT EXISTS smart_invoice_server_url text;

-- Add a column to sales table to store ZRA verification data
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS smart_invoice_mark_id text,
  ADD COLUMN IF NOT EXISTS smart_invoice_status text;
