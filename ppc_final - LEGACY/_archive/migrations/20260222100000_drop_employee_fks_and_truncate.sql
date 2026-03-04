-- Drop FKs that reference employees so we can clear and re-sync employee data
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conrelid::regclass::text AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.confrelid = 'public.employees'::regclass AND c.contype = 'f'
  )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', trim(both '"' from r.tbl), r.conname);
  END LOOP;
END $$;

DELETE FROM employees;
