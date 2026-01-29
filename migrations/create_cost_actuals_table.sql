-- Migration: Create cost_actuals table for Workday General Ledger data
-- This table stores cost actuals from the General Ledger report

CREATE TABLE IF NOT EXISTS cost_actuals (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id),
  project_name VARCHAR(255),
  accounting_date DATE NOT NULL,
  transaction_date DATE,
  ledger_account VARCHAR(100),
  ledger_account_id VARCHAR(20),
  company VARCHAR(100),
  cost_center VARCHAR(50),
  supplier VARCHAR(255),
  invoice_number VARCHAR(50),
  journal_source VARCHAR(50),
  spend_category VARCHAR(100),
  customer VARCHAR(255),
  net_amount NUMERIC(15, 2) NOT NULL,
  debit_amount NUMERIC(15, 2) DEFAULT 0,
  credit_amount NUMERIC(15, 2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_cost_actuals_project_id ON cost_actuals(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_actuals_accounting_date ON cost_actuals(accounting_date);
CREATE INDEX IF NOT EXISTS idx_cost_actuals_ledger_account ON cost_actuals(ledger_account_id);
CREATE INDEX IF NOT EXISTS idx_cost_actuals_supplier ON cost_actuals(supplier);
CREATE INDEX IF NOT EXISTS idx_cost_actuals_invoice_number ON cost_actuals(invoice_number);
CREATE INDEX IF NOT EXISTS idx_cost_actuals_net_amount ON cost_actuals(net_amount);

-- Add comments for documentation
COMMENT ON TABLE cost_actuals IS 'Cost actuals from Workday General Ledger report';
COMMENT ON COLUMN cost_actuals.id IS 'Unique identifier for the cost transaction';
COMMENT ON COLUMN cost_actuals.project_id IS 'Reference to the associated project';
COMMENT ON COLUMN cost_actuals.accounting_date IS 'Date the transaction was recorded in the ledger';
COMMENT ON COLUMN cost_actuals.ledger_account_id IS 'Account code (expense accounts start with 6xxxx or 7xxxx)';
COMMENT ON COLUMN cost_actuals.net_amount IS 'Net amount (debit - credit, positive for expenses)';
COMMENT ON COLUMN cost_actuals.debit_amount IS 'Debit amount (increases expenses)';
COMMENT ON COLUMN cost_actuals.credit_amount IS 'Credit amount (decreases expenses)';
COMMENT ON COLUMN cost_actuals.spend_category IS 'Category of the expense (e.g., Engineering Services)';
