# Pinnacle Project Controls (PPC)

Next.js app for project controls: WBS/Gantt, resourcing, hours, forecasting, insights, sprint planning, and QC. Data is stored in a relational database; Workday syncs employees, project hierarchy, and labor hours.

---

## Current setup

- **Frontend / API:** Next.js 15 (React 19), hosted e.g. on Vercel or any Node host.
- **Database:** PostgreSQL (Azure Postgres recommended). Supabase client is still supported as fallback in some paths.
- **Workday sync:** Today this runs via **Supabase Edge Functions** (Deno) triggered by the Next.js API route `/api/workday`. It fetches employees, project hierarchy, and Project Labor Transactions from Workday and writes to Supabase.
- **Auth:** Auth0 via `@auth0/nextjs-auth0` (optional; configure Auth0 and env vars if used).
- **Schema:** Single source of truth is `DB 2.17.26.sql`.
- **MPP parser API:** Python Flask app in `api-python/` (MPXJ/Java) parses MPP files; often hosted on **Railway**. The Next.js app calls it when processing project plans (e.g. Documents / Project Plans).

---

## Migrating to Azure

High-level steps:

1. **Database**  
   Use **Azure Database for PostgreSQL** and run:
   - **File:** `DB 2.17.26.sql`
   - Run it in Azure Postgres (e.g. Query Editor or `psql`). It includes tables, indexes, and triggers used by the app and sync services.

2. **Web app**  
   Point the Next.js app at Azure Postgres instead of Supabase:
   - Either switch `lib/database.ts` to use a `pg` connection to `DATABASE_URL` (or `AZURE_POSTGRES_CONNECTION_STRING`) and adapt the existing Supabase-shaped queries to raw SQL or a Postgres client, **or**
   - Keep using the Supabase client and point it at Supabase’s “Supabase on your own Postgres” (if you use that), **or**
   - Use an adapter layer that keeps the current API and talks to Azure Postgres.
   - Set env vars for the app (see **Environment variables** below).

3. **Workday sync**  
   Replace the Supabase Edge Functions with **Azure Functions** (Node.js) in this repo:
   - **Folder:** `azure-functions-workday-sync/`
   - Same pipeline: Workday → employees, hierarchy, hours, matching/aggregation; only the runtime and database client change. See **Azure Functions (Workday sync)** below.

4. **CI/CD**  
   Use the existing `pipeline/azure-pipeline.yaml` (or adapt it) to build and deploy the Next.js app and/or the Azure Functions from your Azure DevOps repo.

5. **MPP parser API**  
   Move `api-python/` from Railway to Azure (see **MPP Parser API (api-python): Railway → Azure** below).

---

## Azure Functions (Workday sync)

The app in `azure-functions-workday-sync/` is a 1:1 replacement for the Supabase Edge Workday pipeline. It runs on Azure Functions and writes to **Azure Postgres**.

### What it does

1. **Employees** – Workday report → upsert into `employees`.
2. **Hierarchy** – Find Projects + View Project Plan Integration → upsert `portfolios`, `customers`, `sites`, `projects`, `workday_tasks`.
3. **Hours** – Project Labor Transactions (in date windows) → upsert `phases`, `tasks`, `hour_entries`.
4. **Matching** – Match hour entry descriptions to task/unit names, set `hour_entries.task_id`, then aggregate `actual_hours` and `actual_cost` onto `tasks`.

All Workday report URLs and WIDs are defined in `azure-functions-workday-sync/config.js` and can be overridden with environment variables.

### Deploying the function app

1. Create an **Azure Function App** (Node 18+, Consumption or Premium).
2. Configure **Application settings** (see **Variables for Azure Functions** below).
3. Deploy the contents of `azure-functions-workday-sync/` as the function app (e.g. from Azure DevOps build or VS Code Azure Functions extension).
4. **Timer:** `WorkdaySyncTimer` runs on a schedule (default 2:00 AM daily; edit `schedule` in `WorkdaySyncTimer/function.json`).
5. **Manual run:** HTTP trigger `WorkdaySyncHttp` – POST/GET to the function URL (with function key) to run a sync on demand.

