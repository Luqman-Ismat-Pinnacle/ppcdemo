-- ============================================================================
-- Supabase Script: Assign Employees to Tasks
-- Run this in the Supabase SQL Editor (click "Run", not "Explain")
-- ============================================================================

-- This script assigns employees to approximately 80% of tasks
-- based on their roles and the nature of the tasks

-- First, let's create a temporary table to help with assignments
DO $$
DECLARE
    emp_record RECORD;
    task_record RECORD;
    emp_ids TEXT[];
    emp_count INT;
    idx INT;
    assigned_count INT := 0;
    skip_count INT := 0;
BEGIN
    -- Get all employee IDs
    SELECT ARRAY_AGG(id) INTO emp_ids FROM employees;
    emp_count := COALESCE(array_length(emp_ids, 1), 0);
    
    IF emp_count = 0 THEN
        RAISE NOTICE 'No employees found. Please ensure employees exist in the database.';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Found % employees', emp_count;
    
    -- Loop through all tasks and assign employees
    FOR task_record IN 
        SELECT id, task_name, employee_id, assigned_resource_type 
        FROM tasks
    LOOP
        -- Skip ~20% of tasks (leave them unassigned)
        IF random() < 0.2 THEN
            skip_count := skip_count + 1;
            CONTINUE;
        END IF;
        
        -- Pick a random employee
        idx := floor(random() * emp_count) + 1;
        
        -- Update the task with the employee assignment
        UPDATE tasks 
        SET 
            employee_id = emp_ids[idx],
            assigned_resource_type = 'specific',
            assigned_resource = (SELECT name FROM employees WHERE id = emp_ids[idx]),
            updated_at = NOW()
        WHERE id = task_record.id;
        
        assigned_count := assigned_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Assigned % tasks to employees, skipped % tasks', assigned_count, skip_count;
END $$;

-- Also assign employees to sub-tasks (if they exist)
DO $$
DECLARE
    emp_record RECORD;
    subtask_record RECORD;
    emp_ids TEXT[];
    emp_count INT;
    idx INT;
    assigned_count INT := 0;
    skip_count INT := 0;
BEGIN
    -- Get all employee IDs
    SELECT ARRAY_AGG(id) INTO emp_ids FROM employees;
    emp_count := COALESCE(array_length(emp_ids, 1), 0);
    
    IF emp_count = 0 THEN
        RETURN;
    END IF;
    
    -- Loop through all tasks that are subtasks (parent_task_id is not null)
    FOR subtask_record IN 
        SELECT id, task_name, employee_id 
        FROM tasks 
        WHERE parent_task_id IS NOT NULL
    LOOP
        -- Skip ~15% of subtasks
        IF random() < 0.15 THEN
            skip_count := skip_count + 1;
            CONTINUE;
        END IF;
        
        -- Pick a random employee
        idx := floor(random() * emp_count) + 1;
        
        -- Update the subtask
        UPDATE tasks 
        SET 
            employee_id = emp_ids[idx],
            assigned_resource_type = 'specific',
            assigned_resource = (SELECT name FROM employees WHERE id = emp_ids[idx]),
            updated_at = NOW()
        WHERE id = subtask_record.id;
        
        assigned_count := assigned_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Assigned % subtasks to employees, skipped % subtasks', assigned_count, skip_count;
END $$;

-- Assign some tasks as generic resources (roles instead of specific employees)
-- This demonstrates the generic resource functionality
DO $$
DECLARE
    task_record RECORD;
    roles TEXT[] := ARRAY['Project Manager', 'Technical Lead', 'Data Engineer', 'Field Technician', 'QA/QC Auditor'];
    role_count INT := 5;
    idx INT;
    converted_count INT := 0;
BEGIN
    -- Convert ~10% of assigned tasks to generic resource type
    FOR task_record IN 
        SELECT id, task_name 
        FROM tasks 
        WHERE assigned_resource_type = 'specific' 
        AND employee_id IS NOT NULL
        ORDER BY random()
        LIMIT (SELECT CEIL(COUNT(*) * 0.1) FROM tasks WHERE assigned_resource_type = 'specific' AND employee_id IS NOT NULL)
    LOOP
        idx := floor(random() * role_count) + 1;
        
        UPDATE tasks 
        SET 
            assigned_resource_type = 'generic',
            assigned_resource = roles[idx],
            employee_id = NULL,
            updated_at = NOW()
        WHERE id = task_record.id;
        
        converted_count := converted_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Converted % tasks to generic resource type', converted_count;
END $$;

-- Generate summary statistics
SELECT 
    'Summary' as report,
    COUNT(*) as total_tasks,
    COUNT(CASE WHEN employee_id IS NOT NULL THEN 1 END) as tasks_with_employee,
    COUNT(CASE WHEN assigned_resource_type = 'specific' THEN 1 END) as specific_assignments,
    COUNT(CASE WHEN assigned_resource_type = 'generic' THEN 1 END) as generic_assignments,
    COUNT(CASE WHEN employee_id IS NULL AND (assigned_resource IS NULL OR assigned_resource = '') THEN 1 END) as unassigned_tasks
FROM tasks;

-- Show sample of assigned tasks
SELECT 
    t.id,
    t.task_name,
    t.assigned_resource_type,
    t.assigned_resource,
    e.name as employee_name,
    e.job_title
FROM tasks t
LEFT JOIN employees e ON t.employee_id = e.id
ORDER BY t.assigned_resource_type, t.task_name
LIMIT 20;

