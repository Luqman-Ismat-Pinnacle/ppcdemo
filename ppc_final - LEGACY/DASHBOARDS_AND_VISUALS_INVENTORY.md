# Dashboards and Visuals Inventory (Current State)

## Purpose
This document inventories all current dashboard and visual experiences in the PPC web app, grouped by functional area. It reflects what is implemented in the codebase as of this revision, including role-based views and shared visualization components.

## Legend
- KPI with provenance: metric cards/values wired to `MetricProvenanceChip` and shared calculation layer.
- Interactive chart: visual supports click/filter/drill interactions.
- Data table/grid: tabular or board-style operational view.

---

## 1) Insights Dashboards

### `/insights/overview` and `/insights/overview-v2`
- Purpose: executive/portfolio monitoring with cross-domain performance signals.
- Core visuals:
  - KPI cards (health, variance, completion) with provenance chips.
  - Operational Sankey (charge/role/person modes) (interactive).
  - Risk scatter / bubble style risk matrix (interactive).
  - Trend/time-series views (hours/progress trajectory).
  - Dependency friction visual panel.
  - Portfolio performance bars and rollups.
- Interaction model:
  - Click-to-drill from charts into project context.
  - Cross-filter behavior between major visuals.

### `/insights/tasks`
- Purpose: task execution efficiency, risk, and workload movement.
- Core visuals:
  - KPI strip with efficiency metric provenance.
  - Cross-filter bar (active filter chips).
  - Task risk/scatter views (interactive).
  - Distribution and trend charts for task performance.
  - Task-level detailed table sections.

### `/insights/hours`
- Purpose: labor, charge code, and role-level hours intelligence.
- Core visuals:
  - KPI cards with provenance-enabled metrics.
  - Insights filter bar (Power BI-style interactions).
  - Non-execute pie chart.
  - Labor breakdown visuals by role/project/charge.
  - Stacked and trend views for weekly/monthly hour flow.
  - Detailed labor tables (role and worker slices).

