-- ============================================================================
-- SQL Script: Add Unit Hierarchy Layer Between Site and Project
-- ============================================================================
-- Run this in Supabase SQL Editor
-- Creates a new "units" table to add a hierarchy layer between Site and Project
-- Hierarchy: Portfolio → Customer → Site → UNIT → Project → Phase → Task
-- 
-- This script also adds logic for Generic Resources:
-- - If assigned_resource_type = 'generic', employee_id is NOT required
-- - assigned_resource becomes a role name (dropdown) instead of employee name
-- ============================================================================

-- ============================================================================
-- STEP 1: Create the UNITS table
-- ============================================================================

CREATE TABLE IF NOT EXISTS units (
    -- Primary identifier
    id TEXT PRIMARY KEY,
    unit_id TEXT,                              -- Legacy/external ID
    
    -- Name and description
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    
    -- Foreign keys
    site_id TEXT REFERENCES sites(id) ON DELETE SET NULL,
    employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
    
    -- Tracking fields (same as other hierarchy levels)
    baseline_start_date DATE,
    baseline_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,
    
    -- Progress
    percent_complete DECIMAL(5,2) DEFAULT 0,
    comments TEXT DEFAULT '',
    
    -- Hours tracking
    baseline_hours DECIMAL(10,2) DEFAULT 0,
    actual_hours DECIMAL(10,2) DEFAULT 0,
    remaining_hours DECIMAL(10,2) DEFAULT 0,
    
    -- Cost tracking
    baseline_cost DECIMAL(12,2) DEFAULT 0,
    actual_cost DECIMAL(12,2) DEFAULT 0,
    remaining_cost DECIMAL(12,2) DEFAULT 0,
    
    -- Predecessor linking
    predecessor_id TEXT,
    predecessor_relationship TEXT CHECK (predecessor_relationship IN ('FS', 'SS', 'FF', 'SF')),
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger for remaining calculations
CREATE OR REPLACE FUNCTION calculate_unit_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_hours := COALESCE(NEW.baseline_hours, 0) - COALESCE(NEW.actual_hours, 0);
    NEW.remaining_cost := COALESCE(NEW.baseline_cost, 0) - COALESCE(NEW.actual_cost, 0);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_unit_remaining ON units;
CREATE TRIGGER trigger_unit_remaining
    BEFORE INSERT OR UPDATE ON units
    FOR EACH ROW
    EXECUTE FUNCTION calculate_unit_remaining();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_units_site_id ON units(site_id);
CREATE INDEX IF NOT EXISTS idx_units_employee_id ON units(employee_id);
CREATE INDEX IF NOT EXISTS idx_units_is_active ON units(is_active);

-- ============================================================================
-- STEP 2: Add unit_id column to PROJECTS table
-- ============================================================================

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS unit_id TEXT REFERENCES units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_unit_id ON projects(unit_id);

-- ============================================================================
-- STEP 3: Add Generic Resources support to TASKS table
-- ============================================================================

-- Add assigned_resource_type column if not exists
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS assigned_resource_type TEXT DEFAULT 'specific'
    CHECK (assigned_resource_type IN ('specific', 'generic'));

-- Add assigned_resource column to store the role name for generic resources
-- or employee name for specific resources
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS assigned_resource TEXT;

-- Make employee_id nullable (for generic resources)
-- Note: This assumes employee_id is already nullable; if not, run:
-- ALTER TABLE tasks ALTER COLUMN employee_id DROP NOT NULL;

-- Add comment to clarify usage
COMMENT ON COLUMN tasks.assigned_resource_type IS 
    'specific = assigned to specific employee (uses employee_id), generic = assigned to role (uses assigned_resource as role name)';

COMMENT ON COLUMN tasks.assigned_resource IS 
    'For specific: employee name (denormalized). For generic: role name from EmployeeRole enum';

-- ============================================================================
-- STEP 4: Add Generic Resources support to SUB_TASKS (if exists)
-- ============================================================================

-- Check if sub_tasks table exists and add columns
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'sub_tasks') THEN
        EXECUTE 'ALTER TABLE sub_tasks ADD COLUMN IF NOT EXISTS assigned_resource_type TEXT DEFAULT ''specific'' CHECK (assigned_resource_type IN (''specific'', ''generic''))';
        EXECUTE 'ALTER TABLE sub_tasks ADD COLUMN IF NOT EXISTS assigned_resource TEXT';
    END IF;
