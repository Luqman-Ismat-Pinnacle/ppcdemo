# PPC Full Overhaul – Gate Checks

Run these checks to verify each phase was implemented correctly. Use `[x]` when passed.

## Automated Verification

```bash
node scripts/run-gate-checks.mjs
```

Exits 0 if all 38 checks pass, 1 otherwise.

Then run `npm run build` to verify the app compiles.

---

## Phase 1: Foundation (Data + Performance)

### 1.1 Lazy and Progressive Loading

- [ ] `lib/route-data-config.ts` exists with `ROUTE_VIEWS`, `getViewsForPath()`, `SHELL_TABLE_KEYS`
- [ ] `lib/database.ts` has `fetchAllData(mode: 'shell' | 'full')`; shell returns only portfolios, customers, sites, projects, employees
- [ ] `app/api/data/route.ts` accepts `?shell=true` query param
- [ ] `lib/data-transforms` (or transform-data.ts) has `views` option; only builds requested transforms
- [ ] `lib/data-context.tsx` does shell load first, then full load; passes `views` from `getViewsForPath(pathname)`

### 1.2 Split data-transforms.ts

- [ ] `lib/data-transforms/` folder exists with domain modules: core, wbs, resource, qc, milestones, budget-forecast, tasks, documents, utils, transform-data
- [ ] `lib/data-transforms/index.ts` re-exports `transformData` and `clearMemoizationCache`
- [ ] No `lib/data-transforms.ts` (single file) – removed
- [ ] `lib/data-context.tsx` imports from `lib/data-transforms` (or index)
- [ ] Memoization on build* functions (laborBreakdown, resourceGantt, sCurve, qualityHours)

---

## Phase 2: Role-Scoped Data

### 2.1 Server-Side Filtering

- [ ] `/api/data` accepts `?role=`, `?email=`, `?employeeId=` query params
- [ ] `lib/database.ts` has `FetchScope` and applies SQL WHERE based on role
- [ ] RDA: `hour_entries` filtered by `employee_id`; `tasks` by assignments
- [ ] COO: `employees` and `hour_entries` filtered by department `'1111 services'`
- [ ] `lib/data-context.tsx` passes scope params (role, email, employeeId) on fetch

### 2.2 COO Hierarchy

- [ ] COO scope uses department-based or hierarchy-based filtering

### 2.3 RDA Scope

- [ ] RDA receives only assigned tasks and own hour_entries

---

## Phase 3: App Structure and Navigation

### 3.1 Shared Folder

- [ ] `app/shared/` exists with: wbs-gantt-v2, data-management, mapping, project-plans, folders, resourcing, resource-leveling, health-report, project-health
- [ ] `app/shared/` has: overview-v2, hours, tasks, milestones, documents, qc-dashboard, snapshots-variance, metric-provenance, mos-page
- [ ] `app/shared/` has: forecast, sprint, backlog, boards, capacity, iterations, documentation, qc-log
- [ ] Routes use `/shared/...` paths

### 3.2 Role-Specific Pages

- [ ] `app/role-views/<role>/` exists for role dashboards
- [ ] Shared APIs stay in `app/api/`

### 3.3 Navigation

- [ ] `lib/role-navigation.ts` points to `/shared/...` routes

### 3.4 Archive

- [ ] `_archive/azure-functions-workday-sync/` exists (moved)
- [ ] `_archive/migrations/` exists (moved)

---

## Phase 4: Scripts and Workflow

### 4.1 Supabase Edge Function

- [ ] `docs/WORKDAY_SYNC.md` documents Supabase Edge Functions as canonical
- [ ] `app/api/workday/route.ts` uses Supabase when `AZURE_FUNCTION_URL` unset

### 4.2 Hours Pull Script

- [ ] `scripts/hours-pull.mjs` exists
- [ ] Supports `--from`, `--to`, `--project`, `--dry-run`

### 4.3 Matching Automation

- [ ] `scripts/hours-match.mjs` exists
- [ ] Runs match-hours-to-workday-phases and match-hours-workday-mpp-buckets
- [ ] Supports `--project`, `--dry-run`, `--rematch-all`

