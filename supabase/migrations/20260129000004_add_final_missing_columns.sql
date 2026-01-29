-- Add final missing columns for complete MPP compatibility

-- Add parent_id column to units table (for MPP parent-child relationships)
ALTER TABLE units ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50);

-- Add unit_id column to tasks table (for MPP task-unit relationships)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS unit_id VARCHAR(50);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_units_parent_id ON units(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_unit_id ON tasks(unit_id);
