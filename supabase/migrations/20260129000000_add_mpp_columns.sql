-- Add missing columns for MPP import functionality
-- These columns are needed by the MPP parser and converter

-- Add comments column to phases table (for MPP task comments)
ALTER TABLE phases ADD COLUMN IF NOT EXISTS comments TEXT;

-- Add active column to units table (for MPP unit status)
ALTER TABLE units ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Add parent_id column to tasks table (for MPP parent-child relationships)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50);

-- Add is_summary column to tasks table (for MPP summary task detection)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_summary BOOLEAN DEFAULT false;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_is_summary ON tasks(is_summary);
