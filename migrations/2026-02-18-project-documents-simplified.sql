-- Migration: Simplify project_documents table for project plans / MPP
-- Drops existing table and recreates with minimal columns. Run against ppcdb.

BEGIN;

DROP TABLE IF EXISTS project_documents CASCADE;

CREATE TABLE project_documents (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50),
  name VARCHAR(255),
  file_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL DEFAULT 'mpp',
  document_type VARCHAR(50) NOT NULL DEFAULT 'MPP' CHECK (document_type IN (
    'DRD', 'QMP', 'SOP', 'Workflow', 'MPP', 'Excel', 'PDF', 'Word', 'Other'
  )),
  file_size BIGINT NOT NULL DEFAULT 0,
  storage_bucket VARCHAR(100) DEFAULT 'projectdoc',
  uploaded_at TIMESTAMP DEFAULT NOW(),
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  is_current_version BOOLEAN DEFAULT false,
  health_score INTEGER,
  health_check_json JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_documents_current ON project_documents(project_id, is_current_version) WHERE is_current_version = true;
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_type ON project_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_project_documents_uploaded_at ON project_documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_documents_storage_path ON project_documents(storage_path);
CREATE INDEX IF NOT EXISTS idx_project_documents_project_type ON project_documents(project_id, document_type);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_updated_at_project_documents ON project_documents;
CREATE TRIGGER trigger_update_updated_at_project_documents
  BEFORE UPDATE ON project_documents
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

COMMIT;
