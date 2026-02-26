# Role Workstation Page Section Report

## Purpose
This report describes each current route in `app/role-views/**/page.tsx`, what each section on the page does, and how users act on it.

Last updated: 2026-02-26

---

## Global layout conventions
Most role routes use `RoleWorkstationShell` with a consistent structure:
1. Workstation header (title + operational subtitle)
2. Role context strip (active role scope + role-native orientation)
3. Optional action links/action bar
4. KPI and workflow panels
5. Role-scoped data tables/queues/workspaces

---

## Entry route

### `/role-views`
1. Redirect controller to active role home from role lens context.

---

## PCA workstation

### `/role-views/pca`
1. Header + role-native links
2. `RoleWorkflowActionBar` shortcuts for upload/parser, mapping, data-quality, WBS
3. Today's operational queue summary (upload/publish/mapping focus)

### `/role-views/pca/plan-uploads`
1. Scope KPI cards (projects, with-plan, missing, overdue)
2. Freshness table by project:
- project/customer
- last upload date + days since
- task count
- upload health status
3. Direct links to parser, mapping, data-quality

### `/role-views/pca/mapping`
1. Mapping workload KPIs
2. Mapping queue table and action links
3. Oversight summary (coverage/staleness focus)

### `/role-views/pca/data-quality`
1. Issue KPI strip and severity filters
2. Issue board with trend context
3. Action links from issue -> mapping/WBS correction paths

### `/role-views/pca/wbs`
1. Quick KPIs for assigned schedule risk
2. `RoleScopedWbsWorkspace` with PCA capability gates

### `/role-views/pca-workspace`
1. Redirect-only alias -> `/role-views/pca/mapping`

---

## PCL workstation

### `/role-views/pcl`
1. Command center KPIs
2. Compliance matrix snapshot
3. Drill links to exceptions/plans-mapping/WBS

### `/role-views/pcl/schedule-health`
1. KPI cards (open/overdue/dependency-linked workload)
2. Schedule health table for triage priorities

### `/role-views/pcl/plans-mapping`
1. Portfolio mapping oversight KPIs
2. Coverage/unmapped/stale indicators by project
3. Governance links for PCA + plans paths

### `/role-views/pcl/resourcing`
1. Utilization outlier KPIs
2. Resource pressure/resourcing summary table

### `/role-views/pcl/exceptions`
1. Exception queue filters
2. Bulk + row actions (ack/escalate/resolve)
3. Trend + severity visibility for triage

### `/role-views/pcl/wbs`
1. Cross-project risk queue above schedule view
2. `RoleScopedWbsWorkspace` for scoped intervention controls

### `/role-views/pcl-exceptions`
1. Redirect-only alias -> `/role-views/pcl/exceptions`

---

## Project Lead workstation

### `/role-views/project-lead`
1. KPI cards with provenance chips (health/SPI/CPI/variance/forecast pressure)
2. Execution snapshot section
3. Overdue and milestone action list

### `/role-views/project-lead/schedule`
1. Phase-level schedule rollups
2. Critical-path and overdue task table
3. Links to week-ahead and WBS operations

### `/role-views/project-lead/team`
1. Team workload/utilization summary
2. Assignment pressure signals

### `/role-views/project-lead/week-ahead`
1. KPI summary for next operating window
2. `WeekAheadBoard` with action links for due/overdue/upcoming work

### `/role-views/project-lead/forecast`
1. Scenario controls and variance surfacing
2. Plan-vs-forecast visualization (`PlanVsForecastActualSCurve`)
3. Top-variance task list

### `/role-views/project-lead/documents`
1. Document workflow KPIs by status
2. Operational records table and action links

### `/role-views/project-lead/report`
1. Commitment authoring + period controls
2. Lock-state visibility + override behavior
3. Historical commitment cards and status actions

---

## Senior Manager workstation

### `/role-views/senior-manager`
1. Portfolio KPI strip (health/SPI/CPI/variance/alert pressure)
2. Escalation queue panel (risk-scored project rows)
3. Open alerts panel
4. `ClientHealthGrid` portfolio comparator

### `/role-views/senior-manager/projects`
1. Operational portfolio project table
2. At-risk/high-variance drill visibility

### `/role-views/senior-manager/milestones`
1. Filterable milestone triage (`all/overdue/upcoming`)
2. Milestone scoreboard + timing status

### `/role-views/senior-manager/documents`
1. Document status pane across portfolio scope
2. Pending-signoff and escalation signals

### `/role-views/senior-manager/commitments`
1. Commitments table with status filters
2. Review/escalate/approve workflow actions

### `/role-views/senior-manager/wbs`
1. Portfolio-scoped `RoleScopedWbsWorkspace` (read/annotate/escalate)

---

## COO workstation

### `/role-views/coo`
1. Executive KPI strip + decision pressure counters
2. Summary links to period review/milestones/commitments/AI

### `/role-views/coo/period-review`
1. Period rollup table (portfolio/project view)
2. Scope and trend context for executive period checks

### `/role-views/coo/milestones`
1. Milestone filter set (`all/overdue/upcoming/at_risk`)
2. KPI strip + scoreboard triage

### `/role-views/coo/commitments`
1. Executive commitment decision queue
2. Decision actions with audit trail behavior

### `/role-views/coo/ai`
1. `AIBriefingChat` with presets and history context
2. OpenAI-backed Q&A for scoped role period data

### `/role-views/coo/wbs`
1. Executive schedule lens using `RoleScopedWbsWorkspace`

---

## RDA workstation

### `/role-views/rda`
1. Task card lane for open work
2. Quick orientation to hours/work/schedule subroutes

### `/role-views/rda/hours`
1. Personal hours lane + anomaly indicators
2. Table focused on corrective actions

### `/role-views/rda/work`
1. Action-ready task queue
2. Open task/priority focus for individual execution

### `/role-views/rda/schedule`
1. Limited-capability schedule lane via `RoleScopedWbsWorkspace`

---

## Client portal

### `/role-views/client-portal`
1. Client-safe KPI strip (external wording)
2. Client-visible milestones only (`is_client_visible` enforcement)
3. Latest client-eligible documents/status panel
4. Open delivery items summary

---

## Data + permission behavior
1. Role-lens scoping comes from global role context + data selectors.
2. Mutation actions are gated in both UI and API by workflow permissions.
3. Major KPI surfaces include provenance chips/metadata where available.
4. Role WBS routes are shells over shared WBS engine capabilities, not forks.
