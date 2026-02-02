-- Add workday_phase and workday_task columns to hour_entries for matching to MPP tasks
-- These store the Phase and Task names from Workday labor transactions

ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS workday_phase VARCHAR(255);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS workday_task VARCHAR(255);

-- Add indexes for faster matching
CREATE INDEX IF NOT EXISTS idx_hour_entries_workday_phase ON hour_entries(workday_phase);
CREATE INDEX IF NOT EXISTS idx_hour_entries_workday_task ON hour_entries(workday_task);
CREATE INDEX IF NOT EXISTS idx_hour_entries_project_workday ON hour_entries(project_id, workday_phase, workday_task);

COMMENT ON COLUMN hour_entries.workday_phase IS 'Phase name from Workday labor transactions (for matching to MPP phases)';
COMMENT ON COLUMN hour_entries.workday_task IS 'Task name from Workday labor transactions (for matching to MPP tasks)';