### Local run (no Azure)

```bash
cd azure-functions-workday-sync
npm install
cp local.settings.json.example local.settings.json
# Edit local.settings.json with real Workday and Postgres values
node run-sync.js
```

More detail: see `azure-functions-workday-sync/README.md`.

---

## Environment variables

### Required env vars for website (Next.js)

These are the minimum required variables for production website operation:

| Variable | Required | Purpose |
|---------|---------|--------|
| `DATABASE_URL` (or `AZURE_POSTGRES_CONNECTION_STRING`) | Yes | Primary PostgreSQL connection string |
| `NEXT_PUBLIC_AUTH_DISABLED` | Yes | `false` in production (set `true` only for local/demo bypass) |
| `AUTH0_SECRET` | Yes (when auth enabled) | Auth0 session secret |
| `AUTH0_BASE_URL` | Yes (when auth enabled) | Public website URL |
| `AUTH0_ISSUER_BASE_URL` | Yes (when auth enabled) | Auth0 tenant issuer URL |
| `AUTH0_CLIENT_ID` | Yes (when auth enabled) | Auth0 app client ID |
| `AUTH0_CLIENT_SECRET` | Yes (when auth enabled) | Auth0 app client secret |

### Strongly recommended / feature-required website vars

| Variable | Required for | Purpose |
|---------|--------------|--------|
| `AUTH0_CONNECTION` | Enterprise login routing | Forces a specific Auth0 connection (example: Azure AD connection name) |
| `AUTH0_AUDIENCE` | Custom API claims | Audience for custom role claims |
| `AUTH0_ROLE_SCOPE` | Custom API claims | Extra scope to request role claims |
| `NEXT_PUBLIC_AUTH_ROLE_SOURCE` | OAuth role mapping | `oauth-first` (default), `oauth-only`, `employee-only` |
| `NEXT_PUBLIC_AUTH_ROLE_CLAIM` | OAuth role mapping | Primary claim key containing user role |
| `NEXT_PUBLIC_AUTH_ROLE_CLAIMS` | OAuth role mapping | Fallback claim keys list |
| `NEXT_PUBLIC_MPP_PARSER_URL` | Project Plans / MPP processing | Browser-facing MPP parser base URL |
| `MPP_PARSER_URL` | `/api/documents/process-mpp` | Server-side MPP parser base URL |
| `AZURE_DEVOPS_ORGANIZATION` | Sprint/QC Azure sync | Azure DevOps org |
| `AZURE_DEVOPS_PROJECT` | Sprint/QC Azure sync | Azure DevOps project |
| `AZURE_DEVOPS_TEAM` | Sprint/QC Azure sync | Azure DevOps team (defaults to project name). If you see "team does not exist", call `GET /api/azure-devops/teams` to list valid team names and set this. |
| `AZURE_DEVOPS_PAT` | Sprint/QC Azure sync | Azure DevOps PAT |
| `AZURE_DEVOPS_BASE_URL` | Sprint/QC Azure sync | Defaults to `https://dev.azure.com` |

### Optional fallback (legacy Supabase mode)

| Variable | Purpose |
|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL (fallback mode only) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (fallback mode only) |

### Azure Functions (Workday sync)

Set these in the Function App **Application settings** (or in `local.settings.json` for local runs).

**Required**

| Variable | Description |
|----------|-------------|
| `WORKDAY_ISU_USER` | Workday ISU (integration) username |
| `WORKDAY_ISU_PASS` | Workday ISU password |
| `POSTGRES_CONNECTION_STRING` or `AZURE_POSTGRES_CONNECTION_STRING` | Azure Postgres connection string, e.g. `postgresql://user:password@host:5432/dbname?sslmode=require` |

