# Workday Hours & Cost Integration

This enhancement adds comprehensive cost tracking to the existing Workday hours integration, allowing you to pull both actual hours and cost data from Workday into your PPC system.

## Overview

The integration now extracts:
- **Hours data** from Project Labor Transactions (existing functionality enhanced)
- **Cost data** from Project Labor Transactions (new - billable rates, standard costs, actual costs/revenue)
- **Additional cost actuals** from General Ledger (new - supplier costs, other expenses)

## Data Sources

### 1. Project Labor Transactions Report
**URL**: `https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Project_Labor_Transactions`

**Key Fields Extracted**:
- `Hours` - Actual hours worked
- `Billable_Rate` - Hourly billing rate
- `Billable_Amount` - Total billable amount
- `Standard_Cost_Rate` - Standard cost rate
- `Reported_Standard_Cost_Amt` - Actual cost amount
- `Customer_Billing_Status` - Billing status (Billed/Unbilled)
- `Invoice_Number` - Associated invoice
- `Invoice_Status` - Invoice status (Approved/Paid)
- `Charge_Type` - Charge type (EX/NON)

### 2. General Ledger Report
**URL**: `https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Pinnacle_General_Ledger`

**Key Fields Extracted**:
- `Project` - Project name and ID
- `Ledger_Account_ID` - Account code (expense accounts: 6xxxx, 7xxxx)
- `Net_Amount` - Net transaction amount (debit - credit)
- `Supplier` - Vendor/supplier name
- `Invoice_Number` - Supplier invoice
- `Spend_Category` - Category of expense

## Database Changes

### Enhanced `hour_entries` Table
Added cost-related columns:
```sql
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS billable_rate NUMERIC(10, 2);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS billable_amount NUMERIC(10, 2);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS standard_cost_rate NUMERIC(10, 2);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(10, 2);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS actual_revenue NUMERIC(10, 2);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS customer_billing_status VARCHAR(50);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS invoice_status VARCHAR(50);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS charge_type VARCHAR(10);
```

### New `cost_actuals` Table
Stores general ledger cost transactions:
```sql
CREATE TABLE IF NOT EXISTS cost_actuals (
  id VARCHAR(100) PRIMARY KEY,
  project_id VARCHAR(50),
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
```

## Edge Functions

### 1. Enhanced `workday-hours` Function
- **Location**: `supabase/functions/workday-hours/index.ts`
- **Enhancements**:
  - Extracts cost fields from Project Labor Transactions
  - Calculates actual cost and revenue
  - Stores billing status and invoice information
  - Automatically runs migration to add cost columns

### 2. New `workday-ledger` Function
- **Location**: `supabase/functions/workday-ledger/index.ts`
- **Purpose**: Extracts cost actuals from General Ledger
- **Features**:
  - Filters for project-related expense transactions
  - Extracts supplier costs and other expenses
  - Stores in `cost_actuals` table

### 3. New `workday-sync` Function
- **Location**: `supabase/functions/workday-sync/index.ts`
- **Purpose**: Orchestrates both hours and ledger sync
- **Usage**: Single endpoint to trigger all Workday data sync

## Usage

### 1. Run Migrations
```bash
# Apply database migrations
psql -h your-host -U your-user -d your-database -f migrations/add_cost_fields_to_hour_entries.sql
psql -h your-host -U your-user -d your-database -f migrations/create_cost_actuals_table.sql
```

### 2. Deploy Edge Functions
```bash
# Deploy to Supabase
supabase functions deploy workday-hours
supabase functions deploy workday-ledger
supabase functions deploy workday-sync
```

### 3. Trigger Sync
```bash
# Manual sync using curl
curl -X POST "https://your-project.supabase.co/functions/v1/workday-sync" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 4. Query Cost Data
```sql
-- Hours with cost data
SELECT 
  project_id,
  employee_id,
  date,
  hours,
  actual_cost,
  actual_revenue,
  invoice_number,
  customer_billing_status
FROM hour_entries 
WHERE actual_cost > 0 
ORDER BY date DESC 
LIMIT 10;

-- General ledger cost actuals
SELECT 
  project_id,
  accounting_date,
  ledger_account,
  net_amount,
  supplier,
  invoice_number,
  spend_category
FROM cost_actuals 
ORDER BY accounting_date DESC 
LIMIT 10;

-- Project cost summary
SELECT 
  p.project_id,
  p.name as project_name,
  SUM(h.actual_cost) as total_actual_cost,
  SUM(h.actual_revenue) as total_actual_revenue,
  SUM(c.net_amount) as ledger_costs
FROM projects p
LEFT JOIN hour_entries h ON p.id = h.project_id
LEFT JOIN cost_actuals c ON p.id = c.project_id
GROUP BY p.project_id, p.name
ORDER BY total_actual_cost DESC;
```

## Cost Calculations

### From Project Labor Transactions:
- **Actual Cost**: Uses `Reported_Standard_Cost_Amt` if available, otherwise calculates `Hours × Standard_Cost_Rate`
- **Actual Revenue**: Uses `Billable_Amount` if available, otherwise calculates `Hours × Billable_Rate`

### From General Ledger:
- **Net Amount**: `Debit_Amount - Credit_Amount` (positive values indicate expenses)
- **Filters**: Only includes expense accounts (starting with 6xxxx or 7xxxx)

## Environment Variables Required

Ensure these are set in your Supabase project:
- `WORKDAY_ISU_USER` - Workday API username
- `WORKDAY_ISU_PASS` - Workday API password
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

## Testing

Use the provided test script:
```bash
./scripts/workday-sync-test.sh
```

This script will:
1. Run database migrations
2. Trigger the sync process
3. Provide sample queries to verify data

## Notes

- The integration uses a rolling 30-day window for data sync to avoid timeouts
- Project hierarchies are comprehensively included using the full WID list you provided
- Cost data is automatically linked to existing project hierarchy
- The system handles both new and existing data gracefully
- All cost amounts are stored in USD as per the Workday configuration

## Troubleshooting

1. **Missing Cost Data**: Check that the Project Labor Transactions report includes the cost fields
2. **Migration Errors**: The functions include automatic migration handling
3. **Large Data Sets**: Consider adjusting the date range or batch size if timeouts occur
4. **Authentication**: Ensure Workday credentials are current and have proper permissions
