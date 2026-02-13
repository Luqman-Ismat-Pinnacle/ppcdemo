-- Feedback / Issues / Features tracking tables
-- Created: 2026-02-13

CREATE TABLE IF NOT EXISTS feedback_items (
  id BIGSERIAL PRIMARY KEY,
  item_type TEXT NOT NULL CHECK (item_type IN ('issue', 'feature')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  page_path TEXT NULL,
  user_action TEXT NULL,
  expected_result TEXT NULL,
  actual_result TEXT NULL,
  error_message TEXT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'in_progress', 'planned', 'resolved', 'released', 'closed')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  notes TEXT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'runtime', 'import')),
  created_by_name TEXT NULL,
  created_by_email TEXT NULL,
  created_by_employee_id TEXT NULL,
  browser_info TEXT NULL,
  runtime_error_name TEXT NULL,
  runtime_stack TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_items_type_status_created
  ON feedback_items (item_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_items_status_updated
  ON feedback_items (status, updated_at DESC);

CREATE OR REPLACE FUNCTION set_feedback_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feedback_items_updated_at ON feedback_items;
CREATE TRIGGER trg_feedback_items_updated_at
BEFORE UPDATE ON feedback_items
FOR EACH ROW
EXECUTE FUNCTION set_feedback_items_updated_at();
