# Role Layout + Data Utilization Audit (Deep Dive)
Date: 2026-02-27  
Scope: current role workstation implementation, role navigation, role-specific pages, and data usage paths.

## 1) Executive diagnosis
The app now has strong role coverage and working endpoints, but still feels fragmented because presentation and data composition are split across:
- role command centers,
- canonical legacy pages (`/insights/*`, `/project-controls/*`, `/project-management/*`),
- and many role sub-routes that are redirects.

The “page barely takes up space / weird layout” symptoms are primarily from:
1. **Conflicting global layout rules**: `.page-panel` is defined multiple times with different paddings/behavior.
2. **Heavy inline style grids with fixed column counts** on role pages (`gridTemplateColumns: 'repeat(4, ...)'`, `'1.2fr 1fr'`, hard pixel columns) that do not adapt smoothly.
3. **Mixed shell patterns**: some role pages use `RoleWorkstationShell`, some bypass it and build their own top header sections.
4. **Redirect-based IA**: users navigate into many routes that immediately redirect or point to hash anchors, which feels like split ownership.
5. **Inconsistent data loading patterns**: some pages rely on `useData(filteredData/fullData)`, others call APIs directly with varying role-header usage.

---

## 2) Baseline architecture (what exists right now)

## 2.1 Role IA source of truth
- `lib/role-navigation.ts` defines role presets and per-role header nav.
- Each role has `primary` links; Product Owner also has `tools`.
- `/role-views` redirects to the active role dashboard route.

## 2.2 Shared layout primitives
- `RoleWorkstationShell`:
  - top line (title),
  - main personalized greeting,
  - context strip,
  - optional actions bar,
  - tier-flag gate.
- `WorkstationLayout`:
  - split shell (`focus` + optional `aiPanel`),
  - currently most pages pass only `focus` (single-column effective layout).

## 2.3 Header shell
- Header contains logo, role-aware nav, filters (date/hierarchy), notification, profile.
- Product Owner additionally sees system status dropdown.
- Mobile nav exists (hamburger + panel).

---

## 3) Global layout and spacing issues (root causes in CSS/system)

## 3.1 Duplicate `.page-panel` definitions
`app/globals.css` defines `.page-panel` in multiple places:
- early definition: glass card, border, blur, box shadow, padding `0.5rem`.
- later definition: different padding and animation (`padding: 0.95rem`).
- mobile overrides: yet another padding adjustment.

Impact:
- inconsistent spacing across pages,
- unpredictable nesting visuals,
- “container inside container” feel,
- non-deterministic visual rhythm.

## 3.2 Dense fixed-width grids
Many role pages hardcode grids like:
- `repeat(4, minmax(0, 1fr))`,
- `1.2fr 1fr`,
- table rows with fixed pixel columns.

Impact:
- cramped cards on medium widths,
- excessive empty margins in some breakpoints,
- overflow pressure and visual imbalance.

## 3.3 Shell inconsistency
Some roles use `RoleWorkstationShell` + `WorkstationLayout`; others implement standalone top sections.

Impact:
- different vertical rhythm by role,
- different heading hierarchy,
- perceived fragmentation even when data is correct.

## 3.4 Redirect-heavy role routes
Large portion of `/role-views/*/*` are redirect wrappers to:
- command center anchors (`#...`),
- canonical pages,
- WBS/query lenses.

Impact:
- user mental model: “many pages, but some are fake pages,”
- harder discoverability,
- mixed expectations around where actions should happen.

---

## 4) Role-by-role layout anatomy and improvement opportunities

## 4.1 Product Owner
### Current header IA
- Command Center
- Overview
- Portfolio
- System Health
- Data Management
- All Tools dropdown (deep links)

### Current command center layout
Route: `/role-views/product-owner`
- `RoleWorkstationShell`
- KPI strip (6 cards)
- Data pipeline block (2x2)
- Open Features block (feedback-backed)
- Data Quality + Role Activity side-by-side
- Portfolio Pulse list
- Open Issues tabbed panel
- Quick action bar (workday/alerts/mapping)

