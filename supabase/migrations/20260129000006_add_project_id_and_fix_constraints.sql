-- Add project_id to units table and handle foreign key constraints

-- Add project_id column to units table (for MPP unit-project relationships)
ALTER TABLE units ADD COLUMN IF NOT EXISTS project_id VARCHAR(50);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_units_project_id ON units(project_id);

-- Note: The foreign key constraint error for parent_task_id suggests we need to:
-- 1. Either make the constraint nullable/deferred
-- 2. Or ensure parent_task_id references valid task IDs
-- 3. Or handle this in the converter by not setting invalid parent_task_id values
