# Current Pages and Role Navigation Report

Last updated: 2026-02-26

## Purpose
This document inventories the current application pages, summarizes what each page contains, and maps role-specific navigation paths.

It also highlights a critical structural issue: **header navigation and workstation navigation are currently redundant** and can confuse users.

---

## Routing and Landing Behavior
1. Root `/` redirects to `/role-views`.
2. `/role-views` redirects to the active role preset dashboard route.
3. Active role preset landing routes:
- Product Owner: `/role-views/product-owner`
- PCL: `/role-views/pcl`
- PCA: `/role-views/pca`
- Project Lead: `/role-views/project-lead`
- Senior Manager: `/role-views/senior-manager`
- COO: `/role-views/coo`
- RDA: `/role-views/rda`
- Client Portal: `/role-views/client-portal`

---

## Global Page Inventory (non-role-workstation)

### Core entry/help/feedback
- `/`:
  - Role-aware redirect entrypoint.
- `/help` and `/help/[pageId]`:
  - Help docs and page-specific guidance.
- `/feedback`:
  - User feedback capture.

### Insights
- `/insights/overview` and `/insights/overview-v2`:
  - Portfolio/project KPI dashboards and analysis surfaces.
- `/insights/tasks`:
  - Task-level analytics and queue views.
- `/insights/hours`:
  - Hours trends and labor views.
- `/insights/mos-page`:
  - Mo’s operational insights view.
- `/insights/milestones`:
  - Milestone tracking and status.
- `/insights/documents`:
  - Documentation analytics/status.
- `/insights/metric-provenance`:
  - Formula/source provenance visibility.
- `/insights/qc-dashboard`:
  - Quality control reporting.
- `/insights/snapshots-variance`:
  - Snapshot variance analysis.

### Project controls
- `/project-controls/data-management`:
  - Data CRUD, sync, and administrative controls.
- `/project-controls/project-plans`:
  - Full MPP upload/parser/process engine.
- `/project-controls/wbs-gantt` and `/project-controls/wbs-gantt-v2`:
  - Canonical WBS/Gantt editing and schedule operations.
- `/project-controls/resourcing`:
  - Staffing/capacity workspace.
- `/project-controls/resource-leveling`:
  - Resource leveling tools.
- `/project-controls/folders`:
  - Project folders and file management operations.
- `/project-controls/project-health` and `/project-controls/health-report`:
  - Health diagnostics and reporting.

### Project management
- `/project-management/forecast`:
  - Forecasting workspace.
- `/project-management/documentation`:
  - Document operations workspace.
- `/project-management/qc-log`:
  - QC logging flow.
- `/project-management/backlog`:
  - Backlog management.
- `/project-management/boards`:
  - Board-style planning view.
- `/project-management/sprint`, `/sprint/capacity`, `/sprint/iterations`:
  - Sprint planning/capacity/iteration management.

---

## Role Workstation Inventory

## Product Owner
### Landing: `/role-views/product-owner`
Content:
1. Command-center KPI cards (open issues, critical issues, open features, people count).
2. Open issues queue from alerts.
3. Open features queue from tasks.
4. Role distribution and people/role table.
5. Quick links to all role command centers and Data Management.

Workstation nav (`ROLE_NAV_CONFIG`):
1. Command Center
2. PCL
3. PCA
4. Project Lead
5. Senior Manager
6. COO
7. RDA

Header nav (Product Owner mode):
1. Command (all command centers)
2. Project Controls
3. Insights
4. Project Management

## PCL
### Landing: `/role-views/pcl`
Content:
1. Command-center KPI strip.
2. Compliance matrix.
3. Embedded open exceptions queue with acknowledge/escalate actions.
4. Action bar to exceptions, plans/mapping, resourcing, WBS.

Additional pages:
1. `/role-views/pcl/schedule-health`: schedule KPI + health table.
2. `/role-views/pcl/plans-mapping`: plans/mapping oversight.
3. `/role-views/pcl/resourcing`: utilization outlier lane.
4. `/role-views/pcl/exceptions`: full exceptions triage queue.
5. `/role-views/pcl/wbs`: risk queue + role-scoped WBS workspace.

## PCA
### Landing: `/role-views/pca`
Content:
1. Queue KPI strip (unmapped hours, overdue plans, data issues).
2. Today’s priority queue with action links.
3. Workflow action bar.

