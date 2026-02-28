/**
 * Workday hours sync – 1:1 with Supabase workday-hours Edge Function.
 * Fetches Project Labor Transactions for a date range, upserts hour_entries (and phase/task skeletons if needed).
 */

const config = require('../config');

const log = (msg, detail) => {
  const out = detail !== undefined ? `[HoursSync] ${msg} ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : `[HoursSync] ${msg}`;
  console.log(out);
};

function workdayFetch(url) {
  const auth = Buffer.from(`${config.workday.user}:${config.workday.pass}`).toString('base64');
  return fetch(url, { headers: { Accept: 'application/json', Authorization: `Basic ${auth}` } });
}

function safeString(val) {
  return (val != null ? String(val) : '').trim();
}

function cleanProjectId(raw) {
  if (!raw) return '';
  return String(raw).replace(/\s*\(Inactive\)\s*$/i, '').trim().substring(0, 50);
}

function generateSlug(text) {
  return String(text).replace(/[^A-Za-z0-9]/g, '').substring(0, 20);
}

/** Normalize to YYYY-MM-DD for Postgres DATE column */
function toDateOnly(val) {
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

function buildHoursUrl(startDate, endDate) {
  const formatDate = (d) => d.toISOString().split('T')[0] + '-08:00';
  const params = new URLSearchParams({
    'Projects_and_Project_Hierarchies!WID': config.urls.hoursQueryWid,
    'Include_Subordinate_Project_Hierarchies': '1',
    'Currency_Rate_Type!WID': config.urls.currencyRateTypeWid,
    'Reporting_Currency!WID': config.urls.reportingCurrencyWid,
    'Start_Date': formatDate(startDate),
    'End_Date': formatDate(endDate),
    'format': 'json',
  });
  return `${config.urls.hoursBase}?${params.toString()}`;
}

async function syncHours(client, startDate, endDate) {
  if (!config.workday.user || !config.workday.pass) {
    throw new Error('WORKDAY_ISU_USER and WORKDAY_ISU_PASS must be set');
  }

  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  const url = buildHoursUrl(start, end);
  log('Fetching hours', { url, start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] });

  const response = await workdayFetch(url);
  const responseText = await response.text();
  if (!response.ok) {
    log('Workday hours API error', { status: response.status, body: responseText.slice(0, 500) });
    throw new Error(`Workday hours API ${response.status}: ${responseText.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    log('Hours response JSON parse failed', e.message);
    throw new Error(`Hours response not valid JSON: ${e.message}`);
  }

  const records = data.Report_Entry || data.report_Entry || data.ReportEntry || [];
  log('Hours report parsed', {
    recordCount: records.length,
    topLevelKeys: Object.keys(data).slice(0, 15),
    sampleKeys: records[0] ? Object.keys(records[0]).slice(0, 25) : [],
  });

  if (records.length === 0) {
    log('No hour records in report; skipping upserts');
    return { fetched: 0, hours: 0, phases: 0, tasks: 0 };
  }

  const hoursToUpsert = new Map();
  const phasesToUpsert = new Map();
  const tasksToUpsert = new Map();
  let skippedNoProject = 0;
  let skippedNoEmployee = 0;
  let skippedNoWorkdayId = 0;

  for (const r of records) {
    const rawProjectId = safeString(r.Project_ID || r.Project_Id || r.project_id);
    if (!rawProjectId) {
      skippedNoProject++;
      continue;
    }
    const projectId = cleanProjectId(rawProjectId);
    const employeeId = safeString(r.Employee_ID || r.Employee_Id || r.employee_id);
    const workdayId = safeString(r.workdayID || r.referenceID || r.Reference_ID || r.Transaction_ID || r.id);
    if (!employeeId) {
      skippedNoEmployee++;
      continue;
    }
    if (!workdayId) {
      skippedNoWorkdayId++;
      continue;
    }

    const rawPhaseName = safeString(r.Phase || r.phase) || 'General Phase';
    const rawTaskName = safeString(r.Task || r.task) || 'General Task';
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

    const hoursVal = parseFloat(r.Hours || r.hours || '0') || 0;
    const dateRaw = r.Transaction_Date || r.transaction_date || r.Date || r.date;
    const dateOnly = toDateOnly(dateRaw);
    if (!dateOnly) {
      log('Skip hour entry: invalid date', { dateRaw, workdayId: workdayId.slice(0, 20) });
      continue;
    }
    const description = (safeString(r.Time_Type || r.Billable_Transaction || r.time_type) || safeString(r.Billable_Transaction || r.billable_transaction)).substring(0, 500);
    const billableRate = parseFloat(r.Billable_Rate || r.billable_rate || '0') || 0;
    const billableAmount = parseFloat(r.Billable_Amount || r.billable_amount || '0') || 0;
    const standardCostRate = parseFloat(r.Standard_Cost_Rate || r.standard_cost_rate || '0') || 0;
    const standardCostAmt = parseFloat(r.Reported_Standard_Cost_Amt || r.Reported_Standard_22 || r.reported_standard_cost_amt || '0') || 0;
    const reportedStandard22 = parseFloat(r.Reported_Standard_22 || r.reported_standard_22 || '0') || 0;
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
        workday_phase: rawPhaseName,
        workday_task: rawTaskName,
        billable_rate: billableRate,
        billable_amount: billableAmount,
        standard_cost_rate: standardCostRate,
        reported_standard_cost_amt: standardCostAmt,
        actual_cost: actualCost,
        actual_revenue: actualRevenue,
        customer_billing_status: safeString(r.Customer_Billing_Status || r.customer_billing_status).substring(0, 50) || null,
        invoice_number: safeString(r.Invoice_Number || r.invoice_number).substring(0, 50) || null,
        invoice_status: safeString(r.Invoice_Status || r.invoice_status).substring(0, 50) || null,
        charge_type: safeString(r.Charge_Code || r.Charge_Type || r.charge_code || r.charge_type).substring(0, 10) || null,
      });
    }
  }

  if (skippedNoProject || skippedNoEmployee || skippedNoWorkdayId) {
    log('Skipped records', { skippedNoProject, skippedNoEmployee, skippedNoWorkdayId });
  }

  const phaseList = Array.from(phasesToUpsert.values());
  const taskList = Array.from(tasksToUpsert.values());
  let hourList = Array.from(hoursToUpsert.values());

  const existingProjectIds = new Set();
  const existingEmployeeIds = new Set();
  try {
    const projRes = await client.query('SELECT id FROM projects');
    projRes.rows.forEach((row) => existingProjectIds.add(String(row.id)));
    const empRes = await client.query('SELECT id FROM employees');
    empRes.rows.forEach((row) => existingEmployeeIds.add(String(row.id)));
    log('Existing FK sets', { projects: existingProjectIds.size, employees: existingEmployeeIds.size });
  } catch (e) {
    log('Could not load existing projects/employees for FK filter', e.message);
  }

  const beforeFilter = hourList.length;
  hourList = hourList.filter((h) => {
    const hasProject = existingProjectIds.has(h.project_id);
    const hasEmployee = existingEmployeeIds.has(h.employee_id);
    return hasProject && hasEmployee;
  });
  if (hourList.length < beforeFilter) {
    log('Filtered hour_entries by FK', { before: beforeFilter, after: hourList.length, dropped: beforeFilter - hourList.length });
  }

  const phaseListFiltered = phaseList.filter((p) => existingProjectIds.has(p.project_id));
  const taskListFiltered = taskList.filter((t) => existingProjectIds.has(t.project_id));
  if (phaseListFiltered.length < phaseList.length || taskListFiltered.length < taskList.length) {
    log('Filtered phases/tasks by existing projects', { phases: phaseListFiltered.length, tasks: taskListFiltered.length });
  }

  const batchSize = config.sync.hoursBatchSize;
  const upsert = async (table, items, cols) => {
    if (items.length === 0) return;
    const allCols = cols || Object.keys(items[0]);
    const setClause = allCols.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const values = batch.map(r => allCols.map(c => r[c]));
      const placeholders = batch.map((_, bi) => '(' + allCols.map((_, ci) => `$${bi * allCols.length + ci + 1}`).join(',') + ')').join(',');
      const sql = `INSERT INTO ${table} (${allCols.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`;
      try {
        await client.query(sql, values.flat());
      } catch (err) {
        const code = err.code || '';
        const detail = err.detail || err.message;
        const fullMsg = [code, detail].filter(Boolean).join(' ') || err.message;
        log(`${table} batch ${i / batchSize + 1} failed`, { code, detail, message: err.message, rowSample: batch[0] });
        throw new Error(`${table} upsert failed: ${fullMsg}`);
      }
    }
  };

  try {
    await upsert('phases', phaseListFiltered);
    log('Phases upserted', phaseListFiltered.length);
  } catch (e) {
    log('Phases upsert error', e.message);
    throw e;
  }
  try {
    await upsert('tasks', taskListFiltered);
    log('Tasks upserted', taskListFiltered.length);
  } catch (e) {
    log('Tasks upsert error', e.message);
    throw e;
  }
  try {
    await upsert('hour_entries', hourList);
    log('Hour entries upserted', hourList.length);
  } catch (e) {
    log('Hour entries upsert error', e.message);
    throw e;
  }

  return { fetched: records.length, hours: hourList.length, phases: phaseListFiltered.length, tasks: taskListFiltered.length };
}

module.exports = { syncHours };
