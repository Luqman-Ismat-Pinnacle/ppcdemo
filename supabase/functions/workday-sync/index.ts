/**
 * Workday Sync Edge Function – matches Azure WorkdaySyncHttp API.
 * GET/POST; query sync=customerContracts or body { hoursDaysBack }; returns same JSON shape as Azure.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { workdayConfig, workdayFetch } from '../_shared/workday-config.ts';
import { corsHeaders } from '../_shared/cors.ts';

const BATCH = 100;
const PAGE = 1000;

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
  const key = [custName, siteName].filter(Boolean).join(' ') || siteName;
  return generateId('STE', key);
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return h;
}

// --- Employees (mirror Azure sync/employees.js) ---
function mapEmployee(r: Record<string, unknown>): Record<string, unknown> | null {
  const employeeId = (r.Employee_ID ?? r.employee_id ?? r.employeeId ?? r.ID ?? r.Worker_ID ?? r.worker_id) as string | undefined;
  if (!employeeId) return null;
  let name = safeString(r.Worker ?? r.Name ?? r.Full_Name ?? r.full_name ?? '');
  if (!name && (r.firstName || r.First_Name) && (r.lastName || r.Last_Name)) {
    name = `${r.firstName || r.First_Name || ''} ${r.lastName || r.Last_Name || ''}`.trim();
  }
  if (!name) name = safeString(r.firstName ?? r.First_Name) || `Employee ${employeeId}`;
  const activeStatus = r.Active_Status ?? r.active_status ?? r.Status;
  const terminationDate = r.termination_date ?? r.Termination_Date;
  const isActive =
    activeStatus === '1' || activeStatus === 1 || activeStatus === true ||
    activeStatus === 'Active' || activeStatus === 'active' || r.is_active === true ||
    (activeStatus !== '0' && activeStatus !== 0 && activeStatus !== 'Inactive' && !terminationDate);
  return {
    id: String(employeeId),
    employee_id: String(employeeId),
    name: String(name).trim(),
    email: (r.Work_Email ?? r.work_email ?? r.Email ?? r.email ?? r.Primary_Work_Email ?? r.primary_work_email) ? String(r.Work_Email ?? r.work_email ?? r.Email ?? r.email ?? r.Primary_Work_Email ?? r.primary_work_email) : null,
    job_title: safeString(r.businessTitle ?? r.Business_Title ?? r.Default_Job_Title ?? r.Job_Profile_Name ?? r.Job_Title ?? r.Position_Title) || null,
    management_level: safeString(r.Management_Level ?? r.management_level ?? r.Manager_Level) || null,
    manager: safeString(r.Worker_s_Manager ?? r.Workers_Manager ?? r.Manager ?? r.Manager_Name) || null,
    employee_type: safeString(r.Employee_Type ?? r.employee_type ?? r.Worker_Type ?? r.worker_type) || null,
    role: safeString(r.Job_Profile ?? r.job_profile ?? r.Role ?? r.role) || null,
    department: safeString(r.Cost_Center ?? r.cost_center ?? r.Department ?? r.department ?? r.Org_Unit) || null,
    is_active: !!isActive,
  };
}

async function syncEmployees(supabase: ReturnType<typeof createClient>): Promise<{ total: number; valid: number; synced: number }> {
  const url = workdayConfig.urls.employees;
  const res = await workdayFetch(url);
  if (!res.ok) throw new Error(`Workday employees API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let records: unknown[] = Array.isArray(data) ? data : (data.Report_Entry ?? []);
  if (!Array.isArray(records) && data && typeof data === 'object') {
    const key = Object.keys(data).find((k) => Array.isArray((data as Record<string, unknown>)[k]) && ((data as Record<string, unknown>)[k] as unknown[]).length > 0);
    if (key) records = (data as Record<string, unknown>)[key] as unknown[];
  }
  const cleaned = (records as Record<string, unknown>[]).map((r) => mapEmployee(r)).filter(Boolean) as Record<string, unknown>[];
  const batchSize = workdayConfig.sync.batchSize;
  let synced = 0;
  for (let i = 0; i < cleaned.length; i += batchSize) {
    const batch = cleaned.slice(i, i + batchSize);
    const { error } = await supabase.from('employees').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`employees upsert: ${error.message}`);
    synced += batch.length;
  }
  return { total: records.length, valid: cleaned.length, synced };
}

// --- Projects / hierarchy (mirror Azure sync/projects.js) ---
async function syncProjects(supabase: ReturnType<typeof createClient>): Promise<{ portfolios: number; customers: number; sites: number; projects: number; workdayTasks: number }> {
  const resMaster = await workdayFetch(workdayConfig.urls.findProjects);
  if (!resMaster.ok) throw new Error(`Workday Find Projects ${resMaster.status}: ${await resMaster.text()}`);
  const dataMaster = await resMaster.json();
  const masterRecords = (dataMaster.Report_Entry ?? []) as Record<string, unknown>[];

  const portfoliosToUpsert = new Map<string, Record<string, unknown>>();
  const customersToUpsert = new Map<string, Record<string, unknown>>();
  const sitesToUpsert = new Map<string, Record<string, unknown>>();
  const projectsToUpsert = new Map<string, Record<string, unknown>>();

  for (const r of masterRecords) {
    const custName = (r.CF_Customer_Site_Ref_ID ?? r.Customer) as string | undefined;
    const siteName = (r.CF_Project_Site_Ref_ID ?? r.Site) as string | undefined;
    const portfolioMgr = r.Optional_Project_Hierarchies as string | undefined;
    let portfolioId: string | null = null;
    if (portfolioMgr) {
      portfolioId = generateId('PRF', portfolioMgr);
      if (!portfoliosToUpsert.has(portfolioId)) {
        portfoliosToUpsert.set(portfolioId, {
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
      const custId = generateId('CST', custName);
      if (!customersToUpsert.has(custId)) {
        customersToUpsert.set(custId, {
          id: custId,
          customer_id: custId,
          name: custName,
          portfolio_id: portfolioId,
          is_active: true,
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (siteName) {
      const siteId = generateSiteId(custName ?? null, siteName);
      if (siteId && !sitesToUpsert.has(siteId)) {
        sitesToUpsert.set(siteId, {
          id: siteId,
          site_id: siteId,
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
    if (projectId && projectName) {
      const custId = custName ? generateId('CST', custName) : null;
      const siteId = generateSiteId(custName ?? null, siteName ?? null);
      if (!projectsToUpsert.has(projectId)) {
        projectsToUpsert.set(projectId, {
          id: projectId,
          project_id: projectId,
          name: projectName,
          customer_id: custId,
          site_id: siteId,
          has_schedule: false,
          is_active: r['Inactive_-_Current'] !== '1' && r.Project_Status !== 'Closed',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  const workdayTasksToUpsert = new Map<string, Record<string, unknown>>();
  try {
    const resInt = await workdayFetch(workdayConfig.urls.integration);
    if (resInt.ok) {
      const dataInt = await resInt.json();
      const intRecords = (dataInt.Report_Entry ?? []) as Record<string, unknown>[];
      for (const r of intRecords) {
        const taskId = (r.Task_ID ?? r.taskReferenceID) as string | undefined;
        const projectId = (r.projectReferenceID ?? r.Project_ID) as string | undefined;
        if (taskId && projectId && !workdayTasksToUpsert.has(taskId)) {
          workdayTasksToUpsert.set(taskId, {
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
  } catch (_e) {
    console.warn('[workday-sync] Integration report fetch failed (non-fatal)');
  }

  const upsertBatch = async (table: string, items: Record<string, unknown>[], cols?: string[]) => {
    if (items.length === 0) return;
    const batchSize = workdayConfig.sync.hoursBatchSize;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
      if (error) throw new Error(`${table} upsert: ${error.message}`);
    }
  };

  await upsertBatch('portfolios', Array.from(portfoliosToUpsert.values()));
  await upsertBatch('customers', Array.from(customersToUpsert.values()));
  await upsertBatch('sites', Array.from(sitesToUpsert.values()));
  await upsertBatch('projects', Array.from(projectsToUpsert.values()));
  const wtCols = ['id', 'project_id', 'task_name', 'task_number', 'start_date', 'end_date', 'budgeted_hours', 'actual_hours', 'actual_cost', 'status', 'assigned_resource', 'created_at', 'updated_at', 'deleted'];
  await upsertBatch('workday_tasks', Array.from(workdayTasksToUpsert.values()), wtCols);

  return {
    portfolios: portfoliosToUpsert.size,
    customers: customersToUpsert.size,
    sites: sitesToUpsert.size,
    projects: projectsToUpsert.size,
    workdayTasks: workdayTasksToUpsert.size,
  };
}

// --- Customer contracts (mirror Azure sync/customer-contracts.js) ---
const CURRENCY_TO_USD: Record<string, number> = {
  USD: 1, US: 1, EUR: 1.08, GBP: 1.27, CAD: 0.74, AUD: 0.65, JPY: 0.0067, CHF: 1.13, MXN: 0.058, INR: 0.012,
};

function leadingDigitsFromBillableProject(raw: string): string | null {
  const s = safeString(raw);
  if (!s) return null;
  const match = s.match(/^(\d+)/);
  return match ? match[1] : null;
}

function resolveProjectId(billableProjectRaw: string, existingProjectIds: string[]): string | null {
  const leading = leadingDigitsFromBillableProject(billableProjectRaw);
  if (!leading || existingProjectIds.length === 0) return null;
  const set = new Set(existingProjectIds);
  if (set.has(leading)) return leading;
  if (set.has(leading + ' (Inactive)')) return leading + ' (Inactive)';
  for (const id of existingProjectIds) {
    if (id === leading || id.startsWith(leading + ' ') || id.startsWith(leading + '_')) return id;
  }
  return null;
}

function toUsd(amount: number, currency: string): number | null {
  if (Number.isNaN(amount)) return null;
  const code = safeString(currency).toUpperCase().replace(/\s/g, '');
  const rate = CURRENCY_TO_USD[code] ?? (code.startsWith('US') ? 1 : null);
  if (rate == null) return null;
  return Math.round(amount * rate * 100) / 100;
}

async function syncCustomerContracts(supabase: ReturnType<typeof createClient>): Promise<{ fetched: number; upserted: number }> {
  const url = workdayConfig.urls.customerContracts;
  if (!url) return { fetched: 0, upserted: 0 };
  const res = await workdayFetch(url);
  if (!res.ok) throw new Error(`Workday customer contracts API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const records = (data.Report_Entry ?? data.report_Entry ?? data.ReportEntry ?? []) as Record<string, unknown>[];

  let projectIds: string[] = [];
  const { data: projRows } = await supabase.from('projects').select('id');
  if (projRows) projectIds = projRows.map((row: { id: string }) => row.id);

  const rows: Record<string, unknown>[] = [];
  for (let idx = 0; idx < records.length; idx++) {
    const r = records[idx];
    const lineAmount = (r.Line_Amount ?? r.line_amount ?? r.LineAmount) as number | undefined;
    const lineFromDate = r.Line_From_Date ?? r.line_from_date ?? r.LineFromDate ?? r.Date ?? r.date;
    const currency = safeString(r.Currency ?? r.currency ?? 'USD') || 'USD';
    const billableProject = String(r.Billable_Project ?? r.billable_project ?? r.BillableProject ?? '');
    const referenceID = safeString(r.referenceID ?? r.referenceId ?? r.reference_id ?? '');

    const amount = parseFloat(String(lineAmount));
    if (Number.isNaN(amount)) continue;
    const projectId = resolveProjectId(billableProject, projectIds);
    let dateOnly: string | null = null;
    if (lineFromDate != null) {
      if (typeof lineFromDate === 'string') {
        const part = lineFromDate.split('T')[0].split(' ')[0].trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(part)) dateOnly = part;
        else {
          const d = new Date(lineFromDate as string);
          if (!Number.isNaN(d.getTime())) dateOnly = d.toISOString().split('T')[0];
        }
      } else if (lineFromDate instanceof Date && !Number.isNaN(lineFromDate.getTime())) {
        dateOnly = lineFromDate.toISOString().split('T')[0];
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
  const batchSize = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('customer_contracts').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`customer_contracts upsert: ${error.message}`);
    upserted += batch.length;
  }
  return { fetched: records.length, upserted };
}

// --- Hours (mirror Azure sync/hours.js) ---
function buildHoursUrl(startDate: Date, endDate: Date): string {
  const formatDate = (d: Date) => d.toISOString().split('T')[0] + '-08:00';
  const params = new URLSearchParams({
    'Projects_and_Project_Hierarchies!WID': workdayConfig.urls.hoursQueryWid,
    'Include_Subordinate_Project_Hierarchies': '1',
    'Currency_Rate_Type!WID': workdayConfig.urls.currencyRateTypeWid,
    'Reporting_Currency!WID': workdayConfig.urls.reportingCurrencyWid,
    'Start_Date': formatDate(startDate),
    'End_Date': formatDate(endDate),
    'format': 'json',
  });
  return `${workdayConfig.urls.hoursBase}?${params.toString()}`;
}

async function syncHoursChunk(
  supabase: ReturnType<typeof createClient>,
  startDate: Date,
  endDate: Date,
  existingProjectIds: Set<string>,
  existingEmployeeIds: Set<string>
): Promise<{ fetched: number; hours: number; phases: number; tasks: number; skippedNoProject?: number; skippedNoEmployee?: number; skippedNoWorkdayId?: number; skippedNoDate?: number; filteredByFk?: number }> {
  const url = buildHoursUrl(startDate, endDate);
  const res = await workdayFetch(url);
  if (!res.ok) throw new Error(`Workday hours API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const records = (data.Report_Entry ?? data.report_Entry ?? data.ReportEntry ?? []) as Record<string, unknown>[];

  if (records.length === 0) return { fetched: 0, hours: 0, phases: 0, tasks: 0 };

  let skippedNoProject = 0;
  let skippedNoEmployee = 0;
  let skippedNoWorkdayId = 0;
  let skippedNoDate = 0;
  const hoursToUpsert = new Map<string, Record<string, unknown>>();
  const phasesToUpsert = new Map<string, Record<string, unknown>>();
  const tasksToUpsert = new Map<string, Record<string, unknown>>();

  for (const r of records) {
    const rawProjectId = safeString(r.Project_ID ?? r.Project_Id ?? r.project_id);
    if (!rawProjectId) {
      skippedNoProject++;
      continue;
    }
    const projectId = cleanProjectId(rawProjectId);
    const employeeId = safeString(r.Employee_ID ?? r.Employee_Id ?? r.employee_id);
    const workdayId = safeString(r.workdayID ?? r.referenceID ?? r.Reference_ID ?? r.Transaction_ID ?? r.id);
    if (!employeeId) {
      skippedNoEmployee++;
      continue;
    }
    if (!workdayId) {
      skippedNoWorkdayId++;
      continue;
    }

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
    if (!dateOnly) {
      skippedNoDate++;
      continue;
    }
    const description = (safeString(r.Time_Type ?? r.Billable_Transaction ?? r.time_type) || safeString(r.Billable_Transaction ?? r.billable_transaction)).substring(0, 500);
    const parsed = parseHourDescription(description);
    const billableRate = parseFloat(String(r.Billable_Rate ?? r.billable_rate ?? '0')) || 0;
    const billableAmount = parseFloat(String(r.Billable_Amount ?? r.billable_amount ?? '0')) || 0;
    const standardCostRate = parseFloat(String(r.Standard_Cost_Rate ?? r.standard_cost_rate ?? '0')) || 0;
    const standardCostAmt = parseFloat(String(r.Reported_Standard_Cost_Amt ?? r.Reported_Standard_22 ?? r.reported_standard_cost_amt ?? '0')) || 0;
    const reportedStandard22 = parseFloat(String(r.Reported_Standard_22 ?? r.reported_standard_22 ?? '0')) || 0;
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
        customer_billing_status: safeString(r.Customer_Billing_Status ?? r.customer_billing_status).substring(0, 50) || null,
        invoice_number: safeString(r.Invoice_Number ?? r.invoice_number).substring(0, 50) || null,
        invoice_status: safeString(r.Invoice_Status ?? r.invoice_status).substring(0, 50) || null,
        charge_type: safeString(r.Charge_Code ?? r.Charge_Type ?? r.charge_code ?? r.charge_type).substring(0, 10) || null,
      });
    }
  }

  const phaseList = Array.from(phasesToUpsert.values()).filter((p) => existingProjectIds.has(String(p.project_id)));
  const taskList = Array.from(tasksToUpsert.values()).filter((t) => existingProjectIds.has(String(t.project_id)));
  const beforeFk = hoursToUpsert.size;
  let hourList = Array.from(hoursToUpsert.values()).filter(
    (h) => existingProjectIds.has(String(h.project_id)) && existingEmployeeIds.has(String(h.employee_id))
  );
  const filteredByFk = beforeFk - hourList.length;

  const batchSize = workdayConfig.sync.hoursBatchSize;
  const upsertBatch = async (table: string, items: Record<string, unknown>[]) => {
    if (items.length === 0) return;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
      if (error) throw new Error(`${table} upsert: ${error.message}`);
    }
  };

  await upsertBatch('phases', phaseList);
  await upsertBatch('tasks', taskList);
  await upsertBatch('hour_entries', hourList);

  return {
    fetched: records.length,
    hours: hourList.length,
    phases: phaseList.length,
    tasks: taskList.length,
    skippedNoProject,
    skippedNoEmployee,
    skippedNoWorkdayId,
    skippedNoDate,
    filteredByFk,
  };
}

// --- Matching + aggregation (mirror Azure sync/matching.js) ---
async function runMatchingAndAggregation(supabase: ReturnType<typeof createClient>): Promise<{ tasksMatched: number; unitsMatched: number; stillUnmatched: number; tasksUpdated: number }> {
  const unassigned: { id: string; project_id: string | null; description: string | null }[] = [];
  let offset = 0;
  while (true) {
    const { data: rows } = await supabase
      .from('hour_entries')
      .select('id, project_id, description')
      .is('task_id', null)
      .range(offset, offset + PAGE - 1);
    if (!rows || rows.length === 0) break;
    for (const row of rows) unassigned.push({ id: row.id, project_id: row.project_id ?? null, description: row.description ?? null });
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  if (unassigned.length === 0) {
    return { tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0, tasksUpdated: 0 };
  }

  const tasks: { id: string; project_id: string | null; name: string | null }[] = [];
  offset = 0;
  while (true) {
    const { data: rows } = await supabase.from('tasks').select('id, project_id, name').range(offset, offset + PAGE - 1);
    if (!rows || rows.length === 0) break;
    for (const row of rows) tasks.push({ id: row.id, project_id: row.project_id ?? null, name: row.name ?? null });
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const units: { id: string; project_id: string | null; name: string | null }[] = [];
  offset = 0;
  while (true) {
    const { data: rows } = await supabase.from('units').select('id, project_id, name').range(offset, offset + PAGE - 1);
    if (!rows || rows.length === 0) break;
    for (const row of rows) units.push({ id: row.id, project_id: row.project_id ?? null, name: row.name ?? null });
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const tasksByProject = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!t.project_id || !t.name) continue;
    const list = tasksByProject.get(t.project_id) ?? [];
    list.push(t);
    tasksByProject.set(t.project_id, list);
  }
  const unitsByProject = new Map<string, typeof units>();
  for (const u of units) {
    if (!u.project_id || !u.name) continue;
    const list = unitsByProject.get(u.project_id) ?? [];
    list.push(u);
    unitsByProject.set(u.project_id, list);
  }

  const normalize = (s: string | null) => (s ?? '').toString().trim().toLowerCase();
  const hoursToUpdate: { id: string; task_id: string }[] = [];

  for (const h of unassigned) {
    if (!h.project_id) continue;
    const description = normalize(h.description);
    const projectTasks = tasksByProject.get(h.project_id) ?? [];
    let matched = false;
    for (const task of projectTasks) {
      const taskName = normalize(task.name);
      if (taskName && description.includes(taskName)) {
        hoursToUpdate.push({ id: h.id, task_id: task.id });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const projectUnits = unitsByProject.get(h.project_id) ?? [];
    for (const unit of projectUnits) {
      const unitName = normalize(unit.name);
      if (unitName && description.includes(unitName)) {
        hoursToUpdate.push({ id: h.id, task_id: unit.id });
        break;
      }
    }
  }

  const unitIds = new Set(units.map((u) => u.id));
  let tasksMatched = 0;
  let unitsMatched = 0;
  for (const u of hoursToUpdate) {
    if (unitIds.has(u.task_id)) unitsMatched++;
    else tasksMatched++;
  }

  for (let i = 0; i < hoursToUpdate.length; i += BATCH) {
    const batch = hoursToUpdate.slice(i, i + BATCH);
    for (const { id, task_id } of batch) {
      await supabase.from('hour_entries').update({ task_id }).eq('id', id);
    }
  }

  const matchedHoursByTask = new Map<string, { total_hours: number; total_cost: number }>();
  offset = 0;
  while (true) {
    const { data: rows } = await supabase
      .from('hour_entries')
      .select('task_id, hours, actual_cost, reported_standard_cost_amt')
      .not('task_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      const tid = row.task_id as string;
      const hours = Number(row.hours ?? 0);
      const cost = Number(row.actual_cost ?? row.reported_standard_cost_amt ?? 0);
      const cur = matchedHoursByTask.get(tid) ?? { total_hours: 0, total_cost: 0 };
      cur.total_hours += hours;
      cur.total_cost += cost;
      matchedHoursByTask.set(tid, cur);
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  let tasksUpdated = 0;
  for (const [taskId, agg] of matchedHoursByTask) {
    const { error } = await supabase.from('tasks').update({ actual_hours: agg.total_hours, actual_cost: agg.total_cost }).eq('id', taskId);
    if (!error) tasksUpdated++;
  }

  return {
    tasksMatched,
    unitsMatched,
    stillUnmatched: unassigned.length - hoursToUpdate.length,
    tasksUpdated,
  };
}

// --- Workday phases (mirror Azure sync/workday-phases.js) ---
function leadingDigits(raw: string): string | null {
  const s = safeString(raw);
  if (!s) return null;
  const m = s.match(/^(\d+)/);
  return m ? m[1] : null;
}

function slug(text: string, maxLen = 30): string {
  return safeString(text).replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').substring(0, maxLen) || 'X';
}

function resolvePhaseProjectId(leading: string | null, existingProjectIds: string[]): string | null {
  if (!leading || existingProjectIds.length === 0) return null;
  const set = new Set(existingProjectIds);
  if (set.has(leading)) return leading;
  if (set.has(leading + ' (Inactive)')) return leading + ' (Inactive)';
  for (const id of existingProjectIds) {
    if (id === leading || id.startsWith(leading + ' ') || id.startsWith(leading + '_')) return id;
  }
  return null;
}

async function syncWorkdayPhases(supabase: ReturnType<typeof createClient>): Promise<{ fetched: number; upserted: number; skippedNoProject?: number; skippedNoLevel2?: number; deduped?: number }> {
  const url = workdayConfig.urls.workdayPhases;
  if (!url) return { fetched: 0, upserted: 0 };
  const res = await workdayFetch(url);
  if (!res.ok) throw new Error(`Workday phases API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const records = (data.Report_Entry ?? data.report_Entry ?? data.ReportEntry ?? []) as Record<string, unknown>[];

  let projectIds: string[] = [];
  const { data: projRows } = await supabase.from('projects').select('id');
  if (projRows) projectIds = projRows.map((row: { id: string }) => row.id);

  let skippedNoProject = 0;
  let skippedNoLevel2 = 0;
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const r of records) {
    const projectRaw = String(r.Project ?? r.project ?? '');
    const level1 = safeString(r.Level_1 ?? r.Level1 ?? r.unit ?? '');
    const level2 = safeString(r.Level_2 ?? r.Level2 ?? r.name ?? r.Phase ?? '');
    const leading = leadingDigits(projectRaw);
    const projectId = resolvePhaseProjectId(leading, projectIds);
    if (!projectId) {
      skippedNoProject++;
      continue;
    }
    if (!level2) {
      skippedNoLevel2++;
      continue;
    }
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

  if (rows.length === 0) return { fetched: records.length, upserted: 0, skippedNoProject, skippedNoLevel2, deduped: 0 };
  const batchSize = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('workday_phases').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`workday_phases upsert: ${error.message}`);
    upserted += batch.length;
  }
  const deduped = records.length - skippedNoProject - skippedNoLevel2 - rows.length;
  return { fetched: records.length, upserted, skippedNoProject, skippedNoLevel2, deduped };
}

// --- Full sync (mirror Azure run-sync.js) ---
async function runFullSync(supabase: ReturnType<typeof createClient>, hoursDaysBackOverride?: number): Promise<Record<string, unknown>> {
  const HOURS_DAYS_BACK =
    typeof hoursDaysBackOverride === 'number' && hoursDaysBackOverride >= 1 && hoursDaysBackOverride <= 730
      ? hoursDaysBackOverride
      : workdayConfig.sync.hoursDaysBack;
  const WINDOW_DAYS = workdayConfig.sync.windowDays;
  const HOURS_COOLDOWN_MS = workdayConfig.sync.hoursChunkCooldownMs ?? 1200;

  const summary: Record<string, unknown> = {
    employees: null,
    hierarchy: null,
    hours: {
      chunksOk: 0,
      chunksFail: 0,
      totalHours: 0,
      totalFetched: 0,
      hoursDaysBack: HOURS_DAYS_BACK,
      lastError: null as string | null,
    },
    matching: null,
    customerContracts: null,
    workdayPhases: null,
  };

  summary.employees = await syncEmployees(supabase);

  summary.hierarchy = await syncProjects(supabase);

  try {
    summary.customerContracts = await syncCustomerContracts(supabase);
  } catch (e) {
    summary.customerContracts = { error: (e as Error).message };
  }

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - HOURS_DAYS_BACK);
  const totalChunks = Math.ceil(HOURS_DAYS_BACK / WINDOW_DAYS);

  let existingProjectIds = new Set<string>();
  let existingEmployeeIds = new Set<string>();
  const { data: projRows } = await supabase.from('projects').select('id');
  const { data: empRows } = await supabase.from('employees').select('id');
  if (projRows) projRows.forEach((row: { id: string }) => existingProjectIds.add(row.id));
  if (empRows) empRows.forEach((row: { id: string }) => existingEmployeeIds.add(row.id));

  const hoursSummary = summary.hours as Record<string, unknown>;
  let sumSkippedNoProject = 0;
  let sumSkippedNoEmployee = 0;
  let sumSkippedNoWorkdayId = 0;
  let sumSkippedNoDate = 0;
  let sumFilteredByFk = 0;
  for (let i = 0; i < totalChunks; i++) {
    const chunkEnd = new Date(end);
    chunkEnd.setDate(end.getDate() - i * WINDOW_DAYS);
    const chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() - WINDOW_DAYS + 1);
    if (chunkStart.getTime() < start.getTime()) chunkStart.setTime(start.getTime());
    try {
      const result = await syncHoursChunk(supabase, chunkStart, chunkEnd, existingProjectIds, existingEmployeeIds);
      hoursSummary.chunksOk = (hoursSummary.chunksOk as number) + 1;
      hoursSummary.totalFetched = (hoursSummary.totalFetched as number) + (result.fetched ?? 0);
      hoursSummary.totalHours = (hoursSummary.totalHours as number) + (result.hours ?? 0);
      sumSkippedNoProject += result.skippedNoProject ?? 0;
      sumSkippedNoEmployee += result.skippedNoEmployee ?? 0;
      sumSkippedNoWorkdayId += result.skippedNoWorkdayId ?? 0;
      sumSkippedNoDate += result.skippedNoDate ?? 0;
      sumFilteredByFk += result.filteredByFk ?? 0;
      if (i < totalChunks - 1) await new Promise((r) => setTimeout(r, HOURS_COOLDOWN_MS));
    } catch (e) {
      hoursSummary.chunksFail = (hoursSummary.chunksFail as number) + 1;
      hoursSummary.lastError = (e as Error).message ?? String(e);
    }
  }
  if (sumSkippedNoProject || sumSkippedNoEmployee || sumSkippedNoWorkdayId || sumSkippedNoDate || sumFilteredByFk) {
    hoursSummary.skippedNoProject = sumSkippedNoProject;
    hoursSummary.skippedNoEmployee = sumSkippedNoEmployee;
    hoursSummary.skippedNoWorkdayId = sumSkippedNoWorkdayId;
    hoursSummary.skippedNoDate = sumSkippedNoDate;
    hoursSummary.filteredByFk = sumFilteredByFk;
  }

  try {
    summary.matching = await runMatchingAndAggregation(supabase);
  } catch (_e) {
    // non-fatal
  }

  try {
    summary.workdayPhases = await syncWorkdayPhases(supabase);
  } catch (e) {
    summary.workdayPhases = { error: (e as Error).message };
  }

  return summary;
}

/** Hours-only sync (day-by-day with cooldown): no employees/projects/customerContracts/workdayPhases. Use to stay under worker limits. */
async function runHoursOnlySync(
  supabase: ReturnType<typeof createClient>,
  hoursDaysBackOverride: number,
  startDateOverride?: string,
  endDateOverride?: string
): Promise<Record<string, unknown>> {
  const WINDOW_DAYS = workdayConfig.sync.windowDays;
  const HOURS_COOLDOWN_MS = workdayConfig.sync.hoursChunkCooldownMs ?? 500;

  let start: Date;
  let end: Date;
  let hoursDaysBack: number;
  if (startDateOverride && endDateOverride) {
    start = new Date(startDateOverride + 'T12:00:00Z');
    end = new Date(endDateOverride + 'T12:00:00Z');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error('Invalid startDate/endDate; use YYYY-MM-DD');
    }
    hoursDaysBack = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    hoursDaysBack = Math.min(730, Math.max(1, hoursDaysBack));
  } else {
    hoursDaysBack = Math.min(730, Math.max(1, hoursDaysBackOverride));
    end = new Date();
    start = new Date();
    start.setDate(start.getDate() - hoursDaysBack);
  }

  const totalChunks = Math.ceil(hoursDaysBack / WINDOW_DAYS);

  const summary: Record<string, unknown> = {
    employees: null,
    hierarchy: null,
    hours: {
      chunksOk: 0,
      chunksFail: 0,
      totalHours: 0,
      totalFetched: 0,
      hoursDaysBack,
      lastError: null as string | null,
    },
    matching: null,
    customerContracts: null,
    workdayPhases: null,
  };

  let existingProjectIds = new Set<string>();
  let existingEmployeeIds = new Set<string>();
  const { data: projRows } = await supabase.from('projects').select('id');
  const { data: empRows } = await supabase.from('employees').select('id');
  if (projRows) projRows.forEach((row: { id: string }) => existingProjectIds.add(row.id));
  if (empRows) empRows.forEach((row: { id: string }) => existingEmployeeIds.add(row.id));

  const hoursSummary = summary.hours as Record<string, unknown>;
  let sumSkippedNoProject = 0;
  let sumSkippedNoEmployee = 0;
  let sumSkippedNoWorkdayId = 0;
  let sumSkippedNoDate = 0;
  let sumFilteredByFk = 0;
  for (let i = 0; i < totalChunks; i++) {
    const chunkEnd = new Date(end);
    chunkEnd.setDate(end.getDate() - i * WINDOW_DAYS);
    const chunkStart = new Date(chunkEnd);
    chunkStart.setDate(chunkStart.getDate() - WINDOW_DAYS + 1);
    if (chunkStart.getTime() < start.getTime()) chunkStart.setTime(start.getTime());
    try {
      const result = await syncHoursChunk(supabase, chunkStart, chunkEnd, existingProjectIds, existingEmployeeIds);
      hoursSummary.chunksOk = (hoursSummary.chunksOk as number) + 1;
      hoursSummary.totalFetched = (hoursSummary.totalFetched as number) + (result.fetched ?? 0);
      hoursSummary.totalHours = (hoursSummary.totalHours as number) + (result.hours ?? 0);
      sumSkippedNoProject += result.skippedNoProject ?? 0;
      sumSkippedNoEmployee += result.skippedNoEmployee ?? 0;
      sumSkippedNoWorkdayId += result.skippedNoWorkdayId ?? 0;
      sumSkippedNoDate += result.skippedNoDate ?? 0;
      sumFilteredByFk += result.filteredByFk ?? 0;
      if (i < totalChunks - 1) await new Promise((r) => setTimeout(r, HOURS_COOLDOWN_MS));
    } catch (e) {
      hoursSummary.chunksFail = (hoursSummary.chunksFail as number) + 1;
      hoursSummary.lastError = (e as Error).message ?? String(e);
    }
  }
  if (sumSkippedNoProject || sumSkippedNoEmployee || sumSkippedNoWorkdayId || sumSkippedNoDate || sumFilteredByFk) {
    hoursSummary.skippedNoProject = sumSkippedNoProject;
    hoursSummary.skippedNoEmployee = sumSkippedNoEmployee;
    hoursSummary.skippedNoWorkdayId = sumSkippedNoWorkdayId;
    hoursSummary.skippedNoDate = sumSkippedNoDate;
    hoursSummary.filteredByFk = sumFilteredByFk;
  }

  try {
    summary.matching = await runMatchingAndAggregation(supabase);
  } catch (_e) {
    /* non-fatal */
  }

  return summary;
}

