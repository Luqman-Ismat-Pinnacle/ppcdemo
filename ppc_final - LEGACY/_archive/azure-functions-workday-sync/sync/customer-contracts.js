/**
 * Workday Customer Contract Lines sync for forecasting.
 * Fetches RPT_-_Find_Customer_Contract_Lines_-_Revenue, maps to project_id from Billable_Project, converts to USD.
 */

const config = require('../config');

const log = (msg, detail) => {
  const out = detail !== undefined ? `[CustomerContracts] ${msg} ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : `[CustomerContracts] ${msg}`;
  console.log(out);
};

function workdayFetch(url) {
  const auth = Buffer.from(`${config.workday.user}:${config.workday.pass}`).toString('base64');
  return fetch(url, { headers: { Accept: 'application/json', Authorization: `Basic ${auth}` } });
}

function safeString(val) {
  return (val != null ? String(val) : '').trim();
}

/** Extract leading digits from Billable_Project (e.g. "20040 Chevron..." -> "20040") */
function leadingDigitsFromBillableProject(raw) {
  const s = safeString(raw);
  if (!s) return null;
  const match = s.match(/^(\d+)/);
  return match ? match[1] : null;
}

/** Resolve Workday Billable_Project to a project id that exists in DB. Projects have id like "20040" or "20040 (Inactive)". */
function resolveProjectId(billableProjectRaw, existingProjectIds) {
  const raw = safeString(billableProjectRaw);
  const leading = leadingDigitsFromBillableProject(raw);
  if (!leading || !existingProjectIds.length) return null;
  const set = new Set(existingProjectIds);
  if (set.has(leading)) return leading;
  const withInactive = leading + ' (Inactive)';
  if (set.has(withInactive)) return withInactive;
  for (const id of existingProjectIds) {
    if (id === leading || id.startsWith(leading + ' ') || id.startsWith(leading + '_')) return id;
  }
  return null;
}

/** Simple non-USD to USD conversion (approximate). Override via env or extend as needed. */
const CURRENCY_TO_USD = {
  USD: 1,
  US: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.74,
  AUD: 0.65,
  JPY: 0.0067,
  CHF: 1.13,
  MXN: 0.058,
  INR: 0.012,
};

function toUsd(amount, currency) {
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return null;
  const code = safeString(currency).toUpperCase().replace(/\s/g, '');
  const rate = CURRENCY_TO_USD[code] ?? (code.startsWith('US') ? 1 : null);
  if (rate == null) {
    log('Unknown currency, storing as null amount_usd', { currency: code });
    return null;
  }
  return Math.round(num * rate * 100) / 100;
}

async function syncCustomerContracts(client) {
  const url = config.urls.customerContracts;
  if (!url) {
    log('WORKDAY_CUSTOMER_CONTRACTS_URL not set; skipping');
    return { fetched: 0, upserted: 0 };
  }
  if (!config.workday.user || !config.workday.pass) {
    throw new Error('WORKDAY_ISU_USER and WORKDAY_ISU_PASS must be set');
  }

  log('Fetching customer contracts', { url: url.slice(0, 80) + '...' });
  const response = await workdayFetch(url);
  const responseText = await response.text();
  if (!response.ok) {
    log('API error', { status: response.status, body: responseText.slice(0, 400) });
    throw new Error(`Workday customer contracts API ${response.status}: ${responseText.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    log('Response not valid JSON', e.message);
    throw new Error(`Customer contracts response not valid JSON: ${e.message}`);
  }

  const records = data.Report_Entry || data.report_Entry || data.ReportEntry || [];
  log('Report parsed', { recordCount: records.length, sampleKeys: records[0] ? Object.keys(records[0]).slice(0, 20) : [] });

  let projectIds = [];
  try {
    const res = await client.query('SELECT id FROM projects');
    projectIds = (res.rows || []).map((row) => row.id);
    log('Resolving project_id against projects', { count: projectIds.length });
  } catch (e) {
    log('Could not load project ids; customer_contracts will have project_id null', e.message);
  }

  const rows = [];
  for (let idx = 0; idx < records.length; idx++) {
    const r = records[idx];
    const lineAmount = r.Line_Amount ?? r.line_amount ?? r.LineAmount;
    const lineFromDate = r.Line_From_Date ?? r.line_from_date ?? r.LineFromDate ?? r.Date ?? r.date;
    const currency = safeString(r.Currency ?? r.currency ?? 'USD') || 'USD';
    const billableProject = r.Billable_Project ?? r.billable_project ?? r.BillableProject ?? '';
    const referenceID = safeString(r.referenceID ?? r.referenceId ?? r.reference_id ?? '');

    const amount = parseFloat(lineAmount);
    if (Number.isNaN(amount)) continue;

    const projectId = resolveProjectId(billableProject, projectIds);

    let dateOnly = null;
    if (lineFromDate != null) {
      if (typeof lineFromDate === 'string') {
        const part = lineFromDate.split('T')[0].split(' ')[0].trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(part)) dateOnly = part;
        else {
          const d = new Date(lineFromDate);
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
      project_id: projectId || null,
      line_amount: amount,
      line_from_date: dateOnly,
      currency: currency.substring(0, 10),
      amount_usd: amountUsd,
      billable_project_raw: safeString(billableProject).substring(0, 255),
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    log('No rows to upsert');
    return { fetched: records.length, upserted: 0 };
  }

  const cols = ['id', 'project_id', 'line_amount', 'line_from_date', 'currency', 'amount_usd', 'billable_project_raw', 'updated_at'];
  const setClause = cols.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
  const batchSize = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map(r => cols.map(c => r[c]));
    const placeholders = batch.map((_, bi) => '(' + cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(',') + ')').join(',');
    const sql = `INSERT INTO customer_contracts (${cols.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`;
    try {
      await client.query(sql, values.flat());
      upserted += batch.length;
    } catch (err) {
      log('Upsert batch failed', { err: err.message, detail: err.detail });
      throw new Error(`customer_contracts upsert failed: ${err.message}`);
    }
  }
  log('Upserted', { upserted, total: rows.length });
  return { fetched: records.length, upserted };
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return h;
}

module.exports = { syncCustomerContracts };
