-- Add remaining missing columns for MPP import functionality

-- Add is_critical column to phases table (for MPP critical path)
ALTER TABLE phases ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT false;

-- Add end_date column to units table (for MPP end dates)
ALTER TABLE units ADD COLUMN IF NOT EXISTS end_date DATE;

-- Add projected_hours column to tasks table (for MPP projected hours)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS projected_hours NUMERIC(10, 2) DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_phases_is_critical ON phases(is_critical);
CREATE INDEX IF NOT EXISTS idx_units_end_date ON units(end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_projected_hours ON tasks(projected_hours);
