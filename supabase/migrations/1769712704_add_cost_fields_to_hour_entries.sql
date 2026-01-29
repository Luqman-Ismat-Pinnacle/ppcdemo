-- Migration: Add cost fields to hour_entries table
-- This migration adds fields to track actual costs and revenue from Workday

-- Add cost-related columns to hour_entries
ALTER TABLE hour_entries 
ADD COLUMN IF NOT EXISTS billable_rate NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS billable_amount NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS standard_cost_rate NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS actual_revenue NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS customer_billing_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS invoice_status VARCHAR(50),
ADD COLUMN IF NOT EXISTS charge_type VARCHAR(10);

-- Add comments for documentation
COMMENT ON COLUMN hour_entries.billable_rate IS 'Billable rate from Workday labor transactions';
COMMENT ON COLUMN hour_entries.billable_amount IS 'Total billable amount from Workday';
COMMENT ON COLUMN hour_entries.standard_cost_rate IS 'Standard cost rate from Workday';
COMMENT ON COLUMN hour_entries.actual_cost IS 'Actual cost calculated from standard cost rate and hours';
COMMENT ON COLUMN hour_entries.actual_revenue IS 'Actual revenue calculated from billable rate and hours';
COMMENT ON COLUMN hour_entries.customer_billing_status IS 'Billing status from Workday (e.g., Billed, Unbilled)';
COMMENT ON COLUMN hour_entries.invoice_number IS 'Invoice number if billed';
COMMENT ON COLUMN hour_entries.invoice_status IS 'Status of the invoice (e.g., Approved, Paid)';
COMMENT ON COLUMN hour_entries.charge_type IS 'Charge type from Workday (e.g., EX, NON)';

-- Add indexes for performance on cost-related queries
CREATE INDEX IF NOT EXISTS idx_hour_entries_invoice_number ON hour_entries(invoice_number);
CREATE INDEX IF NOT EXISTS idx_hour_entries_billing_status ON hour_entries(customer_billing_status);
CREATE INDEX IF NOT EXISTS idx_hour_entries_actual_cost ON hour_entries(actual_cost);
CREATE INDEX IF NOT EXISTS idx_hour_entries_actual_revenue ON hour_entries(actual_revenue);
