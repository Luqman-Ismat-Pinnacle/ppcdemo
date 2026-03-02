# PPC Minimal — Standalone Project Controls App

A standalone project controls application with role-based views (PCA, PCL, COO, Project Lead, Senior Manager). Built with a minimal database schema, DB-side rollups, progressive loading, and a liquid glass UI theme.

**This folder is self-contained.** Copy it out and run it as its own project—no parent repo required.

## Quick Start

```bash
npm install --legacy-peer-deps
```

1. Create a PostgreSQL database (Supabase, Neon, or any Postgres).
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — your Postgres connection string
   - `AZURE_STORAGE_CONNECTION_STRING` — Azure Blob Storage (for MPP file uploads)
   - `MPP_PARSER_URL` — URL of an MPXJ-compatible parser (e.g. cloud-hosted or local)
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
- **Parser**: External MPXJ-compatible service (deploy separately or use a cloud URL)

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
| `/wbs`           | WBS Gantt (hierarchical grid + Konva timeline) |
| `/mapping`       | Hour-to-plan mapping with auto-match      |
| `/project-plans` | MPP upload, Azure storage, processing     |
| `/sprint`        | Sprint board, backlog, burndown, velocity |
| `/forecast`      | Cost/schedule forecast, CPI/SPI analysis  |
| `/data-management` | Direct CRUD on all DB tables            |

### Schema

See `db/schema.sql`. Tables: `portfolios → customers → sites → projects → units → phases → tasks → sub_tasks`, plus `employees`, `hour_entries`, `customer_contracts`, `project_documents`, `sprints`, `sprint_tasks`.

Rollups computed via `refresh_rollups()` stored procedure (called after each ingestion).

See `docs/DATA_PROVENANCE.md` for detailed metric provenance.

## Standalone Usage

To use this as a standalone project:

1. Copy the entire `ppc-minimal` folder to a new location (or clone the repo and `cd ppc-minimal`).
2. Run `npm install --legacy-peer-deps` inside the folder.
3. Configure `.env.local` from `.env.example`.
4. Apply `db/schema.sql` to your Postgres database.
5. Run `npm run dev`.

All code, components, and APIs live within this folder. There are no imports from parent directories.
