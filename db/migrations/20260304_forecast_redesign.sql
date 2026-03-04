-- Forecast redesign: add count-update provenance + guardrail governance table

-- Track when actual counts were last updated (for stale detection)
ALTER TABLE units     ADD COLUMN IF NOT EXISTS actual_count_updated_at TIMESTAMPTZ;
ALTER TABLE phases    ADD COLUMN IF NOT EXISTS actual_count_updated_at TIMESTAMPTZ;
ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS actual_count_updated_at TIMESTAMPTZ;
ALTER TABLE sub_tasks ADD COLUMN IF NOT EXISTS actual_count_updated_at TIMESTAMPTZ;

-- Epic/Feature progress tracking for sprint rollup
ALTER TABLE epics    ADD COLUMN IF NOT EXISTS progress NUMERIC(5,2) DEFAULT 0;
ALTER TABLE features ADD COLUMN IF NOT EXISTS progress NUMERIC(5,2) DEFAULT 0;

-- Guardrail log: flags when PL enters remaining hours below predicted
CREATE TABLE IF NOT EXISTS forecast_guardrails (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id),
  record_table    TEXT NOT NULL,
  record_id       TEXT NOT NULL,
  record_name     TEXT,
  predicted_hours NUMERIC(12,2) NOT NULL DEFAULT 0,
  entered_hours   NUMERIC(12,2) NOT NULL DEFAULT 0,
  delta           NUMERIC(12,2) NOT NULL DEFAULT 0,
  pl_comment      TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending_pca',
  pca_comment     TEXT,
  escalated_to    TEXT,
  escalated_at    TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fg_project ON forecast_guardrails(project_id);
CREATE INDEX IF NOT EXISTS idx_fg_status  ON forecast_guardrails(status);

-- Trigger for updated_at
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_forecast_guardrails_updated') THEN
    CREATE TRIGGER trg_forecast_guardrails_updated
      BEFORE UPDATE ON forecast_guardrails
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
