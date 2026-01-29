-- Add comprehensive missing columns for complete MPP compatibility

-- Add parent_id column to phases table (for MPP parent-child relationships)
ALTER TABLE phases ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50);

-- Add is_summary column to units table (for MPP summary task detection)
ALTER TABLE units ADD COLUMN IF NOT EXISTS is_summary BOOLEAN DEFAULT false;

-- Add task_name column to tasks table (for MPP task names)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_name VARCHAR(255);

-- Add other commonly inherited fields to prevent future errors
ALTER TABLE phases ADD COLUMN IF NOT EXISTS total_slack INTEGER DEFAULT 0;
ALTER TABLE phases ADD COLUMN IF NOT EXISTS projected_hours NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE phases ADD COLUMN IF NOT EXISTS remaining_hours NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE units ADD COLUMN IF NOT EXISTS total_slack INTEGER DEFAULT 0;
ALTER TABLE units ADD COLUMN IF NOT EXISTS projected_hours NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE units ADD COLUMN IF NOT EXISTS remaining_hours NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS total_slack INTEGER DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_phases_parent_id ON phases(parent_id);
CREATE INDEX IF NOT EXISTS idx_units_is_summary ON units(is_summary);
CREATE INDEX IF NOT EXISTS idx_tasks_task_name ON tasks(task_name);
CREATE INDEX IF NOT EXISTS idx_phases_total_slack ON phases(total_slack);
CREATE INDEX IF NOT EXISTS idx_units_total_slack ON units(total_slack);
CREATE INDEX IF NOT EXISTS idx_tasks_total_slack ON tasks(total_slack);
