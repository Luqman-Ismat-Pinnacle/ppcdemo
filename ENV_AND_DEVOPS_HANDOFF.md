# PPC – Environment Variables & DevOps Handoff

Concise reference for setting up the production container and related services.

---

## 1. Production app (Next.js container)

Set these on the app (e.g. Azure Container App / App Service). Mark secrets as secret in the pipeline or key vault.

### Core (required)

| Variable | Purpose |
|----------|--------|
| `DATABASE_URL` or `AZURE_POSTGRES_CONNECTION_STRING` or `POSTGRES_CONNECTION_STRING` | PostgreSQL connection string, e.g. `postgresql://user:password@host:5432/dbname?sslmode=require` |
| `NEXT_PUBLIC_AUTH_DISABLED` | `false` in production; `true` only for local/demo auth bypass |

### Auth (one of)

**Auth0:** `AUTH0_SECRET`, `AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`. Optional: `AUTH0_CONNECTION`, `AUTH0_AUDIENCE`, `AUTH0_ROLE_SCOPE`, `NEXT_PUBLIC_AUTH_ROLE_SOURCE`, `NEXT_PUBLIC_AUTH_ROLE_CLAIM`, `NEXT_PUBLIC_AUTH_ROLE_CLAIMS`.

**Azure AD (NextAuth):** `NEXTAUTH_SECRET`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` (or `common`).

### MPP parser (Project Plans / Documents)

| Variable | Purpose |
|----------|--------|
| `MPP_PARSER_URL` | Server: MPP parser base URL (e.g. `https://your-mpp-api.azurewebsites.net`) |
| `NEXT_PUBLIC_MPP_PARSER_URL` | Same URL for browser; set both to the same value |

### Azure Blob Storage (Documents / MPP uploads)

| Variable | Purpose |
|----------|--------|
| `AZURE_STORAGE_CONNECTION_STRING` | Storage account connection string. App uses container **`projectdoc`** (created if missing). |

### Workday sync (in-app trigger)

| Variable | Purpose |
|----------|--------|
| `AZURE_FUNCTION_URL` | Workday sync Azure Function HTTP trigger URL |
| `AZURE_FUNCTION_KEY` | Function key for that trigger |

### Sprint Planning & QC Log (Azure DevOps)

| Variable | Purpose |
|----------|--------|
| `AZURE_DEVOPS_ORGANIZATION` | DevOps org (e.g. `pinnacletechnology`) |
| `AZURE_DEVOPS_PROJECT` | Project name |
| `AZURE_DEVOPS_PAT` | Personal Access Token (Work Items read/write). **Secret.** |
| `AZURE_DEVOPS_TEAM` | (Optional) Team name; defaults to project |
| `AZURE_DEVOPS_BASE_URL` | (Optional) Default `https://dev.azure.com` |
| `NEXT_PUBLIC_AZURE_QC_URL` | QC Log “Open in Azure DevOps” link (e.g. `https://dev.azure.com/org/project`) |

### Optional / fallback

- **Supabase fallback:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (only if using Supabase instead of/in addition to Postgres).
- **UI:** `NEXT_PUBLIC_WORKDAY_API_URL`, `NEXT_PUBLIC_AZURE_QC_URL` (see above).

---

## 2. Database

- **Schema:** Run **`DB 2.17.26.sql`** (repo root) once on the Postgres instance. No migrations unless the app team provides a new script.
- **Connection:** One connection string in the format above; app accepts `DATABASE_URL`, `AZURE_POSTGRES_CONNECTION_STRING`, or `POSTGRES_CONNECTION_STRING`.
- **Network:** Allow container egress to Postgres; use `sslmode=require`.

---

## 3. Other services

- **MPP parser:** Separate service (repo: `api-python/`). Deploy as its own container; set `PORT` (e.g. 8080). App needs `MPP_PARSER_URL` and `NEXT_PUBLIC_MPP_PARSER_URL` pointing to that URL.
- **Workday sync:** Azure Function App from `azure-functions-workday-sync/`. Needs its own settings (Workday ISU user/pass, Postgres connection string). Production app needs `AZURE_FUNCTION_URL` and `AZURE_FUNCTION_KEY` to trigger sync from the UI.
- **Pipeline:** `pipeline/azure-pipeline.yaml` injects a subset of vars; add any missing ones as pipeline variables (secrets) or set them on the container.
- **Secrets:** Store DB, Auth0/Azure AD, storage, PAT, and function key as secrets (pipeline variables or key vault); never commit.

---

## 4. Checklist

- [ ] Postgres: schema `DB 2.17.26.sql` run once; connection string secured.
- [ ] Production app: core + auth + MPP parser URLs + storage + Workday function URL/key + Sprint/QC vars (if used).
- [ ] MPP parser container deployed; app env points to it.
- [ ] Workday Function deployed and configured; app env has URL and key.
- [ ] All secrets in pipeline/key vault; no credentials in repo.

For more detail (Workday Function settings, local run), see **README.md** and **DEVOPS_SETUP.md**.