### `/insights/mos-page`
- Purpose: management operating system (Mo's Page) performance and operational trend dashboard.
- Core visuals:
  - KPI cards with provenance chips.
  - Milestone bucket charting (interactive).
  - Period variance chart with provenance.
  - Task breakdown and charge-code drill charts.
  - Non-execute/QC stacked distribution visualizations.

### `/insights/qc-dashboard`
- Purpose: quality-control throughput and defect/performance monitoring.
- Core visuals:
  - QC transaction bar charts (by gate/project).
  - QC stacked bars and hours bars.
  - QC feedback time charts.
  - QC pass-rate line chart.
  - QC distribution visual blocks and detailed QC table.
- Interaction model:
  - Bar/point click handlers drive scoped filters.

### `/insights/milestones`
- Purpose: milestone status distribution and milestone detail monitoring.
- Core visuals:
  - Milestone status pie chart.
  - Filter bar and detailed milestone matrix/table.

### `/insights/documents`
- Purpose: deliverable and document status visibility.
- Core visuals:
  - Deliverable status pie chart(s).
  - Percent/status cards by document families.
  - Detailed deliverable matrix.

### `/insights/metric-provenance`
- Purpose: canonical formula/source map for KPI provenance.
- Core visuals:
  - Registry-style metric reference page for formulas/data sources.

### `/insights/snapshots-variance`
- Purpose: snapshot-variance entry/redirect workflow (minimal visual surface currently).

---

## 2) Project Controls Dashboards

### `/project-controls/wbs-gantt` and `/project-controls/wbs-gantt-v2`
- Purpose: schedule control and WBS execution timeline management.
- Core visuals:
  - Custom WBS + Gantt canvas/timeline rendering.
  - Task bars, float/critical indicators, dependency lines/arrows.
  - Tooltip overlays and row/column contextual controls.
  - Header menu/filter interactions and timeline markers.

### `/project-controls/resourcing`
- Purpose: capacity planning, org-level staffing, utilization and assignment operations.
- Core visuals:
  - Organization tree visualization (interactive).
  - Scorecards including provenance-enabled utilization metric.
  - Employee utilization chart (interactive).
  - Capacity vs demand chart.
  - Utilization distribution pie.
  - Role utilization and FTE requirement panels.
  - Resource heatmap (week/month/quarter modes).
  - Assignment analytics panels (top reassignments, source mix, recent changes, top projects).
- Data operations:
  - Task assignment actions.
  - 30-day assignment summary/insight API coupling.

### `/project-controls/data-management`
- Purpose: central data admin and table-level governance.
- Core visuals:
  - Multi-table management UI.
  - Editable grids and import controls.
  - Column filters/sorting/search.
  - Computed field lineage section.
  - Snapshot controls.
- Not a chart-heavy dashboard, but a critical operational visual/data control surface.

### `/project-controls/project-plans` and `/project-controls/folders`
- Purpose: project-plan/document orchestration and mapping workflows.
- Core visuals:
  - Plan/file operational panels.
  - Mapping suggestions operational tables, stats, and action controls.
  - Workflow shortcuts into WBS/resourcing contexts.

### `/project-controls/project-health`
- Purpose: project health scoring and approval workflow.
- Core visuals:
  - Health KPI and checks with provenance chip.
  - Approval stage workflow/status panel.
  - Checklists and exception tracking sections.

### `/project-controls/health-report`
- Purpose: health report summary surface (lighter display page).

### `/project-controls/resource-leveling`
- Purpose: dedicated entry route for resource-leveling workflow (minimal standalone visual surface currently).

---

## 3) Project Management Dashboards

### `/project-management/forecast`
- Purpose: forecast, EV/cost posture, and financial trend analysis.
- Core visuals:
  - KPI row with provenance on key calculations (e.g., IEAC/TCPI-related areas).
  - Gauge visuals (margin/performance style).
  - Monthly trend charts.
  - Cost breakdown charts.
  - Forecast trajectory and variance visuals.
  - Detailed forecast tables and metric panels.

### `/project-management/sprint`
- Purpose: sprint planning and delivery tracking.
- Core visuals:
  - Sprint progress visuals and health indicators.
  - Task distribution chart.
  - Team workload chart.
  - Supporting board/list operational sections.

### `/project-management/sprint/capacity`
- Purpose: sprint capacity distribution by team role/person.
- Core visuals:
  - Capacity and role allocation tables/charts.

### `/project-management/sprint/iterations`
- Purpose: iteration-level sprint view (light page, operational focus).

### `/project-management/boards` and `/project-management/backlog`
- Purpose: kanban/backlog operational execution surfaces.
- Core visuals:
  - Board/list management UI, status movement/progress indicators.

### `/project-management/qc-log`
- Purpose: QC event and defect log analytics.
- Core visuals:
  - Defect pie chart.
  - QC status bar chart.
  - QC trend/time visuals.
  - QC detail table sections.

### `/project-management/documentation`
- Purpose: project documentation workflow and record management.
- Core visuals:
  - Document records table and metadata editing blocks.
  - Version/download action surfaces.

---

## 4) Role Views (Phase 7)

### `/role-views` (hub)
- Purpose: role dashboard index and switching entry.
- Core visuals: role cards with state labels.

### `/role-views/project-lead`
- Purpose: project lead execution control dashboard.
- Core visuals:
  - KPI cards with provenance: Health, SPI, CPI, Hours Variance, IEAC, TCPI.
  - Execution snapshot cards.
  - Overdue task queue.

### `/role-views/pca-workspace`
- Purpose: PCA mapping operations.
- Core visuals:
  - Suggestion stats cards.
  - Mapping suggestion operational table with status/confidence filters.
  - Apply/dismiss/batch actions.

### `/role-views/pcl-exceptions`
- Purpose: exception management for PCL.
- Core visuals:
  - Alert/exception list table.
  - Severity/status filtering.
  - Acknowledge/resolve action controls.

### `/role-views/senior-manager`
- Purpose: senior manager portfolio posture dashboard.
- Core visuals:
  - KPI cards with provenance (Health/SPI/CPI/Variance).
  - Escalation queue table.
  - Open alerts panel.

### `/role-views/coo`
- Purpose: COO dashboard + AI-style Q&A narrative assistant.
- Core visuals:
  - Executive KPI cards with provenance.
  - Q&A input and generated response panel.
  - Top project movers table.

### `/role-views/client-portal`
- Purpose: client-facing project status lens.
- Core visuals:
  - Project selector.
  - KPI cards with provenance.
  - Open delivery items panel.
  - Latest documents panel.

---

## 5) Global Visual Systems

### Global floating controls
- Help + Feedback floating buttons.
- Role View switcher (toolbar-style, expandable, app-wide role lens simulation).

### Header-level visuals
- Main navigation dropdowns.
- Date/hierarchy filters.
- Notifications bell with role-aware/all-scope behavior for full-access users.
- User profile + theme toggle.

### Theming/background system
- Layered atmosphere background.
- Theme-safe overlays and card contrast handling.
- Light/dark visual variables and transitions.

---

## 6) Shared Chart Component Catalog

Current reusable chart modules in `components/charts/` include:
- `BudgetVarianceChart`
- `DeliverableStatusPie`
- `ForecastChart`
- `GaugeChart`
- `HoursWaterfallChart`
- `LaborBreakdownChart`
- `MilestoneStatusPie`
- `NonExecutePieChart`
- `PercentCompleteDonut`
- `PlanForecastActualChart`
- `QCFeedbackTimeBarChart`
- `QCFeedbackTimeMonthlyChart`
- `QCHoursBarChart`
- `QCOutcomesStackedChart`
- `QCPassFailStackedChart`
- `QCPassRateLineChart`
- `QCScatterChart`
- `QCStackedBarChart`
- `QCTransactionBarChart`
- `QualityHoursChart`
- `ResourceGanttChart`
- `ResourceHeatmapChart`
- `ResourceLevelingChart`
- `SCurveChart`
- `SprintBurndownChart`
- `TaskHoursEfficiencyChart`
- `TrendChart`
- `VelocityChart`
- `WBSGanttChart`
- `EChartsGantt`
- `ChartWrapper` (base renderer for ECharts-driven visuals)

---

## 7) Notes on Provenance Coverage
- Provenance chips are actively used in key KPI surfaces across:
  - Overview / Overview-v2
  - Forecast
  - Tasks (selected metrics)
  - Project Health
  - Resourcing (utilization KPI)
  - Role views (Project Lead, Senior Manager, COO, Client Portal)
- Formula registry/source references are documented in the metric provenance route and shared calculation modules.

---

## 8) Suggested Next Documentation Enhancements
1. Add a screenshot atlas per dashboard section (desktop + mobile).
2. Add a per-visual schema map: inputs, transforms, and API dependencies.
3. Add a "critical visuals" SLA list (owner, refresh cadence, validation tests).
