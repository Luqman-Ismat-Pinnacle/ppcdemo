-- QC Log Entries: store Excel "All QC Log Entries" columns + UOM, QC Score, Count, etc.
-- Matches: All QC Log Entries 2-19-2026 2-08-47 PM.xlsx

CREATE TABLE IF NOT EXISTS qc_log_entries (
  id BIGSERIAL PRIMARY KEY,
  -- Excel (Do Not Modify) columns - stored for round-trip
  qc_log_id UUID,
  row_checksum TEXT,
  modified_on_excel NUMERIC,
  -- Excel business columns
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
  -- App / legacy fields (UOM, QC Score, Count, etc.)
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
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qc_log_entries_qc_transaction ON qc_log_entries(qc_transaction);
CREATE INDEX IF NOT EXISTS idx_qc_log_entries_qc_status ON qc_log_entries(qc_status);
CREATE INDEX IF NOT EXISTS idx_qc_log_entries_project_id_v2 ON qc_log_entries(project_id_v2);
CREATE INDEX IF NOT EXISTS idx_qc_log_entries_created_at ON qc_log_entries(created_at DESC);

COMMENT ON TABLE qc_log_entries IS 'QC Log entries from Excel import and app; columns align with All QC Log Entries.xlsx';
