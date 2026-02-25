# Website Data Flow and MPP Parser Flow

Last updated: 2026-02-25

## 1) Overview
This document focuses on how data moves through the website at runtime, and then drills into the MPP parser integration in detail.

Core runtime files:
- `lib/data-context.tsx`
- `lib/data-transforms.ts`
- `lib/database.ts`
- `lib/supabase.ts`
- `app/api/data/route.ts`
- `app/api/data/sync/route.ts`
- `app/api/documents/process-mpp/route.ts`
- `app/project-controls/data-management/page.tsx`
- `app/project-controls/project-plans/page.tsx`
- `app/project-controls/folders/page.tsx`

## 2) End-to-end website data flow

```mermaid
flowchart LR
  A[PostgreSQL primary / Supabase fallback] --> B[/api/data GET]
  B --> C[DataProvider in lib/data-context.tsx]
  C --> D[transformData in lib/data-transforms.ts]
  D --> E[filteredData + computed structures]
  E --> F[Pages and charts]

  G[Page edits/import actions] --> H[/api/data/sync POST]
  H --> A
  H --> C

  I[Mapping actions] --> J[/api/data/mapping POST]
  J --> A
  J --> C

  K[Workday sync] --> L[/api/workday POST]
  L --> A
  L --> C
```

## 3) Read flow (initial load and refresh)
1. App mounts under `DataProvider`.
2. `DataProvider` calls `/api/data` with `cache: 'no-store'`.
3. `/api/data` calls `fetchAllData()` in `lib/database.ts`.
4. Database layer selects PostgreSQL first, Supabase fallback second.
5. DB rows are normalized to app shape (snake_case to camelCase).
6. `DataProvider` runs `transformData()`.
7. `data` + `filteredData` are published via `useData()`.
8. Pages render from `filteredData` and computed views (`wbsData`, `resourceHeatmap`, variance views, forecast views, etc.).

## 4) Write flow (edits, imports, sync)
1. User changes data in Data Management or operational pages.
2. UI updates local context with `updateData()` for immediate feedback.
3. UI posts to `/api/data/sync` (or specialized route).
4. `/api/data/sync` sanitizes and transforms records:
   - null normalization,
   - camelCase to snake_case,
   - per-table compatibility fixes,
   - hour description parsing for `hour_entries`.
5. API persists to PostgreSQL (or Supabase fallback).
6. Context refreshes and re-runs `transformData()`.
7. Cross-tab broadcast triggers refresh in other open tabs.

## 5) Data Management page role in the flow
`app/project-controls/data-management/page.tsx` is the admin control surface:
- Section-driven CRUD over mapped datasets.
- Imports from files and batch sync.
- Uses `DATA_KEY_TO_TABLE` mapping from `lib/supabase.ts`.
- Persists through `/api/data/sync`.
- Keeps frontend immediately consistent through `updateData()`.

## 6) MPP parser integration: complete flow

### 6.1 Trigger points
Main entry points:
- `app/project-controls/project-plans/page.tsx`
- `app/project-controls/folders/page.tsx`
- API endpoint: `app/api/documents/process-mpp/route.ts`

### 6.2 MPP parser pipeline

```mermaid
flowchart TD
  A[User selects MPP doc] --> B[project_documents row exists with storage_path]
  B --> C[/api/documents/process-mpp POST]
  C --> D[Download file from Azure Blob]
  D --> E[Call parser service /parse]
  E --> F[convertProjectPlanJSON]
  F --> G[Normalize/enrich rows with project context]
  G --> H[Upsert units]
  G --> I[Upsert phases]
  G --> J[Upsert tasks]
  J --> K[Build and upsert task_dependencies]
  K --> L[runProjectHealthAutoCheck]
  L --> M[Update project_documents + project metadata]
  M --> N[Return logs + counts to UI]
  N --> O[UI refresh via /api/data and context transform]
```

### 6.3 Parser endpoint resolution
`/api/documents/process-mpp` resolves parser URL in order:
1. `MPP_PARSER_URL`
2. `NEXT_PUBLIC_MPP_PARSER_URL`
3. fallback constant in route (`DEFAULT_MPP_PARSER_URL`)

### 6.4 What `/api/documents/process-mpp` does
1. Validates required inputs (`documentId`, `projectId`).
2. Loads `project_documents` row to locate blob path.
3. Downloads binary MPP file from Azure storage.
4. Sends file to parser service (`POST /parse`, multipart form-data).
5. Validates parser payload (`success === true`).
6. Converts parser JSON with `convertProjectPlanJSON(parsed, projectId)`.
7. Enriches converted rows with project/portfolio/customer/site metadata.
8. Upserts core schedule entities:
   - `units`
   - `phases`
   - `tasks`
9. Builds dependency rows from task predecessor/successor arrays and upserts `task_dependencies`.
10. Runs `runProjectHealthAutoCheck` on converted structure.
11. Updates document/version/current-plan metadata and returns diagnostic logs.

### 6.5 Data quality and compatibility rules in parser flow
- Column filtering against live DB schema (`information_schema` lookup).
- VARCHAR truncation protection for oversized text fields.
- JSONB serialization for structured dependency payload fields.
- ID normalization and fallback ID generation where needed.
- Batch upsert strategy for large row sets.

## 7) How parser output propagates to website pages
After successful parse/upsert:
1. DB has fresh `units/phases/tasks/task_dependencies` for the target project.
2. `DataProvider.refreshData()` (explicit or triggered) re-fetches `/api/data`.
3. `transformData()` rebuilds dependent views:
   - WBS tree and gantt structures,
   - resource/heatmap and allocation views,
   - forecast/health and milestone-related aggregates.
4. Affected pages render updated schedule and metrics.

## 8) Related APIs in the same data graph
- `/api/data` for full read bootstrap.
- `/api/data/sync` for generic write/sync operations.
- `/api/data/mapping` for hour/task/workday phase mapping.
- `/api/workday` for Workday data sync.
- `/api/project-documents` for document records/versions lifecycle.
- `/api/storage` for Azure blob operations used by document + MPP flows.

## 9) Failure points and expected behavior
- Parser unreachable/timeout: process API returns failure with diagnostics; no partial frontend mutation should be trusted until refresh.
- Invalid parser payload: conversion halts; diagnostics returned.
- DB constraint mismatch: upsert path sanitizes and filters, but invalid FK/data can still fail and will be surfaced in response.
- Storage download failure: process flow terminates before parse call.

## 10) Quick operational checks
When verifying data flow or parser issues:
1. Confirm parser URL env vars are set and reachable.
2. Confirm Azure blob storage credentials and file path validity.
3. Confirm `/api/documents/process-mpp` returns row counts and no conversion errors.
4. Confirm `/api/data` includes updated `tasks/phases/units/task_dependencies`.
5. Confirm WBS/Project Plans/Forecast pages reflect new schedule data after refresh.

