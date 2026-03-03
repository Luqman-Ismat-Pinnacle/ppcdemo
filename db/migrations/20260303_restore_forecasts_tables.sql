BEGIN;

CREATE TABLE IF NOT EXISTS forecasts (
  id                TEXT PRIMARY KEY,
  project_id        TEXT REFERENCES projects(id),
  submitted_by      TEXT,
  forecast_hours    NUMERIC(12,2) DEFAULT 0,
  forecast_cost     NUMERIC(14,2) DEFAULT 0,
  baseline_hours    NUMERIC(12,2) DEFAULT 0,
  baseline_cost     NUMERIC(14,2) DEFAULT 0,
  forecast_end_date DATE,
  period            TEXT,
  notes             TEXT,
  status            TEXT DEFAULT 'pending',
  reviewed_by       TEXT,
  review_comment    TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id);
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS submitted_by TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS forecast_hours NUMERIC(12,2) DEFAULT 0;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS forecast_cost NUMERIC(14,2) DEFAULT 0;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS baseline_hours NUMERIC(12,2) DEFAULT 0;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS baseline_cost NUMERIC(14,2) DEFAULT 0;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS forecast_end_date DATE;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS period TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS review_comment TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'forecasts'
      AND column_name = 'forecast_date'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE forecasts ALTER COLUMN forecast_date DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_forecasts_project ON forecasts(project_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_status ON forecasts(status);
CREATE INDEX IF NOT EXISTS idx_forecasts_created ON forecasts(created_at DESC);

CREATE TABLE IF NOT EXISTS forecast_phase_lines (
  id                      TEXT PRIMARY KEY,
  forecast_id             TEXT NOT NULL REFERENCES forecasts(id) ON DELETE CASCADE,
  project_id              TEXT REFERENCES projects(id),
  phase_id                TEXT,
  unit_name               TEXT,
  phase_name              TEXT NOT NULL,
  baseline_hours          NUMERIC(12,2) DEFAULT 0,
  actual_hours            NUMERIC(12,2) DEFAULT 0,
  current_remaining_hours NUMERIC(12,2) DEFAULT 0,
  delta_hours             NUMERIC(12,2) DEFAULT 0,
  revised_remaining_hours NUMERIC(12,2) DEFAULT 0,
  revised_eac_hours       NUMERIC(12,2) DEFAULT 0,
  current_eac_cost        NUMERIC(14,2) DEFAULT 0,
  delta_cost              NUMERIC(14,2) DEFAULT 0,
  revised_eac_cost        NUMERIC(14,2) DEFAULT 0,
  rationale               TEXT,
  sort_order              INTEGER DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS forecast_id TEXT REFERENCES forecasts(id) ON DELETE CASCADE;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id);
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS phase_id TEXT;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS unit_name TEXT;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS phase_name TEXT;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS baseline_hours NUMERIC(12,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(12,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS current_remaining_hours NUMERIC(12,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS delta_hours NUMERIC(12,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS revised_remaining_hours NUMERIC(12,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS revised_eac_hours NUMERIC(12,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS current_eac_cost NUMERIC(14,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS delta_cost NUMERIC(14,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS revised_eac_cost NUMERIC(14,2) DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS rationale TEXT;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE forecast_phase_lines ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_forecast_phase_lines_forecast ON forecast_phase_lines(forecast_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_forecast_phase_lines_project ON forecast_phase_lines(project_id);

DO $$
BEGIN
  IF to_regclass('public.forecasts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_forecasts_updated'
    ) THEN
      CREATE TRIGGER trg_forecasts_updated
      BEFORE UPDATE ON forecasts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at();
    END IF;
  END IF;

  IF to_regclass('public.forecast_phase_lines') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_forecast_phase_lines_updated'
    ) THEN
      CREATE TRIGGER trg_forecast_phase_lines_updated
      BEFORE UPDATE ON forecast_phase_lines
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at();
    END IF;
  END IF;
END $$;

COMMIT;
