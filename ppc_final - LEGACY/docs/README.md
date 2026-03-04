# PPC Documentation

High-level architecture and module reference for the Pinnacle Project Controls (PPC) application.

- **[Local Dev Setup](LOCAL_DEV_SETUP.md)** – Run PPC locally with PostgreSQL for verification

## Architecture Overview

```mermaid
flowchart TD
  subgraph Data Layer
    PG[(PostgreSQL)]
    SB[(Supabase)]
  end

  subgraph API
    API_DATA[/api/data]
    API_SYNC[/api/data/sync]
    API_MAPPING[/api/data/mapping]
    API_WORKDAY[/api/workday]
    API_MPP[/api/documents/process-mpp]
  end

  subgraph App
    DC[DataProvider]
    TF[transformData]
    FF[filteredData]
    PAGES[Pages & Charts]
  end

  PG --> API_DATA
  SB -.fallback.-> API_DATA
  API_DATA --> DC
  DC --> TF
  TF --> FF
  FF --> PAGES

  PAGES -->|edits| API_SYNC
  API_SYNC --> PG
  PAGES -->|mapping| API_MAPPING
  API_MAPPING --> PG
  PAGES -->|sync| API_WORKDAY
  API_WORKDAY --> PG
  PAGES -->|MPP upload| API_MPP
  API_MPP --> PG
```

## Key Modules

| Area | Primary Files |
|------|---------------|
| **Data loading** | `lib/data-context.tsx`, `lib/database.ts`, `app/api/data/route.ts` |
| **Transforms** | `lib/data-transforms/` (core, wbs, resource, qc, milestones, etc.) |
| **Role scoping** | `lib/role-data-selectors.ts`, `lib/database.ts` (FetchScope) |
| **Navigation** | `lib/role-navigation.ts` |
| **Route data config** | `lib/route-data-config.ts` (views, shell/full load) |
| **Filters** | `lib/filter-utils.ts`, `components/layout/HierarchyFilter.tsx`, `components/layout/DateFilterControl.tsx` |
| **Theme/background** | `app/globals.css`, `components/background/AmbientBackground.tsx` |
| **AI** | `app/api/ai/briefing/route.ts`, `app/api/ai/query/route.ts`, `lib/ai-context.ts` |
| **Provenance** | `components/ui/MetricProvenanceChip.tsx`, `app/shared/metric-provenance/page.tsx` |

## Manual Structure (Local)

Create these files in `docs/` for the full manual (gitignored):

- `docs/ARCHITECTURE.md` – Data flow, sync, role scoping
- `docs/MODULES.md` – lib/database, lib/data-converter, lib/data-transforms, etc.
- `docs/ROUTES.md` – API routes and page routes
- `docs/DATA_FLOW.md` – MPP parse → DB → transforms → UI
- `docs/ROLES.md` – Role keys, permissions, scoping rules

Content can be adapted from root MD files: `WEBSITE_DATA_FLOW_AND_MPP_PARSER.md`, `ENV_AND_DEVOPS_HANDOFF.md`, etc.

## Data Flow Summary

1. **Read**: `DataProvider` → `/api/data` → `fetchAllData()` → `transformData()` → `filteredData`
2. **Write**: Page → `/api/data/sync` → PostgreSQL → context refresh
3. **Shell/Full**: Shell load (portfolios, projects, employees) first; full load triggered after shell renders
4. **Role scope**: `?role=`, `?email=`, `?employeeId` passed to `/api/data` for server-side filtering
