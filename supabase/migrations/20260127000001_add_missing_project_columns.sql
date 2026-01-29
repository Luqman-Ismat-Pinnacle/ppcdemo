-- Add missing columns to projects table for Workday sync
ALTER TABLE projects ADD COLUMN IF NOT EXISTS methodology text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS billable_type text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS baseline_start_date timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS baseline_end_date timestamptz;
