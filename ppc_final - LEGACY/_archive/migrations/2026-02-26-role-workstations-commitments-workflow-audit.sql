-- Phase 7 Role Workstations
-- Commitments + workflow audit persistence (backward-compatible additive migration)

CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  owner_role TEXT NOT NULL,
  author_employee_id TEXT,
  author_email TEXT,
  commitment_text TEXT NOT NULL,
  followthrough_text TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, period_key, owner_role, author_email)
);

CREATE INDEX IF NOT EXISTS idx_commitments_project_period ON commitments(project_id, period_key);
CREATE INDEX IF NOT EXISTS idx_commitments_author_period ON commitments(author_email, period_key);
CREATE INDEX IF NOT EXISTS idx_commitments_status_created ON commitments(status, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  role_key TEXT,
  actor_email TEXT,
  project_id TEXT,
  entity_type TEXT,
  entity_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_audit_event_created ON workflow_audit_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_audit_project_created ON workflow_audit_log(project_id, created_at DESC);
