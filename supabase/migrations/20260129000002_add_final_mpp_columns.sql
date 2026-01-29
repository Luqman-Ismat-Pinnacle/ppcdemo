-- Add final missing columns for complete MPP import functionality

-- Add is_summary column to phases table (for MPP summary task detection)
ALTER TABLE phases ADD COLUMN IF NOT EXISTS is_summary BOOLEAN DEFAULT false;

-- Add is_critical column to units table (for MPP critical path)
ALTER TABLE units ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT false;

-- Add task_description column to tasks table (for MPP task descriptions)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_description TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_phases_is_summary ON phases(is_summary);
CREATE INDEX IF NOT EXISTS idx_units_is_critical ON units(is_critical);
CREATE INDEX IF NOT EXISTS idx_tasks_task_description ON tasks(task_description);
