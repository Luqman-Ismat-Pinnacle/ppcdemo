# DevOps setup – PPC on Azure

Handoff checklist for setting up **database** and **Azure Functions (Workday sync)**. The app owner does not have database access; these steps are for the DevOps engineer.

---

## 1. Database (Azure PostgreSQL)

**Goal:** One-time schema setup so the app and Workday sync can use the same database.

1. **Create** an Azure Database for PostgreSQL server and database (or use an existing one).
2. **Run the schema once** (first-time only; no DROP/purge in this file):
   - **File in repo:** `schema_full_postgres.sql` (at repo root).
   - Run it in Azure Postgres (Query Editor in Azure Portal, or `psql` with the connection string).
   - This creates all tables, sequences, triggers, and functions (including `employees`, `hour_entries` with `workday_phase` / `workday_task` / `actual_cost`, `portfolios`, `projects`, `tasks`, etc.).
3. **Connection string:** Build the Postgres connection string and keep it secure. You will need it for the Azure Function App (Workday sync). Format:
   ```text
   postgresql://<user>:<password>@<host>:5432/<dbname>?sslmode=require
   ```
   Example host: `your-server.postgres.database.azure.com`.

**No migrations to run after that** unless the app team provides a new schema file.

---

## 2. Azure Functions – Workday sync

**Goal:** Replace the current Workday sync (Supabase Edge Functions) with an Azure Function App that writes to the same Azure Postgres database.

**Repo path:** `azure-functions-workday-sync/`

### 2.1 Create the Function App

- **Runtime:** Node 18+ (or 20).
- **Plan:** Consumption or Premium.
- **Region:** Same as (or close to) the Postgres server if possible.

### 2.2 Application settings (required)

Set these in the Function App → **Configuration** → **Application settings**. Get values from the app/Workday owner where noted.

| Setting | Description | Where to get it |
|--------|-------------|------------------|
| `FUNCTIONS_WORKER_RUNTIME` | Must be `node` | Set automatically; verify it exists. |
| `AzureWebJobsStorage` | Storage connection for the Function App | Azure Portal (required for Azure Functions). |
| `WORKDAY_ISU_USER` | Workday integration (ISU) username | App/Workday owner. |
| `WORKDAY_ISU_PASS` | Workday integration (ISU) password | App/Workday owner. |
| `POSTGRES_CONNECTION_STRING` or `AZURE_POSTGRES_CONNECTION_STRING` | Full Postgres connection string | From step 1 (same DB as schema). Example: `postgresql://user:password@host:5432/dbname?sslmode=require` |

### 2.3 Application settings (optional)

Only set these if the app/Workday owner asks to override defaults. All Workday report URLs and WIDs are already in `azure-functions-workday-sync/config.js`.

| Setting | Default / purpose |
|--------|--------------------|
| `WORKDAY_BASE_URL` | `https://services1.myworkday.com` |
| `WORKDAY_EMPLOYEES_URL` | Full URL in `config.js` |
| `WORKDAY_FIND_PROJECTS_URL` | Full URL in `config.js` |
| `WORKDAY_INTEGRATION_URL` | Full URL in `config.js` |
| `WORKDAY_HOURS_BASE_URL` | Full URL in `config.js` |
| `WORKDAY_HOURS_QUERY_WID` | WID string in `config.js` |
| `WORKDAY_CURRENCY_RATE_TYPE_WID` | In `config.js` |
| `WORKDAY_REPORTING_CURRENCY_WID` | In `config.js` |
| `WORKDAY_HOURS_DAYS_BACK` | `365` (how many days back to pull hours) |
| `WORKDAY_HOURS_WINDOW_DAYS` | `30` (days per chunk) |

### 2.4 Deploy the function code

- **Source:** Clone the repo (e.g. from Azure DevOps); deploy the **contents** of the folder `azure-functions-workday-sync/` as the Function App code (e.g. via Azure DevOps pipeline, VS Code Azure Functions extension, or `func azure functionapp publish <app-name>` from that folder).
- **Triggers:**
  - **Timer:** `WorkdaySyncTimer` – runs on a schedule (default 2:00 AM daily). Schedule is in `WorkdaySyncTimer/function.json` (`schedule`: `0 0 2 * * *`). Change there if a different schedule is needed.
  - **HTTP:** `WorkdaySyncHttp` – for manual sync. Call the function URL (GET or POST) with the function key (query `?code=...` or header).

### 2.5 Verify

- Run a manual sync via the HTTP trigger URL (with key). Check Function App logs and the Postgres database (e.g. `employees`, `hour_entries` row counts) to confirm data is written.

---

## 3. What to get from the app owner

- **Workday:** `WORKDAY_ISU_USER` and `WORKDAY_ISU_PASS` (integration account for the reports used by the sync).
- **Database:** If DevOps is not creating the Postgres server, the app owner should provide the connection string (or a way to obtain it) so you can run `schema_full_postgres.sql` and configure the Function App.
- **Next.js app:** If/when the web app is pointed at Azure Postgres and the new Workday sync, the app owner will set the app’s env vars (e.g. `NEXT_PUBLIC_SUPABASE_*` or `DATABASE_URL` / `AZURE_POSTGRES_CONNECTION_STRING`, and any Workday-related URLs). No action needed from DevOps for the Next.js app env vars unless you own that deployment.

---

## 4. Summary checklist

- [ ] Azure Postgres server/database created (or existing one identified).
- [ ] `schema_full_postgres.sql` run once on that database.
- [ ] Postgres connection string saved securely.
- [ ] Azure Function App created (Node 18+, with `AzureWebJobsStorage`).
- [ ] Application settings set: `WORKDAY_ISU_USER`, `WORKDAY_ISU_PASS`, `POSTGRES_CONNECTION_STRING` (or `AZURE_POSTGRES_CONNECTION_STRING`).
- [ ] Function App deployed from repo folder `azure-functions-workday-sync/`.
- [ ] Manual HTTP sync tested; logs and DB checked.

For more context (current setup, migration overview, MPP parser), see the root **README.md**.
