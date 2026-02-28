-- Migration: Ensure feedback_items table exists with correct schema
-- Idempotent - safe to run multiple times.

BEGIN;

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

COMMIT;
