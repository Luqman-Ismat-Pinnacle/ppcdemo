-- ============================================================================
-- Delete All Data from Database (in reverse dependency order)
-- Updated with latest schema including Workday integration
-- This deletes all records but keeps the table structure
-- Also clears the project-documents storage bucket
-- Run this in your Supabase SQL editor
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Clear Storage Bucket (project-documents)
-- ============================================================================
DELETE FROM storage.objects WHERE bucket_id = 'project-documents';

-- ============================================================================
-- STEP 2: Delete Operational/Transaction Tables (highest dependency)
-- ============================================================================
DO $$ 
BEGIN
    -- Change tracking
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'change_impacts') THEN
        DELETE FROM change_impacts;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'change_requests') THEN
        DELETE FROM change_requests;
    END IF;
    
    -- Project documents and logs
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_documents') THEN
        DELETE FROM project_documents;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_log') THEN
        DELETE FROM project_log;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_health') THEN
        DELETE FROM project_health;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'snapshots') THEN
        DELETE FROM snapshots;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'forecasts') THEN
        DELETE FROM forecasts;
    END IF;
    
    -- Workday Integration Tables (NEW)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cost_actuals') THEN
        DELETE FROM cost_actuals;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hour_entries') THEN
        DELETE FROM hour_entries;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_mappings') THEN
        DELETE FROM project_mappings;
    END IF;
    
    -- Work items and time tracking
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'work_items') THEN
        DELETE FROM work_items;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task_quantity_entries') THEN
        DELETE FROM task_quantity_entries;
    END IF;
    
    -- QC and deliverables
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'qc_tasks') THEN
        DELETE FROM qc_tasks;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'deliverables') THEN
        DELETE FROM deliverables;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'milestones') THEN
        DELETE FROM milestones;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: Delete Agile/Scrum Tables
-- ============================================================================
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_stories') THEN
        DELETE FROM user_stories;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'features') THEN
        DELETE FROM features;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'epics') THEN
        DELETE FROM epics;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprint_tasks') THEN
        DELETE FROM sprint_tasks;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sprints') THEN
        DELETE FROM sprints;
    END IF;
END $$;

-- ============================================================================
-- STEP 4: Delete WBS Hierarchy (bottom up)
-- ============================================================================
DO $$ 
BEGIN
    -- Task dependencies first
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task_dependencies') THEN
        DELETE FROM task_dependencies;
    END IF;
    
    -- Tasks
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') THEN
        DELETE FROM tasks;
    END IF;
    
    -- Phases
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'phases') THEN
        DELETE FROM phases;
    END IF;
    
    -- Subprojects
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subprojects') THEN
        DELETE FROM subprojects;
    END IF;
    
    -- Projects
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
        DELETE FROM projects;
    END IF;
    
    -- Hierarchy nodes
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hierarchy_nodes') THEN
        DELETE FROM hierarchy_nodes;
    END IF;
    
    -- Units
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'units') THEN
        DELETE FROM units;
    END IF;
    
    -- Sites
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sites') THEN
        DELETE FROM sites;
    END IF;
    
    -- Customers
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
        DELETE FROM customers;
    END IF;
    
    -- Portfolios
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'portfolios') THEN
        DELETE FROM portfolios;
    END IF;
END $$;

-- ============================================================================
-- STEP 5: Delete Base Reference Tables
-- ============================================================================
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'employees') THEN
        DELETE FROM employees;
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- Summary of tables deleted (in order):
-- Storage: project-documents bucket
-- Operational: change_impacts, change_requests, project_documents, project_log,
--              project_health, snapshots, forecasts, cost_actuals, hour_entries,
--              project_mappings, work_items, task_quantity_entries, qc_tasks, 
--              deliverables, milestones
-- Agile: user_stories, features, epics, sprint_tasks, sprints
-- WBS: task_dependencies, tasks, phases, subprojects, projects, hierarchy_nodes,
--      units, sites, customers, portfolios
-- Base: employees
-- 
-- NEW Workday Integration Tables:
-- - cost_actuals: General Ledger cost actuals from Workday
-- - hour_entries: Enhanced with cost fields (billable_rate, actual_cost, actual_revenue)
-- - project_mappings: Links MPP projects to Workday projects
-- ============================================================================

-- ============================================================================
-- Verification Queries (Optional - Run to confirm deletion)
-- ============================================================================
-- 
-- -- Check remaining record counts
-- SELECT 'hour_entries' as table_name, COUNT(*) as count FROM hour_entries
-- UNION ALL
-- SELECT 'cost_actuals' as table_name, COUNT(*) as count FROM cost_actuals
-- UNION ALL
-- SELECT 'project_mappings' as table_name, COUNT(*) as count FROM project_mappings
-- UNION ALL
-- SELECT 'projects' as table_name, COUNT(*) as count FROM projects
-- UNION ALL
-- SELECT 'employees' as table_name, COUNT(*) as count FROM employees;
-- 
-- -- Check storage bucket
-- SELECT COUNT(*) as remaining_objects FROM storage.objects WHERE bucket_id = 'project-documents';
-- 
-- ============================================================================
