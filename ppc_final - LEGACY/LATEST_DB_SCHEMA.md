# Latest DB Schema (Active Runtime Surface)

Last updated: 2026-02-25

This file documents the currently active database schema surface used by the app runtime after legacy pruning.

## Canonical Source

- Runtime table constants and mappings: `lib/supabase.ts`
- Type contracts: `types/data.ts`
- Transform/runtime joins: `lib/data-transforms.ts`

## Active Tables

- `employees`
- `portfolios`
- `customers`
- `sites`
- `units`
- `projects`
- `subprojects`
- `phases`
- `tasks`
- `qc_tasks`
- `deliverables`
- `hour_entries`
- `milestones`
- `project_health`
- `project_log`
- `task_dependencies`
- `snapshots`
- `visual_snapshots`
- `change_requests`
- `change_impacts`
- `task_quantity_entries`
- `project_mappings`
- `sprints`
- `epics`
- `features`
- `user_stories`
- `project_documents`
- `project_document_records`
- `project_document_versions`
- `customer_contracts`
- `workday_phases`
- `mo_period_notes`
- `engine_logs`

## App Data Key -> Table Mapping

- `employees` -> `employees`
- `portfolios` -> `portfolios`
- `customers` -> `customers`
- `sites` -> `sites`
- `units` -> `units`
- `projects` -> `projects`
- `subprojects` -> `subprojects`
- `phases` -> `phases`
- `tasks` -> `tasks`
- `qctasks` -> `qc_tasks`
- `deliverables` -> `deliverables`
- `hours` -> `hour_entries`
- `milestonesTable` -> `milestones`
- `projectHealth` -> `project_health`
- `projectLog` -> `project_log`
- `taskDependencies` -> `task_dependencies`
- `snapshots` -> `snapshots`
- `visualSnapshots` -> `visual_snapshots`
- `changeRequests` -> `change_requests`
- `changeImpacts` -> `change_impacts`
- `taskQuantityEntries` -> `task_quantity_entries`
- `projectMappings` -> `project_mappings`
- `sprints` -> `sprints`
- `epics` -> `epics`
- `features` -> `features`
- `userStories` -> `user_stories`
- `projectDocuments` -> `project_documents`
- `projectDocumentRecords` -> `project_document_records`
- `projectDocumentVersions` -> `project_document_versions`
- `customerContracts` -> `customer_contracts`
- `workdayPhases` -> `workday_phases`
- `moPeriodNotes` -> `mo_period_notes`

## Pruning Notes

- Legacy/unused tables and paths were removed from runtime mappings.
- `change_log`/`change_logs` duplication is normalized to the active runtime model.
- `changeLog` in app state is in-memory and not persisted as a direct table mapping.

