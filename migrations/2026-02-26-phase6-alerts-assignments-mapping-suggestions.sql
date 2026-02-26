-- Phase 6 foundation:
-- 1) alert_events for platform alerting/provenance
-- 2) task_assignments for normalized assignment history
-- 3) mapping_suggestions for hours-to-task mapping assist

CREATE TABLE IF NOT EXISTS alert_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT,
  message TEXT NOT NULL,
  source TEXT,
  entity_type TEXT,
  entity_id TEXT,
  related_project_id TEXT,
  related_task_id TEXT,
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_events_created_at ON alert_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_status ON alert_events (status);
CREATE INDEX IF NOT EXISTS idx_alert_events_severity ON alert_events (severity);
CREATE INDEX IF NOT EXISTS idx_alert_events_dedupe_key ON alert_events (dedupe_key);

CREATE TABLE IF NOT EXISTS task_assignments (
  id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  assigned_by TEXT,
  assignment_source TEXT NOT NULL DEFAULT 'manual',
  previous_employee_id TEXT,
  previous_employee_name TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_employee_id ON task_assignments (employee_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_changed_at ON task_assignments (changed_at DESC);

CREATE TABLE IF NOT EXISTS mapping_suggestions (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL,
  workday_phase_id TEXT,
  hour_entry_id TEXT,
  task_id TEXT,
  suggestion_type TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,
  reason TEXT NOT NULL,
  source_value TEXT,
  target_value TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mapping_suggestions_project_status ON mapping_suggestions (project_id, status);
CREATE INDEX IF NOT EXISTS idx_mapping_suggestions_confidence ON mapping_suggestions (confidence DESC);
CREATE INDEX IF NOT EXISTS idx_mapping_suggestions_hour_entry ON mapping_suggestions (hour_entry_id);
