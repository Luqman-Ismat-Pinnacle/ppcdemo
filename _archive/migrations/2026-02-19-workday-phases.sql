-- Workday Phases: from RPT_-_View_Project_Plan_-_Integration_for_Parent_Phase
-- Project (leading digits) -> project_id, Level_1 -> unit, Level_2 -> name (phase)
-- Same column shape as phases for compatibility; we populate id, project_id, unit, name.

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

COMMENT ON TABLE workday_phases IS 'Workday parent-phase hierarchy: Level_1 (unit), Level_2 (phase name) per project.';

-- Allow tasks to be bucketed to a Workday Phase
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workday_phase_id VARCHAR(50) REFERENCES workday_phases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_workday_phase_id ON tasks(workday_phase_id);