Additional pages:
1. `/role-views/pca/mapping`: mapping operations workspace.
2. `/role-views/pca/plan-uploads`: in-route upload/parser/publish + version history.
3. `/role-views/pca/data-quality`: issue board + trend/filtering.
4. `/role-views/pca/wbs`: role-scoped WBS editing surface.
5. `/role-views/pca-workspace`: redirect alias to mapping.

## Project Lead
### Landing: `/role-views/project-lead`
Content:
1. Execution KPI cards and period efficiency.
2. Overdue queue and milestone/execution snapshot.
3. Quick links to schedule/forecast/documents/report.

Additional pages:
1. `/role-views/project-lead/schedule`: phase health, critical path, efficiency, embedded WBS.
2. `/role-views/project-lead/team`: team workload/utilization view.
3. `/role-views/project-lead/week-ahead`: week-ahead action board.
4. `/role-views/project-lead/forecast`: forecast operations and variance surfacing.
5. `/role-views/project-lead/documents`: operational doc status/signoff updates.
6. `/role-views/project-lead/report`: commitment/report authoring and lock-window workflow.

## Senior Manager
### Landing: `/role-views/senior-manager`
Content:
1. Portfolio KPI strip.
2. Escalation queue.
3. Open alerts panel.
4. Client health grid.

Additional pages:
1. `/role-views/senior-manager/projects`: project-level portfolio operations.
2. `/role-views/senior-manager/milestones`: milestone triage/filters.
3. `/role-views/senior-manager/commitments`: review/escalation/approval flow.
4. `/role-views/senior-manager/documents`: document status and signoff pane.
5. `/role-views/senior-manager/wbs`: portfolio WBS lens.

## COO
### Landing: `/role-views/coo`
Content:
1. Executive KPI strip.
2. Decision pressure counters.
3. AI-style Q&A narrative panel and top movers.

Additional pages:
1. `/role-views/coo/period-review`: period rollup and review.
2. `/role-views/coo/milestones`: milestone risk filters.
3. `/role-views/coo/commitments`: executive decision queue/actions.
4. `/role-views/coo/ai`: AI briefing chat page.
5. `/role-views/coo/wbs`: executive WBS lens.

## RDA
### Landing: `/role-views/rda`
Content:
1. Personal task cards and execution lane orientation.

Additional pages:
1. `/role-views/rda/hours`: personal hours lane.
2. `/role-views/rda/work`: task queue.
3. `/role-views/rda/schedule`: limited role-scoped schedule lane.

## Client Portal
### Landing: `/role-views/client-portal`
Content:
1. Client-safe KPI view.
2. Client-visible milestones/documents only.
3. Delivery/open-item visibility.

---

## Role Navigation Mapping (Current)

Each role currently has two parallel nav layers on workstation pages:
1. Global header nav (role-aware dropdowns).
2. In-page workstation chip nav (`RoleWorkstationShell` from `ROLE_NAV_CONFIG`).

Both often point to the same role routes.

---

## CRITICAL ISSUE: Header Nav and Workstation Nav Are Redundant

## What is happening
1. On a workstation page, users see role-specific links in the header.
2. They also see nearly the same links again in the workstation chip bar.
3. Product Owner additionally sees broad app-level nav plus command links, increasing overlap.

## Why this is a problem
1. Cognitive overhead: users decide between two equivalent nav systems.
2. Visual noise: duplicate route sets reduce clarity of primary actions.
3. Inconsistent intent: header feels global, workstation chips feel local, but they overlap heavily.
4. Higher maintenance: nav changes must be kept synchronized in multiple places.

## Recommended resolution (next optimization)
1. Choose a single primary nav per context:
- Option A: keep header global, simplify/remove workstation chips.
- Option B: keep workstation chips as primary in role routes, minimize header role links.
2. Keep only one source-of-truth config for role route links.
3. Use the secondary nav only for cross-domain jumps (for example, to canonical engines like WBS/Data Management), not for duplicate role route links.
4. Add UX rule: “one page, one primary navigation model.”

---

## Canonical Redirects and Aliases
1. `/role-views/pca-workspace` -> `/role-views/pca/mapping`
2. `/role-views/pcl-exceptions` -> `/role-views/pcl/exceptions`
3. `/role-views` -> active role preset dashboard route

---

## Notes
1. Role toolbar is intentionally Product Owner-only.
2. Role landing behavior is command-center-first for each role.
3. Workstation routes are functional operational surfaces layered over shared engines.
