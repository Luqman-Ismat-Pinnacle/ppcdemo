-- Wipe all business data; keep app_settings (schedule).
-- Only truncates tables that exist. Order: children first (no CASCADE needed).

DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'hour_entries', 'task_quantity_entries', 'task_dependencies', 'tasks', 'phases',
    'subprojects', 'projects', 'units', 'sites', 'customers', 'portfolios', 'employees',
    'qc_tasks', 'deliverables', 'milestones', 'sprint_tasks', 'sprints',
    'user_stories', 'features', 'epics', 'forecasts', 'snapshots', 'visual_snapshots',
    'project_health', 'project_log', 'change_impacts', 'change_requests',
    'project_documents', 'project_mappings', 'metrics_history'
  ];
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', t);
      RAISE NOTICE 'Truncated %', t;
    END IF;
  END LOOP;
END $$;
