-- Role View Enhancement v2.1 strict schema additions.
-- Adds client visibility support and hardens indexes used by role workstation APIs.

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_milestones_client_visible
  ON milestones (is_client_visible, project_id);

CREATE INDEX IF NOT EXISTS idx_alert_events_type_severity_status_created
  ON alert_events (event_type, severity, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_project_status_created
  ON alert_events (related_project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_audit_entity_created
  ON workflow_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_audit_role_created
  ON workflow_audit_log (role_key, created_at DESC);

ALTER TABLE commitments
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_commitments_status_period
  ON commitments (status, period_key, updated_at DESC);
