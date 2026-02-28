-- MPP Full Extraction: New task columns and task_dependencies.is_external
-- Date: 2026-02-27
-- Adds columns for all MPXJ-extracted fields from the expanded parser.

-- TASKS: Add new columns (IF NOT EXISTS for idempotency)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS outline_number VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS constraint_type VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS constraint_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_name VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS fixed_cost NUMERIC(12, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cost_variance NUMERIC(12, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS work_variance NUMERIC(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_variance NUMERIC(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact VARCHAR(255);

-- TASK_DEPENDENCIES: Add is_external for external predecessor/successor links
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;
