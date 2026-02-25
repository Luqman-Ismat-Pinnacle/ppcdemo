# PPC System Deep Dive: Calculations, Database Interactions, and API/Data Flow

Last updated: 2026-02-25

## 1) Purpose of this document
This document explains how calculations are performed, how the database interacts with the web app, and how Data Management, API routes, and page-level features connect end-to-end.

Primary implementation anchors:
- `lib/data-context.tsx`
- `lib/data-transforms.ts`
- `lib/database.ts`
- `lib/supabase.ts`
- `types/data.ts`
- `app/project-controls/data-management/page.tsx`
- `app/api/data/route.ts`
- `app/api/data/sync/route.ts`
- `app/api/data/mapping/route.ts`
- `app/api/workday/route.ts`
- `app/api/project-documents/route.ts`
- `app/api/documents/process-mpp/route.ts`

## 2) High-level architecture
The app follows a central data-context pattern with server APIs as write/read boundaries.

Flow:
1. Browser mounts app under `DataProvider`.
2. `DataProvider` calls `/api/data` to fetch all active table datasets.
3. `/api/data` delegates to `fetchAllData()` in `lib/database.ts`.
4. `fetchAllData()` uses PostgreSQL as primary, Supabase as fallback.
5. Raw rows are converted from `snake_case` to `camelCase`.
6. `transformData()` computes all derived structures used by visual pages.
7. Pages consume `useData().filteredData` and render chart/table views.
8. Mutations go through `/api/data/sync`, `/api/data/mapping`, `/api/workday`, `/api/project-documents`, and selected specialty routes.
9. `updateData()` in context merges local edits and re-runs `transformData()` so all computed views stay consistent.

## 3) Active database runtime surface
Canonical runtime table mapping is in `lib/supabase.ts` (`TABLES`, `DATA_KEY_TO_TABLE`).

Active table set (also documented in `LATEST_DB_SCHEMA.md`):
- `employees`, `portfolios`, `customers`, `sites`, `units`, `projects`, `subprojects`, `phases`, `tasks`, `qc_tasks`
- `deliverables`, `hour_entries`, `milestones`, `project_health`, `project_log`, `task_dependencies`
- `snapshots`, `visual_snapshots`, `change_requests`, `change_impacts`, `task_quantity_entries`, `project_mappings`
- `sprints`, `epics`, `features`, `user_stories`
- `project_documents`, `project_document_records`, `project_document_versions`
- `customer_contracts`, `workday_phases`, `mo_period_notes`, `engine_logs`

Hard-pruned legacy tables were removed via `migrations/2026-02-25-legacy-hard-prune.sql`.
Pruned set includes:
- `cost_actuals`, `cost_transactions`, `cost_categories`, `resource_calendars`, `progress_claims`, `approval_records`
- `baseline_snapshots`, `forecast_snapshots`, `deliverables_tracker`, `calendars`
- `change_log` (legacy duplicate; canonical model is pluralized logs)

## 4) DB access and fallback model
### 4.1 Read path
- `/api/data` returns a full payload from `fetchAllData()`.
- In `lib/database.ts`:
  - `isPostgresConfigured()` true: run fan-out SELECTs on active tables.
  - Else: use Supabase REST client fallback with pagination for large `hour_entries`.
  - Else: mock/no-db mode.

### 4.2 Write path
Writes are mostly routed through server APIs:
- `/api/data/sync`: generic upsert/delete/replace/wipe operations by `dataKey`.
- `/api/data/mapping`: specialized assignment/matching for Workday hour/task/phase linkage.
- `/api/project-documents`: document record/version lifecycle.
- `/api/workday`: scheduled/manual sync of employees/projects/hours and available project lookup.
- `/api/documents/process-mpp`: parse-and-upsert MPP data into units/phases/tasks/task_dependencies and update project metadata.

### 4.3 Data normalization safeguards
`app/api/data/sync/route.ts` performs the core sanitation and protection:
- Converts camelCase payloads to snake_case.
- Trims null-like values (`'', '-', 'null', 'undefined', 'n/a'`) to actual SQL NULL.
- Applies per-table compatibility adjustments.
- Parses `hour_entries.description` using `parseHourDescription()` and writes normalized `charge_code`, `charge_code_v2`, `phases`, `task`.
- Validates `hour_entries.task_id` and `hour_entries.phase_id` against existing FK targets, nulling invalid IDs to prevent constraint failures.

