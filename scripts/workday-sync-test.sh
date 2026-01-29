#!/bin/bash

# Workday Hours & Cost Sync Test Script
# This script demonstrates how to trigger the enhanced Workday sync

echo "=== Workday Hours & Cost Sync ==="
echo ""

# Set your Supabase URL and Service Role Key
# You can get these from your Supabase project settings
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

echo "1. Running database migrations..."
echo "   Adding cost fields to hour_entries table..."

# Run the migration to add cost fields
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS billable_rate NUMERIC(10, 2); ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS billable_amount NUMERIC(10, 2); ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS standard_cost_rate NUMERIC(10, 2); ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(10, 2); ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS actual_revenue NUMERIC(10, 2); ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS customer_billing_status VARCHAR(50); ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50); ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS invoice_status VARCHAR(50); ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS charge_type VARCHAR(10);"
  }'

echo ""
echo "2. Creating cost_actuals table (for General Ledger data)..."

# Create the cost_actuals table
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "CREATE TABLE IF NOT EXISTS cost_actuals (id VARCHAR(100) PRIMARY KEY, project_id VARCHAR(50), project_name VARCHAR(255), accounting_date DATE NOT NULL, transaction_date DATE, ledger_account VARCHAR(100), ledger_account_id VARCHAR(20), company VARCHAR(100), cost_center VARCHAR(50), supplier VARCHAR(255), invoice_number VARCHAR(50), journal_source VARCHAR(50), spend_category VARCHAR(100), customer VARCHAR(255), net_amount NUMERIC(15, 2) NOT NULL, debit_amount NUMERIC(15, 2) DEFAULT 0, credit_amount NUMERIC(15, 2) DEFAULT 0, currency VARCHAR(3) DEFAULT '\''USD'\'', description TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW());"
  }'

echo ""
echo "3. Triggering Workday sync..."
echo "   This will pull both hours and cost data from Workday..."

# Trigger the comprehensive sync
curl -X POST "${SUPABASE_URL}/functions/v1/workday-sync" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}'

echo ""
echo "4. Verifying data..."
echo "   Check the following tables for new data:"
echo "   - hour_entries (with cost fields)"
echo "   - cost_actuals (general ledger costs)"
echo "   - projects, employees, phases, tasks (hierarchy data)"

echo ""
echo "=== Sync Complete ==="
echo ""
echo "To query the new cost data:"
echo ""
echo "-- Hours with cost data:"
echo "SELECT project_id, employee_id, date, hours, actual_cost, actual_revenue, invoice_number FROM hour_entries WHERE actual_cost > 0 ORDER BY date DESC LIMIT 10;"
echo ""
echo "-- General ledger cost actuals:"
echo "SELECT project_id, accounting_date, ledger_account, net_amount, supplier, invoice_number FROM cost_actuals ORDER BY accounting_date DESC LIMIT 10;"
