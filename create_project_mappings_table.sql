-- Create project_mappings table for MPP to Workday project linking
CREATE TABLE IF NOT EXISTS project_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mpp_project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    workday_project_id VARCHAR(255) REFERENCES portfolios(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(255),
    notes TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_mappings_mpp_project_id ON project_mappings(mpp_project_id);
CREATE INDEX IF NOT EXISTS idx_project_mappings_workday_project_id ON project_mappings(workday_project_id);
CREATE INDEX IF NOT EXISTS idx_project_mappings_deleted ON project_mappings(deleted);

-- Add RLS policies
ALTER TABLE project_mappings ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to read mappings
CREATE POLICY "Authenticated users can view project mappings" ON project_mappings
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for service role to manage mappings
CREATE POLICY "Service role can manage project mappings" ON project_mappings
    FOR ALL USING (auth.role() = 'service_role');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_project_mappings_updated_at 
    BEFORE UPDATE ON project_mappings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
