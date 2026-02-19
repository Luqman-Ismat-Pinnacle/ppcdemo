-- ============================================================================
-- PPC V3 Database Schema - DB 2.17.26
-- Canonical single schema for this repository.
-- ============================================================================

BEGIN;

-- ============================================================================
-- DROP EXISTING TABLES (reverse dependency order)
-- ============================================================================
DROP TABLE IF EXISTS visual_snapshots CASCADE;
DROP TABLE IF EXISTS project_documents CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS feedback_items CASCADE;
DROP TABLE IF EXISTS engine_logs CASCADE;
DROP TABLE IF EXISTS change_logs CASCADE;
DROP TABLE IF EXISTS workday_tasks CASCADE;
DROP TABLE IF EXISTS project_mappings CASCADE;
DROP TABLE IF EXISTS change_impacts CASCADE;
DROP TABLE IF EXISTS change_requests CASCADE;
DROP TABLE IF EXISTS snapshots CASCADE;
DROP TABLE IF EXISTS project_log CASCADE;
DROP TABLE IF EXISTS project_health CASCADE;
DROP TABLE IF EXISTS forecasts CASCADE;
DROP TABLE IF EXISTS sprint_tasks CASCADE;
DROP TABLE IF EXISTS sprints CASCADE;
DROP TABLE IF EXISTS user_stories CASCADE;
DROP TABLE IF EXISTS features CASCADE;
DROP TABLE IF EXISTS epics CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS deliverables CASCADE;
DROP TABLE IF EXISTS qc_tasks CASCADE;
DROP TABLE IF EXISTS hour_entries CASCADE;
DROP TABLE IF EXISTS task_quantity_entries CASCADE;
DROP TABLE IF EXISTS task_dependencies CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS phases CASCADE;
DROP TABLE IF EXISTS subprojects CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS sites CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS portfolios CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;

-- ============================================================================
-- SEQUENCES: Create sequences for ID generation
-- ============================================================================

DO $$
BEGIN
  -- Drop existing sequences if recreating
  DROP SEQUENCE IF EXISTS seq_portfolio_id CASCADE;
  -- Note: seq_customer_id, seq_site_id, seq_project_id removed - using Workday IDs directly
  DROP SEQUENCE IF EXISTS seq_unit_id CASCADE;
  DROP SEQUENCE IF EXISTS seq_phase_id CASCADE;
  DROP SEQUENCE IF EXISTS seq_task_id CASCADE;
  DROP SEQUENCE IF EXISTS seq_subproject_id CASCADE;
  DROP SEQUENCE IF EXISTS seq_hour_entry_id CASCADE;
  DROP SEQUENCE IF EXISTS seq_milestone_id CASCADE;
  DROP SEQUENCE IF EXISTS seq_deliverable_id CASCADE;
  DROP SEQUENCE IF EXISTS seq_qc_task_id CASCADE;
  
  -- Create sequences only for entities without Workday IDs
  CREATE SEQUENCE seq_portfolio_id START 1; -- Portfolios generated from employees
  CREATE SEQUENCE seq_unit_id START 1;
  CREATE SEQUENCE seq_phase_id START 1;
  CREATE SEQUENCE seq_task_id START 1;
  CREATE SEQUENCE seq_subproject_id START 1;
  CREATE SEQUENCE seq_hour_entry_id START 1;
  CREATE SEQUENCE seq_milestone_id START 1;
  CREATE SEQUENCE seq_deliverable_id START 1;
  CREATE SEQUENCE seq_qc_task_id START 1;
  
  -- Note: Projects, Sites, and Customers use Workday IDs directly as primary keys
  -- Project_by_ID from Workday → id in projects table
  -- Site IDs from Workday → id in sites table  
  -- Customer IDs from Workday → id in customers table
END $$;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate ID with prefix using sequences
CREATE OR REPLACE FUNCTION generate_id_with_prefix(prefix TEXT, sequence_name TEXT)
RETURNS TEXT AS $$
DECLARE
  next_val BIGINT;
  padded_number TEXT;