## 5) Data Context and transform pipeline
`lib/data-context.tsx` is the in-browser data orchestrator.

Main responsibilities:
- Holds raw + computed state (`data`) and view-filtered state (`filteredData`).
- Bootstraps from `/api/data`, with short-lived session cache for fast reloads.
- Applies active filters (inactive employee/project suppression, planned project filtering, portfolio/customer/site cascades).
- Rebuilds computed datasets through `transformData()` whenever core entities change.
- Broadcasts data updates across tabs (`BroadcastChannel` + storage event fallback).

Important invariant:
- Most pages should consume `filteredData`.
- Data Management works with raw edit surfaces and then syncs mutations through API boundaries.

## 6) Data Management page: how it controls the DB
File: `app/project-controls/data-management/page.tsx`

This page is the admin/editor control plane for table-backed datasets.

Core behavior:
- Defines section configs per dataset (`portfolios`, `customers`, `sites`, `projects`, `units`, `phases`, `employees`, `tasks`, `hours`, `milestonesTable`, `deliverables`, `qctasks`, etc.).
- Supports row add/edit/delete flows.
- Supports import flows (JSON/CSV/Excel/MPP related processing paths).
- Calls `updateData()` for immediate in-memory consistency.
- Persists using `/api/data/sync` when DB is enabled and table mapping exists.

Sync mechanics:
- `syncToSupabase(dataKey, records)` (name legacy, route is now generic DB sync endpoint) posts normalized records to `/api/data/sync`.
- Table resolution uses `DATA_KEY_TO_TABLE` from `lib/supabase.ts`.
- Section keys without a runtime table mapping are not persisted as direct table writes.

## 7) Calculation engines and formulas
This section summarizes the main mathematical logic and where it is implemented.

### 7.1 Transform-layer aggregates (`lib/data-transforms.ts`)
This module builds computed structures consumed across pages.

High-impact computed outputs:
- WBS tree (`buildWBSData`) with hierarchy joining and fallback project-phase-task linking.
- Resource views (`buildResourceHeatmap`, `buildResourceGantt`, `buildResourceLeveling`).
- Labor and quality aggregates (`buildLaborBreakdown`, `buildQualityHours`, `buildTaskHoursEfficiency`).
- Forecast and trend outputs (`buildForecastData`, `buildSCurveData`, `buildPlanVsForecastVsActual`).
- QC metrics (`buildQCPassFailByTask`, `buildQCFeedbackTimeByMonth`, etc.).
- Milestone and deliverable summaries (`buildMilestoneStatus`, `buildMilestoneStatusPie`, `buildDeliverablesTracker`).

Cross-cutting transform techniques:
- Date normalization to canonical `YYYY-MM-DD` for grouping correctness.
- Week mapping memoization to avoid recomputation costs.
- Hierarchy map pre-builds for O(1) joins instead of repeated O(n) filtering.

### 7.2 Variance engine (`lib/variance-engine.ts`)
Key formulas:
- Absolute change: `change = current - previous`
- Percent change: `changePercent = ((current - previous) / abs(previous)) * 100` when previous != 0
- Trend classification:
  - `flat` when abs(changePercent) <= 0.5
  - `up` when positive beyond threshold
  - `down` when negative beyond threshold

Provides period windows for day/week/month/quarter/custom comparisons and metric aggregation by period.

### 7.3 Forecasting engine (`lib/forecasting-engine.ts`)
Includes Monte Carlo and EVM-based projections.

Core outputs:
- Cost and duration percentile forecasts: P10 / P50 / P90
- IEAC variants:
  - `IEAC(CPI) = BAC / CPI`
  - `IEAC(Budget Rate) = AC + (BAC - EV)`
- TCPI:
  - To BAC and to chosen EAC scenarios

Simulation behavior:
- Uses Box-Muller normal randomization (`randomNormal`) with configurable risk/optimism/resource/scoping multipliers.

