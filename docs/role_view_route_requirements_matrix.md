# Role View Route Requirements Matrix (v2.1)

Last updated: 2026-02-26

This matrix locks page-level contracts for each `app/role-views/**/page.tsx` route in Role View Enhancement Plan v2.1.

## Render States
- `loading`: skeleton or loading text while API/data request is in progress
- `empty`: no rows/items after successful fetch
- `error`: failed fetch or permission failure
- `ready`: active operational UI

## Tier 1 Contract Matrix

| Route | Primary Sections | Backing API/Data | Required States |
|---|---|---|---|
| `/role-views/pca` | Today queue, priority list, queue KPI cards | `/api/data-quality/issues`, `/api/data/mapping`, role-scoped docs/tasks | `loading`, `empty`, `error`, `ready` |
| `/role-views/pca/mapping` | Mapping stats, filters, suggestion queue, batch apply | `/api/data/mapping` (`listMappingSuggestions`, `mappingSuggestionsStats`, `apply*`) | `loading`, `empty`, `error`, `ready` |
| `/role-views/pca/data-quality` | Category cards, issue list, trend | `/api/data-quality/issues` | `loading`, `empty`, `error`, `ready` |
| `/role-views/pcl/schedule-health` | KPI cards, project performance table | `/api/compliance/matrix` + role tasks/hours data | `loading`, `empty`, `error`, `ready` |
| `/role-views/pcl/plans-mapping` | Oversight KPIs, plans table, mapping oversight | docs/tasks/hour mappings + `/api/data/mapping` stats | `loading`, `empty`, `error`, `ready` |
| `/role-views/pcl/exceptions` | Summary strip, actionable exception queue, status updates | `/api/alerts` GET/PATCH/POST | `loading`, `empty`, `error`, `ready` |
| `/role-views/pcl/resourcing` | Utilization KPIs, outlier list, bench risk | role-scoped `hours`, `employees`, `taskAssignments` | `loading`, `empty`, `error`, `ready` |
| `/role-views/senior-manager/projects` | Project rollup table, risk drill rows | role `projects`, `projectHealth`, `tasks` | `loading`, `empty`, `error`, `ready` |
| `/role-views/senior-manager/documents` | document status pane, signoff coverage | role `projectDocumentRecords` / `projectDocuments` | `loading`, `empty`, `error`, `ready` |
| `/role-views/coo/period-review` | period KPI rollup, project summary table | role `hours`, `projects`, `moPeriodNotes` | `loading`, `empty`, `error`, `ready` |
| `/role-views/coo/commitments` | commitment queue, decision workflow | `/api/commitments` GET/PATCH | `loading`, `empty`, `error`, `ready` |
| `/role-views/rda/hours` | personal hours KPI + anomalies | role-scoped `hours` | `loading`, `empty`, `error`, `ready` |
| `/role-views/rda/work` | open work queue with actions | role-scoped `tasks` | `loading`, `empty`, `error`, `ready` |

## Canonicalization Rules
- `/role-views/pca-workspace` redirects to `/role-views/pca/mapping`.
- `/role-views/pcl-exceptions` redirects to `/role-views/pcl/exceptions`.
- Navigation and deep links must only use canonical routes above.

## Rollout Flags
- `NEXT_PUBLIC_ROLE_ENHANCE_TIER1` controls Tier 1 route enablement.
- `NEXT_PUBLIC_ROLE_ENHANCE_TIER2` controls Tier 2 route enablement.
- `NEXT_PUBLIC_ROLE_ENHANCE_TIER3` controls Tier 3 route enablement.
- Routes are gated through `RoleWorkstationShell` `requiredTier` property.
