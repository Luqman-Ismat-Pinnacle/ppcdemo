-- Project documentation versioned schema
-- Shared record table + version table grouped by doc_type.

CREATE TABLE IF NOT EXISTS project_document_records (
  id VARCHAR(80) PRIMARY KEY,
  portfolio_id VARCHAR(80) NULL,
  customer_id VARCHAR(80) NULL,
  site_id VARCHAR(80) NULL,
  project_id VARCHAR(80) NULL,
  doc_type VARCHAR(20) NOT NULL CHECK (doc_type IN ('DRD', 'Workflow', 'QMP', 'SOP')),
  name VARCHAR(255) NOT NULL,
  owner VARCHAR(255) NOT NULL DEFAULT 'System',
  due_date DATE NULL,
  status VARCHAR(80) NOT NULL DEFAULT 'Not Started',
  client_signoff_required BOOLEAN NOT NULL DEFAULT false,
  client_signoff_complete BOOLEAN NOT NULL DEFAULT false,
  latest_version_id VARCHAR(80) NULL,
  created_by VARCHAR(255) NULL,
  updated_by VARCHAR(255) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_document_versions (
  id VARCHAR(80) PRIMARY KEY,
  record_id VARCHAR(80) NOT NULL REFERENCES project_document_records(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NULL,
  blob_path TEXT NOT NULL,
  mime_type VARCHAR(120) NULL,
  file_size BIGINT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by VARCHAR(255) NULL,
  notes TEXT NULL,
  is_latest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_document_versions_record_latest
  ON project_document_versions(record_id)
  WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS idx_project_document_records_type_project
  ON project_document_records(doc_type, project_id);
CREATE INDEX IF NOT EXISTS idx_project_document_records_scope
  ON project_document_records(portfolio_id, customer_id, site_id, project_id);
CREATE INDEX IF NOT EXISTS idx_project_document_versions_record_uploaded_at
  ON project_document_versions(record_id, uploaded_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'project_document_records'
      AND constraint_name = 'project_document_records_latest_version_fkey'
  ) THEN
    ALTER TABLE project_document_records
      ADD CONSTRAINT project_document_records_latest_version_fkey
      FOREIGN KEY (latest_version_id) REFERENCES project_document_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

