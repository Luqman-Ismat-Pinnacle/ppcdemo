-- Create project mapping table
CREATE TABLE IF NOT EXISTS project_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mpp_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workday_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(mpp_project_id, workday_project_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_project_mappings_mpp ON project_mappings(mpp_project_id);
CREATE INDEX IF NOT EXISTS idx_project_mappings_workday ON project_mappings(workday_project_id);
