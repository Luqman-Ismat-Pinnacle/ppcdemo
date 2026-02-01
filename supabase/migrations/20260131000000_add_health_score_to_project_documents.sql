-- Add health_score to project_documents for MPXJ health check persistence
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS health_score INTEGER;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS health_check_json JSONB;
COMMENT ON COLUMN project_documents.health_score IS 'Project health score (0-100) from MPXJ auto-check';
COMMENT ON COLUMN project_documents.health_check_json IS 'Full health check result (issues, results) as JSON';