---

## Phase 5: Visuals and Design Consistency

### 5.1 WBS Gantt

- [ ] No changes; Glide Data Grid + Konva preserved

### 5.2 Design Tokens

- [ ] `app/globals.css` has `--chart-1` through `--chart-6`

### 5.3 Consistency

- [ ] Shared `.card-panel`, `.kpi-card` classes in globals.css
- [ ] `.kpi-value`, `.kpi-label` defined

---

## Phase 6: Metric Provenance Completion

### 6.1 Drill-Down

- [ ] `MetricProvenanceChip` opens modal with formula, inputs, data sources
- [ ] "Explain" or "View formula" action present

### 6.2 Lineage

- [ ] `app/shared/metric-provenance/page.tsx` has lineage view (DATA_FLOW_LINEAGE or similar)

### 6.3 Auto-Mapping

- [ ] Document or script for "Where used" (optional)

---

## Phase 7: AI Integration

### 7.1 "Explain This Metric"

- [ ] `MetricProvenanceChip` has `onExplain` and `value` props
- [ ] `lib/ai-context.ts` has `buildMetricExplainContext(provenance, value)`
- [ ] `/api/ai/query` accepts `provenance` and `value`; uses buildMetricExplainContext
- [ ] At least one page wires `onExplain` to call API (e.g. project-health, hours, tasks, resourcing, overview, mos-page)

### 7.2 "What Should I Do Next?"

- [ ] `app/api/ai/briefing/route.ts` prompt asks for concrete actions (exceptions, mapping suggestions, overdue plans)

### 7.3 Mapping Suggestions

- [ ] Optional: AI-assisted mapping endpoint (lower priority)

---

## Phase 8: Theme and Background

### 8.1 Theme Overhaul

- [ ] Light theme: `--border-color: rgba(0, 0, 0, 0.08)`, `--border-hover: rgba(0, 0, 0, 0.14)`
- [ ] `--bg-card`, `--surface-raised` have sufficient opacity for contrast
- [ ] No global `* { transition }`; transitions only on `.app-container`, `.main-content`, theme-aware wrappers

### 8.2 Background Quality

- [ ] `.ambient-image` uses CSS gradient (no `url('/Final Background.png')`)

### 8.3 Background Animation

- [ ] `ambientFloat` keyframes (4–5 steps)
- [ ] Blob durations staggered (e.g. 20s, 28s, 32s)
- [ ] `@media (prefers-reduced-motion: reduce)` disables animations

### 8.4 Grid Retina

- [ ] `.ambient-grid` `background-size: 56px` (or 2× for retina)

---

## Phase 9: Documentation

### 9.1 Git-Ignored Manual

- [ ] `.gitignore` has `docs/*` and `!docs/README.md`
- [ ] `docs/README.md` exists with architecture diagram, links to key modules

### 9.2 Manual Structure

- [ ] docs/README.md references ARCHITECTURE, MODULES, ROUTES, DATA_FLOW, ROLES (or notes to create locally)

---

## Phase 10: Global Filters Overhaul

### 10.1 Hierarchy Filter

- [ ] `HierarchyFilter` interface in types/data.ts uses IDs: `portfolioId`, `customerId`, `siteId`, `projectId`, `unitId`, `phaseId`
- [ ] `HierarchyFilter` component uses `setHierarchyFilter` with IDs (not display names)
- [ ] `lib/filter-utils.ts` has `getValidProjectIdsFromHierarchyFilter`
- [ ] `lib/data-context.tsx` uses filter-utils for hierarchy filtering (not 200+ lines inline)

### 10.2 Date Filter

- [ ] Presets simplified (All Time, This Week, Month, Quarter, YTD, Last 30/90, Custom)
- [ ] `lib/filter-utils.ts` has `getDateRangeFromFilter`, `persistDateFilter`, `restoreDateFilter`
- [ ] Date filter persisted to localStorage
- [ ] `lib/data-context.tsx` restores date filter from localStorage on mount

### 10.3 URL Persistence

- [ ] Optional: query params for project, from, to

---

## Build Verification

- [ ] `npm run build` succeeds with no errors
