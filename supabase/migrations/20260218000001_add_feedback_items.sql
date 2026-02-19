-- Migration: Add feedback_items table for Issues & Features log (Feedback page)
-- Stores user-submitted issues and feature requests with status and progress.

CREATE TABLE IF NOT EXISTS feedback_items (
  id BIGSERIAL PRIMARY KEY,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('issue', 'feature')),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  page_path VARCHAR(500),
  user_action TEXT,
  expected_result TEXT,
  actual_result TEXT,
  error_message TEXT,
  severity VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(50) DEFAULT 'open',
  progress_percent INTEGER DEFAULT 0,
  notes TEXT,
  source VARCHAR(50) DEFAULT 'manual',
  created_by_name VARCHAR(255),
  created_by_email VARCHAR(255),
  created_by_employee_id VARCHAR(100),
  browser_info TEXT,
  runtime_error_name TEXT,
  runtime_stack TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_items_item_type ON feedback_items(item_type);
CREATE INDEX IF NOT EXISTS idx_feedback_items_status ON feedback_items(status);
CREATE INDEX IF NOT EXISTS idx_feedback_items_created_at ON feedback_items(created_at DESC);

ALTER TABLE feedback_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read feedback_items"
  ON feedback_items FOR SELECT TO public USING (true);

CREATE POLICY "Allow public insert feedback_items"
  ON feedback_items FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow public update feedback_items"
  ON feedback_items FOR UPDATE TO public USING (true) WITH CHECK (true);