BEGIN
  EXECUTE 'SELECT nextval(''' || sequence_name || ''')' INTO next_val;
  padded_number := LPAD(next_val::TEXT, 4, '0');
  RETURN prefix || '-' || padded_number;
END;
$$ LANGUAGE plpgsql;

-- Calculate remaining hours
CREATE OR REPLACE FUNCTION calculate_remaining_hours(baseline_hours NUMERIC, actual_hours NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN GREATEST(0, COALESCE(baseline_hours, 0) - COALESCE(actual_hours, 0));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Calculate remaining cost
CREATE OR REPLACE FUNCTION calculate_remaining_cost(baseline_cost NUMERIC, actual_cost NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  RETURN GREATEST(0, COALESCE(baseline_cost, 0) - COALESCE(actual_cost, 0));
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- Calculate variance days
CREATE OR REPLACE FUNCTION calculate_variance_days(planned_date TIMESTAMP, actual_date TIMESTAMP)
RETURNS INTEGER AS $$
BEGIN
  IF planned_date IS NULL OR actual_date IS NULL THEN
    RETURN 0;
  END IF;
  RETURN EXTRACT(DAY FROM (actual_date - planned_date))::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- ============================================================================
-- CORE TABLES (in dependency order)
-- ============================================================================

-- EMPLOYEES (no dependencies)
CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(50) PRIMARY KEY,
  employee_id VARCHAR(50) UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  job_title VARCHAR(255),
  management_level VARCHAR(100),
  manager VARCHAR(255),
  employee_type VARCHAR(50),
  role VARCHAR(255),
  department VARCHAR(255),
  hourly_rate NUMERIC(10, 2),
  utilization_percent NUMERIC(5, 2) CHECK (utilization_percent IS NULL OR (utilization_percent >= 0 AND utilization_percent <= 100)),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_employee_id ON employees(employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_active ON employees(is_active);

-- APP SETTINGS (key-value for cron schedule, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PORTFOLIOS (depends on employees)
CREATE TABLE IF NOT EXISTS portfolios (
  id VARCHAR(50) PRIMARY KEY,
  portfolio_id VARCHAR(50) UNIQUE,
  name VARCHAR(255) NOT NULL,
  employee_id VARCHAR(50) REFERENCES employees(id),
  manager VARCHAR(255),
  methodology VARCHAR(100),
  description TEXT,
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  baseline_hours NUMERIC(10, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  remaining_hours NUMERIC(10, 2) DEFAULT 0,
  baseline_cost NUMERIC(12, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  remaining_cost NUMERIC(12, 2) DEFAULT 0,
  comments TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_employee_id ON portfolios(employee_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_is_active ON portfolios(is_active);

-- CUSTOMERS (depends on portfolios)
-- Note: id should use Workday Customer ID directly as primary key
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(50) PRIMARY KEY, -- Use Workday Customer ID directly
  customer_id VARCHAR(50), -- Same as id for reference
  portfolio_id VARCHAR(50) REFERENCES portfolios(id),
  employee_id VARCHAR(50) REFERENCES employees(id),
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  baseline_hours NUMERIC(10, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  remaining_hours NUMERIC(10, 2) DEFAULT 0,
  baseline_cost NUMERIC(12, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  remaining_cost NUMERIC(12, 2) DEFAULT 0,
  comments TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_portfolio_id ON customers(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_customers_employee_id ON customers(employee_id);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);

-- SITES (depends on customers)
-- Note: id should use Workday Site ID directly as primary key
CREATE TABLE IF NOT EXISTS sites (
  id VARCHAR(50) PRIMARY KEY, -- Use Workday Site ID directly
  site_id VARCHAR(50), -- Same as id for reference
  customer_id VARCHAR(50) REFERENCES customers(id),
  employee_id VARCHAR(50) REFERENCES employees(id),
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  baseline_hours NUMERIC(10, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  remaining_hours NUMERIC(10, 2) DEFAULT 0,
  baseline_cost NUMERIC(12, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  remaining_cost NUMERIC(12, 2) DEFAULT 0,
  comments TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_customer_id ON sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_sites_employee_id ON sites(employee_id);
CREATE INDEX IF NOT EXISTS idx_sites_is_active ON sites(is_active);

-- UNITS (depends on sites)
CREATE TABLE IF NOT EXISTS units (
  id VARCHAR(50) PRIMARY KEY,
  unit_id VARCHAR(50),
  site_id VARCHAR(50) REFERENCES sites(id),
  project_id VARCHAR(50),
  parent_id VARCHAR(50),
  hierarchy_type VARCHAR(20),
  outline_level INTEGER,
  employee_id VARCHAR(50) REFERENCES employees(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  task_name VARCHAR(255),
  task_description TEXT,
  folder TEXT,
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  start_date DATE,
  end_date DATE,
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
  active BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_units_site_id ON units(site_id);
CREATE INDEX IF NOT EXISTS idx_units_project_id ON units(project_id);
CREATE INDEX IF NOT EXISTS idx_units_start_date ON units(start_date);
CREATE INDEX IF NOT EXISTS idx_units_employee_id ON units(employee_id);
CREATE INDEX IF NOT EXISTS idx_units_is_active ON units(is_active);

-- PROJECTS (depends on units, sites, customers, portfolios)
-- Note: id should use Project_by_ID from Workday directly as primary key
CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(50) PRIMARY KEY, -- Use Project_by_ID from Workday directly
  project_id VARCHAR(50), -- Same as id for reference
  unit_id VARCHAR(50) REFERENCES units(id),
  site_id VARCHAR(50) REFERENCES sites(id),
  customer_id VARCHAR(50) REFERENCES customers(id),
  portfolio_id VARCHAR(50) REFERENCES portfolios(id),
  name VARCHAR(255) NOT NULL,
  project_type VARCHAR(100),
  billable_type VARCHAR(20) CHECK (billable_type IN ('T&M', 'FP')),
  CONSTRAINT chk_projects_dates CHECK (baseline_end_date IS NULL OR baseline_start_date IS NULL OR baseline_end_date >= baseline_start_date),
  CONSTRAINT chk_projects_actual_dates CHECK (actual_end_date IS NULL OR actual_start_date IS NULL OR actual_end_date >= actual_start_date),
  description TEXT,
  manager_id VARCHAR(50) REFERENCES employees(id),
  manager_name VARCHAR(255),
  start_date DATE,
  end_date DATE,
  planned_start_date DATE,
  planned_end_date DATE,
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  baseline_budget NUMERIC(12, 2) DEFAULT 0,
  baseline_hours NUMERIC(10, 2) DEFAULT 0,
  actual_budget NUMERIC(12, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  remaining_hours NUMERIC(10, 2) DEFAULT 0,
  baseline_cost NUMERIC(12, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  remaining_cost NUMERIC(12, 2) DEFAULT 0,
  eac_budget NUMERIC(12, 2) DEFAULT 0,
  eac_hours NUMERIC(10, 2) DEFAULT 0,
  cpi NUMERIC(10, 4) DEFAULT 0,
  spi NUMERIC(10, 4) DEFAULT 0,
  is_overhead BOOLEAN DEFAULT false,
  is_tpw BOOLEAN DEFAULT false,
  has_schedule BOOLEAN DEFAULT false,
  total_slack INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Not Started',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_unit_id ON projects(unit_id);
CREATE INDEX IF NOT EXISTS idx_projects_site_id ON projects(site_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_portfolio_id ON projects(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager_id ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects(is_active);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_billable_type ON projects(billable_type);
CREATE INDEX IF NOT EXISTS idx_projects_portfolio_active ON projects(portfolio_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_projects_dates ON projects(baseline_start_date, baseline_end_date) WHERE baseline_start_date IS NOT NULL;

-- SUBPROJECTS (depends on projects)
CREATE TABLE IF NOT EXISTS subprojects (
  id VARCHAR(50) PRIMARY KEY,
  subproject_id VARCHAR(50),
  project_id VARCHAR(50) REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  sequence INTEGER DEFAULT 0,
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  baseline_hours NUMERIC(10, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  remaining_hours NUMERIC(10, 2) DEFAULT 0,
  baseline_cost NUMERIC(12, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  remaining_cost NUMERIC(12, 2) DEFAULT 0,
  comments TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subprojects_project_id ON subprojects(project_id);
CREATE INDEX IF NOT EXISTS idx_subprojects_is_active ON subprojects(is_active);

-- PHASES (depends on projects)
CREATE TABLE IF NOT EXISTS phases (
  id VARCHAR(50) PRIMARY KEY,
  phase_id VARCHAR(50),
  project_id VARCHAR(50) REFERENCES projects(id),
  unit_id VARCHAR(50),
  parent_id VARCHAR(50),
  hierarchy_type VARCHAR(20),
  outline_level INTEGER,
  employee_id VARCHAR(50) REFERENCES employees(id),
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

CREATE INDEX IF NOT EXISTS idx_phases_project_id ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_employee_id ON phases(employee_id);
CREATE INDEX IF NOT EXISTS idx_phases_is_active ON phases(is_active);
CREATE INDEX IF NOT EXISTS idx_phases_project_sequence ON phases(project_id, sequence);
CREATE INDEX IF NOT EXISTS idx_phases_project_active ON phases(project_id, is_active) WHERE is_active = true;

-- TASKS (depends on phases, projects)
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50),
  phase_id VARCHAR(50) REFERENCES phases(id),
  unit_id VARCHAR(50),
  project_id VARCHAR(50) REFERENCES projects(id),
  parent_task_id VARCHAR(50) REFERENCES tasks(id),
  parent_id VARCHAR(50),
  hierarchy_type VARCHAR(20),
  outline_level INTEGER,
  wbs_code VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  task_name VARCHAR(255),
  description TEXT,
  task_description TEXT,
  folder TEXT,
  assigned_resource_id VARCHAR(50) REFERENCES employees(id),
  assigned_resource_name VARCHAR(255),
  assigned_resource_type VARCHAR(20),
  assigned_resource VARCHAR(255),
  start_date DATE,
  end_date DATE,
  planned_start_date DATE,
  planned_end_date DATE,
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  days_required INTEGER DEFAULT 0,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  baseline_hours NUMERIC(10, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  projected_hours NUMERIC(10, 2) DEFAULT 0,
  projected_remaining_hours NUMERIC(10, 2) DEFAULT 0,
  remaining_hours NUMERIC(10, 2) DEFAULT 0,
  baseline_cost NUMERIC(12, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  remaining_cost NUMERIC(12, 2) DEFAULT 0,
  baseline_qty NUMERIC(10, 2) DEFAULT 0,
  actual_qty NUMERIC(10, 2) DEFAULT 0,
  completed_qty NUMERIC(10, 2) DEFAULT 0,
  baseline_count INTEGER DEFAULT 0,
  baseline_metric VARCHAR(100),
  baseline_uom VARCHAR(50),
  actual_count INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  uom VARCHAR(50),
  user_story_id VARCHAR(50),
  sprint_id VARCHAR(50),
  status VARCHAR(50) DEFAULT 'Not Started',
  priority VARCHAR(20) DEFAULT 'medium',
  ev_method VARCHAR(20),
  early_start INTEGER DEFAULT 0,
  early_finish INTEGER DEFAULT 0,
  late_start INTEGER DEFAULT 0,
  late_finish INTEGER DEFAULT 0,
  total_float INTEGER DEFAULT 0,
  free_float INTEGER DEFAULT 0,
  total_slack INTEGER DEFAULT 0,
  is_summary BOOLEAN DEFAULT false,
  predecessors JSONB DEFAULT '[]'::jsonb,
  successors JSONB DEFAULT '[]'::jsonb,
  is_critical BOOLEAN DEFAULT false,
  is_milestone BOOLEAN DEFAULT false,
  is_sub_task BOOLEAN DEFAULT false,
  predecessor_id VARCHAR(50),
  predecessor_relationship VARCHAR(10),
  notes TEXT,
  comments TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_phase_id ON tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_resource_id ON tasks(assigned_resource_id);
CREATE INDEX IF NOT EXISTS idx_tasks_sprint_id ON tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_is_sub_task ON tasks(is_sub_task);
CREATE INDEX IF NOT EXISTS idx_tasks_wbs_code ON tasks(wbs_code);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_dates ON tasks(baseline_start_date, baseline_end_date) WHERE baseline_start_date IS NOT NULL;

-- TASK DEPENDENCIES
CREATE TABLE IF NOT EXISTS task_dependencies (
  id VARCHAR(50) PRIMARY KEY,
  predecessor_task_id VARCHAR(50) REFERENCES tasks(id),
  successor_task_id VARCHAR(50) REFERENCES tasks(id),
  relationship_type VARCHAR(10) DEFAULT 'FS' CHECK (relationship_type IN ('FS', 'SS', 'FF', 'SF')),
  CONSTRAINT chk_task_dependencies_no_self_ref CHECK (predecessor_task_id != successor_task_id),
  lag_days INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_predecessor ON task_dependencies(predecessor_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_successor ON task_dependencies(successor_task_id);

-- HOUR ENTRIES (depends on employees, projects, phases, tasks)
CREATE TABLE IF NOT EXISTS hour_entries (
  id VARCHAR(50) PRIMARY KEY,
  entry_id VARCHAR(50),
  employee_id VARCHAR(50) REFERENCES employees(id),
  project_id VARCHAR(50) REFERENCES projects(id),
  phase_id VARCHAR(50) REFERENCES phases(id) ON DELETE SET NULL,
  task_id VARCHAR(50) REFERENCES tasks(id) ON DELETE SET NULL,
  user_story_id VARCHAR(50),
  date DATE NOT NULL,
  hours NUMERIC(10, 2) NOT NULL CHECK (hours >= 0),
  description TEXT,
  workday_phase VARCHAR(255),
  workday_task VARCHAR(255),
  actual_cost NUMERIC(10, 2),
  reported_standard_cost_amt NUMERIC(10, 2),
  billable_rate NUMERIC(10, 2),
  billable_amount NUMERIC(10, 2),
  standard_cost_rate NUMERIC(10, 2),
  actual_revenue NUMERIC(10, 2),
  customer_billing_status VARCHAR(50),
  invoice_number VARCHAR(50),
  invoice_status VARCHAR(50),
  charge_type VARCHAR(10),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hour_entries_employee_id ON hour_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_hour_entries_project_id ON hour_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_hour_entries_phase_id ON hour_entries(phase_id);
CREATE INDEX IF NOT EXISTS idx_hour_entries_task_id ON hour_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_hour_entries_date ON hour_entries(date DESC);
CREATE INDEX IF NOT EXISTS idx_hour_entries_employee_date ON hour_entries(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_hour_entries_project_date ON hour_entries(project_id, date);
CREATE INDEX IF NOT EXISTS idx_hour_entries_workday_phase ON hour_entries(workday_phase);
CREATE INDEX IF NOT EXISTS idx_hour_entries_workday_task ON hour_entries(workday_task);
CREATE INDEX IF NOT EXISTS idx_hour_entries_project_workday ON hour_entries(project_id, workday_phase, workday_task);
CREATE INDEX IF NOT EXISTS idx_hour_entries_actual_cost ON hour_entries(actual_cost);

-- TASK QUANTITY ENTRIES
CREATE TABLE IF NOT EXISTS task_quantity_entries (
  id VARCHAR(50) PRIMARY KEY,
  task_id VARCHAR(50) REFERENCES tasks(id),
  date DATE NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_quantity_entries_task_id ON task_quantity_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_task_quantity_entries_date ON task_quantity_entries(date);

-- QC TASKS (depends on projects, phases, tasks)
CREATE TABLE IF NOT EXISTS qc_tasks (
  id VARCHAR(50) PRIMARY KEY,
  qc_task_id VARCHAR(50),
  project_id VARCHAR(50) REFERENCES projects(id),
  phase_id VARCHAR(50) REFERENCES phases(id),
  task_id VARCHAR(50) REFERENCES tasks(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'Not Started',
  assigned_to VARCHAR(50) REFERENCES employees(id),
  due_date DATE,
  completed_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_tasks_project_id ON qc_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_qc_tasks_phase_id ON qc_tasks(phase_id);
CREATE INDEX IF NOT EXISTS idx_qc_tasks_task_id ON qc_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_qc_tasks_assigned_to ON qc_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_qc_tasks_status ON qc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_qc_tasks_due_date ON qc_tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_tasks_project_status ON qc_tasks(project_id, status);

-- QC LOG ENTRIES (Excel All QC Log Entries + UOM, Score, Count)
CREATE TABLE IF NOT EXISTS qc_log_entries (
  id BIGSERIAL PRIMARY KEY,
  qc_log_id UUID,
  row_checksum TEXT,
  modified_on_excel NUMERIC,
  qc_transaction VARCHAR(100) NOT NULL,
  project_id_ifs VARCHAR(100),
  charge_code VARCHAR(100),
  project_id_v2 VARCHAR(100),
  charge_code_v2 VARCHAR(500),
  description_ifs TEXT,
  title VARCHAR(500),
  task_worker VARCHAR(255),
  qc_status VARCHAR(50) DEFAULT 'Not Started',
  client_ready VARCHAR(20),
  pct_items_correct NUMERIC(5, 2),
  items_submitted INTEGER,
  items_correct INTEGER,
  notes TEXT,
  qc_gate VARCHAR(100),
  qc_requested_date TIMESTAMPTZ,
  created_by VARCHAR(255),
  created_on_excel NUMERIC,
  modified_by VARCHAR(255),
  modified_on_excel NUMERIC,
  qc_assigned_date TIMESTAMPTZ,
  qc_complete_date TIMESTAMPTZ,
  qc_complete_date_override TIMESTAMPTZ,
  qc_resource VARCHAR(255),
  qc_uom VARCHAR(50) DEFAULT 'Item',
  qc_score NUMERIC(5, 2),
  qc_count INTEGER,
  qc_hours NUMERIC(10, 2),
  qc_type VARCHAR(100) DEFAULT 'Quality Review',
  qc_critical_errors INTEGER DEFAULT 0,
  qc_non_critical_errors INTEGER DEFAULT 0,
  parent_task_id VARCHAR(255),
  qc_resource_id VARCHAR(255),
  employee_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qc_log_entries_qc_transaction ON qc_log_entries(qc_transaction);
CREATE INDEX IF NOT EXISTS idx_qc_log_entries_qc_status ON qc_log_entries(qc_status);
CREATE INDEX IF NOT EXISTS idx_qc_log_entries_project_id_v2 ON qc_log_entries(project_id_v2);
CREATE INDEX IF NOT EXISTS idx_qc_log_entries_created_at ON qc_log_entries(created_at DESC);

-- DELIVERABLES (depends on projects, phases, tasks, milestones)
CREATE TABLE IF NOT EXISTS deliverables (
  id VARCHAR(50) PRIMARY KEY,
  deliverable_id VARCHAR(50),
  project_id VARCHAR(50) REFERENCES projects(id),
  phase_id VARCHAR(50) REFERENCES phases(id),
  task_id VARCHAR(50) REFERENCES tasks(id),
  milestone_id VARCHAR(50),
  employee_id VARCHAR(50) REFERENCES employees(id),
  assignee_id VARCHAR(50) REFERENCES employees(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'Not Started',
  due_date DATE,
  completed_date DATE,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  baseline_start_date DATE,
  baseline_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  baseline_hours NUMERIC(10, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  baseline_cost NUMERIC(12, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  comments TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliverables_project_id ON deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_phase_id ON deliverables(phase_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_task_id ON deliverables(task_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_milestone_id ON deliverables(milestone_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_status ON deliverables(status);
CREATE INDEX IF NOT EXISTS idx_deliverables_due_date ON deliverables(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deliverables_project_status ON deliverables(project_id, status);

-- MILESTONES (depends on projects, phases, tasks)
CREATE TABLE IF NOT EXISTS milestones (
  id VARCHAR(50) PRIMARY KEY,
  milestone_id VARCHAR(50),
  milestone_name VARCHAR(255) NOT NULL,
  project_id VARCHAR(50) REFERENCES projects(id),
  phase_id VARCHAR(50) REFERENCES phases(id),
  task_id VARCHAR(50) REFERENCES tasks(id),
  customer VARCHAR(255),
  planned_date DATE,
  forecasted_date DATE,
  actual_date DATE,
  variance_days INTEGER DEFAULT 0,
  percent_complete NUMERIC(5, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_phase_id ON milestones(phase_id);
CREATE INDEX IF NOT EXISTS idx_milestones_task_id ON milestones(task_id);
CREATE INDEX IF NOT EXISTS idx_milestones_planned_date ON milestones(planned_date);
CREATE INDEX IF NOT EXISTS idx_milestones_actual_date ON milestones(actual_date) WHERE actual_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_milestones_project_planned ON milestones(project_id, planned_date);

-- SPRINTS
CREATE TABLE IF NOT EXISTS sprints (
  id VARCHAR(50) PRIMARY KEY,
  sprint_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  project_id VARCHAR(50) REFERENCES projects(id),
  start_date DATE,
  end_date DATE,
  status VARCHAR(50) DEFAULT 'Planned',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sprints_project_id ON sprints(project_id);

-- SPRINT TASKS
CREATE TABLE IF NOT EXISTS sprint_tasks (
  id VARCHAR(50) PRIMARY KEY,
  sprint_id VARCHAR(50) REFERENCES sprints(id),
  task_id VARCHAR(50) REFERENCES tasks(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sprint_tasks_sprint_id ON sprint_tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprint_tasks_task_id ON sprint_tasks(task_id);

-- EPICS
CREATE TABLE IF NOT EXISTS epics (
  id VARCHAR(50) PRIMARY KEY,
  epic_id VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'Not Started',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- FEATURES
CREATE TABLE IF NOT EXISTS features (
  id VARCHAR(50) PRIMARY KEY,
  feature_id VARCHAR(50),
  epic_id VARCHAR(50) REFERENCES epics(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'Not Started',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_features_epic_id ON features(epic_id);
CREATE INDEX IF NOT EXISTS idx_features_status ON features(status);

-- USER STORIES
CREATE TABLE IF NOT EXISTS user_stories (
  id VARCHAR(50) PRIMARY KEY,
  user_story_id VARCHAR(50),
  feature_id VARCHAR(50) REFERENCES features(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  status VARCHAR(50) DEFAULT 'Not Started',
  sprint_id VARCHAR(50) REFERENCES sprints(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stories_feature_id ON user_stories(feature_id);
CREATE INDEX IF NOT EXISTS idx_user_stories_sprint_id ON user_stories(sprint_id);

-- FORECASTS
CREATE TABLE IF NOT EXISTS forecasts (
  id VARCHAR(50) PRIMARY KEY,
  forecast_id VARCHAR(50),
  project_id VARCHAR(50) REFERENCES projects(id),
  forecast_date DATE NOT NULL,
  forecasted_budget NUMERIC(12, 2),
  forecasted_hours NUMERIC(10, 2),
  forecasted_completion_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forecasts_project_id ON forecasts(project_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_forecast_date ON forecasts(forecast_date);
CREATE INDEX IF NOT EXISTS idx_forecasts_project_date ON forecasts(project_id, forecast_date DESC);

-- SNAPSHOTS
CREATE TABLE IF NOT EXISTS snapshots (
  id VARCHAR(50) PRIMARY KEY,
  snapshot_id VARCHAR(50),
  version_name VARCHAR(255),
  scope VARCHAR(50),
  scope_id VARCHAR(50),
  snapshot_type VARCHAR(50),
  snapshot_date DATE,
  created_by VARCHAR(255),
  approved_by VARCHAR(255),
  approved_at DATE,
  notes TEXT,
  is_locked BOOLEAN DEFAULT false,
  total_hours NUMERIC(12, 2),
  total_cost NUMERIC(15, 2),
  total_projects INTEGER,
  total_tasks INTEGER,
  total_employees INTEGER,
  snapshot_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_scope ON snapshots(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_snapshot_date ON snapshots(snapshot_date);

-- VISUAL SNAPSHOTS
CREATE TABLE IF NOT EXISTS visual_snapshots (
  id VARCHAR(50) PRIMARY KEY,
  visual_id VARCHAR(100),
  visual_type VARCHAR(20),
  visual_title VARCHAR(255),
  snapshot_name VARCHAR(255),
  snapshot_date DATE,
  data JSONB,
  metadata JSONB,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visual_snapshots_visual_id ON visual_snapshots(visual_id);
CREATE INDEX IF NOT EXISTS idx_visual_snapshots_date ON visual_snapshots(snapshot_date);

-- METRICS HISTORY (for variance trending feature)
CREATE TABLE IF NOT EXISTS metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_date DATE NOT NULL,
  scope VARCHAR(50) NOT NULL DEFAULT 'all',  -- 'project', 'phase', 'task', 'all'
  scope_id VARCHAR(50),                       -- ID of the scoped entity
  
  -- Progress metrics
  total_tasks INTEGER,
  completed_tasks INTEGER,
  percent_complete NUMERIC(5, 2),
  
  -- Hours metrics  
  baseline_hours NUMERIC(12, 2),
  actual_hours NUMERIC(12, 2),
  remaining_hours NUMERIC(12, 2),
  
  -- Cost metrics
  baseline_cost NUMERIC(14, 2),
  actual_cost NUMERIC(14, 2),
  remaining_cost NUMERIC(14, 2),
  
  -- EVM metrics
  earned_value NUMERIC(14, 2),
  planned_value NUMERIC(14, 2),
  cpi NUMERIC(5, 3),
  spi NUMERIC(5, 3),
  
  -- QC metrics
  qc_pass_rate NUMERIC(5, 2),
  qc_critical_errors INTEGER,
  qc_total_tasks INTEGER,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(recorded_date, scope, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_metrics_history_date ON metrics_history(recorded_date);
CREATE INDEX IF NOT EXISTS idx_metrics_history_scope ON metrics_history(scope, scope_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_date_scope ON metrics_history(recorded_date DESC, scope);

-- PROJECT HEALTH
CREATE TABLE IF NOT EXISTS project_health (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id),
  health_score NUMERIC(5, 2),
  status VARCHAR(50),
  risk_level VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_health_project_id ON project_health(project_id);
CREATE INDEX IF NOT EXISTS idx_project_health_status ON project_health(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_health_updated_at ON project_health(updated_at DESC);

-- PROJECT LOG (no FK on project_id so parser can log before project exists)
CREATE TABLE IF NOT EXISTS project_log (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50),
  entry_date TIMESTAMP DEFAULT NOW(),
  entry_type VARCHAR(50),
  message TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_log_project_id ON project_log(project_id);
CREATE INDEX IF NOT EXISTS idx_project_log_entry_date ON project_log(entry_date);

-- CHANGE REQUESTS
CREATE TABLE IF NOT EXISTS change_requests (
  id VARCHAR(50) PRIMARY KEY,
  change_request_id VARCHAR(50),
  project_id VARCHAR(50) REFERENCES projects(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'Submitted',
  submitted_at TIMESTAMP,
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  submitted_by VARCHAR(255),
  approved_by VARCHAR(255),
  delta_baseline_hours NUMERIC(10, 2) DEFAULT 0,
  delta_baseline_cost NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_requests_project_id ON change_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_status ON change_requests(status);
CREATE INDEX IF NOT EXISTS idx_change_requests_submitted_at ON change_requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_change_requests_project_status ON change_requests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_change_requests_submitted_at_desc ON change_requests(submitted_at DESC);

-- CHANGE IMPACTS
CREATE TABLE IF NOT EXISTS change_impacts (
  id VARCHAR(50) PRIMARY KEY,
  change_request_id VARCHAR(50) REFERENCES change_requests(id),
  project_id VARCHAR(50) REFERENCES projects(id),
  phase_id VARCHAR(50) REFERENCES phases(id),
  task_id VARCHAR(50) REFERENCES tasks(id),
  delta_baseline_hours NUMERIC(10, 2) DEFAULT 0,
  delta_baseline_cost NUMERIC(12, 2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_impacts_change_request_id ON change_impacts(change_request_id);
CREATE INDEX IF NOT EXISTS idx_change_impacts_project_id ON change_impacts(project_id);

-- PROJECT DOCUMENTS (simplified for project plans / MPP)
-- Minimal columns: id, project link, file identity, storage, versioning, health.
CREATE TABLE IF NOT EXISTS project_documents (
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

-- PROJECT MAPPINGS (MPP project id to Workday project id for actuals)
CREATE TABLE IF NOT EXISTS project_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mpp_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workday_project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mpp_project_id, workday_project_id)
);
CREATE INDEX IF NOT EXISTS idx_project_mappings_mpp ON project_mappings(mpp_project_id);
CREATE INDEX IF NOT EXISTS idx_project_mappings_workday ON project_mappings(workday_project_id);
CREATE INDEX IF NOT EXISTS idx_project_mappings_active ON project_mappings(is_active);

-- WORKDAY TASKS (used by Workday sync service)
CREATE TABLE IF NOT EXISTS workday_tasks (
  id VARCHAR(50) PRIMARY KEY,
  project_id VARCHAR(50) REFERENCES projects(id),
  task_name VARCHAR(255),
  task_number VARCHAR(100),
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  budgeted_hours NUMERIC(10, 2) DEFAULT 0,
  actual_hours NUMERIC(10, 2) DEFAULT 0,
  actual_cost NUMERIC(12, 2) DEFAULT 0,
  status VARCHAR(50),
  assigned_resource VARCHAR(255),
  deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workday_tasks_project_id ON workday_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_workday_tasks_task_number ON workday_tasks(task_number);

-- FEEDBACK ITEMS (issues + feature requests)
CREATE TABLE IF NOT EXISTS feedback_items (
  id BIGSERIAL PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (item_type IN ('issue', 'feature')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_path TEXT,
  user_action TEXT,
  expected_result TEXT,
  actual_result TEXT,
  error_message TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'in_progress', 'planned', 'resolved', 'released', 'closed')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'runtime', 'import')),
  created_by_name TEXT,
  created_by_email TEXT,
  created_by_employee_id TEXT,
  browser_info TEXT,
  runtime_error_name TEXT,
  runtime_stack TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_items_type_status_created
  ON feedback_items (item_type, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_items_status_updated
  ON feedback_items (status, updated_at DESC);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  employee_id TEXT,
  role TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_task_id TEXT,
  related_project_id TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_employee_role_read_created
  ON notifications (employee_id, role, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role_created
  ON notifications (role, created_at DESC);

-- ENGINE LOGS
CREATE TABLE IF NOT EXISTS engine_logs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_time_ms INTEGER,
  project_duration_days INTEGER,
  critical_path_count INTEGER,
  logs JSONB,
  engine_name TEXT,
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_engine_logs_created_at ON engine_logs(created_at DESC);

-- CHANGE LOGS
CREATE TABLE IF NOT EXISTS change_logs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT,
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  description TEXT,
  old_value TEXT,
  new_value TEXT,
  user_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_change_logs_created_at ON change_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_logs_entity ON change_logs(entity_type, entity_id, created_at DESC);

-- PERFORMANCE INDEXES FOR HOT PATHS
CREATE INDEX IF NOT EXISTS idx_employees_name_lower ON employees (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_employees_email_lower ON employees (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_tasks_project_name ON tasks (project_id, name);
CREATE INDEX IF NOT EXISTS idx_tasks_project_phase ON tasks (project_id, phase_id);
CREATE INDEX IF NOT EXISTS idx_units_site_name ON units (site_id, name);
CREATE INDEX IF NOT EXISTS idx_hour_entries_unmatched ON hour_entries (project_id, date DESC) WHERE task_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_hour_entries_task_date ON hour_entries (task_id, date DESC);

-- ============================================================================
-- AUTO-GENERATE ID TRIGGERS
-- ============================================================================

-- PORTFOLIOS
CREATE OR REPLACE FUNCTION auto_generate_portfolio_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('PRT', 'seq_portfolio_id');
  END IF;
  IF NEW.portfolio_id IS NULL OR NEW.portfolio_id = '' THEN
    NEW.portfolio_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_portfolio_ids ON portfolios;
CREATE TRIGGER trigger_auto_generate_portfolio_ids
  BEFORE INSERT ON portfolios
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_portfolio_ids();

-- CUSTOMERS
CREATE OR REPLACE FUNCTION auto_generate_customer_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('CST', 'seq_customer_id');
  END IF;
  IF NEW.customer_id IS NULL OR NEW.customer_id = '' THEN
    NEW.customer_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_customer_ids ON customers;
CREATE TRIGGER trigger_auto_generate_customer_ids
  BEFORE INSERT ON customers
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_customer_ids();

-- SITES
CREATE OR REPLACE FUNCTION auto_generate_site_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('STE', 'seq_site_id');
  END IF;
  IF NEW.site_id IS NULL OR NEW.site_id = '' THEN
    NEW.site_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_site_ids ON sites;
CREATE TRIGGER trigger_auto_generate_site_ids
  BEFORE INSERT ON sites
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_site_ids();

-- UNITS
CREATE OR REPLACE FUNCTION auto_generate_unit_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('UNT', 'seq_unit_id');
  END IF;
  IF NEW.unit_id IS NULL OR NEW.unit_id = '' THEN
    NEW.unit_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_unit_ids ON units;
CREATE TRIGGER trigger_auto_generate_unit_ids
  BEFORE INSERT ON units
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_unit_ids();

-- PROJECTS
CREATE OR REPLACE FUNCTION auto_generate_project_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('PRJ', 'seq_project_id');
  END IF;
  IF NEW.project_id IS NULL OR NEW.project_id = '' THEN
    NEW.project_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_project_ids ON projects;
CREATE TRIGGER trigger_auto_generate_project_ids
  BEFORE INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_project_ids();

-- PHASES
CREATE OR REPLACE FUNCTION auto_generate_phase_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('PHS', 'seq_phase_id');
  END IF;
  IF NEW.phase_id IS NULL OR NEW.phase_id = '' THEN
    NEW.phase_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_phase_ids ON phases;
CREATE TRIGGER trigger_auto_generate_phase_ids
  BEFORE INSERT ON phases
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_phase_ids();

-- TASKS
CREATE OR REPLACE FUNCTION auto_generate_task_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    IF COALESCE(NEW.is_sub_task, false) = true THEN
      NEW.id := generate_id_with_prefix('SUB', 'seq_task_id');
    ELSE
      NEW.id := generate_id_with_prefix('TSK', 'seq_task_id');
    END IF;
  END IF;
  IF NEW.task_id IS NULL OR NEW.task_id = '' THEN
    NEW.task_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_task_ids ON tasks;
CREATE TRIGGER trigger_auto_generate_task_ids
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_task_ids();

-- SUBPROJECTS
CREATE OR REPLACE FUNCTION auto_generate_subproject_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('SUB', 'seq_subproject_id');
  END IF;
  IF NEW.subproject_id IS NULL OR NEW.subproject_id = '' THEN
    NEW.subproject_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_subproject_ids ON subprojects;
CREATE TRIGGER trigger_auto_generate_subproject_ids
  BEFORE INSERT ON subprojects
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_subproject_ids();

-- HOUR ENTRIES
CREATE OR REPLACE FUNCTION auto_generate_hour_entry_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('HRS', 'seq_hour_entry_id');
  END IF;
  IF NEW.entry_id IS NULL OR NEW.entry_id = '' THEN
    NEW.entry_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_hour_entry_ids ON hour_entries;
CREATE TRIGGER trigger_auto_generate_hour_entry_ids
  BEFORE INSERT ON hour_entries
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_hour_entry_ids();

-- MILESTONES
CREATE OR REPLACE FUNCTION auto_generate_milestone_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('MLS', 'seq_milestone_id');
  END IF;
  IF NEW.milestone_id IS NULL OR NEW.milestone_id = '' THEN
    NEW.milestone_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_milestone_ids ON milestones;
CREATE TRIGGER trigger_auto_generate_milestone_ids
  BEFORE INSERT ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_milestone_ids();

-- DELIVERABLES
CREATE OR REPLACE FUNCTION auto_generate_deliverable_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('DLB', 'seq_deliverable_id');
  END IF;
  IF NEW.deliverable_id IS NULL OR NEW.deliverable_id = '' THEN
    NEW.deliverable_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_deliverable_ids ON deliverables;
CREATE TRIGGER trigger_auto_generate_deliverable_ids
  BEFORE INSERT ON deliverables
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_deliverable_ids();

-- QC TASKS
CREATE OR REPLACE FUNCTION auto_generate_qc_task_ids()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := generate_id_with_prefix('QCT', 'seq_qc_task_id');
  END IF;
  IF NEW.qc_task_id IS NULL OR NEW.qc_task_id = '' THEN
    NEW.qc_task_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_qc_task_ids ON qc_tasks;
CREATE TRIGGER trigger_auto_generate_qc_task_ids
  BEFORE INSERT ON qc_tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_qc_task_ids();

-- ============================================================================
-- CALCULATED FIELDS TRIGGERS
-- ============================================================================

-- PORTFOLIOS
CREATE OR REPLACE FUNCTION auto_calculate_portfolio_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_hours := calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours);
  NEW.remaining_cost := calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_portfolio_fields ON portfolios;
CREATE TRIGGER trigger_auto_calculate_portfolio_fields
  BEFORE INSERT OR UPDATE ON portfolios
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_portfolio_fields();

-- CUSTOMERS
CREATE OR REPLACE FUNCTION auto_calculate_customer_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_hours := calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours);
  NEW.remaining_cost := calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_customer_fields ON customers;
CREATE TRIGGER trigger_auto_calculate_customer_fields
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_customer_fields();

-- SITES
CREATE OR REPLACE FUNCTION auto_calculate_site_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_hours := calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours);
  NEW.remaining_cost := calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_site_fields ON sites;
CREATE TRIGGER trigger_auto_calculate_site_fields
  BEFORE INSERT OR UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_site_fields();

-- UNITS
CREATE OR REPLACE FUNCTION auto_calculate_unit_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_hours := calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours);
  NEW.remaining_cost := calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_unit_fields ON units;
CREATE TRIGGER trigger_auto_calculate_unit_fields
  BEFORE INSERT OR UPDATE ON units
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_unit_fields();

-- PROJECTS
CREATE OR REPLACE FUNCTION auto_calculate_project_fields()
RETURNS TRIGGER AS $$
DECLARE
  earned_value NUMERIC;
  planned_value NUMERIC;
  actual_cost NUMERIC;
BEGIN
  NEW.remaining_hours := calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours);
  NEW.remaining_cost := calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost);
  
  -- Calculate CPI (Cost Performance Index) = EV / AC
  earned_value := COALESCE(NEW.baseline_cost, 0) * COALESCE(NEW.percent_complete, 0) / 100.0;
  actual_cost := COALESCE(NEW.actual_cost, 0);
  
  IF actual_cost > 0 THEN
    NEW.cpi := earned_value / actual_cost;
  ELSE
    NEW.cpi := 0;
  END IF;
  
  -- Calculate SPI (Schedule Performance Index) = EV / PV
  planned_value := COALESCE(NEW.baseline_cost, 0);
  
  IF planned_value > 0 THEN
    NEW.spi := earned_value / planned_value;
  ELSE
    NEW.spi := 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_project_fields ON projects;
CREATE TRIGGER trigger_auto_calculate_project_fields
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_project_fields();

-- PHASES
CREATE OR REPLACE FUNCTION auto_calculate_phase_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_hours := calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours);
  NEW.remaining_cost := calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_phase_fields ON phases;
CREATE TRIGGER trigger_auto_calculate_phase_fields
  BEFORE INSERT OR UPDATE ON phases
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_phase_fields();

-- TASKS (preserve MPP/Data Management remaining_hours and remaining_cost when set)
CREATE OR REPLACE FUNCTION auto_calculate_task_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_hours := COALESCE(NEW.remaining_hours, calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours));
  NEW.remaining_cost := COALESCE(NEW.remaining_cost, calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_task_fields ON tasks;
CREATE TRIGGER trigger_auto_calculate_task_fields
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_task_fields();

-- SUBPROJECTS
CREATE OR REPLACE FUNCTION auto_calculate_subproject_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_hours := calculate_remaining_hours(NEW.baseline_hours, NEW.actual_hours);
  NEW.remaining_cost := calculate_remaining_cost(NEW.baseline_cost, NEW.actual_cost);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_subproject_fields ON subprojects;
CREATE TRIGGER trigger_auto_calculate_subproject_fields
  BEFORE INSERT OR UPDATE ON subprojects
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_subproject_fields();

-- MILESTONES
CREATE OR REPLACE FUNCTION auto_calculate_milestone_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.planned_date IS NOT NULL AND (NEW.actual_date IS NOT NULL OR NEW.forecasted_date IS NOT NULL) THEN
    NEW.variance_days := calculate_variance_days(
      NEW.planned_date::TIMESTAMP,
      COALESCE(NEW.actual_date, NEW.forecasted_date)::TIMESTAMP
    );
  ELSE
    NEW.variance_days := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_calculate_milestone_fields ON milestones;
CREATE TRIGGER trigger_auto_calculate_milestone_fields
  BEFORE INSERT OR UPDATE ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_milestone_fields();

-- ============================================================================
-- AUTO-UPDATE UPDATED_AT TRIGGERS
-- ============================================================================

-- Apply updated_at triggers to all tables with updated_at column
CREATE TRIGGER trigger_update_updated_at_portfolios
  BEFORE UPDATE ON portfolios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_customers
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_sites
  BEFORE UPDATE ON sites
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_units
  BEFORE UPDATE ON units
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_projects
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_subprojects
  BEFORE UPDATE ON subprojects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_phases
  BEFORE UPDATE ON phases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_tasks
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_task_dependencies
  BEFORE UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_hour_entries
  BEFORE UPDATE ON hour_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_task_quantity_entries
  BEFORE UPDATE ON task_quantity_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_qc_tasks
  BEFORE UPDATE ON qc_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_deliverables
  BEFORE UPDATE ON deliverables
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_milestones
  BEFORE UPDATE ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_sprints
  BEFORE UPDATE ON sprints
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_sprint_tasks
  BEFORE UPDATE ON sprint_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_epics
  BEFORE UPDATE ON epics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_features
  BEFORE UPDATE ON features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_user_stories
  BEFORE UPDATE ON user_stories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_forecasts
  BEFORE UPDATE ON forecasts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_snapshots
  BEFORE UPDATE ON snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_visual_snapshots
  BEFORE UPDATE ON visual_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_project_health
  BEFORE UPDATE ON project_health
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_project_log
  BEFORE UPDATE ON project_log
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_change_requests
  BEFORE UPDATE ON change_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_change_impacts
  BEFORE UPDATE ON change_impacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_project_documents
  BEFORE UPDATE ON project_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_employees
  BEFORE UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_workday_tasks
  BEFORE UPDATE ON workday_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_updated_at_feedback_items
  BEFORE UPDATE ON feedback_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DB 2.17.26 Notes
-- - This is the single canonical schema file for PPC.
-- - Includes runtime tables required by current APIs:
--   app_settings, feedback_items, notifications, engine_logs, change_logs, workday_tasks.
-- - Includes additional hot-path indexes for auth lookup, matching, notifications, and documents.
-- ============================================================================

COMMIT;