### Data usage
- Single API: `/api/role-views/product-owner/summary`
- Good: central API composition.
- Gap: several metrics are still proxy/fallback style and not strict domain contracts.

### Layout/data improvements
- Move KPI strip to responsive `auto-fit` min cards; remove hard 6-column lock.
- Split page into:
  1) executive KPIs
  2) action queue
  3) system diagnostics
  with consistent block heights.
- Promote pipeline freshness SLA thresholds in backend (typed constants).
- Add drill-through from each KPI to offender rows (not just aggregate percentages).

---

## 4.2 PCL
### Current header IA
- Overview
- WBS Gantt
- Resourcing
- Project Plans
- Forecasting
- Data Management

### Current command center layout
Route: `/role-views/pcl`
- `RoleWorkstationShell` + `WorkstationLayout`
- top KPI strip (4 cards)
- provenance overlay
- two-column body:
  - `ComplianceMatrix`
  - Open Exceptions queue with actions (ack/escalate)

### Data usage
- `/api/compliance/matrix`
- `/api/alerts`
- mutation via `/api/alerts` patch/post

### Layout/data improvements
- Replace fixed 4-card strip with adaptive card grid.
- Move exception filters (severity/project/age) to top controls.
- Add “time-to-ack” and “repeat exception rate” metrics.
- Add persistent triage state (last sort/filter) per user.

---

## 4.3 PCA
### Current header IA
- Overview
- WBS Gantt
- Mapping
- Project Plans
- Sprint Planning
- QC Log
- Forecasting
- Data Management

### Current command center layout
Route: `/role-views/pca`
- `RoleWorkstationShell` + `WorkstationLayout`
- 3 summary cards (unmapped hours / overdue plans / data issues)
- Today’s queue list with link actions

### Data usage
- Mix of `useData()` + `/api/data-quality/issues`.
- Derives mapping/unmapped and overdue upload heuristics client-side.

### Layout/data improvements
- Move queue construction to API to avoid client-side inference drift.
- Expand queue to explicit categories:
  - parser publish failures
  - stale mappings
  - unmapped hour spikes by project.
- Add “only projects with plans” guard in mapping page feed itself.
- Consolidate PCA summary numbers with project-plans + mapping canonical APIs.

---

## 4.4 Project Lead
### Current header IA
- Project Health
- Tasks
- WBS Gantt
- Sprint Planning
- Forecasting

### Current command center layout
Route: `/role-views/project-lead`
- KPI cards from calc layer (SPI/CPI/IEAC/TCPI etc)
- PeriodEfficiencyBanner
- Execution snapshot + overdue queue
- embedded textual placeholders for week-ahead/documents/report roll-ins

### Secondary PL health page
Route: `/role-views/project-lead/project-health`
- KPI strip + phase health table + `RoleScopedWbsWorkspace`

### Data usage
- Mostly `useData()` with local calculations.
- Good use of shared KPI functions.
- Gaps:
  - some workflow blocks still informational placeholders.
  - action completion state not always persisted in role-native view.

### Layout/data improvements
- Convert placeholder text blocks into actionable compact modules:
  - “Pending report draft”
  - “Documents requiring signoff”
  - “Week-ahead commitments”.
- Add project-selector pinned bar (if user has multi-project scope).
- Normalize queue priority scoring in shared selector (not local mapping).

---

## 4.5 Senior Manager
### Current header IA
- Overview
- Portfolio Health
- WBS Gantt
- Forecasting

### Current command center layout
Route: `/role-views/senior-manager`
- custom page panel (does not use `RoleWorkstationShell`)
- KPI grid + escalation queue + alerts list + client health grid

### Secondary page
Route: `/role-views/senior-manager/portfolio-health`
- `RoleWorkstationShell` with project risk table + milestone rollup