// --- HTTP handler (mirror Azure index.js httpTrigger) ---
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  try {
    if (req.body) body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (_e) {
    // ignore
  }
  const syncOnly = url.searchParams.get('sync') ?? (body?.sync as string | undefined);

  const res: { status: number; body: Record<string, unknown>; headers: Record<string, string> } = {
    status: 200,
    body: {},
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  };

  try {
    if (!workdayConfig.workday.user || !workdayConfig.workday.pass) {
      res.status = 500;
      res.body = { success: false, error: 'WORKDAY_ISU_USER and WORKDAY_ISU_PASS must be set' };
      return new Response(JSON.stringify(res.body), { status: res.status, headers: res.headers });
    }

    const azureConn = Deno.env.get('POSTGRES_CONNECTION_STRING') || Deno.env.get('AZURE_POSTGRES_CONNECTION_STRING');
    let summary: Record<string, unknown>;

    if (azureConn) {
      // Write to Azure Postgres (Supabase as middle man: fetch Workday → upsert to Azure)
      let hoursDaysBack = workdayConfig.sync.hoursDaysBack;
      if (typeof body.hoursDaysBack === 'number') {
        hoursDaysBack = Math.min(730, Math.max(1, body.hoursDaysBack));
      }
      const azureResult = await import('./azure-db.ts').then((m) => m.runFullSyncAzure(azureConn, hoursDaysBack, syncOnly));
      if ((azureResult as Record<string, unknown>)._customerContractsOnly) {
        res.body = { success: true, customerContracts: (azureResult as Record<string, unknown>).customerContracts };
        return new Response(JSON.stringify(res.body), { status: res.status, headers: res.headers });
      }
      summary = azureResult;
    } else {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (!supabaseUrl || !supabaseKey) {
        res.status = 500;
        res.body = { success: false, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or set POSTGRES_CONNECTION_STRING to write to Azure Postgres.' };
        return new Response(JSON.stringify(res.body), { status: res.status, headers: res.headers });
      }
      const supabase = createClient(supabaseUrl, supabaseKey);

      if (syncOnly === 'customerContracts') {
        const result = await syncCustomerContracts(supabase);
        res.body = { success: true, customerContracts: result };
        return new Response(JSON.stringify(res.body), { status: res.status, headers: res.headers });
      }

      let hoursDaysBack = workdayConfig.sync.hoursDaysBack;
      if (typeof body.hoursDaysBack === 'number') {
        hoursDaysBack = Math.min(730, Math.max(1, body.hoursDaysBack));
      }

      if (syncOnly === 'hours') {
        const startDate = typeof body.startDate === 'string' ? body.startDate : undefined;
        const endDate = typeof body.endDate === 'string' ? body.endDate : undefined;
        summary = await runHoursOnlySync(supabase, hoursDaysBack, startDate, endDate);
      } else {
        summary = await runFullSync(supabase, hoursDaysBack);
      }
    }

    const results: Record<string, unknown> = {};
    if (summary.employees != null) results.employees = { success: true, summary: summary.employees };
    if (summary.hierarchy != null) results.hierarchy = { success: true, summary: summary.hierarchy };
    if (summary.hours != null) {
      const h = summary.hours as Record<string, unknown>;
      results.hours = {
        success: (h.chunksFail ?? 0) === 0,
        summary: {
          chunksOk: h.chunksOk,
          chunksFail: h.chunksFail,
          totalHours: h.totalHours,
          totalFetched: h.totalFetched,
          hoursDaysBack: h.hoursDaysBack,
          lastError: h.lastError ?? undefined,
          skippedNoProject: h.skippedNoProject,
          skippedNoEmployee: h.skippedNoEmployee,
          skippedNoWorkdayId: h.skippedNoWorkdayId,
          skippedNoDate: h.skippedNoDate,
          filteredByFk: h.filteredByFk,
        },
      };
    }
    if (summary.matching != null) results.matching = { success: true, summary: summary.matching };
    if (summary.customerContracts != null) {
      const cc = summary.customerContracts as Record<string, unknown>;
      results.customerContracts = cc.error
        ? { success: false, error: cc.error, summary: summary.customerContracts }
        : { success: true, summary: summary.customerContracts };
    }
    if (summary.workdayPhases != null) {
      const wp = summary.workdayPhases as Record<string, unknown>;
      results.workdayPhases = wp.error
        ? { success: false, error: wp.error, summary: summary.workdayPhases }
        : { success: true, summary: summary.workdayPhases };
    }

    res.body = { success: true, summary, results };
    return new Response(JSON.stringify(res.body), { status: res.status, headers: res.headers });
  } catch (err) {
    res.status = 500;
    res.body = { success: false, error: (err as Error).message };
    return new Response(JSON.stringify(res.body), { status: res.status, headers: res.headers });
  }
});
