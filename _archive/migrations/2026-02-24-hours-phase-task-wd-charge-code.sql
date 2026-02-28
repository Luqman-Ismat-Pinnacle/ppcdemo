-- Add derived Workday parsing columns to hour_entries and WD charge code to tasks.

ALTER TABLE hour_entries
  ADD COLUMN IF NOT EXISTS charge_code VARCHAR(255),
  ADD COLUMN IF NOT EXISTS charge_code_v2 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS phases VARCHAR(255),
  ADD COLUMN IF NOT EXISTS task TEXT,
  ADD COLUMN IF NOT EXISTS workday_phase_id VARCHAR(50);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS wd_charge_code VARCHAR(255);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'workday_phases'
  ) THEN
    BEGIN
      ALTER TABLE hour_entries
        ADD CONSTRAINT hour_entries_workday_phase_id_fkey
        FOREIGN KEY (workday_phase_id) REFERENCES workday_phases(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_hour_entries_workday_phase_id ON hour_entries(workday_phase_id);
CREATE INDEX IF NOT EXISTS idx_hour_entries_phases ON hour_entries(phases);
CREATE INDEX IF NOT EXISTS idx_tasks_wd_charge_code ON tasks(wd_charge_code);

WITH parsed AS (
  SELECT
    id,
    regexp_replace(
      regexp_replace(COALESCE(description, ''), '\\s*\\([^)]*\\)\\s*$', '', 'i'),
      '\\s*((\\d{4}[-/]\\d{1,2}[-/]\\d{1,2})|(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4})|([A-Za-z]{3,9}\\.?\\s+\\d{1,2},?\\s+\\d{2,4})|(\\d{1,2}-[A-Za-z]{3,9}-\\d{2,4}))\\s*$',
      '',
      'i'
    ) AS normalized
  FROM hour_entries
)
UPDATE hour_entries h
SET
  charge_code = NULLIF(TRIM(p.normalized), ''),
  charge_code_v2 = NULLIF(TRIM(p.normalized), ''),
  phases = NULLIF(TRIM(split_part(p.normalized, '>', 2)), ''),
  task = NULLIF(
    TRIM(
      CASE
        WHEN p.normalized ~ '^[^>]*>[^>]*>.*$' THEN regexp_replace(p.normalized, '^[^>]*>[^>]*>\\s*', '')
        ELSE ''
      END
    ),
    ''
  ),
  workday_phase = NULL,
  workday_task = NULL
FROM parsed p
WHERE h.id = p.id
  AND COALESCE(h.description, '') <> '';
