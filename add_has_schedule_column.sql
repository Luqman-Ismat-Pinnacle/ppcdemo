-- Add has_schedule column to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS has_schedule BOOLEAN DEFAULT FALSE;

-- Update projects to set has_schedule = TRUE if they have phases or tasks
UPDATE projects 
SET has_schedule = TRUE 
WHERE id IN (
    SELECT DISTINCT project_id 
    FROM phases 
    WHERE project_id IS NOT NULL
    UNION
    SELECT DISTINCT project_id 
    FROM tasks 
    WHERE project_id IS NOT NULL
);

-- Show the results
SELECT 
    id,
    name,
    has_schedule,
    (SELECT COUNT(*) FROM phases WHERE phases.project_id = projects.id) as phase_count,
    (SELECT COUNT(*) FROM tasks WHERE tasks.project_id = projects.id) as task_count
FROM projects 
ORDER BY name;
