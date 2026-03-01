# PPC Minimal — PCA-First App

A streamlined project controls application focused on the PCA role. Built from scratch with a minimal database schema, DB-side rollups, progressive loading, and a liquid glass UI theme.

## Quick Start

```bash
cd ppc-minimal
npm install --legacy-peer-deps
```

1. Create a new Supabase project (or any PostgreSQL instance).
2. Copy `.env.local` and fill in:
   - `DATABASE_URL` — your Postgres connection string
   - `AZURE_STORAGE_CONNECTION_STRING` — Azure Blob Storage (for MPP file uploads)
   - `MPP_PARSER_URL` — URL of the MPXJ parser service (default `http://localhost:5001/parse`)
3. Apply the schema:
   ```bash
   psql $DATABASE_URL -f db/schema.sql
   ```
4. Run the dev server:
   ```bash
   npm run dev   # http://localhost:3001
   ```

## Architecture

- **Frontend**: Next.js 15 / React 19 / TypeScript
- **Backend**: Next.js API routes → PostgreSQL (via `pg` driver)
- **Storage**: Azure Blob Storage for MPP files
- **Parser**: External Python/Flask MPXJ parser (`api-python/`)

### Data Flow

```
Workday CSV/JSON → POST /api/ingest/workday → employees, portfolios, customers, sites, projects, hour_entries, customer_contracts
MPP Parser JSON  → POST /api/ingest/mpp     → units, phases, tasks, sub_tasks
                                               ↓
                                    SELECT refresh_rollups()
                                               ↓
                                    Rolled-up metrics on every level
                                               ↓
                          PCA pages fetch from /api/pca/* → direct DB queries → JSON → UI
```

### Pages

| Route            | Description                               |
| ---------------- | ----------------------------------------- |
| `/`              | Command Center — KPIs, priority queue     |
| `/overview`      | Project overview with status table        |
| `/wbs`           | WBS Gantt (reused component from main app)|
| `/mapping`       | Hour-to-plan mapping with auto-match      |
| `/project-plans` | MPP upload, Azure storage, processing     |
| `/sprint`        | Sprint board, backlog, burndown, velocity |
| `/forecast`      | Cost/schedule forecast, CPI/SPI analysis  |
| `/data-management` | Direct CRUD on all DB tables            |

### Schema

See `db/schema.sql`. Tables: `portfolios → customers → sites → projects → units → phases → tasks → sub_tasks`, plus `employees`, `hour_entries`, `customer_contracts`, `project_documents`, `sprints`, `sprint_tasks`.

Rollups computed via `refresh_rollups()` stored procedure (called after each ingestion).

See `docs/DATA_PROVENANCE.md` for detailed metric provenance.
