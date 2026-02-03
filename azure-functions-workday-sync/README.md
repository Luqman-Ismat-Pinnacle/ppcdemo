# Workday Sync – Azure Functions (Node.js)

1:1 replacement for the Supabase Edge Functions Workday pipeline. Runs on Azure Functions, writes to **Azure Postgres**. Supports **cron** (timer) and **manual** (HTTP) sync.

## What it does

1. **Employees** – Fetches `RPT_-_Employees`, upserts into `employees`.
2. **Hierarchy** – Fetches Find Projects + View Project Plan Integration, upserts `portfolios`, `customers`, `sites`, `projects`, `workday_tasks`.
3. **Hours** – Fetches Project Labor Transactions in date windows (default 30 days), upserts `phases`, `tasks`, `hour_entries`.
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
   Deploy this folder as an Azure Function App (Node 18+, consumption or premium). Timer runs on schedule (default 2 AM daily). HTTP trigger for manual sync (e.g. `POST /api/WorkdaySyncHttp` with function key).

## Local run

```bash
cd azure-functions-workday-sync
npm install
cp local.settings.json.example local.settings.json
# Edit local.settings.json with real credentials
node run-sync.js
```

## Triggers

- **Timer** – `WorkdaySyncTimer`: default schedule `0 0 2 * * *` (2:00 AM daily). Change in `WorkdaySyncTimer/function.json` (`schedule`).
- **HTTP** – `WorkdaySyncHttp`: `POST` or `GET` to the function URL (with `?code=<function-key>` or header) for manual sync.
