import { NextRequest, NextResponse } from 'next/server';
import { execute, refreshRollups } from '@/lib/db';
import { mapEmployees, mapProjects, mapHours, mapContracts, mapWorkdayPhases } from '@/lib/ingest/workday-mapper';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const BASE = 'https://services1.myworkday.com';

const URLS = {
  employees: `${BASE}/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Employees?Include_Terminated_Workers=1&format=json`,
  findProjects: `${BASE}/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Find_Projects_-_Pinnacle?Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&Include_Subordinate_Project_Hierarchies=1&Billable=0&Capital=0&Inactive=0&Status%21WID=8114d1e7d62810016e8dbc4118e60000!8114d1e7d62810016e8dbba72b880000!758d94cc846601c5404e6ab4e2135430!8114d1e7d62810016e8dbb0d64800000!874d109880b8100105bee5e42fde0000!8114d1e7d62810016e8dbba72b880001&format=json`,
  hoursBase: `${BASE}/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Project_Labor_Transactions`,
  hoursQueryWid: '94cffcd386281001f21ecbc0ba820001!3cc34283d5c31000b9685df9ccce0001!74988a42b1d71000bb0ee8b8b70c0000!74988a42b1d71000bad6bfeceb310001!74988a42b1d71000babc7d9ad9b50001!8114d1e7d6281001755179b2ecba0000!74988a42b1d71000b9565eb994d30000!74988a42b1d71000b928197b465e0001!74988a42b1d71000b90309e92b680001!6e4362224aa81000ca8f84a39b6a0001!74988a42b1d71000b8ee4094ed830001!82a1fc685dda1000c6c99bc7562b0000!6c3abbb4fb20100174cf1f0f36850000!e0c093bd0ece100165ff337f9cdd0000!5821192f86da1000c64cf77badb50001!2a5ee02cc70210015501fde7aa720001!2a5ee02cc702100154f3887562a20001!60cb012a3c2a100169b86b0bb3d20001!761afa109c8910017615a972157b0000!761afa109c8910017615a83d85680000!761afa109c8910017615a7094cce0000!761afa109c8910017615a53aeb070000!761afa109c8910017615a4050c3c0000!761afa109c8910017615a235a48a0000!3cc34283d5c31000ba1e365ffde80001',
  currencyRateTypeWid: '44e3d909d76b0127e940e8b41011293b',
  reportingCurrencyWid: '9e996ffdd3e14da0ba7275d5400bafd4',
  customerContracts: `${BASE}/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_Find_Customer_Contract_Lines_-_Revenue?New_Business=0&Renewable=0&format=json`,
  workdayPhases: `${BASE}/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_View_Project_Plan_-_Integration_for_Parent_Phase?Include_Subordinate_Project_Hierarchies=1&Projects_and_Project_Hierarchies%21WID=6c3abbb4fb20100174cf1f0f36850000&format=json`,
};

