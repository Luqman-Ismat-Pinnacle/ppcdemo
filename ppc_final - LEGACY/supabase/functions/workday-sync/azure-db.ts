/**
 * Run full Workday sync writing to Azure Postgres (or any Postgres) via connection string.
 * Set POSTGRES_CONNECTION_STRING or AZURE_POSTGRES_CONNECTION_STRING in Supabase secrets.
 * Uses same fetch/map logic as Supabase path; writes with raw SQL to match Azure Functions.
 */
import { Client } from 'npm:pg@8.11.3';
import { workdayConfig, workdayFetch } from '../_shared/workday-config.ts';

type PgClient = InstanceType<typeof Client>;

function safeString(val: unknown): string {
  return (val != null ? String(val) : '').trim();
}
const TRAILING_DATE_PATTERNS: RegExp[] = [
  /\s*\([^)]*\)\s*$/i,
  /\s*\d{4}-\d{1,2}-\d{1,2}\s*$/i,
  /\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i,
  /\s*\d{1,2}-\d{1,2}-\d{2,4}\s*$/i,
  /\s*\d{4}\/\d{1,2}\/\d{1,2}\s*$/i,
  /\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\s*$/i,
  /\s*\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}\s*$/i,
  /\s*\d{1,2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*-\d{2,4}\s*$/i,
];
function stripDatesFromEnd(input: string): string {
  let out = (input || '').trim();
  if (!out) return '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TRAILING_DATE_PATTERNS) {
      const next = out.replace(pattern, '').trimEnd();
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
  }
  return out.trim();
}
function parseHourDescription(description: string): { chargeCode: string; phases: string; task: string } {
  const normalized = stripDatesFromEnd(description);
  const parts = normalized.split('>').map((p) => p.trim()).filter(Boolean);
  return {
    chargeCode: stripDatesFromEnd(normalized),
    phases: parts.length >= 2 ? (parts[1] || '') : '',
    task: stripDatesFromEnd(parts.length >= 3 ? parts.slice(2).join(' > ') : ''),
  };
}
function cleanProjectId(raw: string): string {
  if (!raw) return '';
  return String(raw).replace(/\s*\(Inactive\)\s*$/i, '').trim().substring(0, 50);
}
function toDateOnly(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === 'string') {
    const part = val.split('T')[0].split(' ')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val.toISOString().split('T')[0];
  return null;
}
function generateSlug(text: string): string {
  return String(text).replace(/[^A-Za-z0-9]/g, '').substring(0, 20);
}
function generateId(prefix: string, name: string): string {
  const slug = String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 30);
  return `${prefix}-${slug}`;
}
function generateSiteId(custName: string | null, siteName: string | null): string | null {
  if (!siteName) return null;
  return generateId('STE', [custName, siteName].filter(Boolean).join(' ') || siteName);
}
function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h;
}

function mapEmployee(r: Record<string, unknown>): Record<string, unknown> | null {
  const employeeId = (r.Employee_ID ?? r.employee_id ?? r.ID ?? r.Worker_ID) as string | undefined;
  if (!employeeId) return null;
  let name = safeString(r.Worker ?? r.Name ?? r.Full_Name ?? '');
  if (!name && (r.firstName || r.First_Name) && (r.lastName || r.Last_Name)) {
    name = `${r.firstName || r.First_Name || ''} ${r.lastName || r.Last_Name || ''}`.trim();
  }
  if (!name) name = `Employee ${employeeId}`;
  const activeStatus = r.Active_Status ?? r.active_status ?? r.Status;
  const terminationDate = r.termination_date ?? r.Termination_Date;
  const isActive =
    activeStatus === '1' || activeStatus === 1 || activeStatus === true ||
    activeStatus === 'Active' || (activeStatus !== '0' && activeStatus !== 0 && activeStatus !== 'Inactive' && !terminationDate);
  return {
    id: String(employeeId),
    employee_id: String(employeeId),
    name: String(name).trim(),
    email: (r.Work_Email ?? r.Email ?? r.Primary_Work_Email) ? String(r.Work_Email ?? r.Email ?? r.Primary_Work_Email) : null,
    job_title: safeString(r.businessTitle ?? r.Business_Title ?? r.Job_Title) || null,
    management_level: safeString(r.Management_Level ?? r.Manager_Level) || null,
    manager: safeString(r.Manager ?? r.Manager_Name) || null,
    employee_type: safeString(r.Employee_Type ?? r.Worker_Type) || null,
    role: safeString(r.Job_Profile ?? r.Role) || null,
    department: safeString(r.Cost_Center ?? r.Department) || null,
    is_active: !!isActive,
  };
}

