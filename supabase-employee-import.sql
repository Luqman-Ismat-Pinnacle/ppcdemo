-- =============================================================================
-- PINNACLE PROJECT CONTROLS - EMPLOYEE CSV IMPORT SCRIPT
-- =============================================================================
-- 
-- This script sets up the employees table with a trigger to auto-populate
-- the 'id' column from 'employee_id' when importing from CSV.
--
-- RUN THIS SCRIPT IN SUPABASE SQL EDITOR BEFORE IMPORTING YOUR CSV
--
-- =============================================================================

-- Step 1: Drop existing table if needed (BE CAREFUL - this deletes all data!)
DROP TABLE IF EXISTS employees CASCADE;

-- Step 2: Create the employees table
CREATE TABLE employees (
    id TEXT PRIMARY KEY,
    employee_id TEXT,
    name TEXT NOT NULL,
    email TEXT,
    job_title TEXT,
    management_level TEXT DEFAULT 'Individual Contributor',
    employee_type TEXT DEFAULT 'Regular',
    manager TEXT,
    hourly_rate DECIMAL(10,2) DEFAULT 0,
    utilization_percent DECIMAL(5,2) DEFAULT 80,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create unique index on employee_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);

-- Step 4: Create trigger function to auto-set id from employee_id
CREATE OR REPLACE FUNCTION set_employee_id_as_id()
RETURNS TRIGGER AS $$
BEGIN
    -- If id is null but employee_id has a value, use employee_id as id
    IF NEW.id IS NULL AND NEW.employee_id IS NOT NULL THEN
        NEW.id := NEW.employee_id;
    END IF;
    -- If both are null, generate a UUID
    IF NEW.id IS NULL THEN
        NEW.id := 'EMP-' || gen_random_uuid()::text;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create the trigger
DROP TRIGGER IF EXISTS trigger_set_employee_id ON employees;
CREATE TRIGGER trigger_set_employee_id
    BEFORE INSERT ON employees
    FOR EACH ROW
    EXECUTE FUNCTION set_employee_id_as_id();

-- =============================================================================
-- IMPORT INSTRUCTIONS
-- =============================================================================
-- 
-- After running the above SQL:
-- 
-- 1. Go to Supabase Dashboard → Table Editor → employees
-- 2. Click "Insert" → "Import data from CSV"
-- 3. Upload your Employee List.csv file
-- 4. Map the columns:
--    ┌─────────────────────┬────────────────────┐
--    │ CSV Column          │ Supabase Column    │
--    ├─────────────────────┼────────────────────┤
--    │ Employee_ID         │ employee_id        │
--    │ Worker              │ name               │
--    │ Work_Email          │ email              │
--    │ Default_Job_Title   │ job_title          │
--    │ Management_Level    │ management_level   │
--    │ Employee_Type       │ employee_type      │
--    │ Workers_Manager     │ manager            │
--    │ (leave unmapped)    │ id (auto-filled)   │
--    │ (skip)              │ termination_date   │
--    └─────────────────────┴────────────────────┘
-- 5. Click Import
-- 
-- The trigger will automatically set id = employee_id for every row.
-- 
-- =============================================================================

-- Verify data after import (run these after importing):
-- SELECT COUNT(*) as total_employees FROM employees;
-- SELECT id, employee_id, name, email FROM employees ORDER BY name LIMIT 10;