### Data usage
- Mix of `useData()` local aggregates and `/api/alerts`.
- Portfolio health logic duplicated in-page vs secondary page.

### Layout/data improvements
- Use `RoleWorkstationShell` consistently on SM home.
- De-duplicate risk scoring in shared selector (`lib/calculations/selectors`).
- Add trend lines for risk changes by period (not only snapshot).
- Add explicit owner/action columns for escalations.

---

## 4.6 COO
### Current header IA
- Overviews
- Mo’s Page
- WBS Gantt
- Commitments

### Current command center layout
Route: `/role-views/coo`
- custom panel + KPI strip + PeriodEfficiencyBanner + top movers table

### Commitments page
Route: `/role-views/coo/commitments`
- full review table with status actions and executive notes.

### Data usage
- home uses `useData()` + live fetch to alerts/commitments
- commitments page fetches and mutates `/api/commitments`

### Layout/data improvements
- Convert COO home to shared shell for consistency.
- Merge commitment urgency counters with same source as commitments table (single selector).
- Add decision aging metrics:
  - submitted > 48h,
  - escalated unresolved.

---

## 4.7 RDA
### Current header IA
- Tasks
- Hours
- Sprint Planning

### Current command center layout
Route: `/role-views/rda`
- shell + short card grid of open tasks (`RDATaskCard`)

### Canonical role pages
- `/role-views/rda/tasks`: task table with due/action links
- `/role-views/rda/hours`: hours table + summary
- legacy `/rda/work` and `/rda/schedule` redirect to tasks.

### Data usage
- entirely from `useData()` currently; no dedicated API for user-specific pre-joined lanes.

### Layout/data improvements
- Create true “my workload” API scoped to authenticated employee.
- Add quick inline actions:
  - update progress,
  - add hours,
  - flag blocker.
- Add daily planned-vs-entered gauge for pacing.

---

## 4.8 Client Portal
### Current header IA
- WBS Gantt
- Progress
- Updates
- Milestones

### Current layout
- command center with 4 route cards.
- each page has project selector + simple block/table.
- WBS page uses `RoleScopedWbsWorkspace role="client_portal"`.

### Data usage
- shared selector `useClientPortalScope()` from `useData()`.
- applies visibility constraints (`is_client_visible`, limited doc statuses).

### Layout/data improvements
- move client-scope selectors server-side to avoid overfetch in browser.
- add explicit “last updated” and “data as-of” stamps on all client pages.
- add “no visibility configured” CTA for milestone/doc admins.

---

## 5) Fragmentation map (where UX still feels split)

## 5.1 Redirect-only mini routes
Multiple role subroutes immediately redirect (PCL/PCA/PL/SM/RDA/COO legacy paths).  
This preserves compatibility but keeps cognitive clutter.

### Improvement
- Keep compatibility routes, but hide from user-facing IA entirely and mark as “legacy alias.”
- Introduce route deprecation doc and telemetry for residual traffic.

## 5.2 Anchor-link workarounds
Several flows navigate to hash anchors in consolidated pages.

### Improvement
- Replace hash jumps with explicit in-page segmented tabs / section state.
- Preserve URL query param (`?section=exceptions`) for stable deep links.

## 5.3 Role page vs canonical page split
Some workflows are role-native, others open canonical pages with different visual context.

### Improvement
- Build shared “canonical surface components” and embed them role-first.
- Canonical pages become power-user views, not required for normal role workflow.

---

## 6) Data usage audit (how data is currently consumed)

## 6.1 Data patterns in use
1. **Context-first**: pages use `useData()` and local `useMemo` aggregation.
2. **API-first**: pages fetch role endpoints directly.
3. **Hybrid**: mix context + API (common in command centers).

## 6.2 Current strengths
- Shared `DataProvider` with role + hierarchy/date filters.
- Employee-name hydration reduces ID-heavy displays.
- Role badges centralized in `lib/role-ui-data.ts`.

