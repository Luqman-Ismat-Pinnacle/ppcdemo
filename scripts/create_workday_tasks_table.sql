-- Create workday_tasks table for Workday task data (read-only reference)
-- This table stores tasks synced from Workday and is used only for fetching actuals
-- MPP tasks go in the regular 'tasks' table

CREATE TABLE IF NOT EXISTS workday_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id),
    task_name TEXT,
    task_number TEXT,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    budgeted_hours NUMERIC DEFAULT 0,
    actual_hours NUMERIC DEFAULT 0,
    actual_cost NUMERIC DEFAULT 0,
    status TEXT,
    assigned_resource TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_workday_tasks_project_id ON workday_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_workday_tasks_task_number ON workday_tasks(task_number);

-- Add RLS policies
ALTER TABLE workday_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to workday_tasks" ON workday_tasks
    FOR ALL USING (true) WITH CHECK (true);

-- Grant permissions
GRANT ALL ON workday_tasks TO authenticated;
GRANT ALL ON workday_tasks TO service_role;
