-- Add is_current_version to project_documents so we can mark the active MPP for each project
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_project_documents_current ON project_documents(project_id, is_current_version) WHERE is_current_version = true;
COMMENT ON COLUMN project_documents.is_current_version IS 'When true, this document is the current/active version for the project (e.g. latest MPP schedule).';
