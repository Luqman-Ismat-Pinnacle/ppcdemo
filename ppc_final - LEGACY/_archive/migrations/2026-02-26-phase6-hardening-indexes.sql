-- Phase 6 hardening: concurrency safety + lookup performance
-- Date: 2026-02-26

-- Prevent duplicate pending hour->task suggestions for the same hour entry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mapping_suggestions_pending_hour_entry
  ON mapping_suggestions (hour_entry_id)
  WHERE suggestion_type = 'hour_to_task'
    AND status = 'pending'
    AND hour_entry_id IS NOT NULL;

-- Keep alert inbox fast when listing open/recent alerts.
CREATE INDEX IF NOT EXISTS idx_alert_events_status_created_at
  ON alert_events (status, created_at DESC);

-- Keep assignment history lookup fast per task timeline.
CREATE INDEX IF NOT EXISTS idx_task_assignments_task_changed_at
  ON task_assignments (task_id, changed_at DESC);

-- Enforce confidence range for suggestions (0..1).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mapping_suggestions_confidence_range_ck'
  ) THEN
    ALTER TABLE mapping_suggestions
      ADD CONSTRAINT mapping_suggestions_confidence_range_ck
      CHECK (confidence >= 0 AND confidence <= 1);
  END IF;
END $$;