END $$;

-- ============================================================================
-- STEP 5: Create view for employee roles (for generic resource dropdown)
-- ============================================================================

-- Create a reference table for valid roles
CREATE TABLE IF NOT EXISTS employee_roles (
    role_name TEXT PRIMARY KEY,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- Insert default roles
INSERT INTO employee_roles (role_name, display_order) VALUES
    ('Partner', 1),
    ('Senior Manager', 2),
    ('Project Manager', 3),
    ('Project Lead', 4),
    ('Technical Lead', 5),
    ('Technical Manager', 6),
    ('Technical Writer', 7),
    ('QA/QC Auditor', 8),
    ('Data Engineer', 9),
    ('Data Scientist', 10),
    ('CAD / Drafter', 11),
    ('Field Technician', 12),
    ('IDMS SME', 13),
    ('Corrosion Engineer', 14),
    ('Reliability Specialist', 15),
    ('Senior Reliability Specialist', 16),
    ('Senior Engineer', 17),
    ('Process Engineer', 18),
    ('Deployment Lead', 19),
    ('Change Lead', 20),
    ('Training Lead', 21)
ON CONFLICT (role_name) DO NOTHING;

-- ============================================================================
-- STEP 6: Enable Row Level Security (RLS) for units table
-- ============================================================================

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-runnability)
DROP POLICY IF EXISTS "Allow read access for all users" ON units;
DROP POLICY IF EXISTS "Allow full access for authenticated users" ON units;

-- Create policy for authenticated users to read all units
CREATE POLICY "Allow read access for all users" ON units
    FOR SELECT USING (true);

-- Create policy for authenticated users to insert/update/delete
CREATE POLICY "Allow full access for authenticated users" ON units
    FOR ALL USING (true);

-- ============================================================================
-- STEP 7: Grant permissions
-- ============================================================================

GRANT ALL ON units TO authenticated;
GRANT ALL ON units TO anon;
GRANT ALL ON employee_roles TO authenticated;
GRANT ALL ON employee_roles TO anon;

-- ============================================================================
-- STEP 8: Verify the new table and columns
-- ============================================================================

SELECT 'Units table created:' AS status, COUNT(*) AS column_count 
FROM information_schema.columns 
WHERE table_name = 'units';

SELECT 'Projects unit_id column:' AS status, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects' AND column_name = 'unit_id';

SELECT 'Tasks generic resource columns:' AS status, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasks' AND column_name IN ('assigned_resource_type', 'assigned_resource');

SELECT 'Employee roles:' AS status, COUNT(*) AS role_count 
FROM employee_roles;

-- ============================================================================
-- USAGE NOTES:
-- ============================================================================
-- 
-- HIERARCHY STRUCTURE (updated):
--   Portfolio → Customer → Site → UNIT → Project → Phase → Task
-- 
-- GENERIC RESOURCES:
--   When creating a task with assigned_resource_type = 'generic':
--   - Set assigned_resource to one of the role names from employee_roles table
--   - employee_id can be NULL
--   - Any employee with that role can be assigned later
--   
--   When creating a task with assigned_resource_type = 'specific':
--   - Set employee_id to the specific employee
--   - assigned_resource will contain the employee name (denormalized)
-- 
-- EXAMPLE INSERT:
--   INSERT INTO tasks (id, name, assigned_resource_type, assigned_resource)
--   VALUES ('TSK-001', 'Review Documents', 'generic', 'QA/QC Auditor');
-- 
-- ============================================================================

