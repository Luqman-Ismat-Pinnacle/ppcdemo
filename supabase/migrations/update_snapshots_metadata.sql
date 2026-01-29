-- Migration to update snapshots table schema and migrate data
-- 1. Move 'view' column data into snapshot_data->metadata->view
-- 2. Drop the 'view' column

-- Ensure we are in a transaction
BEGIN;

-- Helper to ensure snapshot_data is valid JSONB
UPDATE snapshots 
SET snapshot_data = '{}'::jsonb 
WHERE snapshot_data IS NULL;

-- Migrate existing 'view' data to metadata
UPDATE snapshots
SET snapshot_data = jsonb_set(
  snapshot_data,
  '{metadata}',
  COALESCE(snapshot_data->'metadata', '{}'::jsonb) || jsonb_build_object('view', "view")
)
WHERE "view" IS NOT NULL;

-- Drop the 'view' column as it is no longer in the schema
ALTER TABLE snapshots DROP COLUMN IF EXISTS "view";

COMMIT;
