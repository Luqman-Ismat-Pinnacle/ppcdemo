# PPC Minimal — Azure Deployment

## Prerequisites

- Azure CLI (`az`) logged in
- Azure Container App `ppc-minimal` created in resource group `rg-syncrud-pdf-inspection`
- `.env.local` at repo root with production values (or ppc-minimal/.env.local)

## 1. Build and Push Image

From repo root:

```bash
az acr build \
  -t ppc-minimal:$(date +%s) \
  -r vantageacreastus2 \
  -f ppc-minimal/Dockerfile \
  --build-arg NEXT_PUBLIC_AUTH_DISABLED=false \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="<your-value>" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="<your-value>" \
  --build-arg AUTH0_BASE_URL="<your-value>" \
  --build-arg AUTH0_ISSUER_BASE_URL="<your-value>" \
  --build-arg DATABASE_URL="<azure-postgres-connection-string>" \
  ppc-minimal
```

Or use the Azure DevOps pipeline: `pipeline/azure-pipeline-ppc-minimal.yaml` (set variables in Pipeline > Variables).

## 2. Push Env Vars from .env.local

```bash
node scripts/deploy-ppc-minimal-from-env.mjs
```

Reads `.env.local` from repo root and updates the container app env. Ensure these are set:

- `DATABASE_URL` or `POSTGRES_CONNECTION_STRING` (Azure Postgres)
- `AUTH0_SECRET`, `AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`
- `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER_NAME`
- `WORKDAY_ISU_USER`, `WORKDAY_ISU_PASS`
- `MPP_PARSER_URL`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (for migration source)

## 3. Wipe Azure DB, Recreate Schema, Migrate from Supabase

```bash
node scripts/migrate-supabase-to-azure-ppc-minimal.mjs
```

Uses `.env.local` for:
- `DATABASE_URL` / `POSTGRES_CONNECTION_STRING` → Azure Postgres (target)
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) → Supabase (source)

Steps:
1. Drops all tables and recreates from `ppc-minimal/db/schema.sql`
2. Migrates employees, customer_contracts, workday_phases, hour_entries from Supabase

## Env Vars (Container)

Align with legacy `.env.local` so the container picks them up:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Azure Postgres connection string |
| `AUTH0_SECRET` | Auth0 secret (e.g. `openssl rand -hex 32`) |
| `AUTH0_BASE_URL` | App URL (e.g. `https://ppc-minimal.azurecontainerapps.io`) |
| `AUTH0_ISSUER_BASE_URL` | Auth0 tenant URL |
| `AUTH0_CLIENT_ID` | Auth0 client ID |
| `AUTH0_CLIENT_SECRET` | Auth0 client secret |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob storage |
| `AZURE_STORAGE_CONTAINER_NAME` | Container name (default: `project-plans`) |
| `WORKDAY_ISU_USER` | Workday ISU user |
| `WORKDAY_ISU_PASS` | Workday ISU pass |
| `MPP_PARSER_URL` | MPP parser service URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL (optional at runtime) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (optional at runtime) |
