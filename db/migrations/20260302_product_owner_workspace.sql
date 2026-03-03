-- Migration: Product Owner workspace tables
-- Safe to re-run (IF NOT EXISTS / IF EXISTS guards)

BEGIN;

-- ============================================================================
-- FEEDBACK_ITEMS (issues + feature requests from any role)
-- ============================================================================
CREATE TABLE IF NOT EXISTS feedback_items (
  id              BIGSERIAL PRIMARY KEY,
  item_type       TEXT NOT NULL DEFAULT 'issue',
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  page_path       TEXT,
  user_action     TEXT,
  expected_result TEXT,
  actual_result   TEXT,
  error_message   TEXT,
  severity        TEXT NOT NULL DEFAULT 'medium',
  status          TEXT NOT NULL DEFAULT 'open',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  notes           TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',
  created_by_name TEXT,
  created_by_email TEXT,
  created_by_employee_id TEXT,
  browser_info    TEXT,
  runtime_error_name TEXT,
  runtime_stack   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_type_status ON feedback_items(item_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback_items(status, updated_at DESC);

-- ============================================================================
-- INTEGRATION_CONNECTIONS (data pipeline + service health)
-- ============================================================================
CREATE TABLE IF NOT EXISTS integration_connections (
  id              BIGSERIAL PRIMARY KEY,
  connection_key  TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  description     TEXT,
  connection_type TEXT NOT NULL DEFAULT 'database',
  status          TEXT NOT NULL DEFAULT 'unknown',
  last_sync_at    TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error      TEXT,
  config_summary  TEXT,
  owner_email     TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Default connection registry (safe upsert)
INSERT INTO integration_connections
  (connection_key, display_name, description, connection_type, status, owner_email, is_active)
VALUES
  ('azure_postgres', 'Azure PostgreSQL', 'Primary application database connection.', 'database', 'unknown', 'luqman.ismat@pinnaclereliability.com', true),
  ('workday_sync', 'Workday Sync', 'Workday import/sync pipeline.', 'integration', 'unknown', 'luqman.ismat@pinnaclereliability.com', true),
  ('azure_devops', 'Azure DevOps', 'Repository and CI/CD integration.', 'integration', 'unknown', 'luqman.ismat@pinnaclereliability.com', true),
  ('auth0', 'Auth0', 'Authentication and identity provider.', 'auth', 'unknown', 'luqman.ismat@pinnaclereliability.com', true),
  ('azure_blob_docs', 'Azure Blob Storage', 'Project document storage.', 'storage', 'unknown', 'luqman.ismat@pinnaclereliability.com', true)
ON CONFLICT (connection_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  connection_type = EXCLUDED.connection_type,
  owner_email = EXCLUDED.owner_email,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- TRIGGERS
-- ============================================================================
CREATE OR REPLACE TRIGGER trg_feedback_items_updated
  BEFORE UPDATE ON feedback_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_integration_connections_updated
  BEFORE UPDATE ON integration_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
