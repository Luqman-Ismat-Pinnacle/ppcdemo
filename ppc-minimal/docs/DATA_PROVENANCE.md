# Data Provenance — PPC Minimal

This document tracks the origin and calculation method for all metrics in the minimal schema.

## Sources

| Source   | Tables Written                                                | Method                                    |
| -------- | ------------------------------------------------------------- | ----------------------------------------- |
| Workday  | employees, portfolios, customers, sites, projects, hour_entries, customer_contracts | `POST /api/ingest/workday` with type param |
| MPP      | units, phases, tasks, sub_tasks                               | `POST /api/ingest/mpp` (parser → mapper)  |
| UI       | sprints, sprint_tasks, project_documents (metadata)           | Created/edited via PCA pages              |

## Rollup Fields

All rollup fields exist on: `portfolios`, `customers`, `sites`, `projects`, `units`, `phases`, `tasks`, `sub_tasks`.

| Field             | Leaf Calculation                                          | Roll-Up (parent)      | Source      |
| ----------------- | --------------------------------------------------------- | --------------------- | ----------- |
| `actual_hours`    | Direct from MPP or Workday ingestion                      | SUM of children       | MPP/Workday |
| `remaining_hours` | Direct from ingestion                                     | SUM of children       | MPP/Workday |
| `total_hours`     | `actual_hours + remaining_hours`                          | SUM of children       | Derived     |
| `baseline_hours`  | Direct from MPP baseline                                  | SUM of children       | MPP         |
| `actual_cost`     | Direct from Workday or ingestion                          | SUM of children       | Workday     |
| `remaining_cost`  | Direct from ingestion                                     | SUM of children       | Workday     |
| `scheduled_cost`  | `actual_cost + remaining_cost`                            | SUM of children       | Derived     |
| `projected_hours` | Direct from MPP                                           | SUM of children       | MPP         |
| `days`            | `baseline_end - baseline_start` (date diff)               | Recomputed from dates | Derived     |
| `tf`              | Total float from MPP `totalSlack`                         | SUM of children       | MPP         |
| `percent_complete`| `actual_hours / NULLIF(total_hours, 0) * 100`             | Recomputed from sums  | Derived     |
| `progress`        | From MPP `percentComplete` at leaf                        | AVG of children       | MPP         |
| `baseline_start`  | From MPP/Workday                                          | MIN of children       | MPP/Workday |
| `baseline_end`    | From MPP/Workday                                          | MAX of children       | MPP/Workday |
| `actual_start`    | From MPP/Workday                                          | MIN of children       | MPP/Workday |
| `actual_end`      | From MPP/Workday                                          | MAX of children       | MPP/Workday |

## Schedule Fields (units/phases/tasks/sub_tasks only)

| Field               | Origin | Description                                    |
| ------------------- | ------ | ---------------------------------------------- |
| `is_critical`       | MPP    | On the critical path                           |
| `is_milestone`      | MPP    | Zero-duration milestone                        |
| `is_summary`        | MPP    | Summary/parent task                            |
| `outline_level`     | MPP    | Hierarchy depth (2=unit, 3=phase, 4=task, 5+=sub) |
| `total_float`       | MPP    | Slack in workdays                              |
| `resources`         | MPP    | Assigned resource name(s)                      |
| `constraint_date`   | MPP    | Schedule constraint date                       |
| `constraint_type`   | MPP    | ASAP, ALAP, FNET, FNLT, etc.                  |
| `early_start`       | MPP    | CPM earliest start                             |
| `early_finish`      | MPP    | CPM earliest finish                            |
| `late_start`        | MPP    | CPM latest start                               |
| `late_finish`       | MPP    | CPM latest finish                              |
| `priority_value`    | MPP    | Task priority (0-1000)                         |
| `lag_days`          | MPP    | Predecessor lag in days                        |
| `predecessor_name`  | MPP    | Name of predecessor task                       |
| `predecessor_task_id` | MPP  | ID of predecessor task                         |
| `relationship`      | MPP    | FS, FF, SS, SF                                 |
| `wbs_code`          | MPP    | WBS code string                                |

## Forecast KPIs

| Metric           | Calculation                                   | Level      |
| ---------------- | --------------------------------------------- | ---------- |
| EAC              | `actual_cost + remaining_cost`                | Per project |
| CPI              | `contract_value / actual_cost`                | Per project |
| SPI              | `actual_hours / baseline_hours`               | Per project |
| Mapping coverage | `count(mpp_phase_task != '') / count(*)` on hour_entries | Per project |

## Sprint Metrics

| Metric    | Calculation                                                  |
| --------- | ------------------------------------------------------------ |
| Burndown  | Total hours - (actual hours * progress through sprint)       |
| Velocity  | Sum of completed task hours per sprint                       |
| Capacity  | `actual_hours / total_hours * 100` for current sprint        |
