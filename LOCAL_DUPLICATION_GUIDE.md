# PPC Dashboard — Local Duplication Guide

> **Audience:** Developers or analysts who want to run the full dashboard locally, populated entirely from Excel spreadsheets.
>
> **Stack:** Next.js 15 · React 19 · PostgreSQL · ECharts 6 · TypeScript

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Setup](#2-environment-setup)
3. [Database Setup](#3-database-setup)
4. [Running the Application](#4-running-the-application)
5. [Data Model & Hierarchy](#5-data-model--hierarchy)
6. [Preparing Your Excel File](#6-preparing-your-excel-file)
7. [Sheet-by-Sheet Field Reference](#7-sheet-by-sheet-field-reference)
8. [Importing the Excel File](#8-importing-the-excel-file)
9. [How Data Flows Through the Dashboard](#9-how-data-flows-through-the-dashboard)
10. [What Each Insight Page Needs](#10-what-each-insight-page-needs)
11. [Troubleshooting](#11-troubleshooting)
12. [Quick-Start Checklist](#12-quick-start-checklist)

---

## 1. Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 18+ | Runtime |
| **npm** | 9+ | Package manager |
| **PostgreSQL** | 14+ | Database (local or Docker) |
| **Git** | Any | Clone the repo |
| **Docker** (optional) | Any | For containerised Postgres / MPP parser |

---

## 2. Environment Setup

### 2.1 Clone & Install

```bash
git clone <repo-url> ppc_final
cd ppc_final
npm install
```

### 2.2 Create `.env.local`

Create a file called `.env.local` in the project root with the following content. **For a pure local setup you only need the database URL and the auth bypass.**

```env
# ─── Auth Bypass (skip Auth0 for local dev) ───
NEXT_PUBLIC_AUTH_DISABLED=true

# ─── Database ───
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ppcdb?sslmode=disable

# ─── Optional: MPP Parser (only if you parse .mpp files) ───
# NEXT_PUBLIC_MPP_PARSER_URL=http://localhost:5001

# ─── Optional: Azure Blob Storage (only if you upload documents) ───
# AZURE_STORAGE_CONNECTION_STRING=...
```

| Variable | Required? | Explanation |
|----------|-----------|-------------|
| `NEXT_PUBLIC_AUTH_DISABLED` | **Yes** (for local) | Set to `true` to skip Auth0 login and use a demo user |
| `DATABASE_URL` | **Yes** | Standard PostgreSQL connection string. Adjust `user`, `password`, `host`, `port`, `database` to match your local Postgres |
| `NEXT_PUBLIC_MPP_PARSER_URL` | No | Only needed if you want to upload and parse Microsoft Project `.mpp` files |
| `AZURE_STORAGE_CONNECTION_STRING` | No | Only needed for document uploads to Azure Blob Storage |

---

## 3. Database Setup

### 3.1 Create the Database

```bash
# Connect to Postgres
psql -U postgres

# Inside psql:
CREATE DATABASE ppcdb;
\q
```

### 3.2 Run the Schema

The repository includes a complete schema file that creates all tables, indexes, triggers, and auto-ID generators.

```bash
psql -U postgres -d ppcdb -f schema.sql
```

This creates ~40 tables. The core ones for the dashboard insight pages are:

| Table | Purpose |
|-------|---------|
| `employees` | People, their roles, hourly rates, utilization targets |
| `portfolios` | Top-level grouping (a Senior Manager owns a portfolio) |
| `customers` | Clients under portfolios |
| `sites` | Physical locations under customers |
| `projects` | Individual projects under sites |
| `phases` | Phases within a project (e.g., "Initiate", "Execute") |
| `units` | Organizational units within projects |
| `tasks` | Leaf-level work items under phases |
| `hour_entries` | Timesheet records — who worked how many hours on what, and when |
| `milestones` | Planned/actual milestone dates and variance |

### 3.3 Using Docker Instead

If you prefer Docker, there is a `docker-compose.yml` in the repo:

```bash
docker-compose up -d postgres
```

Then run the schema against the Docker container's database.

---

## 4. Running the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Because `NEXT_PUBLIC_AUTH_DISABLED=true`, you will be logged in automatically as a demo user.

### What You'll See

With an empty database you will see the dashboard pages but all charts will show "No data". This is expected — the next sections explain how to populate it.

---

## 5. Data Model & Hierarchy

Understanding the hierarchy is critical. The dashboard filters cascade top-down:

```
Portfolio
  └── Customer
        └── Site
              └── Project
                    ├── Unit (optional grouping)
                    │     └── Phase
                    │           └── Task
                    └── Phase (can be directly under project)
                          └── Task
```

**Additionally:**
- `hour_entries` link an **employee** to a **project** + **phase** + **task** on a specific **date**
- `milestones` link to a **project** (and optionally to a phase/task)

### Foreign Key Relationships

```
employees ──────────────────────────────────────────────┐
portfolios.employee_id ──→ employees.id                 │
customers.portfolio_id ──→ portfolios.id                │
sites.customer_id ──→ customers.id                      │
projects.site_id ──→ sites.id                           │
projects.customer_id ──→ customers.id                   │
projects.portfolio_id ──→ portfolios.id                 │
projects.manager_id ──→ employees.id                    │
phases.project_id ──→ projects.id                       │
units.site_id ──→ sites.id                              │
tasks.project_id ──→ projects.id                        │
tasks.phase_id ──→ phases.id                            │
tasks.assigned_resource_id ──→ employees.id             │
hour_entries.employee_id ──→ employees.id               │
hour_entries.project_id ──→ projects.id                 │
hour_entries.phase_id ──→ phases.id (ON DELETE SET NULL) │
hour_entries.task_id ──→ tasks.id (ON DELETE SET NULL)  │
milestones.project_id ──→ projects.id                   │
```

**Important:** IDs must match across sheets. If a task references `projectId = "PRJ-001"`, there must be a project with `id = "PRJ-001"` in the projects sheet.

---

## 6. Preparing Your Excel File

### 6.1 File Format

Create a single `.xlsx` workbook. Each sheet represents one data entity. **Sheet names are case-insensitive** and flexible:

| Sheet Name (use any of these) | Maps To |
|-------------------------------|---------|
| `employees` | Employee records |
| `portfolios` | Portfolio records |
| `customers` | Customer records |
| `sites` | Site records |
| `projects` | Project records |
| `phases` | Phase records |
| `units` | Unit records |
| `tasks` | Task records |
| `hours` or `hour entries` or `hourentries` | Timesheet records |
| `milestones` or `milestonesTable` | Milestone records |
| `deliverables` | Deliverable records |
| `qctasks` or `qc tasks` | QC task records |

### 6.2 The Action Column

Each sheet supports an optional `Action` column (column A):

| Value | Meaning |
|-------|---------|
| `A` or blank | **Add** — create a new record (or update if ID exists) |
| `E` | **Edit** — update an existing record by ID |
| `D` | **Delete** — remove the record by ID |

If you are populating from scratch, leave the Action column blank or set everything to `A`.

### 6.3 Download a Template

Once the app is running, go to **Project Controls → Data Management** and click the **Download Template** button in the top-right toolbar. This gives you a pre-formatted `.xlsx` with all sheets, headers, and one example row per sheet.

### 6.4 Minimum Viable Dataset

To see meaningful charts, you need at minimum:

1. **1+ employees** (people who do the work)
2. **1 portfolio** (top-level grouping)
3. **1 customer** (under the portfolio)
4. **1 site** (under the customer)
5. **1 project** (under the site/customer, with `has_schedule = true` for WBS/Gantt)
6. **1+ phases** (under the project)
7. **5+ tasks** (under phases, with baseline and actual hours)
8. **10+ hour entries** (timesheet rows linking employees to tasks)
9. **1+ milestones** (optional, for milestone charts)

---

## 7. Sheet-by-Sheet Field Reference

Below are the column headers to use in your Excel file. **Column names use camelCase** (the system converts them to snake_case for the database).

### 7.1 Employees

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `EMP-001`) |
| `employeeId` | Text | No | Can mirror `id` |
| `name` | Text | Yes | Full name |
| `email` | Text | No | Email address |
| `jobTitle` | Text | No | Job title |
| `managementLevel` | Text | No | One of: `Individual Contributor`, `Manager`, `Senior Manager`, `Director`, `VP`, `Partner` |
| `manager` | Text | No | Manager's name |
| `employeeType` | Text | No | `Regular`, `Contractor`, or `Intern` |
| `role` | Text | No | Functional role (e.g., `Engineer`, `QC Analyst`) |
| `department` | Text | No | Department name |
| `hourlyRate` | Number | No | Cost rate per hour |
| `utilizationPercent` | Number | No | Target utilization (0-100) |
| `isActive` | Boolean | No | `true` or `false` (default `true`) |

### 7.2 Portfolios

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `PRT-001`) |
| `name` | Text | Yes | Portfolio name |
| `employeeId` | Text | No | FK → employees.id (portfolio owner) |
| `manager` | Text | No | Manager name (text) |
| `baselineStartDate` | Date | No | `YYYY-MM-DD` |
| `baselineEndDate` | Date | No | `YYYY-MM-DD` |
| `baselineHours` | Number | No | Total planned hours |
| `actualHours` | Number | No | Total actual hours |
| `baselineCost` | Number | No | Total planned cost |
| `actualCost` | Number | No | Total actual cost |
| `isActive` | Boolean | No | Default `true` |

### 7.3 Customers

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `CST-001`) |
| `name` | Text | Yes | Customer name |
| `portfolioId` | Text | Yes | FK → portfolios.id |
| `employeeId` | Text | No | FK → employees.id (account manager) |
| `baselineHours` | Number | No | Planned hours |
| `actualHours` | Number | No | Actual hours |
| `baselineCost` | Number | No | Planned cost |
| `actualCost` | Number | No | Actual cost |
| `isActive` | Boolean | No | Default `true` |

### 7.4 Sites

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `STE-001`) |
| `name` | Text | Yes | Site name |
| `customerId` | Text | Yes | FK → customers.id |
| `location` | Text | No | Physical location |
| `baselineHours` | Number | No | Planned hours |
| `actualHours` | Number | No | Actual hours |
| `isActive` | Boolean | No | Default `true` |

### 7.5 Projects

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `PRJ-001`) |
| `name` | Text | Yes | Project name |
| `customerId` | Text | No | FK → customers.id |
| `siteId` | Text | No | FK → sites.id |
| `portfolioId` | Text | No | FK → portfolios.id |
| `employeeId` | Text | No | FK → employees.id (project manager) |
| `billableType` | Text | No | `T&M` or `FP` |
| `status` | Text | No | `Not Started`, `In Progress`, `On Hold`, `Completed`, `Cancelled` |
| `baselineStartDate` | Date | No | `YYYY-MM-DD` |
| `baselineEndDate` | Date | No | `YYYY-MM-DD` |
| `actualStartDate` | Date | No | `YYYY-MM-DD` |
| `actualEndDate` | Date | No | `YYYY-MM-DD` |
| `percentComplete` | Number | No | 0-100 |
| `baselineHours` | Number | No | Total planned hours for the project |
| `actualHours` | Number | No | Total actual hours |
| `baselineCost` | Number | No | Total planned cost |
| `actualCost` | Number | No | Total actual cost |
| `hasSchedule` | Boolean | No | Set to `true` if this project should appear on WBS Gantt |
| `isActive` | Boolean | No | Default `true` |

### 7.6 Phases

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `PHS-001`) |
| `name` | Text | Yes | Phase name (e.g., "Execution", "Quality Control") |
| `projectId` | Text | Yes | FK → projects.id |
| `sequence` | Number | No | Sort order (1, 2, 3...) |
| `baselineStartDate` | Date | No | `YYYY-MM-DD` |
| `baselineEndDate` | Date | No | `YYYY-MM-DD` |
| `baselineHours` | Number | No | Planned hours for phase |
| `actualHours` | Number | No | Actual hours |
| `percentComplete` | Number | No | 0-100 |

### 7.7 Tasks

This is the most important sheet — tasks drive most dashboard visualizations.

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `TSK-001`) |
| `name` | Text | Yes | Task name |
| `projectId` | Text | Yes | FK → projects.id |
| `phaseId` | Text | Yes | FK → phases.id |
| `assignedResourceId` | Text | No | FK → employees.id (who is assigned) |
| `assignedResource` | Text | No | Role name (e.g., "Engineer") — used when no specific person |
| `status` | Text | No | `Not Started`, `In Progress`, `On Hold`, `Completed`, `Cancelled` |
| `priority` | Text | No | `low`, `medium`, `high`, `critical` |
| `baselineStartDate` | Date | No | `YYYY-MM-DD` — planned start |
| `baselineEndDate` | Date | No | `YYYY-MM-DD` — planned finish |
| `actualStartDate` | Date | No | `YYYY-MM-DD` |
| `actualEndDate` | Date | No | `YYYY-MM-DD` |
| `percentComplete` | Number | No | 0-100 |
| `baselineHours` | Number | **Yes** | Planned hours — **this is the single most important metric** |
| `actualHours` | Number | No | Actual hours worked (also rolls up from hour_entries) |
| `remainingHours` | Number | No | Hours remaining |
| `baselineCost` | Number | No | Planned cost |
| `actualCost` | Number | No | Actual cost |
| `daysRequired` | Number | No | Duration in working days |
| `isMilestone` | Boolean | No | `true` if this is a milestone task (zero-duration) |
| `isCritical` | Boolean | No | `true` if on the critical path |
| `totalFloat` | Number | No | Total float in days (0 = critical) |
| `predecessorId` | Text | No | FK → tasks.id (the predecessor task) |
| `predecessorRelationship` | Text | No | `FS` (Finish-to-Start), `SS`, `FF`, `SF` |
| `chargeType` | Text | No | `EX` (Execution), `QC` (Quality), `CR` (Customer Relations), `SC` (Supervision) |
| `evMethod` | Text | No | `0/100`, `50/50`, `percent_complete`, `weighted_milestone` |
| `comments` | Text | No | Free text |

### 7.8 Hour Entries (hours)

Each row represents a single timesheet entry — one person, one day, one task.

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `HRS-001`) |
| `employeeId` | Text | Yes | FK → employees.id |
| `projectId` | Text | Yes | FK → projects.id |
| `phaseId` | Text | No | FK → phases.id |
| `taskId` | Text | No | FK → tasks.id |
| `date` | Date | **Yes** | `YYYY-MM-DD` — the day the work was done |
| `hours` | Number | **Yes** | Hours worked (e.g., `8`, `4.5`) |
| `chargeType` | Text | No | `EX`, `QC`, `CR`, `SC`, `Other` — **drives the Sankey chart** |
| `actualCost` | Number | No | Cost for this entry (hours × rate) |
| `description` | Text | No | Description of work |

### 7.9 Milestones

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | Text | Yes | Unique ID (e.g., `MLS-001`) |
| `milestoneName` | Text | Yes | Milestone name |
| `projectId` | Text | Yes | FK → projects.id |
| `customer` | Text | No | Customer name (for display) |
| `plannedDate` | Date | **Yes** | `YYYY-MM-DD` — originally planned |
| `forecastedDate` | Date | No | `YYYY-MM-DD` — current forecast |
| `actualDate` | Date | No | `YYYY-MM-DD` — when it actually happened |
| `percentComplete` | Number | No | 0-100 |

> The system auto-calculates `varianceDays = actualDate - plannedDate` (or `forecastedDate - plannedDate` if no actual).

---

## 8. Importing the Excel File

### Step-by-Step

1. Open the application at [http://localhost:3000](http://localhost:3000)
2. Navigate to **Project Controls → Data Management** (sidebar)
3. Click the **Upload** button (top toolbar area)
4. Select your `.xlsx` file
5. The system will:
   - Parse each sheet and map it to the matching entity type
   - Validate foreign key references
   - Show a summary of what will be imported (adds, edits, deletes)
6. Confirm the import
7. Data is synced to PostgreSQL and the dashboard updates immediately

### Import Order

Because of foreign key constraints, the system processes sheets in dependency order automatically:

```
1. employees     (no dependencies)
2. portfolios    (references employees)
3. customers     (references portfolios)
4. sites         (references customers)
5. units         (references sites)
6. projects      (references sites, customers, portfolios, employees)
7. phases        (references projects)
8. tasks         (references projects, phases, employees)
9. hour_entries   (references employees, projects, phases, tasks)
10. milestones    (references projects)
```

If you get FK constraint errors, ensure parent records exist first. You can import in multiple passes if needed.

### Re-Importing / Updating

The import uses **upsert** semantics — if a record with the same `id` already exists, it is updated. New IDs are inserted. This means you can:

- Fix data in your spreadsheet and re-import safely
- Add new rows alongside existing ones
- Use `Action = D` to delete specific rows

---

## 9. How Data Flows Through the Dashboard

Understanding this pipeline helps you debug "why isn't my data showing?"

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  Excel File  │────→│  /api/data/  │────→│  PostgreSQL   │
│  (.xlsx)     │     │  sync        │     │  (raw tables) │
└─────────────┘     └──────────────┘     └───────┬───────┘
                                                  │
                                          GET /api/data
                                                  │
                                                  ▼
                                    ┌─────────────────────┐
                                    │   DataProvider       │
                                    │   (data-context.tsx) │
                                    │                     │
                                    │  1. fetchAllData()   │
                                    │  2. Filter inactive  │
                                    │     employees        │
                                    │  3. transformData()  │
                                    │     ↓                │
                                    │  Builds:             │
                                    │  • wbsData           │
                                    │  • laborBreakdown    │
                                    │  • taskHoursEff.     │
                                    │  • qualityHours      │
                                    │  • milestoneStatus   │
                                    │  • resourceHeatmap   │
                                    │  • + 20 more views   │
                                    └──────────┬──────────┘
                                               │
                                    useData() hook
                                               │
                        ┌──────────────────────┼──────────────────────┐
                        ▼                      ▼                      ▼
                  Overview V2            Hours Page            Tasks Page
                  (Pulse, Sankey,        (Labor breakdown,    (Efficiency,
                   Risk Matrix,           waterfall, etc.)     Sankey, etc.)
                   Dependencies)
```

### Key Transform: `transformData()`

This function takes the raw database rows and builds **computed views** that the chart components consume. The major ones:

| Computed View | What It Contains | Which Page Uses It |
|---------------|------------------|--------------------|
| `wbsData` | Hierarchical tree: Portfolio → Customer → Site → Project → Phase → Task with rollup calculations | WBS Gantt, Overview |
| `laborBreakdown` | Hours grouped `byWorker`, `byPhase`, `byTask`, `byChargeType` with weekly buckets | Hours page |
| `taskHoursEfficiency` | Actual vs. estimated hours per task, efficiency % | Hours page, Tasks page |
| `qualityHours` | Hours split by quality categories (productive, rework, idle) | Hours page |
| `nonExecuteHours` | Overhead/non-execution hours analysis | Hours page |
| `milestoneStatusPie` | Milestone counts by status | Milestones page |
| `milestoneScoreboard` | Milestone stats by customer | Milestones page |
| `planVsForecastVsActual` | Cumulative milestone progress over time | Milestones page |
| `resourceHeatmap` | Hours heatmap by resource and week | Resourcing page |
| `qcTransactionByGate` | QC metrics by gate (Initial, Mid, Final) | QC Dashboard |

### Filtering

Users can filter by:
- **Hierarchy:** Portfolio → Customer → Site → Project (cascading dropdowns in the header)
- **Date Range:** Week, Month, Quarter, YTD, Year, Custom

When a filter is applied, `transformData()` re-runs on the filtered subset, and all charts update.

---

## 10. What Each Insight Page Needs

### Overview V2 (Meeting Command Center)

| Section | Required Data |
|---------|--------------|
| **Pulse (Health Score)** | `tasks` with `baselineHours` and `actualHours` on projects that have `hasSchedule = true` |
| **Leaderboard** | Multiple projects with varying hours/variance |
| **Decisions Required** | Tasks with `status` = "Blocked", or `isCritical = true`, or high variance |
| **Milestones** | `milestones` with `plannedDate`, `forecastedDate`, `actualDate` |
| **Operational Sankey** | `hour_entries` with `chargeType` (EX/QC/CR/SC) and `employeeId` linked to employees with `role` |
| **Risk Matrix** | Multiple projects with different variance levels |
| **Hours Waterfall** | `tasks` with `baselineHours` and `actualHours` (variance per phase) |
| **Predictive Burn** | `tasks` with dates and hours to plot burn trajectory |
| **Dependency Map** | Tasks with `predecessorId` or entries in `task_dependencies` table |
| **Workforce Burn** | `hour_entries` with `employeeId` → employees with `role` |

### Hours Page

| Section | Required Data |
|---------|--------------|
| **Combined Bar Chart** | `hour_entries` with `chargeType`, `projectId`, linked to employees with `role` |
| **Task Efficiency** | `tasks` with both `baselineHours` > 0 and `actualHours` > 0 |
| **Quality Hours** | `hour_entries` with `chargeType = 'QC'` |
| **Labor Tables** | `hour_entries` linked to employees, projects, phases, tasks |

### Tasks Page

| Section | Required Data |
|---------|--------------|
| **Efficiency Chart** | `tasks` with `baselineHours` and `actualHours` |
| **Hours Flow Sankey** | `hour_entries` linked across the hierarchy |
| **Variance Analysis** | `tasks` with date fields for trend analysis |

### Milestones Page

| Section | Required Data |
|---------|--------------|
| **Status Pie** | `milestones` with status derivable from dates |
| **Progress Chart** | `milestones` with `plannedDate` and `actualDate` over time |
| **Scoreboard** | `milestones` with `customer` field populated |

### QC Dashboard

| Section | Required Data |
|---------|--------------|
| All sections | QC task records (`qctasks` table) with gate, status, pass/fail, analyst fields |

---

## 11. Troubleshooting

### "No data" on all pages

- Verify PostgreSQL is running and `DATABASE_URL` is correct
- Check the browser console for API errors
- Visit `http://localhost:3000/api/data` directly — you should see JSON with your data

### Foreign key constraint errors during import

- Ensure parent records exist before children (e.g., create the project before its tasks)
- Check that IDs in FK columns (e.g., `projectId` on tasks) exactly match the `id` column in the parent sheet
- The system processes sheets in dependency order, but if a sheet references an entity in the same sheet, you may need two passes

### Charts show zeros even though data exists

- **Hours page:** Ensure `hour_entries` have a valid `date` within the selected date filter range
- **Overview:** Ensure projects have `hasSchedule = true` (or at least have tasks with hours)
- **Sankey:** Ensure `chargeType` is populated on hour entries (`EX`, `QC`, `CR`, `SC`)
- **Efficiency charts:** Ensure tasks have `baselineHours > 0` (tasks with zero baseline are skipped)

### Variance is always 0%

Variance is calculated as `(actualHours - baselineHours) / baselineHours × 100`. Both fields must be populated and `baselineHours` must be > 0.

### Milestones not showing variance

Ensure both `plannedDate` and either `actualDate` or `forecastedDate` are populated. The system calculates `varianceDays` as the difference.

### WBS Gantt is empty

- Projects must have `hasSchedule = true`
- Tasks need `baselineStartDate` and `baselineEndDate` for the bars to render
- Select a specific project in the Gantt page's dropdown

---

## 12. Quick-Start Checklist

```
□ 1. Install Node.js 18+, PostgreSQL 14+
□ 2. Clone repo, run npm install
□ 3. Create .env.local with DATABASE_URL and NEXT_PUBLIC_AUTH_DISABLED=true
□ 4. Create database: psql -U postgres -c "CREATE DATABASE ppcdb"
□ 5. Run schema: psql -U postgres -d ppcdb -f schema.sql
□ 6. Start app: npm run dev
□ 7. Open http://localhost:3000
□ 8. Go to Project Controls → Data Management
□ 9. Click "Download Template" to get a pre-formatted .xlsx
□ 10. Fill in your data (at minimum: employees, portfolio, customer, site, project, phases, tasks, hours)
□ 11. Upload the filled .xlsx file via the Upload button
□ 12. Navigate to Insights → Overview V2 to see your dashboard
```

### Minimal Example Structure

If you just want to see the dashboard working quickly, create this structure:

```
Portfolio: "Engineering Portfolio"
  └── Customer: "Acme Corp"
        └── Site: "Headquarters"
              └── Project: "Website Redesign"  (hasSchedule = true)
                    ├── Phase: "Design"
                    │     ├── Task: "Wireframes"      (baselineHours: 40, actualHours: 35)
                    │     └── Task: "Mockups"          (baselineHours: 60, actualHours: 72)
                    ├── Phase: "Development"
                    │     ├── Task: "Frontend Build"   (baselineHours: 120, actualHours: 110)
                    │     └── Task: "Backend API"      (baselineHours: 80, actualHours: 95)
                    └── Phase: "QC"
                          └── Task: "Testing"          (baselineHours: 30, actualHours: 28)

Employees:
  - "Jane Smith" (role: "Designer", hourlyRate: 75)
  - "John Doe" (role: "Developer", hourlyRate: 85)
  - "Alice Chen" (role: "QC Analyst", hourlyRate: 70)

Hour Entries (sample):
  - Jane Smith → Design/Wireframes → 2025-01-06 → 8h → chargeType: EX
  - Jane Smith → Design/Mockups → 2025-01-07 → 8h → chargeType: EX
  - John Doe → Development/Frontend → 2025-01-08 → 8h → chargeType: EX
  - Alice Chen → QC/Testing → 2025-01-09 → 6h → chargeType: QC
  ... (more entries across different dates)

Milestones:
  - "Design Complete" → plannedDate: 2025-01-15, actualDate: 2025-01-17
  - "Go Live" → plannedDate: 2025-03-01, forecastedDate: 2025-03-10
```

This will populate the Pulse health score, Sankey flow, Risk Matrix, Hours charts, Milestone tracker, and Workforce Burn sections.

---

*Guide generated for PPC Dashboard v2. For questions, refer to the Data Management page's built-in help or the README.md in the repository root.*
