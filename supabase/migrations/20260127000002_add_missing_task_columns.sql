-- Add missing columns to tasks table for Workday sync
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS baseline_start_date timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS baseline_end_date timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS baseline_hours numeric;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours numeric;