## 6.3 Current risks
1. **Metric drift risk**: same KPI concept calculated differently across pages.
2. **Scope inconsistency risk**: some API calls pass role headers, some rely on default.
3. **Client overcompute**: heavy rollups done repeatedly in page components.
4. **Freshness ambiguity**: many cards show values with no “as of” timestamp.
5. **Fallback metric quality**: some PO summary metrics still placeholders/proxies.

## 6.4 Data enhancement opportunities (high value)
1. Build **Role Data Composition APIs** per command center:
   - one payload, one scope, one freshness stamp.
2. Add **metric contracts**:
   - each KPI has id, formula id, sources, null semantics, units.
3. Add **cache + revalidate policy** per endpoint:
   - command center fast cache (15-60s),
   - mutation-triggered revalidate.
4. Add **offender drill-down contract** for every aggregate:
   - each % card has row-level API.
5. Add **role-scoped data quality scorecards**:
   - coverage, stale records, orphan links, missing assignments.

---

## 7) Concrete layout refactor plan (to fix “small/weird pages”)

## Phase A: Shell normalization
1. Keep one canonical `.page-panel` definition.
2. Introduce spacing tokens for role pages:
   - `--workspace-gap-sm/md/lg`
   - `--workspace-max-width`.
3. Remove duplicate padding/animation overrides for `.page-panel`.
4. Standardize all role homes on:
   - `RoleWorkstationShell`
   - `WorkstationLayout`.

## Phase B: Grid responsiveness
1. Replace hard fixed grids with:
   - `repeat(auto-fit, minmax(220px, 1fr))` for KPI cards.
2. Replace pixel-based table grids where possible with responsive row templates.
3. Add section max-heights only where needed; avoid nested scroll regions by default.

## Phase C: Interaction consistency
1. Convert hash-link action bars into segmented controls with local state.
2. Give each section a standard header row:
   - title
   - status chip
   - refresh/action button group.
3. Add empty/loading/error skeleton standards for all role blocks.

---

## 8) Data utilization optimization plan (role UX + correctness)

## Phase D: KPI contract unification
1. Every displayed KPI maps to:
   - `metricId`
   - `formulaId`
   - source tables
   - recompute timestamp.
2. Drive both UI value + provenance from same payload.

## Phase E: Role-focused operational datasets
1. PCL:
   - exception aging buckets,
   - duplicate issue clustering,
   - ack/escalation SLA compliance.
2. PCA:
   - mapping backlog by project/phase,
   - parser publish failures and recoverability.
3. PL:
   - commitment due-state and pending approvals,
   - schedule risk by phase with intervention hints.
4. SM/COO:
   - decision queue aging and trend deltas.
5. RDA:
   - personalized work lane with assigned scope only and fast write actions.

## Phase F: Observability
1. Add per-page data load diagnostics:
   - fetch source,
   - latency,
   - stale/fresh status.
2. Log role-route payload sizes and render timings.
3. Detect and report KPI drift between pages.

---

## 9) Highest-priority fixes (ordered)
1. **Unify `.page-panel` CSS and remove duplicate declarations** (immediate visual stability gain).
2. **Convert role homes to one shell pattern** (consistency and spacing).
3. **Eliminate hard fixed KPI grid counts** (responsive fit and better space use).
4. **Replace redirect/anchor UX with explicit section-state navigation**.
5. **Centralize role command-center datasets in role APIs** to reduce local drift.
6. **Attach “as-of” timestamps and offender drill-through to all KPIs**.

---

## 10) Success criteria for the next pass
1. Every role landing fills available canvas cleanly at desktop/tablet/mobile.
2. No conflicting container spacing rules in global CSS.
3. No user-facing flow depends on redirect aliases.
4. Each major KPI has one formula source and one data source contract.
5. Users can move from aggregate metric to row-level evidence in one click.
6. Data freshness is visible on all command center sections.

