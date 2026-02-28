# Local Development Setup with Database

Quick setup to run PPC locally with a PostgreSQL database for verification.

## 1. Start PostgreSQL

**Option A: Docker**
```bash
docker compose up -d postgres
# or: docker-compose up -d postgres
```
Wait for the container to be healthy (~10 seconds).

**Option B: Local Postgres** – Ensure Postgres 14+ is running and create database:
```bash
psql -U postgres -c "CREATE DATABASE ppcdb;"
```

## 2. Create Schema

```bash
# Apply base schema (creates tables)
psql postgresql://postgres:postgres@localhost:5432/ppcdb -f "DB 2.17.26.sql"

# Apply pending migrations (new columns, tables)
psql postgresql://postgres:postgres@localhost:5432/ppcdb -f migrations/apply-all-pending.sql
```

## 3. Environment

```bash
cp .env.local.example .env.local
# Edit .env.local if needed (default works with Docker postgres)
```

## 4. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). With `NEXT_PUBLIC_AUTH_DISABLED=true` you skip Auth0.

## 5. Populate Data (Optional)

With an empty DB you'll see "No data". To add sample data:

- Use **Data Management** to import Excel (see LOCAL_DUPLICATION_GUIDE.md)
- Or run Workday sync scripts if you have Workday credentials

## Verifying Phase 10.4 (Server-Side Filters)

1. Add at least one project via Data Management or import
2. Open the app and select a project in the HierarchyFilter
3. URL should show `?project=<id>`
4. Refresh the page – data should load filtered by that project (check Network tab: `/api/data?project=...`)
5. Add date filter – URL shows `?from=...&to=...` – refresh and verify hour_entries are date-scoped
