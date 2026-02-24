-- Run once in Supabase Dashboard → SQL Editor before running employee-reset-and-sync.mjs
-- Drops all foreign key constraints that reference employees(id) so employees can be truncated and re-synced.

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
