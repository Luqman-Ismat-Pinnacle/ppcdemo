# Database Review (2.17.26)

## Scope
Codebase-wide static review of SQL usage in:
- `app/api/*`
- `lib/*`
- `azure-functions-workday-sync/*`

## Current status summary
- Primary runtime database path is PostgreSQL (`DATABASE_URL`/`AZURE_POSTGRES_CONNECTION_STRING`).
- Supabase remains as fallback in several data access paths.
- Prior SQL definitions were fragmented across multiple schema and migration files.
- Several runtime tables were being created ad hoc by APIs (`notifications`) or missing from core schema (`engine_logs`, `change_logs`, `feedback_items`, `workday_tasks`).

## Tables actively used by application/services
- `app_settings`
- `change_impacts`
- `change_logs`
- `change_requests`
- `customers`
- `deliverables`
- `employees`
- `engine_logs`
- `epics`
- `features`
- `feedback_items`
- `forecasts`
- `hour_entries`
- `metrics_history`
- `milestones`
- `notifications`
- `phases`
- `portfolios`
- `project_documents`
- `project_health`
- `project_log`
- `projects`
- `qc_tasks`
- `sites`
- `snapshots`
- `sprint_tasks`
- `sprints`
- `subprojects`
- `task_dependencies`
- `task_quantity_entries`
- `tasks`
- `units`
- `user_stories`
- `visual_snapshots`

## Legacy/unused table names found in old schema files
- `charge_codes`
- `deliverables_tracker`
- `hours`
- `qctasks`
- `subtasks`

## Gaps fixed in new canonical schema
- Added explicit table definitions for:
  - `workday_tasks`
  - `feedback_items`
  - `notifications`
  - `engine_logs`
  - `change_logs`
- Added `units.project_id` column for compatibility with matching logic querying units by project.

## Loading speed improvements implemented
- Added functional indexes for auth/profile lookup:
  - `employees(lower(name))`
  - `employees(lower(email))`
- Added task/query path indexes:
  - `tasks(project_id, name)`
  - `tasks(project_id, phase_id)`
- Added matching/hour hot-path indexes:
  - `hour_entries(project_id, date desc) WHERE task_id IS NULL`
  - `hour_entries(task_id, date desc)`
- Added notifications retrieval indexes:
  - `(employee_id, role, is_read, created_at desc)`
  - `(role, created_at desc)`
- Added document lookup index:
  - `project_documents(storage_path)`

## Operational recommendations (next)
1. Replace broad `SELECT *` loaders in `lib/database.ts` with scoped column projections and endpoint-specific fetches.
2. Move large tables (`hour_entries`) to incremental window fetch on all paths, not only Supabase fallback.
3. Add periodic `VACUUM (ANALYZE)`/autovacuum tuning for heavy-write tables (`hour_entries`, `tasks`, `notifications`).
4. Add EXPLAIN plan checks for `/api/data/sync`, `/api/data/match`, and `/api/workday` workflows after deploying the new schema.
