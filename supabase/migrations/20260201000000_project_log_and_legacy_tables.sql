-- project_log: allow parser/upload logs to save even when project_id is missing or not in projects
-- (drop FK so inserts don't fail; project_id is still stored for filtering)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'project_log' AND c.contype = 'f'
  ) LOOP
    EXECUTE format('ALTER TABLE project_log DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN others THEN NULL;
END $$;

-- project_documents: ensure health columns exist (idempotent)
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS health_score INTEGER;
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS health_check_json JSONB;
COMMENT ON COLUMN project_documents.health_score IS 'Project health score (0-100) from MPXJ auto-check';
COMMENT ON COLUMN project_documents.health_check_json IS 'Parser/health check result (score, issues) as JSON';

-- Drop legacy tables no longer used (app uses portfolios, customers, sites, units, epics, features, user_stories)
DROP TABLE IF EXISTS work_items CASCADE;
DROP TABLE IF EXISTS hierarchy_nodes CASCADE;