### 7.4 Executive metrics (`lib/executive-metrics.ts`)
Executive-facing rollups:
- Health score is a weighted KPI blend:
  - SPI 25%, CPI 25%, progress 20%, quality 15%, utilization 15%
- Budget impact:
  - Variance: `plannedValue - actualCost`
  - EAC: `BAC / CPI` fallback to BAC when CPI invalid
  - ETC: `EAC - actualCost`
- Burn-rate status compares planned daily burn vs actual daily burn.

### 7.5 Metrics engine (`lib/metrics-engine.ts`)
Task/project efficiency views:
- Remaining hours: `max(0, projectedOrBaseline - actual)`
- Metric (hours per unit): `actual / count`
- Variance vs defensible benchmark: `metric - defensible`
- Status bands by configurable warning/bad thresholds.

### 7.6 Utilization engine (`lib/utilization-engine.ts`)
Employee-level calculations:
- Projected utilization: `assignedHours / annualCapacity`
- Current utilization: `actualHoursLogged / proratedCapacityToDate`
- Current efficiency: `weightedBaselineCompleted / actual`
- Projected efficiency: weighted historical trend (default weights 0.4/0.3/0.2/0.1 recent→older).

### 7.7 CPM engine (`lib/cpm-engine.ts`)
Critical Path Method calculations:
- Topological sort with cycle detection.
- Forward pass: early start/finish.
- Backward pass: late start/finish.
- Float:
  - Total Float = LS - ES (equivalently LF - EF)
  - Free Float based on successor constraints.
- Critical path defined by near-zero/zero total float.

### 7.8 Resource leveling (`lib/resource-leveling-engine.ts`)
Deterministic leveling pass for task-resource-date assignment under:
- capacity limits,
- predecessor constraints,
- schedule bounds,
- optional split behavior,
- workday filtering.

Produces assignment map, schedule set, resource utilization summaries, delays, and warnings.

### 7.9 Project health auto-check (`lib/project-health-auto-check.ts`)
Rule-based schedule quality checks over converted parser output:
- task logic presence,
- orphan checks,
- execution resource assignment,
- effort/duration validity,
- oversized low-count task detection,
- non-execution hour ratio constraints.

Returns score out of 100 and issue list.

## 8) API contracts and how they connect to pages

### 8.1 `/api/data` (GET)
Role:
- Full dataset bootstrap/refresh endpoint for app context.

Consumers:
- `lib/data-context.tsx` load + refresh.
- Some page-level refresh operations (project plans/folders flows).

### 8.2 `/api/data/sync` (POST)
Role:
- Primary generic write endpoint for table sync and admin operations.

Supports:
- Upsert-style sync by `dataKey` + `records`.
- Other operations including wipe/replace/delete/set-current-MPP/update-document-health paths.

Primary consumers:
- Data Management page.
- Mo's page comments/notes updates.
- sprint/task quick updates.
- snapshot and visual snapshot persistence from Data Context.

### 8.3 `/api/data/mapping` (POST)
Role:
- Workday linkage actions.

Action examples:
- `assignHourToTask`
- `assignTaskToWorkdayPhase`
- `assignEntityToWorkdayPhase`
- `assignHourToWorkdayPhase`
- `matchWorkdayPhaseToHoursPhases`
- `autoMatchHoursToTasksInWorkdayPhaseBucket`
- `bulkAssignHoursToTasks`

Used by project plan and mapping workflows.

### 8.4 `/api/workday` (POST/GET)
Role:
- Workday sync orchestration.

Modes:
- Unified sync stream (Azure Functions primary, Supabase edge fallback).
- Hours-only or specific sync types.
- `action=get-available-projects` active project listing.

Used by project plan/folder sync flows and planning data refresh.

### 8.5 `/api/project-documents` (POST action router)
Role:
- Structured project document record/version CRUD.

Actions:
- `listDocumentRecords`
- `createDocumentRecord`
- `uploadDocumentVersion`
- `deleteLatestDocumentVersion`
- `updateDocumentRecordMetadata`
- `updateDocumentVersionNotes`

Consumers:
- Project Documentation page.
- Related controls in planning/insights document surfaces.

### 8.6 `/api/documents/process-mpp` (POST)
Role:
- Parse MPP, convert into normalized entities, upsert to DB.

