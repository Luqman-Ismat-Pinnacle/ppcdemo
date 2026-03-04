-- ============================================================================
-- PPC Consolidated Migration - Apply all pending schema changes
-- Run this on an existing DB that has DB 2.17.26.sql applied.
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ============================================================================

BEGIN;

-- Workday phases (if not in base schema)
CREATE TABLE IF NOT EXISTS workday_phases (
  id VARCHAR(50) PRIMARY KEY,
  phase_id VARCHAR(50),
  project_id VARCHAR(50) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  unit_id VARCHAR(50),
  unit VARCHAR(255),
  parent_id VARCHAR(50),
  hierarchy_type VARCHAR(20),
  outline_level INTEGER,
  employee_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  sequence INTEGER DEFAULT 0,
  methodology VARCHAR(100),
  description TEXT,
  folder TEXT,
  start_date DATE,
  end_date DATE,
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  baseline_hours NUMERIC(10, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  projected_hours NUMERIC(10, 2) DEFAULT 0,
  remaining_hours NUMERIC(10, 2) DEFAULT 0,
  baseline_cost NUMERIC(12, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  remaining_cost NUMERIC(12, 2) DEFAULT 0,
  total_slack INTEGER DEFAULT 0,
  is_summary BOOLEAN DEFAULT false,
  is_critical BOOLEAN DEFAULT false,
  predecessors JSONB DEFAULT '[]'::jsonb,
  successors JSONB DEFAULT '[]'::jsonb,
  comments TEXT,
  ev_method VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workday_phases_project_id ON workday_phases(project_id);
CREATE INDEX IF NOT EXISTS idx_workday_phases_unit ON workday_phases(unit);
CREATE INDEX IF NOT EXISTS idx_workday_phases_project_unit_name ON workday_phases(project_id, unit, name);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workday_phase_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_tasks_workday_phase_id ON tasks(workday_phase_id);

-- Phase 6: alert_events, task_assignments, mapping_suggestions
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
CREATE INDEX IF NOT EXISTS idx_alert_events_type_severity_status_created ON alert_events (event_type, severity, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_project_status_created ON alert_events (related_project_id, status, created_at DESC);

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

-- Commitments + workflow_audit_log
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
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_commitments_status_period ON commitments (status, period_key, updated_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_workflow_audit_entity_created ON workflow_audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_audit_role_created ON workflow_audit_log (role_key, created_at DESC);

-- Mo period notes
CREATE TABLE IF NOT EXISTS mo_period_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_granularity TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  portfolio_id TEXT,
  customer_id TEXT,
  site_id TEXT,
  project_id TEXT,
  note_type TEXT NOT NULL,
  content TEXT NOT NULL,
  author_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mo_period_notes_period ON mo_period_notes (period_granularity, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_mo_period_notes_scope ON mo_period_notes (portfolio_id, customer_id, site_id, project_id);
CREATE INDEX IF NOT EXISTS idx_mo_period_notes_type ON mo_period_notes (note_type);
ALTER TABLE mo_period_notes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Milestones is_client_visible
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_milestones_client_visible ON milestones (is_client_visible, project_id);

-- MPP full extraction: task columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS outline_number VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS constraint_type VARCHAR(50);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS constraint_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_name VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_hours NUMERIC(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS fixed_cost NUMERIC(12, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cost_variance NUMERIC(12, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS work_variance NUMERIC(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_variance NUMERIC(10, 2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_estimated BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS contact VARCHAR(255);

-- task_dependencies is_external
ALTER TABLE task_dependencies ADD COLUMN IF NOT EXISTS is_external BOOLEAN DEFAULT false;

-- hour_entries MPP bucket columns
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS mpp_task_phase TEXT;
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS mpp_phase_unit TEXT;
CREATE INDEX IF NOT EXISTS idx_hour_entries_mpp_task_phase ON hour_entries (mpp_task_phase);
CREATE INDEX IF NOT EXISTS idx_hour_entries_mpp_phase_unit ON hour_entries (mpp_phase_unit);

-- hour_entries: total_hours + work_date (Workday sync compatibility; alias for hours/date if missing)
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS total_hours NUMERIC(10, 2);
ALTER TABLE hour_entries ADD COLUMN IF NOT EXISTS work_date DATE;
-- Backfill: total_hours = hours, work_date = date where null
UPDATE hour_entries SET total_hours = hours WHERE total_hours IS NULL AND hours IS NOT NULL;
UPDATE hour_entries SET work_date = date WHERE work_date IS NULL AND date IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_critical ON tasks(project_id, is_critical) WHERE is_critical = true;
CREATE INDEX IF NOT EXISTS idx_hour_entries_project_date ON hour_entries(project_id, date);

COMMIT;
