/**
 * Workday hours sync – 1:1 with Supabase workday-hours Edge Function.
 * Fetches Project Labor Transactions for a date range, upserts hour_entries (and phase/task skeletons if needed).
 */

const config = require('../config');

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

  const response = await workdayFetch(url);
  if (!response.ok) throw new Error(`Workday hours API ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const records = data.Report_Entry || [];

  const hoursToUpsert = new Map();
  const phasesToUpsert = new Map();
  const tasksToUpsert = new Map();

  for (const r of records) {
    const rawProjectId = safeString(r.Project_ID);
    if (!rawProjectId) continue;
    const projectId = cleanProjectId(rawProjectId);
    const employeeId = safeString(r.Employee_ID);
    const workdayId = safeString(r.workdayID || r.referenceID);
    if (!projectId || !employeeId || !workdayId) continue;

    const rawPhaseName = safeString(r.Phase) || 'General Phase';
    const rawTaskName = safeString(r.Task) || 'General Task';
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

    const hoursVal = parseFloat(r.Hours || '0');
    const dateVal = r.Transaction_Date;
    const description = (safeString(r.Time_Type) || safeString(r.Billable_Transaction)).substring(0, 500);
    const billableRate = parseFloat(r.Billable_Rate || '0');
    const billableAmount = parseFloat(r.Billable_Amount || '0');
    const standardCostRate = parseFloat(r.Standard_Cost_Rate || '0');
    const standardCostAmt = parseFloat(r.Reported_Standard_Cost_Amt || '0');
    const reportedStandard22 = parseFloat(r.Reported_Standard_22 || '0');
    const actualCost = standardCostAmt || hoursVal * standardCostRate || hoursVal * reportedStandard22 || 0;
    const actualRevenue = billableAmount || hoursVal * billableRate || 0;

    if (!hoursToUpsert.has(workdayId)) {
      hoursToUpsert.set(workdayId, {
        id: workdayId,
        entry_id: workdayId,
        employee_id: employeeId,
        project_id: projectId,
        date: dateVal,
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
        customer_billing_status: safeString(r.Customer_Billing_Status),
        invoice_number: safeString(r.Invoice_Number),
        invoice_status: safeString(r.Invoice_Status),
        charge_type: safeString(r.Charge_Type),
      });
    }
  }

  const batchSize = config.sync.hoursBatchSize;
  const upsert = async (table, items, cols) => {
    if (items.length === 0) return;
    const allCols = cols || Object.keys(items[0]);
    const setClause = allCols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const values = batch.map(r => allCols.map(c => r[c]));
      const placeholders = batch.map((_, bi) => '(' + allCols.map((_, ci) => `$${bi * allCols.length + ci + 1}`).join(',') + ')').join(',');
      const sql = `INSERT INTO ${table} (${allCols.join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`;
      await client.query(sql, values.flat());
    }
  };

  const phaseList = Array.from(phasesToUpsert.values());
  const taskList = Array.from(tasksToUpsert.values());
  const hourList = Array.from(hoursToUpsert.values());

  await upsert('phases', phaseList);
  await upsert('tasks', taskList);
  await upsert('hour_entries', hourList);

  return { fetched: records.length, hours: hourList.length, phases: phaseList.length, tasks: taskList.length };
}

module.exports = { syncHours };
