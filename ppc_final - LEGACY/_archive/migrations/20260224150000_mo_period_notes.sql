-- Mo's Page period notes (commitments + hours comments), scoped by hierarchy and period.

CREATE TABLE IF NOT EXISTS mo_period_notes (
  id VARCHAR(64) PRIMARY KEY,
  note_type VARCHAR(32) NOT NULL CHECK (note_type IN ('last_commitment', 'this_commitment', 'hours_comment')),
  period_granularity VARCHAR(16) NOT NULL CHECK (period_granularity IN ('month', 'quarter')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  portfolio_id VARCHAR(50) NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  customer_id VARCHAR(50) NULL REFERENCES customers(id) ON DELETE CASCADE,
  site_id VARCHAR(50) NULL REFERENCES sites(id) ON DELETE CASCADE,
  project_id VARCHAR(50) NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by VARCHAR(255) NULL,
  updated_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mo_period_notes_period
  ON mo_period_notes (period_granularity, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_mo_period_notes_scope
  ON mo_period_notes (portfolio_id, customer_id, site_id, project_id);
CREATE INDEX IF NOT EXISTS idx_mo_period_notes_type
  ON mo_period_notes (note_type);