async function upsertBatch(client: PgClient, table: string, cols: string[], rows: Record<string, unknown>[], batchSize: number): Promise<void> {
  if (rows.length === 0) return;
  const setClause = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.flatMap((r) => cols.map((c) => r[c]));
    const placeholders = batch.map((_, bi) => '(' + cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(',') + ')').join(',');
    const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`;
    await client.query(sql, values);
  }
}

export async function runFullSyncAzure(connectionString: string, hoursDaysBack: number, syncOnly?: string): Promise<Record<string, unknown>> {
  const client = new Client({ connectionString });
  await client.connect();

  const summary: Record<string, unknown> = {
    employees: null,
    hierarchy: null,
    hours: { chunksOk: 0, chunksFail: 0, totalHours: 0, totalFetched: 0, hoursDaysBack: hoursDaysBack, lastError: null as string | null },
    matching: null,
    customerContracts: null,
    workdayPhases: null,
  };

  try {
    if (syncOnly === 'customerContracts') {
      const result = await syncCustomerContractsAzure(client);
      await client.end();
      return { _customerContractsOnly: true, customerContracts: result } as unknown as Record<string, unknown>;
    }

    const empRes = await workdayFetch(workdayConfig.urls.employees);
    if (!empRes.ok) throw new Error(`Workday employees ${empRes.status}: ${await empRes.text()}`);
    const empData = await empRes.json();
    let empRecords: Record<string, unknown>[] = Array.isArray(empData) ? empData : (empData.Report_Entry ?? []);
    if (!Array.isArray(empRecords) && empData && typeof empData === 'object') {
      const key = Object.keys(empData).find((k) => Array.isArray((empData as Record<string, unknown>)[k]));
      if (key) empRecords = (empData as Record<string, unknown>)[key] as Record<string, unknown>[];
    }
    const cleaned = empRecords.map((r) => mapEmployee(r)).filter(Boolean) as Record<string, unknown>[];
    const empCols = ['id', 'employee_id', 'name', 'email', 'job_title', 'management_level', 'manager', 'employee_type', 'role', 'department', 'is_active'];
    await upsertBatch(client, 'employees', empCols, cleaned, workdayConfig.sync.batchSize);
    summary.employees = { total: empRecords.length, valid: cleaned.length, synced: cleaned.length };

    const resMaster = await workdayFetch(workdayConfig.urls.findProjects);
    if (!resMaster.ok) throw new Error(`Workday Find Projects ${resMaster.status}: ${await resMaster.text()}`);
    const dataMaster = await resMaster.json();
    const masterRecords = (dataMaster.Report_Entry ?? []) as Record<string, unknown>[];

    const portfolios: Record<string, unknown>[] = [];
    const customers: Record<string, unknown>[] = [];
    const sites: Record<string, unknown>[] = [];
    const projects: Record<string, unknown>[] = [];
    const portfolioIds = new Set<string>();
    const customerIds = new Set<string>();
    const siteIds = new Set<string>();
    const projectIds = new Set<string>();

    for (const r of masterRecords) {
      const custName = (r.CF_Customer_Site_Ref_ID ?? r.Customer) as string | undefined;
      const siteName = (r.CF_Project_Site_Ref_ID ?? r.Site) as string | undefined;
      const portfolioMgr = r.Optional_Project_Hierarchies as string | undefined;
      let portfolioId: string | null = null;
      if (portfolioMgr) {
        portfolioId = generateId('PRF', portfolioMgr);
        if (!portfolioIds.has(portfolioId)) {
          portfolioIds.add(portfolioId);
          portfolios.push({
            id: portfolioId,
            portfolio_id: portfolioId,
            name: `${portfolioMgr}'s Portfolio`,
            manager: portfolioMgr,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
      if (custName) {
        const cid = generateId('CST', custName);
        if (!customerIds.has(cid)) {
          customerIds.add(cid);
          customers.push({
            id: cid,
            customer_id: cid,
            name: custName,
            portfolio_id: portfolioId,
            is_active: true,
            updated_at: new Date().toISOString(),
          });
        }
      }
      if (siteName) {
        const sid = generateSiteId(custName ?? null, siteName);
        if (sid && !siteIds.has(sid)) {
          siteIds.add(sid);
          sites.push({
            id: sid,
            site_id: sid,
            name: siteName,
            customer_id: custName ? generateId('CST', custName) : null,
            location: r.Location ?? null,
            is_active: true,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    for (const r of masterRecords) {
      const projectIdRaw = (r.Project_by_ID ?? r.projectReferenceID ?? r.Project_ID) as string | undefined;
      const projectName = (r.Project ?? r.projectName) as string | undefined;
      const projectId = cleanProjectId(projectIdRaw ?? '');
      const custName = (r.CF_Customer_Site_Ref_ID ?? r.Customer) as string | undefined;
      const siteName = (r.CF_Project_Site_Ref_ID ?? r.Site) as string | undefined;
      if (projectId && projectName && !projectIds.has(projectId)) {
        projectIds.add(projectId);
        projects.push({
          id: projectId,
          project_id: projectId,
          name: projectName,
          customer_id: custName ? generateId('CST', custName) : null,
          site_id: siteName ? generateSiteId(custName ?? null, siteName) : null,
          has_schedule: false,
          is_active: r['Inactive_-_Current'] !== '1' && r.Project_Status !== 'Closed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    const workdayTasks: Record<string, unknown>[] = [];
    try {
      const resInt = await workdayFetch(workdayConfig.urls.integration);
      if (resInt.ok) {
        const dataInt = await resInt.json();
        const intRecords = (dataInt.Report_Entry ?? []) as Record<string, unknown>[];
        const taskIds = new Set<string>();
        for (const r of intRecords) {
          const taskId = (r.Task_ID ?? r.taskReferenceID) as string | undefined;
          const projectId = (r.projectReferenceID ?? r.Project_ID) as string | undefined;
          if (taskId && projectId && !taskIds.has(taskId)) {
            taskIds.add(taskId);
            workdayTasks.push({
              id: taskId,
              project_id: projectId,
              task_name: safeString(r.Task ?? r.taskName),
              task_number: safeString(r.Task_Number),
              start_date: r.Start_Date ?? null,
              end_date: r.End_Date ?? null,
              budgeted_hours: parseFloat(String(r.Budgeted_Hours ?? 0)) || 0,
              actual_hours: parseFloat(String(r.Actual_Hours ?? 0)) || 0,
              actual_cost: parseFloat(String(r.Actual_Cost ?? 0)) || 0,
              status: (r.Status as string) ?? 'Active',
              assigned_resource: safeString(r.Assigned_Resource),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted: false,
            });
          }
        }
      }
    } catch {
      console.warn('[workday-sync azure] Integration report failed (non-fatal)');
    }

    const wtCols = ['id', 'project_id', 'task_name', 'task_number', 'start_date', 'end_date', 'budgeted_hours', 'actual_hours', 'actual_cost', 'status', 'assigned_resource', 'created_at', 'updated_at', 'deleted'];
    await upsertBatch(client, 'portfolios', ['id', 'portfolio_id', 'name', 'manager', 'is_active', 'created_at', 'updated_at'], portfolios, workdayConfig.sync.hoursBatchSize);
    await upsertBatch(client, 'customers', ['id', 'customer_id', 'name', 'portfolio_id', 'is_active', 'updated_at'], customers, workdayConfig.sync.hoursBatchSize);
    await upsertBatch(client, 'sites', ['id', 'site_id', 'name', 'customer_id', 'location', 'is_active', 'updated_at'], sites, workdayConfig.sync.hoursBatchSize);
    await upsertBatch(client, 'projects', ['id', 'project_id', 'name', 'customer_id', 'site_id', 'has_schedule', 'is_active', 'created_at', 'updated_at'], projects, workdayConfig.sync.hoursBatchSize);
    await upsertBatch(client, 'workday_tasks', wtCols, workdayTasks, workdayConfig.sync.hoursBatchSize);

    summary.hierarchy = { portfolios: portfolios.length, customers: customers.length, sites: sites.length, projects: projects.length, workdayTasks: workdayTasks.length };

    try {
      summary.customerContracts = await syncCustomerContractsAzure(client);
    } catch (e) {
      summary.customerContracts = { error: (e as Error).message };
    }

    const WINDOW_DAYS = workdayConfig.sync.windowDays;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - hoursDaysBack);
    const totalChunks = Math.ceil(hoursDaysBack / WINDOW_DAYS);
    const hoursSummary = summary.hours as Record<string, unknown>;

    const { rows: projRows } = await client.query('SELECT id FROM projects');
    const { rows: empRows } = await client.query('SELECT id FROM employees');
    const existingProjectIds = new Set((projRows as { id: string }[]).map((r) => r.id));
    const existingEmployeeIds = new Set((empRows as { id: string }[]).map((r) => r.id));

    for (let i = 0; i < totalChunks; i++) {
      const chunkEnd = new Date(end);
      chunkEnd.setDate(end.getDate() - i * WINDOW_DAYS);
      const chunkStart = new Date(chunkEnd);
      chunkStart.setDate(chunkStart.getDate() - WINDOW_DAYS + 1);
      if (chunkStart.getTime() < start.getTime()) chunkStart.setTime(start.getTime());
      try {
        const result = await syncHoursChunkAzure(client, chunkStart, chunkEnd, existingProjectIds, existingEmployeeIds);
        hoursSummary.chunksOk = (hoursSummary.chunksOk as number) + 1;
        hoursSummary.totalFetched = (hoursSummary.totalFetched as number) + (result.fetched ?? 0);
        hoursSummary.totalHours = (hoursSummary.totalHours as number) + (result.hours ?? 0);
        if (i < totalChunks - 1) await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        hoursSummary.chunksFail = (hoursSummary.chunksFail as number) + 1;
        hoursSummary.lastError = (e as Error).message ?? String(e);
      }
    }

    try {
      summary.matching = await runMatchingAzure(client);
    } catch {
      /* non-fatal */
    }

    try {
      summary.workdayPhases = await syncWorkdayPhasesAzure(client);
    } catch (e) {
      summary.workdayPhases = { error: (e as Error).message };
    }

    return summary;
  } finally {
    await client.end();
  }
}

async function syncCustomerContractsAzure(client: PgClient): Promise<Record<string, unknown>> {
  const url = workdayConfig.urls.customerContracts;
  if (!url) return { fetched: 0, upserted: 0 };
  const res = await workdayFetch(url);
  if (!res.ok) throw new Error(`Customer contracts API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const records = (data.Report_Entry ?? data.report_Entry ?? data.ReportEntry ?? []) as Record<string, unknown>[];

  const { rows: projRows } = await client.query('SELECT id FROM projects');
  const projectIds = (projRows as { id: string }[]).map((r) => r.id);

  const CURRENCY_TO_USD: Record<string, number> = { USD: 1, US: 1, EUR: 1.08, GBP: 1.27, CAD: 0.74, AUD: 0.65 };
  function toUsd(amount: number, currency: string): number | null {
    const code = safeString(currency).toUpperCase();
    const rate = CURRENCY_TO_USD[code] ?? (code.startsWith('US') ? 1 : null);
    if (rate == null) return null;
    return Math.round(amount * rate * 100) / 100;
  }
  function leadingDigits(s: string): string | null {
    const m = safeString(s).match(/^(\d+)/);
    return m ? m[1] : null;
  }
  function resolveProjectId(billableProject: string): string | null {
    const leading = leadingDigits(billableProject);
    if (!leading || !projectIds.length) return null;
    const set = new Set(projectIds);
    if (set.has(leading)) return leading;
    if (set.has(leading + ' (Inactive)')) return leading + ' (Inactive)';
    for (const id of projectIds) {
      if (id === leading || id.startsWith(leading + ' ') || id.startsWith(leading + '_')) return id;
    }
    return null;
  }

  const rows: Record<string, unknown>[] = [];
  for (let idx = 0; idx < records.length; idx++) {
    const r = records[idx];
    const lineAmount = (r.Line_Amount ?? r.line_amount ?? r.LineAmount) as number | undefined;
    const lineFromDate = r.Line_From_Date ?? r.line_from_date ?? r.Date ?? r.date;
    const currency = safeString(r.Currency ?? r.currency ?? 'USD') || 'USD';
    const billableProject = String(r.Billable_Project ?? r.billable_project ?? '');
    const referenceID = safeString(r.referenceID ?? r.reference_id ?? '');
    const amount = parseFloat(String(lineAmount));
    if (Number.isNaN(amount)) continue;
    const projectId = resolveProjectId(billableProject);
    let dateOnly: string | null = null;
    if (lineFromDate != null && typeof lineFromDate === 'string') {
      const part = lineFromDate.split('T')[0].trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(part)) dateOnly = part;
      else {
        const d = new Date(lineFromDate);
        if (!Number.isNaN(d.getTime())) dateOnly = d.toISOString().split('T')[0];
      }
    }
    const amountUsd = toUsd(amount, currency);
    const id = referenceID
      ? referenceID.replace(/[^A-Za-z0-9_-]/g, '_').substring(0, 80)
      : `CC_${projectId || 'none'}_${dateOnly || 'nodate'}_${Math.abs(hashCode(billableProject + String(amount) + idx))}`.replace(/-/g, 'M').substring(0, 80);
    rows.push({
      id,
      project_id: projectId ?? null,
      line_amount: amount,
      line_from_date: dateOnly,
      currency: currency.substring(0, 10),
      amount_usd: amountUsd,
      billable_project_raw: safeString(billableProject).substring(0, 255),
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) return { fetched: records.length, upserted: 0 };
  const cols = ['id', 'project_id', 'line_amount', 'line_from_date', 'currency', 'amount_usd', 'billable_project_raw', 'updated_at'];
  const setClause = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const values = batch.flatMap((r) => cols.map((c) => r[c]));
    const placeholders = batch.map((_, bi) => '(' + cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(',') + ')').join(',');
    await client.query(
      `INSERT INTO customer_contracts (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`,
      values
    );
  }
  return { fetched: records.length, upserted: rows.length };
}

function buildHoursUrl(start: Date, end: Date): string {
  const formatDate = (d: Date) => d.toISOString().split('T')[0] + '-08:00';
  const params = new URLSearchParams({
    'Projects_and_Project_Hierarchies!WID': workdayConfig.urls.hoursQueryWid,
    'Include_Subordinate_Project_Hierarchies': '1',
    'Currency_Rate_Type!WID': workdayConfig.urls.currencyRateTypeWid,
    'Reporting_Currency!WID': workdayConfig.urls.reportingCurrencyWid,
    'Start_Date': formatDate(start),
    'End_Date': formatDate(end),
    'format': 'json',
  });
  return `${workdayConfig.urls.hoursBase}?${params.toString()}`;
}

async function syncHoursChunkAzure(
  client: PgClient,
  startDate: Date,
  endDate: Date,
  existingProjectIds: Set<string>,
  existingEmployeeIds: Set<string>
): Promise<{ fetched: number; hours: number; phases: number; tasks: number }> {
  const url = buildHoursUrl(startDate, endDate);
  const res = await workdayFetch(url);
  if (!res.ok) throw new Error(`Hours API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const records = (data.Report_Entry ?? data.report_Entry ?? data.ReportEntry ?? []) as Record<string, unknown>[];
  if (records.length === 0) return { fetched: 0, hours: 0, phases: 0, tasks: 0 };

  const hoursToUpsert = new Map<string, Record<string, unknown>>();
  const phasesToUpsert = new Map<string, Record<string, unknown>>();
  const tasksToUpsert = new Map<string, Record<string, unknown>>();

  for (const r of records) {
    const rawProjectId = safeString(r.Project_ID ?? r.Project_Id ?? r.project_id);
    if (!rawProjectId) continue;
    const projectId = cleanProjectId(rawProjectId);
    const employeeId = safeString(r.Employee_ID ?? r.employee_id);
    const workdayId = safeString(r.workdayID ?? r.referenceID ?? r.Reference_ID ?? r.Transaction_ID ?? r.id);
    if (!employeeId || !workdayId) continue;

    const rawPhaseName = safeString(r.Phase ?? r.phase) || 'General Phase';
    const rawTaskName = safeString(r.Task ?? r.task) || 'General Task';
    const phaseSlug = generateSlug(rawPhaseName);
    const phaseId = `PHS_${projectId}_${phaseSlug}`.substring(0, 50);
    const taskSlug = generateSlug(rawTaskName);
    const taskId = `TSK_${projectId}_${phaseSlug}_${taskSlug}`.substring(0, 50);

    if (!phasesToUpsert.has(phaseId)) {
      phasesToUpsert.set(phaseId, {
        id: phaseId,
        phase_id: phaseId,
        project_id: projectId,
        name: rawPhaseName,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }
    const taskKey = `${projectId}_${phaseId}`;
    if (!tasksToUpsert.has(taskKey)) {
      tasksToUpsert.set(taskKey, {
        id: taskId,
        task_id: taskId,
        project_id: projectId,
        phase_id: phaseId,
        name: rawTaskName,
      });
    }

    const hoursVal = parseFloat(String(r.Hours ?? r.hours ?? '0')) || 0;
    const dateOnly = toDateOnly(r.Transaction_Date ?? r.transaction_date ?? r.Date ?? r.date);
    if (!dateOnly) continue;
    const description = (safeString(r.Time_Type ?? r.Billable_Transaction) || safeString(r.Billable_Transaction)).substring(0, 500);
    const parsed = parseHourDescription(description);
    const billableRate = parseFloat(String(r.Billable_Rate ?? '0')) || 0;
    const billableAmount = parseFloat(String(r.Billable_Amount ?? '0')) || 0;
    const standardCostRate = parseFloat(String(r.Standard_Cost_Rate ?? '0')) || 0;
    const standardCostAmt = parseFloat(String(r.Reported_Standard_Cost_Amt ?? r.Reported_Standard_22 ?? '0')) || 0;
    const reportedStandard22 = parseFloat(String(r.Reported_Standard_22 ?? '0')) || 0;
    const actualCost = standardCostAmt || hoursVal * standardCostRate || hoursVal * reportedStandard22 || 0;
    const actualRevenue = billableAmount || hoursVal * billableRate || 0;

    if (!hoursToUpsert.has(workdayId)) {
      hoursToUpsert.set(workdayId, {
        id: workdayId,
        entry_id: workdayId,
        employee_id: employeeId,
        project_id: projectId,
        date: dateOnly,
        hours: hoursVal,
        description,
        charge_code: parsed.chargeCode ? parsed.chargeCode.substring(0, 255) : null,
        charge_code_v2: parsed.chargeCode ? parsed.chargeCode.substring(0, 500) : null,
        phases: parsed.phases || null,
        task: parsed.task || null,
        workday_phase_id: null,
        workday_phase: null,
        workday_task: null,
        billable_rate: billableRate,
        billable_amount: billableAmount,
        standard_cost_rate: standardCostRate,
        reported_standard_cost_amt: standardCostAmt,
        actual_cost: actualCost,
        actual_revenue: actualRevenue,
        customer_billing_status: safeString(r.Customer_Billing_Status).substring(0, 50) || null,
        invoice_number: safeString(r.Invoice_Number).substring(0, 50) || null,
        invoice_status: safeString(r.Invoice_Status).substring(0, 50) || null,
        charge_type: safeString(r.Charge_Code ?? r.Charge_Type).substring(0, 10) || null,
      });
    }
  }

  const phaseList = Array.from(phasesToUpsert.values()).filter((p) => existingProjectIds.has(String(p.project_id)));
  const taskList = Array.from(tasksToUpsert.values()).filter((t) => existingProjectIds.has(String(t.project_id)));
  const hourList = Array.from(hoursToUpsert.values()).filter(
    (h) => existingProjectIds.has(String(h.project_id)) && existingEmployeeIds.has(String(h.employee_id))
  );

  const phaseCols = ['id', 'phase_id', 'project_id', 'name', 'is_active', 'updated_at'];
  const taskCols = ['id', 'task_id', 'project_id', 'phase_id', 'name'];
  const hourCols = [
    'id', 'entry_id', 'employee_id', 'project_id', 'date', 'hours', 'description',
    'charge_code', 'charge_code_v2', 'phases', 'task', 'workday_phase_id',
    'workday_phase', 'workday_task', 'billable_rate', 'billable_amount', 'standard_cost_rate',
    'reported_standard_cost_amt', 'actual_cost', 'actual_revenue',
    'customer_billing_status', 'invoice_number', 'invoice_status', 'charge_type',
  ];
  await upsertBatch(client, 'phases', phaseCols, phaseList, workdayConfig.sync.hoursBatchSize);
  await upsertBatch(client, 'tasks', taskCols, taskList, workdayConfig.sync.hoursBatchSize);
  await upsertBatch(client, 'hour_entries', hourCols, hourList, workdayConfig.sync.hoursBatchSize);

  return { fetched: records.length, hours: hourList.length, phases: phaseList.length, tasks: taskList.length };
}

async function runMatchingAzure(client: PgClient): Promise<Record<string, unknown>> {
  const { rows: unassigned } = await client.query(
    `SELECT id, project_id, description FROM hour_entries WHERE task_id IS NULL`
  );
  if (!unassigned || (unassigned as unknown[]).length === 0) {
    return { tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0, tasksUpdated: 0 };
  }

  const { rows: tasks } = await client.query('SELECT id, project_id, name FROM tasks');
  const { rows: units } = await client.query('SELECT id, project_id, name FROM units');
  const tasksByProject = new Map<string, { id: string; project_id: string; name: string }[]>();
  for (const t of (tasks ?? []) as { id: string; project_id: string; name: string }[]) {
    if (!t.project_id || !t.name) continue;
    const list = tasksByProject.get(t.project_id) ?? [];
    list.push(t);
    tasksByProject.set(t.project_id, list);
  }
  const unitsByProject = new Map<string, { id: string; project_id: string; name: string }[]>();
  for (const u of (units ?? []) as { id: string; project_id: string; name: string }[]) {
    if (!u.project_id || !u.name) continue;
    const list = unitsByProject.get(u.project_id) ?? [];
    list.push(u);
    unitsByProject.set(u.project_id, list);
  }

  const normalize = (s: string | null) => (s ?? '').toString().trim().toLowerCase();
  const hoursToUpdate: { id: string; task_id: string }[] = [];
  const unitIds = new Set((units ?? []).map((u: { id: string }) => u.id));

  for (const h of unassigned as { id: string; project_id: string; description: string }[]) {
    if (!h.project_id) continue;
    const description = normalize(h.description);
    const projectTasks = tasksByProject.get(h.project_id) ?? [];
    let matched = false;
    for (const task of projectTasks) {
      if (task.name && description.includes(normalize(task.name))) {
        hoursToUpdate.push({ id: h.id, task_id: task.id });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const projectUnits = unitsByProject.get(h.project_id) ?? [];
    for (const unit of projectUnits) {
      if (unit.name && description.includes(normalize(unit.name))) {
        hoursToUpdate.push({ id: h.id, task_id: unit.id });
        break;
      }
    }
  }

  for (const { id, task_id } of hoursToUpdate) {
    await client.query('UPDATE hour_entries SET task_id = $1 WHERE id = $2', [task_id, id]);
  }

  const { rows: matchedHours } = await client.query(
    `SELECT task_id, SUM(hours) AS total_hours, SUM(COALESCE(actual_cost, reported_standard_cost_amt, 0)) AS total_cost FROM hour_entries WHERE task_id IS NOT NULL GROUP BY task_id`
  );
  let tasksUpdated = 0;
  for (const row of (matchedHours ?? []) as { task_id: string; total_hours: string; total_cost: string }[]) {
    await client.query('UPDATE tasks SET actual_hours = $1, actual_cost = $2 WHERE id = $3', [
      Number(row.total_hours),
      Number(row.total_cost),
      row.task_id,
    ]);
    tasksUpdated++;
  }

  const tasksMatched = hoursToUpdate.filter((u) => !unitIds.has(u.task_id)).length;
  const unitsMatched = hoursToUpdate.length - tasksMatched;
  return {
    tasksMatched,
    unitsMatched,
    stillUnmatched: (unassigned as unknown[]).length - hoursToUpdate.length,
    tasksUpdated,
  };
}

async function syncWorkdayPhasesAzure(client: PgClient): Promise<Record<string, unknown>> {
  const url = workdayConfig.urls.workdayPhases;
  if (!url) return { fetched: 0, upserted: 0 };
  const res = await workdayFetch(url);
  if (!res.ok) throw new Error(`Phases API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const records = (data.Report_Entry ?? data.report_Entry ?? data.ReportEntry ?? []) as Record<string, unknown>[];

  const { rows: projRows } = await client.query('SELECT id FROM projects');
  const projectIds = (projRows as { id: string }[]).map((r) => r.id);

  function leadingDigits(s: string): string | null {
    const m = safeString(s).match(/^(\d+)/);
    return m ? m[1] : null;
  }
  function slug(text: string, max = 30): string {
    return safeString(text).replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').substring(0, max) || 'X';
  }
  function resolveProjectId(leading: string | null): string | null {
    if (!leading || !projectIds.length) return null;
    const set = new Set(projectIds);
    if (set.has(leading)) return leading;
    if (set.has(leading + ' (Inactive)')) return leading + ' (Inactive)';
    for (const id of projectIds) {
      if (id === leading || id.startsWith(leading + ' ') || id.startsWith(leading + '_')) return id;
    }
    return null;
  }

  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const r of records) {
    const projectRaw = String(r.Project ?? r.project ?? '');
    const level1 = safeString(r.Level_1 ?? r.Level1 ?? r.unit ?? '');
    const level2 = safeString(r.Level_2 ?? r.Level2 ?? r.name ?? r.Phase ?? '');
    const leading = leadingDigits(projectRaw);
    const projectId = resolveProjectId(leading);
    if (!projectId || !level2) continue;
    const id = `WP_${projectId}_${slug(level1, 20)}_${slug(level2, 25)}`.replace(/-/g, 'M').substring(0, 50);
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      phase_id: id,
      project_id: projectId,
      unit_id: null,
      unit: level1.substring(0, 255),
      parent_id: null,
      hierarchy_type: null,
      outline_level: null,
      employee_id: null,
      name: level2.substring(0, 255),
      sequence: 0,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) return { fetched: records.length, upserted: 0 };
  const cols = ['id', 'phase_id', 'project_id', 'unit_id', 'unit', 'parent_id', 'hierarchy_type', 'outline_level', 'employee_id', 'name', 'sequence', 'is_active', 'updated_at'];
  const setClause = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const values = batch.flatMap((r) => cols.map((c) => r[c]));
    const placeholders = batch.map((_, bi) => '(' + cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(',') + ')').join(',');
    await client.query(
      `INSERT INTO workday_phases (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`,
      values
    );
  }
  return { fetched: records.length, upserted: rows.length };
}
