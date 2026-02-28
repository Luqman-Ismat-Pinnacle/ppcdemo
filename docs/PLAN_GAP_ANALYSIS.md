# PPC Full Overhaul Plan – Gap Analysis

Audit of plan vs. implementation. ✅ = done, ❌ = not done, ⚠️ = partial.

---

## Phase 1: Foundation

### 1.1 Lazy and Progressive Loading
- ✅ `views` option in transformData
- ✅ Shell load (portfolios, projects, employees, hierarchy)
- ✅ Full load triggered after shell
- ✅ `lib/route-data-config.ts` with ROUTE_VIEWS, getViewsForPath
- ✅ DataProvider passes views from pathname

### 1.2 Split data-transforms.ts
- ✅ Domain modules created (core, wbs, resource, qc, milestones, etc.)
- ✅ Re-export from index.ts
- ❌ **Memoization on laborBreakdown, resourceGantt, sCurve, qualityHours** – only WBS, resourceHeatmap, hierarchy use memoize

---

## Phase 2: Role-Scoped Data

### 2.1 Server-Side Filtering
- ✅ Query params `?role=`, `?email=`, `?employeeId=`
- ✅ RDA: hour_entries by employee_id, tasks by assignments
- ✅ COO: department `1111 services`
- ❌ **Project Lead / PCA: filter projects where project_lead_email or pca_email matches** – not implemented

### 2.2 COO Hierarchy
- ❌ **manager_id / reports_to on employees** – not added
- ❌ **Resolve "people under COO" via hierarchy** – uses department only, not org hierarchy

### 2.3 RDA Scope
- ✅ hour_entries filtered by employee_id
- ✅ tasks filtered by assigned_resource_id
- ⚠️ qc_tasks by assigned_to – needs verification

---

## Phase 3: App Structure and Navigation

### 3.1 Shared Folder
- ✅ `app/shared/` created with moved pages
- ⚠️ **Duplicate routes remain** – `app/insights/`, `app/project-controls/`, `app/project-management/` still have pages (redirects or duplicates)

### 3.2 Role-Specific Pages
- ❌ **Move role-specific API routes next to pages** – APIs stay in `app/api/role-views/`, not colocated

### 3.3 Navigation Simplification
- ✅ role-navigation points to `/shared/`
- ❌ **Reduce primary nav to 3–5 items per role; move rest to "More"** – PCL has 7 primary, PCA has 8, etc.
- ❌ **Merge overview and overview-v2** – both still exist
- ❌ **Consolidate project-plans and folders** – not done

### 3.4 Archive and Cleanup
- ✅ azure-functions-workday-sync → _archive
- ✅ migrations → _archive
- ❌ **Move root docs to docs/ or docs/archive/** – WEBSITE_DATA_FLOW_AND_MPP_PARSER.md, ENV_AND_DEVOPS_HANDOFF.md, etc. still at root
- ✅ docs/ gitignore, docs/README.md

---

## Phase 4: Scripts and Workflow

### 4.1–4.3
- ✅ WORKDAY_SYNC.md
- ✅ hours-pull.mjs, hours-match.mjs
- ⚠️ Document usage in docs/ – minimal

---

## Phase 5: Visuals

### 5.2–5.3
- ✅ Design tokens --chart-1 through --chart-6
- ✅ .card-panel, .kpi-card
- ❌ **Tremor for KPI cards** – optional, not added
- ❌ **MUI X Date Range Picker** – optional, not added
- ❌ **Apply same ECharts theme across all chart components** – not audited
- ❌ **Standardize KPI card layout and typography** – partial

---

## Phase 6: Metric Provenance

### 6.1–6.2
- ✅ MetricProvenanceChip modal with formula, inputs
- ✅ "Explain with AI" when onExplain provided
- ✅ DATA_FLOW_LINEAGE in metric-provenance page

### 6.3
- ❌ **Document or script for "Where used"** – not done

---

## Phase 7: AI Integration

### 7.1–7.2
- ✅ onExplain, buildMetricExplainContext
- ✅ Briefing prompt asks for concrete actions

### 7.3
- ❌ **AI-assisted mapping suggestions** – no endpoint that calls AI with charge code/phase/task and returns proposed MPP task/phase

---

## Phase 8: Theme and Background

- ✅ Light theme border fixes
- ✅ No global * transition
- ✅ ambientFloat, staggered blobs, prefers-reduced-motion
- ✅ ambient-grid 56px
- ✅ PPM Background.png (user request)

---

## Phase 9: Documentation

### 9.1
- ✅ docs/README.md with architecture

### 9.2
- ❌ **docs/ARCHITECTURE.md** – not created
- ❌ **docs/MODULES.md** – not created
- ❌ **docs/ROUTES.md** – not created
- ❌ **docs/DATA_FLOW.md** – not created
- ❌ **docs/ROLES.md** – not created
- ❌ **Move/adapt content from root MD files** – not done

---

## Phase 10: Global Filters

### 10.1 Hierarchy Filter
- ✅ HierarchyFilter interface ID-based (portfolioId, projectId, etc.)
- ✅ getValidProjectIdsFromHierarchyFilter in filter-utils
- ✅ data-context uses it for filtering
- ✅ **Project-first UX: single searchable project combobox** – replaced 6 cascading dropdowns
- ✅ **Collapse Unit/Phase into "Advanced"** – done
- ⚠️ filter-utils has getValidProjectIdsFromHierarchyFilter but plan also specified `applyHierarchyFilter` – naming differs, behavior exists

### 10.2 Date Filter
- ✅ Fewer presets
- ✅ localStorage persist/restore
- ✅ getDateRangeFromFilter in filter-utils
- ❌ **MUI X Date Range Picker or better custom range** – still basic inputs

### 10.3
- ✅ **URL persistence (?project=, ?from=, ?to=)** – implemented; syncs hierarchy and date filters to URL; back/forward and shared links work

### 10.4
- ✅ **Pass projectId, from, to to /api/data for server-side filtering** – implemented; API and database filter by project and date range

---

## Summary: Not Implemented

| Area | Items |
|------|-------|
| **Phase 1** | Memoization: laborBreakdown, resourceGantt, sCurve, qualityHours |
| **Phase 2** | Project Lead/PCA server-side scope; COO hierarchy (manager_id, org-based); |
| **Phase 3** | Colocate role APIs; reduce nav to 3–5 items; merge overview/overview-v2; move root docs |
| **Phase 5** | ECharts theme consistency; full KPI standardization |
| **Phase 6** | Auto-mapping script for "Where used" |
| **Phase 7** | AI-assisted mapping suggestions endpoint |
| **Phase 9** | ARCHITECTURE.md, MODULES.md, ROUTES.md, DATA_FLOW.md, ROLES.md; move root docs |
| **Phase 10** | (all done) |

---

## Suggested Priority

1. **High impact:** Phase 10 HierarchyFilter combobox, URL persistence, server-side filter params
2. **Phase 2:** Project Lead/PCA scoping
3. **Phase 3:** Remove duplicate routes, consolidate overview, move root docs
4. **Phase 9:** Create docs/ARCHITECTURE.md, MODULES.md, etc.
5. **Phase 1:** Add memoization to remaining build* functions
6. **Phase 7:** AI mapping suggestions (if desired)
