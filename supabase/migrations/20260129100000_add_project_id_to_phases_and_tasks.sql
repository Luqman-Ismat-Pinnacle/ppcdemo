-- Add project_id to phases and tasks so deleteByProjectId works before MPP sync (units already has it)
ALTER TABLE phases ADD COLUMN IF NOT EXISTS project_id VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_phases_project_id ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
