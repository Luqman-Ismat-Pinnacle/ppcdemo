-- ============================================================================
-- PPC Minimal Schema
-- Standalone database for the PCA-first minimal app.
-- ============================================================================

BEGIN;

-- ============================================================================
-- DROP (safe re-run)
-- ============================================================================
DROP TABLE IF EXISTS integration_connections CASCADE;
DROP TABLE IF EXISTS feedback_items CASCADE;
DROP TABLE IF EXISTS sprint_tasks CASCADE;
DROP TABLE IF EXISTS sprints CASCADE;
DROP TABLE IF EXISTS workday_phases CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS qc_logs CASCADE;
DROP TABLE IF EXISTS customer_contracts CASCADE;
DROP TABLE IF EXISTS project_documents CASCADE;
DROP TABLE IF EXISTS hour_entries CASCADE;
DROP TABLE IF EXISTS sub_tasks CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS phases CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS sites CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS portfolios CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- EMPLOYEES
-- ============================================================================
CREATE TABLE employees (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT UNIQUE,
  name            TEXT NOT NULL,
  email           TEXT,
  time_in_job_profile TEXT,
  management_level TEXT,
  employee_type   TEXT,
  senior_manager  TEXT,
  job_title       TEXT,
  is_active       BOOLEAN DEFAULT true,
  manager         TEXT,
  employee_customer TEXT,
  employee_site   TEXT,
  employee_project TEXT,
  department      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_emp_active ON employees(is_active);
CREATE INDEX idx_emp_dept ON employees(department);

-- ============================================================================
-- PORTFOLIOS (top of hierarchy)
-- Rollup: hours/cost/days/projected_hours SUMMED from children.
-- Dates: MIN(start), MAX(end) from children.
-- percent_complete = actual_hours / NULLIF(total_hours, 0)
-- scheduled_cost = actual_cost + remaining_cost
-- ============================================================================
CREATE TABLE portfolios (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  comments        TEXT,
  -- rollup dates
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  -- rollup numerics
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CUSTOMERS
-- ============================================================================
CREATE TABLE customers (
  id              TEXT PRIMARY KEY,
  portfolio_id    TEXT REFERENCES portfolios(id),
  name            TEXT NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  comments        TEXT,
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cust_portfolio ON customers(portfolio_id);

-- ============================================================================
-- SITES
-- ============================================================================
CREATE TABLE sites (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  location        TEXT,
  customer_id     TEXT REFERENCES customers(id),
  portfolio_id    TEXT REFERENCES portfolios(id),
  is_active       BOOLEAN DEFAULT true,
  comments        TEXT,
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_site_customer ON sites(customer_id);
CREATE INDEX idx_site_portfolio ON sites(portfolio_id);

-- ============================================================================
-- PROJECTS
-- ============================================================================
CREATE TABLE projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  site_id         TEXT REFERENCES sites(id),
  customer_id     TEXT REFERENCES customers(id),
  portfolio_id    TEXT REFERENCES portfolios(id),
  pca_email       TEXT,
  is_active       BOOLEAN DEFAULT true,
  has_schedule    BOOLEAN DEFAULT false,
  comments        TEXT,
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_proj_site ON projects(site_id);
CREATE INDEX idx_proj_cust ON projects(customer_id);
CREATE INDEX idx_proj_port ON projects(portfolio_id);
CREATE INDEX idx_proj_pca ON projects(pca_email);

-- ============================================================================
-- UNITS
-- ============================================================================
CREATE TABLE units (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  project_id      TEXT REFERENCES projects(id),
  employee_id     TEXT,
  is_active       BOOLEAN DEFAULT true,
  comments        TEXT,
  -- rollup
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  -- schedule
  is_critical     BOOLEAN DEFAULT false,
  is_milestone    BOOLEAN DEFAULT false,
  is_summary      BOOLEAN DEFAULT false,
  outline_level   INTEGER DEFAULT 0,
  total_float     INTEGER DEFAULT 0,
  resources       TEXT,
  constraint_date DATE,
  constraint_type TEXT,
  early_start     DATE,
  early_finish    DATE,
  late_start      DATE,
  late_finish     DATE,
  priority_value  INTEGER DEFAULT 0,
  lag_days        INTEGER DEFAULT 0,
  predecessor_name TEXT,
  predecessor_task_id TEXT,
  relationship    TEXT,
  wbs_code        TEXT,
  folder          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_unit_project ON units(project_id);

-- ============================================================================
-- PHASES
-- ============================================================================
CREATE TABLE phases (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  unit_id         TEXT REFERENCES units(id),
  project_id      TEXT REFERENCES projects(id),
  employee_id     TEXT,
  resource        TEXT,
  is_active       BOOLEAN DEFAULT true,
  comments        TEXT,
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  is_critical     BOOLEAN DEFAULT false,
  is_milestone    BOOLEAN DEFAULT false,
  is_summary      BOOLEAN DEFAULT false,
  outline_level   INTEGER DEFAULT 0,
  total_float     INTEGER DEFAULT 0,
  resources       TEXT,
  constraint_date DATE,
  constraint_type TEXT,
  early_start     DATE,
  early_finish    DATE,
  late_start      DATE,
  late_finish     DATE,
  priority_value  INTEGER DEFAULT 0,
  lag_days        INTEGER DEFAULT 0,
  predecessor_name TEXT,
  predecessor_task_id TEXT,
  relationship    TEXT,
  wbs_code        TEXT,
  folder          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_phase_unit ON phases(unit_id);
CREATE INDEX idx_phase_project ON phases(project_id);

-- ============================================================================
-- TASKS
-- ============================================================================
CREATE TABLE tasks (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  phase_id        TEXT REFERENCES phases(id),
  unit_id         TEXT REFERENCES units(id),
  project_id      TEXT REFERENCES projects(id),
  employee_id     TEXT,
  resource        TEXT,
  is_active       BOOLEAN DEFAULT true,
  comments        TEXT,
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  is_critical     BOOLEAN DEFAULT false,
  is_milestone    BOOLEAN DEFAULT false,
  is_summary      BOOLEAN DEFAULT false,
  outline_level   INTEGER DEFAULT 0,
  total_float     INTEGER DEFAULT 0,
  resources       TEXT,
  constraint_date DATE,
  constraint_type TEXT,
  early_start     DATE,
  early_finish    DATE,
  late_start      DATE,
  late_finish     DATE,
  priority_value  INTEGER DEFAULT 0,
  lag_days        INTEGER DEFAULT 0,
  predecessor_name TEXT,
  predecessor_task_id TEXT,
  relationship    TEXT,
  wbs_code        TEXT,
  folder          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_task_phase ON tasks(phase_id);
CREATE INDEX idx_task_unit ON tasks(unit_id);
CREATE INDEX idx_task_project ON tasks(project_id);

-- ============================================================================
-- SUB_TASKS
-- ============================================================================
CREATE TABLE sub_tasks (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  task_id         TEXT REFERENCES tasks(id),
  phase_id        TEXT REFERENCES phases(id),
  unit_id         TEXT REFERENCES units(id),
  project_id      TEXT REFERENCES projects(id),
  employee_id     TEXT,
  resource        TEXT,
  is_active       BOOLEAN DEFAULT true,
  comments        TEXT,
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  is_critical     BOOLEAN DEFAULT false,
  is_milestone    BOOLEAN DEFAULT false,
  is_summary      BOOLEAN DEFAULT false,
  outline_level   INTEGER DEFAULT 0,
  total_float     INTEGER DEFAULT 0,
  resources       TEXT,
  constraint_date DATE,
  constraint_type TEXT,
  early_start     DATE,
  early_finish    DATE,
  late_start      DATE,
  late_finish     DATE,
  priority_value  INTEGER DEFAULT 0,
  lag_days        INTEGER DEFAULT 0,
  predecessor_name TEXT,
  predecessor_task_id TEXT,
  relationship    TEXT,
  wbs_code        TEXT,
  folder          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_subtask_task ON sub_tasks(task_id);
CREATE INDEX idx_subtask_project ON sub_tasks(project_id);

-- ============================================================================
-- HOUR_ENTRIES
-- ============================================================================
CREATE TABLE hour_entries (
  id              TEXT PRIMARY KEY,
  employee_id     TEXT REFERENCES employees(id),
  project_id      TEXT REFERENCES projects(id),
  phase           TEXT,
  task            TEXT,
  charge_code     TEXT,
  description     TEXT,
  date            DATE,
  hours           NUMERIC(8,2) DEFAULT 0,
  actual_cost     NUMERIC(12,2) DEFAULT 0,
  workday_phase   TEXT,
  workday_task    TEXT,
  mpp_phase_task  TEXT,
  actual_revenue  NUMERIC(12,2) DEFAULT 0,
  billing_status  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_he_project ON hour_entries(project_id);
CREATE INDEX idx_he_employee ON hour_entries(employee_id);
CREATE INDEX idx_he_date ON hour_entries(date);

-- ============================================================================
-- CUSTOMER_CONTRACTS
-- ============================================================================
CREATE TABLE customer_contracts (
  id              TEXT PRIMARY KEY,
  project_id      TEXT,
  line_amount     NUMERIC(14,2) NOT NULL,
  line_date       DATE,
  currency        TEXT DEFAULT 'USD',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cc_project ON customer_contracts(project_id);

-- ============================================================================
-- PROJECT_DOCUMENTS (for Project Plans / Azure blob references)
-- ============================================================================
CREATE TABLE project_documents (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id),
  file_name       TEXT NOT NULL,
  storage_path    TEXT,
  document_type   TEXT DEFAULT 'mpp',
  uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
  is_current_version BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pd_project ON project_documents(project_id);

-- ============================================================================
-- SPRINTS (MPP-only, no Azure DevOps)
-- ============================================================================
CREATE TABLE sprints (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  project_id      TEXT REFERENCES projects(id),
  start_date      DATE,
  end_date        DATE,
  status          TEXT DEFAULT 'Planned',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sprint_project ON sprints(project_id);

-- ============================================================================
-- SPRINT_TASKS (links MPP tasks to sprints)
-- ============================================================================
CREATE TABLE sprint_tasks (
  id              TEXT PRIMARY KEY,
  sprint_id       TEXT REFERENCES sprints(id) ON DELETE CASCADE,
  task_id         TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_st_sprint ON sprint_tasks(sprint_id);
CREATE INDEX idx_st_task ON sprint_tasks(task_id);

-- ============================================================================
-- WORKDAY_PHASES (from Workday, not from MPP)
-- ============================================================================
CREATE TABLE workday_phases (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id),
  unit            TEXT,
  name            TEXT NOT NULL,
  baseline_start  DATE,
  baseline_end    DATE,
  actual_start    DATE,
  actual_end      DATE,
  percent_complete NUMERIC(5,2) DEFAULT 0,
  baseline_hours  NUMERIC(12,2) DEFAULT 0,
  actual_hours    NUMERIC(12,2) DEFAULT 0,
  remaining_hours NUMERIC(12,2) DEFAULT 0,
  actual_cost     NUMERIC(14,2) DEFAULT 0,
  remaining_cost  NUMERIC(14,2) DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  comments        TEXT,
  total_hours     NUMERIC(12,2) DEFAULT 0,
  days            INTEGER DEFAULT 0,
  scheduled_cost  NUMERIC(14,2) DEFAULT 0,
  progress        NUMERIC(5,2) DEFAULT 0,
  tf              NUMERIC(10,2) DEFAULT 0,
  projected_hours NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wp_project ON workday_phases(project_id);

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
CREATE TABLE notifications (
  id              BIGSERIAL PRIMARY KEY,
  employee_id     TEXT,
  role            TEXT,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  related_task_id TEXT,
  related_project_id TEXT,
  is_read         BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notif_emp_role ON notifications(employee_id, role, is_read, created_at DESC);
CREATE INDEX idx_notif_role ON notifications(role, created_at DESC);

-- ============================================================================
-- QC_LOGS
-- One current QC state per task.
-- ============================================================================
CREATE TABLE qc_logs (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id      TEXT REFERENCES projects(id),
  phase_id        TEXT REFERENCES phases(id),
  unit_id         TEXT REFERENCES units(id),
  qc_status       TEXT NOT NULL DEFAULT 'not_started',
  severity        TEXT DEFAULT 'low',
  item_count      INTEGER DEFAULT 0,
  correct_count   INTEGER DEFAULT 0,
  minor_issues    INTEGER DEFAULT 0,
  major_issues    INTEGER DEFAULT 0,
  checklist_score NUMERIC(5,2) DEFAULT 0,
  defects_found   INTEGER DEFAULT 0,
  defects_open    INTEGER DEFAULT 0,
  inspector       TEXT,
  inspected_at    DATE,
  resolved_at     DATE,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id)
);
CREATE INDEX idx_qcl_project ON qc_logs(project_id);
CREATE INDEX idx_qcl_status ON qc_logs(qc_status);
CREATE INDEX idx_qcl_severity ON qc_logs(severity);
CREATE INDEX idx_qcl_inspected ON qc_logs(inspected_at DESC);

-- ============================================================================
-- FEEDBACK_ITEMS (issues + feature requests from any role)
-- ============================================================================
CREATE TABLE feedback_items (
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
CREATE INDEX idx_feedback_type_status ON feedback_items(item_type, status, created_at DESC);
CREATE INDEX idx_feedback_status ON feedback_items(status, updated_at DESC);

-- ============================================================================
-- INTEGRATION_CONNECTIONS (data pipeline + service health)
-- ============================================================================
CREATE TABLE integration_connections (
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
-- TRIGGERS: auto-update updated_at
-- ============================================================================
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'employees','portfolios','customers','sites','projects',
    'units','phases','tasks','sub_tasks',
    'hour_entries','customer_contracts','project_documents',
    'sprints','sprint_tasks','qc_logs',
    'feedback_items','integration_connections'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- ROLLUP FUNCTION
-- Recomputes aggregates bottom-up:
--   sub_task → task → phase → unit → project → site → customer → portfolio
--
-- Provenance:
--   percent_complete = actual_hours / NULLIF(total_hours, 0) * 100
--   total_hours      = actual_hours + remaining_hours
--   scheduled_cost   = actual_cost + remaining_cost
--   days             = baseline_end - baseline_start (NULL-safe)
--   Dates: MIN(start), MAX(end) from children.
--   Hours/cost/projected_hours/tf: SUM from children.
--   progress: AVG from children (originally from MPP at leaf level).
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_rollups() RETURNS void AS $$
BEGIN
  -- 1) Leaf-level: compute total_hours, scheduled_cost, percent_complete, days on sub_tasks
  UPDATE sub_tasks SET
    total_hours    = COALESCE(actual_hours,0) + COALESCE(remaining_hours,0),
    scheduled_cost = COALESCE(actual_cost,0) + COALESCE(remaining_cost,0),
    days           = CASE WHEN baseline_start IS NOT NULL AND baseline_end IS NOT NULL
                       THEN (baseline_end - baseline_start) ELSE 0 END;
  UPDATE sub_tasks SET
    percent_complete = CASE WHEN COALESCE(total_hours,0) > 0
                         THEN ROUND(COALESCE(actual_hours,0) / total_hours * 100, 2)
                         ELSE 0 END;

  -- 2) tasks ← sub_tasks (if sub_tasks exist; otherwise tasks keep own values)
  UPDATE tasks t SET
    actual_hours    = COALESCE(s.sum_ah, t.actual_hours),
    remaining_hours = COALESCE(s.sum_rh, t.remaining_hours),
    total_hours     = COALESCE(s.sum_th, COALESCE(t.actual_hours,0)+COALESCE(t.remaining_hours,0)),
    actual_cost     = COALESCE(s.sum_ac, t.actual_cost),
    remaining_cost  = COALESCE(s.sum_rc, t.remaining_cost),
    scheduled_cost  = COALESCE(s.sum_sc, COALESCE(t.actual_cost,0)+COALESCE(t.remaining_cost,0)),
    projected_hours = COALESCE(s.sum_ph, t.projected_hours),
    tf              = COALESCE(s.sum_tf, t.tf),
    baseline_start  = COALESCE(s.min_bs, t.baseline_start),
    baseline_end    = COALESCE(s.max_be, t.baseline_end),
    actual_start    = COALESCE(s.min_as, t.actual_start),
    actual_end      = COALESCE(s.max_ae, t.actual_end),
    progress        = COALESCE(s.avg_prog, t.progress),
    days            = CASE WHEN COALESCE(s.min_bs, t.baseline_start) IS NOT NULL
                           AND  COALESCE(s.max_be, t.baseline_end) IS NOT NULL
                       THEN COALESCE(s.max_be, t.baseline_end) - COALESCE(s.min_bs, t.baseline_start)
                       ELSE 0 END
  FROM (
    SELECT task_id,
      SUM(actual_hours) sum_ah, SUM(remaining_hours) sum_rh, SUM(total_hours) sum_th,
      SUM(actual_cost) sum_ac, SUM(remaining_cost) sum_rc, SUM(scheduled_cost) sum_sc,
      SUM(projected_hours) sum_ph, SUM(tf) sum_tf,
      MIN(baseline_start) min_bs, MAX(baseline_end) max_be,
      MIN(actual_start) min_as, MAX(actual_end) max_ae,
      AVG(progress) avg_prog
    FROM sub_tasks GROUP BY task_id
  ) s WHERE s.task_id = t.id;

  UPDATE tasks SET
    percent_complete = CASE WHEN COALESCE(total_hours,0) > 0
                         THEN ROUND(COALESCE(actual_hours,0) / total_hours * 100, 2)
                         ELSE 0 END;

  -- 3) phases ← tasks
  UPDATE phases p SET
    actual_hours = s.sum_ah, remaining_hours = s.sum_rh, total_hours = s.sum_th,
    actual_cost = s.sum_ac, remaining_cost = s.sum_rc, scheduled_cost = s.sum_sc,
    projected_hours = s.sum_ph, tf = s.sum_tf,
    baseline_start = s.min_bs, baseline_end = s.max_be,
    actual_start = s.min_as, actual_end = s.max_ae,
    progress = s.avg_prog,
    days = CASE WHEN s.min_bs IS NOT NULL AND s.max_be IS NOT NULL THEN s.max_be - s.min_bs ELSE 0 END
  FROM (
    SELECT phase_id,
      SUM(actual_hours) sum_ah, SUM(remaining_hours) sum_rh, SUM(total_hours) sum_th,
      SUM(actual_cost) sum_ac, SUM(remaining_cost) sum_rc, SUM(scheduled_cost) sum_sc,
      SUM(projected_hours) sum_ph, SUM(tf) sum_tf,
      MIN(baseline_start) min_bs, MAX(baseline_end) max_be,
      MIN(actual_start) min_as, MAX(actual_end) max_ae,
      AVG(progress) avg_prog
    FROM tasks WHERE phase_id IS NOT NULL GROUP BY phase_id
  ) s WHERE s.phase_id = p.id;
  UPDATE phases SET percent_complete = CASE WHEN COALESCE(total_hours,0)>0 THEN ROUND(COALESCE(actual_hours,0)/total_hours*100,2) ELSE 0 END;

  -- 4) units ← phases
  UPDATE units u SET
    actual_hours = s.sum_ah, remaining_hours = s.sum_rh, total_hours = s.sum_th,
    actual_cost = s.sum_ac, remaining_cost = s.sum_rc, scheduled_cost = s.sum_sc,
    projected_hours = s.sum_ph, tf = s.sum_tf,
    baseline_start = s.min_bs, baseline_end = s.max_be,
    actual_start = s.min_as, actual_end = s.max_ae,
    progress = s.avg_prog,
    days = CASE WHEN s.min_bs IS NOT NULL AND s.max_be IS NOT NULL THEN s.max_be - s.min_bs ELSE 0 END
  FROM (
    SELECT unit_id,
      SUM(actual_hours) sum_ah, SUM(remaining_hours) sum_rh, SUM(total_hours) sum_th,
      SUM(actual_cost) sum_ac, SUM(remaining_cost) sum_rc, SUM(scheduled_cost) sum_sc,
      SUM(projected_hours) sum_ph, SUM(tf) sum_tf,
      MIN(baseline_start) min_bs, MAX(baseline_end) max_be,
      MIN(actual_start) min_as, MAX(actual_end) max_ae,
      AVG(progress) avg_prog
    FROM phases WHERE unit_id IS NOT NULL GROUP BY unit_id
  ) s WHERE s.unit_id = u.id;
  UPDATE units SET percent_complete = CASE WHEN COALESCE(total_hours,0)>0 THEN ROUND(COALESCE(actual_hours,0)/total_hours*100,2) ELSE 0 END;

  -- 5) projects ← units (+ tasks with no unit for direct project tasks)
  UPDATE projects pr SET
    actual_hours = s.sum_ah, remaining_hours = s.sum_rh, total_hours = s.sum_th,
    actual_cost = s.sum_ac, remaining_cost = s.sum_rc, scheduled_cost = s.sum_sc,
    projected_hours = s.sum_ph, tf = s.sum_tf,
    baseline_start = s.min_bs, baseline_end = s.max_be,
    actual_start = s.min_as, actual_end = s.max_ae,
    progress = s.avg_prog,
    days = CASE WHEN s.min_bs IS NOT NULL AND s.max_be IS NOT NULL THEN s.max_be - s.min_bs ELSE 0 END
  FROM (
    SELECT project_id,
      SUM(actual_hours) sum_ah, SUM(remaining_hours) sum_rh, SUM(total_hours) sum_th,
      SUM(actual_cost) sum_ac, SUM(remaining_cost) sum_rc, SUM(scheduled_cost) sum_sc,
      SUM(projected_hours) sum_ph, SUM(tf) sum_tf,
      MIN(baseline_start) min_bs, MAX(baseline_end) max_be,
      MIN(actual_start) min_as, MAX(actual_end) max_ae,
      AVG(progress) avg_prog
    FROM units WHERE project_id IS NOT NULL GROUP BY project_id
  ) s WHERE s.project_id = pr.id;
  UPDATE projects SET percent_complete = CASE WHEN COALESCE(total_hours,0)>0 THEN ROUND(COALESCE(actual_hours,0)/total_hours*100,2) ELSE 0 END;

  -- 6) sites ← projects
  UPDATE sites si SET
    actual_hours = s.sum_ah, remaining_hours = s.sum_rh, total_hours = s.sum_th,
    actual_cost = s.sum_ac, remaining_cost = s.sum_rc, scheduled_cost = s.sum_sc,
    projected_hours = s.sum_ph, tf = s.sum_tf,
    baseline_start = s.min_bs, baseline_end = s.max_be,
    actual_start = s.min_as, actual_end = s.max_ae,
    progress = s.avg_prog,
    days = CASE WHEN s.min_bs IS NOT NULL AND s.max_be IS NOT NULL THEN s.max_be - s.min_bs ELSE 0 END
  FROM (
    SELECT site_id,
      SUM(actual_hours) sum_ah, SUM(remaining_hours) sum_rh, SUM(total_hours) sum_th,
      SUM(actual_cost) sum_ac, SUM(remaining_cost) sum_rc, SUM(scheduled_cost) sum_sc,
      SUM(projected_hours) sum_ph, SUM(tf) sum_tf,
      MIN(baseline_start) min_bs, MAX(baseline_end) max_be,
      MIN(actual_start) min_as, MAX(actual_end) max_ae,
      AVG(progress) avg_prog
    FROM projects WHERE site_id IS NOT NULL GROUP BY site_id
  ) s WHERE s.site_id = si.id;
  UPDATE sites SET percent_complete = CASE WHEN COALESCE(total_hours,0)>0 THEN ROUND(COALESCE(actual_hours,0)/total_hours*100,2) ELSE 0 END;

  -- 7) customers ← sites
  UPDATE customers c SET
    actual_hours = s.sum_ah, remaining_hours = s.sum_rh, total_hours = s.sum_th,
    actual_cost = s.sum_ac, remaining_cost = s.sum_rc, scheduled_cost = s.sum_sc,
    projected_hours = s.sum_ph, tf = s.sum_tf,
    baseline_start = s.min_bs, baseline_end = s.max_be,
    actual_start = s.min_as, actual_end = s.max_ae,
    progress = s.avg_prog,
    days = CASE WHEN s.min_bs IS NOT NULL AND s.max_be IS NOT NULL THEN s.max_be - s.min_bs ELSE 0 END
  FROM (
    SELECT customer_id,
      SUM(actual_hours) sum_ah, SUM(remaining_hours) sum_rh, SUM(total_hours) sum_th,
      SUM(actual_cost) sum_ac, SUM(remaining_cost) sum_rc, SUM(scheduled_cost) sum_sc,
      SUM(projected_hours) sum_ph, SUM(tf) sum_tf,
      MIN(baseline_start) min_bs, MAX(baseline_end) max_be,
      MIN(actual_start) min_as, MAX(actual_end) max_ae,
      AVG(progress) avg_prog
    FROM sites WHERE customer_id IS NOT NULL GROUP BY customer_id
  ) s WHERE s.customer_id = c.id;
  UPDATE customers SET percent_complete = CASE WHEN COALESCE(total_hours,0)>0 THEN ROUND(COALESCE(actual_hours,0)/total_hours*100,2) ELSE 0 END;

  -- 8) portfolios ← customers
  UPDATE portfolios po SET
    actual_hours = s.sum_ah, remaining_hours = s.sum_rh, total_hours = s.sum_th,
    actual_cost = s.sum_ac, remaining_cost = s.sum_rc, scheduled_cost = s.sum_sc,
    projected_hours = s.sum_ph, tf = s.sum_tf,
    baseline_start = s.min_bs, baseline_end = s.max_be,
    actual_start = s.min_as, actual_end = s.max_ae,
    progress = s.avg_prog,
    days = CASE WHEN s.min_bs IS NOT NULL AND s.max_be IS NOT NULL THEN s.max_be - s.min_bs ELSE 0 END
  FROM (
    SELECT portfolio_id,
      SUM(actual_hours) sum_ah, SUM(remaining_hours) sum_rh, SUM(total_hours) sum_th,
      SUM(actual_cost) sum_ac, SUM(remaining_cost) sum_rc, SUM(scheduled_cost) sum_sc,
      SUM(projected_hours) sum_ph, SUM(tf) sum_tf,
      MIN(baseline_start) min_bs, MAX(baseline_end) max_be,
      MIN(actual_start) min_as, MAX(actual_end) max_ae,
      AVG(progress) avg_prog
    FROM customers WHERE portfolio_id IS NOT NULL GROUP BY portfolio_id
  ) s WHERE s.portfolio_id = po.id;
  UPDATE portfolios SET percent_complete = CASE WHEN COALESCE(total_hours,0)>0 THEN ROUND(COALESCE(actual_hours,0)/total_hours*100,2) ELSE 0 END;

  -- 9) Supplemental propagation fallback (handles sparse / mixed hierarchy links)
  -- project-level fallback from deepest available layer:
  --   units -> phases -> tasks -> sub_tasks
  WITH unit_roll AS (
    SELECT project_id,
      SUM(COALESCE(actual_hours,0)) AS ah,
      SUM(COALESCE(remaining_hours,0)) AS rh,
      SUM(COALESCE(total_hours,0)) AS th,
      SUM(COALESCE(actual_cost,0)) AS ac,
      SUM(COALESCE(remaining_cost,0)) AS rc,
      SUM(COALESCE(scheduled_cost,0)) AS sc
    FROM units
    WHERE project_id IS NOT NULL
    GROUP BY project_id
  ),
  phase_roll AS (
    SELECT project_id,
      SUM(COALESCE(actual_hours,0)) AS ah,
      SUM(COALESCE(remaining_hours,0)) AS rh,
      SUM(COALESCE(total_hours,0)) AS th,
      SUM(COALESCE(actual_cost,0)) AS ac,
      SUM(COALESCE(remaining_cost,0)) AS rc,
      SUM(COALESCE(scheduled_cost,0)) AS sc
    FROM phases
    WHERE project_id IS NOT NULL
    GROUP BY project_id
  ),
  task_roll AS (
    SELECT project_id,
      SUM(COALESCE(actual_hours,0)) AS ah,
      SUM(COALESCE(remaining_hours,0)) AS rh,
      SUM(COALESCE(total_hours,0)) AS th,
      SUM(COALESCE(actual_cost,0)) AS ac,
      SUM(COALESCE(remaining_cost,0)) AS rc,
      SUM(COALESCE(scheduled_cost,0)) AS sc
    FROM tasks
    WHERE project_id IS NOT NULL
    GROUP BY project_id
  ),
  sub_task_roll AS (
    SELECT project_id,
      SUM(COALESCE(actual_hours,0)) AS ah,
      SUM(COALESCE(remaining_hours,0)) AS rh,
      SUM(COALESCE(total_hours,0)) AS th,
      SUM(COALESCE(actual_cost,0)) AS ac,
      SUM(COALESCE(remaining_cost,0)) AS rc,
      SUM(COALESCE(scheduled_cost,0)) AS sc
    FROM sub_tasks
    WHERE project_id IS NOT NULL
    GROUP BY project_id
  ),
  project_source AS (
    SELECT p.id AS project_id,
      COALESCE(u.ah, ph.ah, t.ah, st.ah, 0) AS ah,
      COALESCE(u.rh, ph.rh, t.rh, st.rh, 0) AS rh,
      COALESCE(u.th, ph.th, t.th, st.th, 0) AS th,
      COALESCE(u.ac, ph.ac, t.ac, st.ac, 0) AS ac,
      COALESCE(u.rc, ph.rc, t.rc, st.rc, 0) AS rc,
      COALESCE(u.sc, ph.sc, t.sc, st.sc, 0) AS sc
    FROM projects p
    LEFT JOIN unit_roll u ON u.project_id = p.id
    LEFT JOIN phase_roll ph ON ph.project_id = p.id
    LEFT JOIN task_roll t ON t.project_id = p.id
    LEFT JOIN sub_task_roll st ON st.project_id = p.id
  )
  UPDATE projects p
  SET actual_hours = ps.ah,
      remaining_hours = ps.rh,
      total_hours = ps.th,
      actual_cost = ps.ac,
      remaining_cost = ps.rc,
      scheduled_cost = ps.sc,
      percent_complete = CASE
        WHEN COALESCE(ps.th,0) > 0 THEN ROUND(COALESCE(ps.ah,0) / ps.th * 100, 2)
        ELSE 0
      END
  FROM project_source ps
  WHERE ps.project_id = p.id;

  WITH site_roll AS (
    SELECT site_id,
      SUM(COALESCE(actual_hours,0)) AS ah,
      SUM(COALESCE(remaining_hours,0)) AS rh,
      SUM(COALESCE(total_hours,0)) AS th,
      SUM(COALESCE(actual_cost,0)) AS ac,
      SUM(COALESCE(remaining_cost,0)) AS rc,
      SUM(COALESCE(scheduled_cost,0)) AS sc
    FROM projects
    WHERE site_id IS NOT NULL
    GROUP BY site_id
  )
  UPDATE sites s
  SET actual_hours = COALESCE(sr.ah, 0),
      remaining_hours = COALESCE(sr.rh, 0),
      total_hours = COALESCE(sr.th, 0),
      actual_cost = COALESCE(sr.ac, 0),
      remaining_cost = COALESCE(sr.rc, 0),
      scheduled_cost = COALESCE(sr.sc, 0),
      percent_complete = CASE
        WHEN COALESCE(sr.th,0) > 0 THEN ROUND(COALESCE(sr.ah,0) / sr.th * 100, 2)
        ELSE 0
      END
  FROM site_roll sr
  WHERE s.id = sr.site_id;

  WITH customer_roll AS (
    SELECT customer_id,
      SUM(COALESCE(actual_hours,0)) AS ah,
      SUM(COALESCE(remaining_hours,0)) AS rh,
      SUM(COALESCE(total_hours,0)) AS th,
      SUM(COALESCE(actual_cost,0)) AS ac,
      SUM(COALESCE(remaining_cost,0)) AS rc,
      SUM(COALESCE(scheduled_cost,0)) AS sc
    FROM sites
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  )
  UPDATE customers c
  SET actual_hours = COALESCE(cr.ah, 0),
      remaining_hours = COALESCE(cr.rh, 0),
      total_hours = COALESCE(cr.th, 0),
      actual_cost = COALESCE(cr.ac, 0),
      remaining_cost = COALESCE(cr.rc, 0),
      scheduled_cost = COALESCE(cr.sc, 0),
      percent_complete = CASE
        WHEN COALESCE(cr.th,0) > 0 THEN ROUND(COALESCE(cr.ah,0) / cr.th * 100, 2)
        ELSE 0
      END
  FROM customer_roll cr
  WHERE c.id = cr.customer_id;

  WITH portfolio_roll AS (
    SELECT portfolio_id,
      SUM(COALESCE(actual_hours,0)) AS ah,
      SUM(COALESCE(remaining_hours,0)) AS rh,
      SUM(COALESCE(total_hours,0)) AS th,
      SUM(COALESCE(actual_cost,0)) AS ac,
      SUM(COALESCE(remaining_cost,0)) AS rc,
      SUM(COALESCE(scheduled_cost,0)) AS sc
    FROM customers
    WHERE portfolio_id IS NOT NULL
    GROUP BY portfolio_id
  )
  UPDATE portfolios p
  SET actual_hours = COALESCE(pr.ah, 0),
      remaining_hours = COALESCE(pr.rh, 0),
      total_hours = COALESCE(pr.th, 0),
      actual_cost = COALESCE(pr.ac, 0),
      remaining_cost = COALESCE(pr.rc, 0),
      scheduled_cost = COALESCE(pr.sc, 0),
      percent_complete = CASE
        WHEN COALESCE(pr.th,0) > 0 THEN ROUND(COALESCE(pr.ah,0) / pr.th * 100, 2)
        ELSE 0
      END
  FROM portfolio_roll pr
  WHERE p.id = pr.portfolio_id;

END;
$$ LANGUAGE plpgsql;

COMMIT;