function getAuth() {
  const user = process.env.WORKDAY_ISU_USER;
  const pass = process.env.WORKDAY_ISU_PASS;
  if (!user || !pass) throw new Error('WORKDAY_ISU_USER / WORKDAY_ISU_PASS not set');
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

async function wdFetch(url: string): Promise<Record<string, unknown>[]> {
  const auth = getAuth();
  const res = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: auth },
  });
  if (!res.ok) throw new Error(`Workday ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const group = data.Report_Entry || data.report_entry || data.Report_Fields || [];
  return Array.isArray(group) ? group : [];
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildHoursUrl(startDate: string, endDate: string) {
  return `${URLS.hoursBase}?Projects_and_Project_Hierarchies%21WID=${URLS.hoursQueryWid}&Currency_Rate_Type%21WID=${URLS.currencyRateTypeWid}&Reporting_Currency%21WID=${URLS.reportingCurrencyWid}&Start_Date=${startDate}&End_Date=${endDate}&format=json`;
}

function dedup(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row.id ?? '');
    if (key) seen.set(key, row);
  }
  return [...seen.values()];
}

async function batchUpsert(table: string, rawRows: Record<string, unknown>[]) {
  const rows = dedup(rawRows);
  if (rows.length === 0) return 0;
  let total = 0;
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const cols = Object.keys(batch[0]);
    const vals: unknown[] = [];
    const tuples: string[] = [];
    batch.forEach((row, ri) => {
      const ph = cols.map((c, ci) => { vals.push(row[c] ?? null); return `$${ri * cols.length + ci + 1}`; });
      tuples.push(`(${ph.join(',')})`);
    });
    const update = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
    await execute(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT (id) DO UPDATE SET ${update}`,
      vals,
    );
    total += batch.length;
  }
  return total;
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const log: string[] = [];
  const result: Record<string, number> = {};

  try {
    const body = await req.json().catch(() => ({}));
    const daysBack = Number(body.daysBack) || 90;

    // 1) Employees
    log.push('Fetching employees from Workday...');
    const empRaw = await wdFetch(URLS.employees);
    log.push(`Got ${empRaw.length} employee records`);
    const mapped = mapEmployees(empRaw);
    result.employees = await batchUpsert('employees', mapped);
    log.push(`Upserted ${result.employees} employees`);

    // 2) Projects (includes portfolios, customers, sites)
    log.push('Fetching projects from Workday...');
    const projRaw = await wdFetch(URLS.findProjects);
    log.push(`Got ${projRaw.length} project records`);
    const projMapped = mapProjects(projRaw);
    result.portfolios = await batchUpsert('portfolios', projMapped.portfolios);
    result.customers = await batchUpsert('customers', projMapped.customers);
    result.sites = await batchUpsert('sites', projMapped.sites);
    result.projects = await batchUpsert('projects', projMapped.projects);
    log.push(`Upserted ${result.portfolios} portfolios, ${result.customers} customers, ${result.sites} sites, ${result.projects} projects`);

    // 3) Hours — fetch day by day for the last N days
    log.push(`Fetching hours for last ${daysBack} days...`);
    let totalHours = 0;
    const today = new Date();
    const chunkSize = 7;
    for (let d = daysBack; d > 0; d -= chunkSize) {
      const end = new Date(today);
      end.setDate(end.getDate() - Math.max(0, d - chunkSize));
      const st = new Date(today);
      st.setDate(st.getDate() - d);
      const url = buildHoursUrl(formatDate(st), formatDate(end));
      try {
        const hoursRaw = await wdFetch(url);
        if (hoursRaw.length > 0) {
          const hoursMapped = mapHours(hoursRaw);
          const cnt = await batchUpsert('hour_entries', hoursMapped);
          totalHours += cnt;
        }
      } catch (e) {
        log.push(`Warning: hours chunk ${formatDate(st)}→${formatDate(end)} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    result.hour_entries = totalHours;
    log.push(`Upserted ${totalHours} hour entries`);

    // 4) Customer contracts
    log.push('Fetching customer contracts...');
    const ccRaw = await wdFetch(URLS.customerContracts);
    log.push(`Got ${ccRaw.length} contract records`);
    const ccMapped = mapContracts(ccRaw);
    result.customer_contracts = await batchUpsert('customer_contracts', ccMapped);
    log.push(`Upserted ${result.customer_contracts} contracts`);

    // 5) Workday Phases
    log.push('Fetching workday phases...');
    try {
      const wpRaw = await wdFetch(URLS.workdayPhases);
      log.push(`Got ${wpRaw.length} workday phase records`);
      const wpMapped = mapWorkdayPhases(wpRaw);
      result.workday_phases = await batchUpsert('workday_phases', wpMapped);
      log.push(`Upserted ${result.workday_phases} workday phases`);
    } catch (e) {
      log.push(`Warning: workday phases failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 6) Rollups
    log.push('Running rollups...');
    try { await refreshRollups(); log.push('Rollups complete'); } catch (e) {
      log.push(`Rollup warning: ${e instanceof Error ? e.message : String(e)}`);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log.push(`Done in ${elapsed}s`);

    return NextResponse.json({ success: true, ...result, log, elapsedSeconds: elapsed });
  } catch (err: unknown) {
    log.push(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err), log, ...result },
      { status: 500 },
    );
  }
}