**Optional (defaults in `config.js`)**

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKDAY_BASE_URL` | Workday API base | `https://services1.myworkday.com` |
| `WORKDAY_EMPLOYEES_URL` | Employees report URL | In `config.js` |
| `WORKDAY_FIND_PROJECTS_URL` | Find Projects report URL | In `config.js` |
| `WORKDAY_INTEGRATION_URL` | View Project Plan Integration URL | In `config.js` |
| `WORKDAY_HOURS_BASE_URL` | Project Labor Transactions base URL | In `config.js` |
| `WORKDAY_HOURS_QUERY_WID` | Hours report query WID | In `config.js` |
| `WORKDAY_CURRENCY_RATE_TYPE_WID` | Currency rate type WID | In `config.js` |
| `WORKDAY_REPORTING_CURRENCY_WID` | Reporting currency WID | In `config.js` |
| `WORKDAY_HOURS_DAYS_BACK` | How many days back to pull hours | `365` |
| `WORKDAY_HOURS_WINDOW_DAYS` | Days per hours chunk | `30` |

`AzureWebJobsStorage` and `FUNCTIONS_WORKER_RUNTIME=node` are required by Azure; leave other Workday URLs unset unless you need to override the values in `config.js`.

---

## MPP Parser API (api-python): Railway → Azure

The `api-python/` app is a Flask service that parses Microsoft Project (MPP) files via MPXJ (Java). The Next.js app uploads MPP files to this API and uses the returned JSON for hierarchy and plan data. It is often run on Railway; you can run the same Docker image on Azure.

### Options on Azure

- **Azure App Service (Web App for Containers)** – Deploy the `api-python/` Docker image (build from the repo’s `api-python/Dockerfile`), set the startup port, and point the Next.js app at the new URL.
- **Azure Container Apps** – Run the same image as a container app, expose an HTTPS ingress, and set the Next.js env to that URL.

### Build and image

From the repo root:

```bash
docker build -t ppc-mpp-parser ./api-python
```

Push the image to Azure Container Registry (ACR) or another registry, then deploy that image to App Service or Container Apps.

### Environment variables (api-python)

The service is stateless and uses minimal configuration:

| Variable | Purpose | Default / note |
|----------|---------|-----------------|
| `PORT` | HTTP port the app listens on | `8080` (Dockerfile default). Azure App Service and Container Apps usually set `PORT` (e.g. 80 or 8080); the Dockerfile uses it. |
| `_JAVA_OPTIONS` | JVM options (e.g. heap size) | Set in Dockerfile to `-Xmx256m`. Override in Azure if you need more memory (e.g. `-Xmx512m`). |

No database or API keys are required for the parser itself.

### Next.js variables (after moving api-python to Azure)

Point the Next.js app at the new MPP parser URL:

| Variable | Used by | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_MPP_PARSER_URL` | Project Plans / Folders page (browser) | Base URL of the MPP parser service (e.g. `https://your-mpp-api.azurewebsites.net`) |
| `MPP_PARSER_URL` | `/api/documents/process-mpp` (server) | Same base URL for server-side MPP processing |

**Required** — there is no default. Set both to the deployed parser host (e.g. `https://your-mpp-api.azurewebsites.net` or your Container Apps FQDN). For local development, use `http://localhost:5001`. In the Azure DevOps pipeline, set the `MPP_PARSER_URL` variable and both env vars will be injected automatically.

---

## Repo layout (summary)

| Path | Purpose |
|------|--------|
| `app/` | Next.js pages and API routes |
| `api-python/` | Flask MPP parser (MPXJ); deploy to Railway or Azure (App Service / Container Apps) |
| `components/` | Shared React components and charts |
| `lib/` | Data layer, DB client, transforms, Workday sync stream, etc. |
| `DB 2.17.26.sql` | Canonical database schema for the app |
| `azure-functions-workday-sync/` | Azure Functions app for Workday → Postgres sync |
| `pipeline/azure-pipeline.yaml` | Azure DevOps build/deploy pipeline |
