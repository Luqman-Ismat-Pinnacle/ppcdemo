-- Add Reported_Standard_Cost_Amt from Workday hours pull so cost is available when matching Workday task to project task.
ALTER TABLE hour_entries
ADD COLUMN IF NOT EXISTS reported_standard_cost_amt NUMERIC(10, 2);

COMMENT ON COLUMN hour_entries.reported_standard_cost_amt IS 'Reported standard cost amount from Workday (Reported_Standard_Cost_Amt) for each hours entry';

CREATE INDEX IF NOT EXISTS idx_hour_entries_reported_standard_cost_amt ON hour_entries(reported_standard_cost_amt);
