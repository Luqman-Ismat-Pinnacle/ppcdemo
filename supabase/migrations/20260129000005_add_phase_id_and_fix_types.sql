-- Add phase_id to units table and fix data type issues

-- Add phase_id column to units table (for MPP unit-phase relationships)
ALTER TABLE units ADD COLUMN IF NOT EXISTS phase_id VARCHAR(50);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_units_phase_id ON units(phase_id);

-- Note: The integer error is likely in the converter - we need to fix float values being inserted into integer columns
-- Common integer columns that might get float values:
-- - days_required (tasks table)
-- - sequence (phases table) 
-- - baseline_count, actual_count, completed_count (tasks table)
