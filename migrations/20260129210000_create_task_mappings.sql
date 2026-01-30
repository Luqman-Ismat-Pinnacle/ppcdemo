-- Task mappings: link Workday task identifiers (from hour entries) to project plan tasks (MPP/schedule).
-- Used when resolving actuals: hour_entries.taskId (Workday) -> tasks.id/taskId (plan) per project pair.
CREATE TABLE IF NOT EXISTS task_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_mapping_id UUID NOT NULL REFERENCES project_mappings(id) ON DELETE CASCADE,
    workday_task_id TEXT NOT NULL,
    workday_task_name TEXT,
    plan_task_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_mapping_id, workday_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_mappings_project_mapping ON task_mappings(project_mapping_id);
CREATE INDEX IF NOT EXISTS idx_task_mappings_workday_task ON task_mappings(workday_task_id);
CREATE INDEX IF NOT EXISTS idx_task_mappings_plan_task ON task_mappings(plan_task_id);
CREATE INDEX IF NOT EXISTS idx_task_mappings_active ON task_mappings(is_active);

COMMENT ON TABLE task_mappings IS 'Maps Workday task refs (hour_entries.taskId) to plan tasks for actuals roll-up';
COMMENT ON COLUMN task_mappings.workday_task_id IS 'Workday task ref as stored in hour_entries.taskId';
COMMENT ON COLUMN task_mappings.plan_task_id IS 'Plan task id (tasks.id or taskId) to receive rolled-up hours';
