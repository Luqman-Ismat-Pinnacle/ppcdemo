-- Migration: Hard-prune legacy / no-purpose tables and duplicate log artifact
-- Date: 2026-02-25
-- Policy:
--   - Keep active runtime tables and past-week schema additions.
--   - Remove legacy tables that are empty/no longer used.
--   - Standardize on `change_logs` (plural), drop legacy `change_log` if present.

BEGIN;

-- Drop dependent indexes first (safe no-op if absent)
DROP INDEX IF EXISTS idx_cost_actuals_project_id;
DROP INDEX IF EXISTS idx_cost_transactions_project_id;
DROP INDEX IF EXISTS idx_cost_categories_name;
DROP INDEX IF EXISTS idx_resource_calendars_employee_id;
DROP INDEX IF EXISTS idx_progress_claims_project_id;
DROP INDEX IF EXISTS idx_approval_records_project_id;

-- Legacy / unused tables
DROP TABLE IF EXISTS cost_actuals CASCADE;
DROP TABLE IF EXISTS cost_transactions CASCADE;
DROP TABLE IF EXISTS cost_categories CASCADE;
DROP TABLE IF EXISTS resource_calendars CASCADE;
DROP TABLE IF EXISTS progress_claims CASCADE;
DROP TABLE IF EXISTS approval_records CASCADE;
DROP TABLE IF EXISTS baseline_snapshots CASCADE;
DROP TABLE IF EXISTS forecast_snapshots CASCADE;
DROP TABLE IF EXISTS deliverables_tracker CASCADE;
DROP TABLE IF EXISTS calendars CASCADE;

-- Duplicate legacy log table: keep canonical `change_logs`
DROP TABLE IF EXISTS change_log CASCADE;

COMMIT;
