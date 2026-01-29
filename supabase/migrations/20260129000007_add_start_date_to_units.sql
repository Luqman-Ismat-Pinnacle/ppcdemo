-- Add start_date column to units table

-- Add start_date column to units table (for MPP unit start dates)
ALTER TABLE units ADD COLUMN IF NOT EXISTS start_date DATE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_units_start_date ON units(start_date);
