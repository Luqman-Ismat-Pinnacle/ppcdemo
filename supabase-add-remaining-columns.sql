-- ============================================================================
-- SQL Script: Add Remaining Hours & Cost Columns to All Hierarchy Levels
-- ============================================================================
-- Run this in Supabase SQL Editor
-- Adds remainingHours and remainingCost to portfolios, customers, sites, 
-- projects, phases, and tasks tables
-- Creates triggers to auto-calculate remaining = baseline - actual

-- ============================================================================
-- STEP 1: Add columns to PORTFOLIOS table
-- ============================================================================

ALTER TABLE portfolios 
ADD COLUMN IF NOT EXISTS remaining_hours DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_cost DECIMAL(12,2) DEFAULT 0;

-- Create or replace trigger function for portfolios
CREATE OR REPLACE FUNCTION calculate_portfolio_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_hours := COALESCE(NEW.baseline_hours, 0) - COALESCE(NEW.actual_hours, 0);
    NEW.remaining_cost := COALESCE(NEW.baseline_cost, 0) - COALESCE(NEW.actual_cost, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_portfolio_remaining ON portfolios;
CREATE TRIGGER trigger_portfolio_remaining
    BEFORE INSERT OR UPDATE ON portfolios
    FOR EACH ROW
    EXECUTE FUNCTION calculate_portfolio_remaining();

-- ============================================================================
-- STEP 2: Add columns to CUSTOMERS table
-- ============================================================================

ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS remaining_hours DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_cost DECIMAL(12,2) DEFAULT 0;

-- Create or replace trigger function for customers
CREATE OR REPLACE FUNCTION calculate_customer_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_hours := COALESCE(NEW.baseline_hours, 0) - COALESCE(NEW.actual_hours, 0);
    NEW.remaining_cost := COALESCE(NEW.baseline_cost, 0) - COALESCE(NEW.actual_cost, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_customer_remaining ON customers;
CREATE TRIGGER trigger_customer_remaining
    BEFORE INSERT OR UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION calculate_customer_remaining();

-- ============================================================================
-- STEP 3: Add columns to SITES table
-- ============================================================================

ALTER TABLE sites 
ADD COLUMN IF NOT EXISTS remaining_hours DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_cost DECIMAL(12,2) DEFAULT 0;

-- Create or replace trigger function for sites
CREATE OR REPLACE FUNCTION calculate_site_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_hours := COALESCE(NEW.baseline_hours, 0) - COALESCE(NEW.actual_hours, 0);
    NEW.remaining_cost := COALESCE(NEW.baseline_cost, 0) - COALESCE(NEW.actual_cost, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_site_remaining ON sites;
CREATE TRIGGER trigger_site_remaining
    BEFORE INSERT OR UPDATE ON sites
    FOR EACH ROW
    EXECUTE FUNCTION calculate_site_remaining();

-- ============================================================================
-- STEP 4: Add columns to PROJECTS table
-- ============================================================================

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS remaining_hours DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_cost DECIMAL(12,2) DEFAULT 0;

-- Create or replace trigger function for projects
CREATE OR REPLACE FUNCTION calculate_project_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_hours := COALESCE(NEW.baseline_hours, 0) - COALESCE(NEW.actual_hours, 0);
    NEW.remaining_cost := COALESCE(NEW.baseline_cost, 0) - COALESCE(NEW.actual_cost, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_remaining ON projects;
CREATE TRIGGER trigger_project_remaining
    BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION calculate_project_remaining();

-- ============================================================================
-- STEP 5: Add columns to PHASES table
-- ============================================================================

ALTER TABLE phases 
ADD COLUMN IF NOT EXISTS remaining_hours DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_cost DECIMAL(12,2) DEFAULT 0;

-- Create or replace trigger function for phases
CREATE OR REPLACE FUNCTION calculate_phase_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_hours := COALESCE(NEW.baseline_hours, 0) - COALESCE(NEW.actual_hours, 0);
    NEW.remaining_cost := COALESCE(NEW.baseline_cost, 0) - COALESCE(NEW.actual_cost, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_phase_remaining ON phases;
CREATE TRIGGER trigger_phase_remaining
    BEFORE INSERT OR UPDATE ON phases
    FOR EACH ROW
    EXECUTE FUNCTION calculate_phase_remaining();

-- ============================================================================
-- STEP 6: Add columns to TASKS table (if not exists)
-- ============================================================================

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS remaining_hours DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_cost DECIMAL(12,2) DEFAULT 0;

-- Create or replace trigger function for tasks
CREATE OR REPLACE FUNCTION calculate_task_remaining()
RETURNS TRIGGER AS $$
BEGIN
    NEW.remaining_hours := COALESCE(NEW.baseline_hours, 0) - COALESCE(NEW.actual_hours, 0);
    NEW.remaining_cost := COALESCE(NEW.baseline_cost, 0) - COALESCE(NEW.actual_cost, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_remaining ON tasks;
CREATE TRIGGER trigger_task_remaining
    BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION calculate_task_remaining();

-- ============================================================================
-- STEP 7: Update existing records to calculate remaining values
-- ============================================================================

UPDATE portfolios SET remaining_hours = COALESCE(baseline_hours, 0) - COALESCE(actual_hours, 0);
UPDATE portfolios SET remaining_cost = COALESCE(baseline_cost, 0) - COALESCE(actual_cost, 0);

UPDATE customers SET remaining_hours = COALESCE(baseline_hours, 0) - COALESCE(actual_hours, 0);
UPDATE customers SET remaining_cost = COALESCE(baseline_cost, 0) - COALESCE(actual_cost, 0);

UPDATE sites SET remaining_hours = COALESCE(baseline_hours, 0) - COALESCE(actual_hours, 0);
UPDATE sites SET remaining_cost = COALESCE(baseline_cost, 0) - COALESCE(actual_cost, 0);

UPDATE projects SET remaining_hours = COALESCE(baseline_hours, 0) - COALESCE(actual_hours, 0);
UPDATE projects SET remaining_cost = COALESCE(baseline_cost, 0) - COALESCE(actual_cost, 0);

UPDATE phases SET remaining_hours = COALESCE(baseline_hours, 0) - COALESCE(actual_hours, 0);
UPDATE phases SET remaining_cost = COALESCE(baseline_cost, 0) - COALESCE(actual_cost, 0);

UPDATE tasks SET remaining_hours = COALESCE(baseline_hours, 0) - COALESCE(actual_hours, 0);
UPDATE tasks SET remaining_cost = COALESCE(baseline_cost, 0) - COALESCE(actual_cost, 0);

-- ============================================================================
-- STEP 8: Verify columns added
-- ============================================================================

SELECT 'portfolios' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'portfolios' AND column_name IN ('remaining_hours', 'remaining_cost')

UNION ALL

SELECT 'customers' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'customers' AND column_name IN ('remaining_hours', 'remaining_cost')

UNION ALL

SELECT 'sites' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'sites' AND column_name IN ('remaining_hours', 'remaining_cost')

UNION ALL

SELECT 'projects' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects' AND column_name IN ('remaining_hours', 'remaining_cost')

UNION ALL

SELECT 'phases' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'phases' AND column_name IN ('remaining_hours', 'remaining_cost')

UNION ALL

SELECT 'tasks' as table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tasks' AND column_name IN ('remaining_hours', 'remaining_cost');

