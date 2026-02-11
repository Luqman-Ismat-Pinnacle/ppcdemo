# Workday Sync – Azure Functions (Node.js)

1:1 replacement for the Supabase Edge Functions Workday pipeline. Runs on Azure Functions, writes to **Azure Postgres**. Supports **cron** (timer) and **manual** (HTTP) sync.

## What it does

1. **Employees** – Fetches `RPT_-_Employees`, upserts into `employees`.
2. **Hierarchy** – Fetches Find Projects + View Project Plan Integration, upserts `portfolios`, `customers`, `sites`, `projects`, `workday_tasks`.
3. **Hours** – Fetches Project Labor Transactions in date windows (default 30 days), upserts `phases`, `tasks`, `hour_entries`.

All sync steps use `INSERT ... ON CONFLICT (id) DO UPDATE`, so re-running sync does not duplicate data; it updates existing rows by stable Workday IDs.
4. **Matching** – Sets `hour_entries.task_id` from task/unit name in description; then aggregates `actual_hours` and `actual_cost` onto `tasks`.

Pipeline (Workday → DB) is unchanged; only the runtime moves from Edge Functions to Azure Functions + Postgres.

## Setup (DevOps)

1. **Database**  
   Run the single schema file once on Azure Postgres (first-time setup):
   - From repo root: `schema_full_postgres.sql`

2. **Config**  
   Copy `local.settings.json.example` to `local.settings.json` (local) or set **Application settings** in the Azure Function App:

   - `WORKDAY_ISU_USER` – Workday ISU user  
   - `WORKDAY_ISU_PASS` – Workday ISU password  
   - `POSTGRES_CONNECTION_STRING` (or `AZURE_POSTGRES_CONNECTION_STRING`) – Azure Postgres connection string  
   - Optional: `WORKDAY_HOURS_DAYS_BACK` (default 365), `WORKDAY_HOURS_WINDOW_DAYS` (default 30)

3. **URLs**  
   All Workday report URLs and WIDs are in `config.js`. Override via env if needed:
   - `WORKDAY_EMPLOYEES_URL`, `WORKDAY_FIND_PROJECTS_URL`, `WORKDAY_INTEGRATION_URL`
   - `WORKDAY_HOURS_BASE_URL`, `WORKDAY_HOURS_QUERY_WID`, `WORKDAY_CURRENCY_RATE_TYPE_WID`, `WORKDAY_REPORTING_CURRENCY_WID`

4. **Deploy**  
   Deploy this folder as an Azure Function App (Node 18+, consumption or premium). See **Push to Azure** below.

## Local run

```bash
cd azure-functions-workday-sync
npm install
cp local.settings.json.example local.settings.json
# Edit local.settings.json with real credentials
node run-sync.js
```

## Triggers

- **Timer** – `WorkdaySyncTimer`: runs every 15 minutes (`0 */15 * * * *`). Each tick reads the **scheduled time** from the app’s `app_settings` table (key `workday_sync_schedule`). If the current UTC time matches that hour/minute window and the last run was more than 11 hours ago, it runs the full sync. Set the time in the app: **System Health** dropdown → **Scheduled sync** → choose hour/minute (UTC) → **Save schedule**.
- **HTTP** – `WorkdaySyncHttp`: `POST` or `GET` to the function URL (with `?code=<function-key>` or header) for manual sync.

## Push to Azure

From the repo root (or from `azure-functions-workday-sync`):

```bash
cd azure-functions-workday-sync
npm install
npx func azure functionapp publish <YOUR_FUNCTION_APP_NAME>
```

Replace `<YOUR_FUNCTION_APP_NAME>` with your Azure Function App name. Ensure Azure CLI is logged in (`az login`) and the Function App exists and uses the same Node runtime (e.g. 18). After publish, the timer will run every 15 minutes and execute the full sync when the stored schedule (UTC) is reached.
