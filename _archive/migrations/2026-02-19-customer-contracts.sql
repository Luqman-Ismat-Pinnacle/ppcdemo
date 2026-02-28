-- Customer contracts from Workday (forecasting page)
-- Report: RPT_-_Find_Customer_Contract_Lines_-_Revenue
-- Fields: Line_Amount, Line_From_Date, Currency (convert to USD), Billable_Project (project ID at start)

CREATE TABLE IF NOT EXISTS customer_contracts (
  id VARCHAR(80) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,
  line_amount NUMERIC(14, 2) NOT NULL,
  line_from_date DATE NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  amount_usd NUMERIC(14, 2),
  billable_project_raw VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_contracts_project_id ON customer_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_customer_contracts_line_from_date ON customer_contracts(line_from_date);
CREATE INDEX IF NOT EXISTS idx_customer_contracts_project_date ON customer_contracts(project_id, line_from_date);

COMMENT ON TABLE customer_contracts IS 'Workday customer contract lines for forecasting; amount_usd is converted from currency when known.';