Pipeline:
1. Download source file from Azure storage.
2. Call parser service (`/parse`).
3. Convert parser payload via `convertProjectPlanJSON`.
4. Upsert `units`, `phases`, `tasks`, and derived `task_dependencies`.
5. Run auto health checks and persist metadata.

Consumers:
- Project Plans and Folders upload/process actions.

### 8.7 Other connected APIs
- `/api/storage`: Azure blob list/upload/download/delete.
- `/api/feedback` and `/api/feedback/[id]`: issue/feature capture and status updates.
- `/api/tasks/assign`: assign employee to task.
- `/api/notifications`: assignment notification delivery and state updates.
- `/api/auth/*`: Auth0 login/callback/me/logout path.

## 9) Page-level data dependency map

### 9.1 Core insights pages
- `app/insights/overview/page.tsx` and `overview-v2/page.tsx`:
  - consume context metrics, variance trend functions, and computed aggregates.
- `app/insights/hours/page.tsx`:
  - relies on `hours`, quality/labor outputs, and variance comparisons.
- `app/insights/mos-page/page.tsx`:
  - combines `tasks`, `hours`, `milestones`, `moPeriodNotes`; writes notes/comments through `/api/data/sync`.
- `app/insights/milestones/page.tsx`:
  - reads milestone table + computed status structures.
- `app/insights/documents/page.tsx`:
  - reads project document records/versions from transformed context data.

### 9.2 Project controls pages
- `wbs-gantt` and `wbs-gantt-v2`:
  - consume `wbsData` + tasks and run CPM calculations.
- `resourcing`:
  - uses resource-leveling engine output and assignment APIs.
- `project-health`:
  - uses forecasting and health metrics.
- `project-plans` and `folders`:
  - orchestration-heavy pages for storage, workday sync, parser processing, and DB sync routes.
- `data-management`:
  - direct admin CRUD/import/sync control plane.

### 9.3 Project management pages
- `forecast`:
  - forecasting engine + CPM + scenario controls.
- `documentation`:
  - document records/version lifecycle through `/api/project-documents`.
- sprint/boards/backlog:
  - consume tasks/sprints/epics/features/stories and persist updates via sync routes.
- `qc-log`:
  - primarily `qctasks` with edits flowing through context/sync patterns.

## 10) How DB, Data Management, and other pages stay in sync
Consistency model:
1. User edits in Data Management or operational page.
2. Local context updates immediately (`updateData`) for responsive UI.
3. API mutation persists to DB.
4. Cross-tab event broadcast triggers remote refresh in other tabs.
5. `refreshData()` can force server-truth pull.
6. `transformData()` recomputes all dependent views from updated raw tables.

This gives low-latency UX with eventual consistency converging on DB truth.

## 11) Performance and stability design notes
Current design choices that improve speed and resiliency:
- Session bootstrap cache in Data Context (short TTL) to reduce initial blank states.
- Memoization in `data-transforms` for expensive grouped calculations.
- Bulk upsert batching in sync routes to avoid oversized SQL statements.
- DB fallback model (Postgres primary, Supabase fallback) to keep app operable across environments.
- Guarded filtering logic to avoid collapsing UI to empty during partial-load conditions.

## 12) Risks and operational considerations
- Very large `hour_entries` volumes remain the dominant runtime cost for fetch + transform.
- Mapping quality depends on normalized task/phase identifiers and description parser quality.
- Some endpoints are action-routed POST handlers; strict request validation is important for long-term safety.
- If schema evolves without updating `DATA_KEY_TO_TABLE`, `types/data.ts`, and transform assumptions together, drift bugs can appear.

## 13) Recommended maintenance checklist when changing schema or calculations
1. Update migration + `LATEST_DB_SCHEMA.md`.
2. Update `lib/supabase.ts` table/constants and key mapping.
3. Update `types/data.ts` contracts.
4. Update `/api/data/sync` sanitation and compatibility transforms.
5. Update `transformData()` and any affected calculation engines.
6. Validate Data Management section config for added/removed entities.
7. Run `npm run lint` and `npm run build`.
8. Smoke-check critical routes: `/api/data`, `/api/data/sync`, `/api/data/mapping`, `/api/workday`, `/api/project-documents`, `/api/feedback`.

