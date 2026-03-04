/**
 * Workday Parent Phase report sync – populates workday_phases from
 * RPT_-_View_Project_Plan_-_Integration_for_Parent_Phase.
 * Project (leading digits) -> project_id, Level_1 -> unit, Level_2 -> name.
 */

const config = require('../config');
const crypto = require('crypto');

const log = (msg, detail) => {
  const out = detail !== undefined ? `[WorkdayPhases] ${msg} ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : `[WorkdayPhases] ${msg}`;
  console.log(out);
};

function workdayFetch(url) {
  const auth = Buffer.from(`${config.workday.user}:${config.workday.pass}`).toString('base64');
  return fetch(url, { headers: { Accept: 'application/json', Authorization: `Basic ${auth}` } });
}

function safeString(val) {
  return (val != null ? String(val) : '').trim();
}

function leadingDigits(raw) {
  const s = safeString(raw);
  if (!s) return null;
  const m = s.match(/^(\d+)/);
  return m ? m[1] : null;
}

function slug(text, maxLen = 30) {
  return safeString(text).replace(/[^A-Za-z0-9]/g, '_').replace(/_+/g, '_').substring(0, maxLen) || 'X';
}

function makeStableId(projectId, ref, level2) {
  const hash = crypto.createHash('sha1').update(`${projectId}|${ref}|${level2}`).digest('hex').slice(0, 16);
  return `WP_${projectId}_${hash}`.substring(0, 50);
}

function resolveProjectId(leading, existingProjects) {
  if (!leading || !existingProjects.length) return null;
  const exactId = existingProjects.find((p) => p.id === leading);
  if (exactId) return exactId.id;

  const byProjectCode = existingProjects.find((p) => p.project_id === leading);
  if (byProjectCode) return byProjectCode.id;

  for (const p of existingProjects) {
    if (!p.project_id) continue;
    if (p.project_id === leading || p.project_id.startsWith(leading + ' ') || p.project_id.startsWith(leading + '_')) {
      return p.id;
    }
  }

  for (const p of existingProjects) {
    const id = p.id || '';
    if (id === leading || id.startsWith(leading + ' ') || id.startsWith(leading + '_')) return id;
  }
  return null;
}

async function syncWorkdayPhases(client) {
  const url = config.urls.workdayPhases;
  if (!url) {
    log('WORKDAY_PHASES_URL not set; skipping');
    return { fetched: 0, upserted: 0 };
  }
  if (!config.workday.user || !config.workday.pass) {
    throw new Error('WORKDAY_ISU_USER and WORKDAY_ISU_PASS must be set');
  }

  log('Fetching workday phases', { url: url.slice(0, 80) + '...' });
  const response = await workdayFetch(url);
  const responseText = await response.text();
  if (!response.ok) {
    log('API error', { status: response.status, body: responseText.slice(0, 400) });
    throw new Error(`Workday phases API ${response.status}: ${responseText.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    log('Response not valid JSON', e.message);
    throw new Error(`Workday phases response not valid JSON: ${e.message}`);
  }

  const records = data.Report_Entry || data.report_Entry || data.ReportEntry || [];
  log('Report parsed', { recordCount: records.length });

  let existingProjects = [];
  try {
    const res = await client.query('SELECT id, project_id FROM projects');
    existingProjects = (res.rows || []).map((r) => ({
      id: safeString(r.id),
      project_id: safeString(r.project_id),
    })).filter((p) => p.id);
  } catch (e) {
    log('Could not load projects for phase mapping', e.message);
  }

  const rows = [];
  let skippedNoProject = 0;
  let skippedNoLevel2 = 0;
  for (let idx = 0; idx < records.length; idx += 1) {
    const r = records[idx];
    const projectRaw = r.Project ?? r.project ?? '';
    const level1 = safeString(r.Level_1 ?? r.Level1 ?? r.unit ?? '');
    const level2 = safeString(r.Level_2 ?? r.Level2 ?? r.name ?? r.Phase ?? '');
    const subPhaseRef = safeString(r.SubPhase_Reference_ID ?? r.subphase_reference_id ?? '');
    const parentRef = safeString(r.Parent_Reference_ID ?? r.parent_reference_id ?? '');
    const leading = leadingDigits(projectRaw);
    const resolvedProjectId = resolveProjectId(leading, existingProjects);
    const projectId = resolvedProjectId || null;
    if (!projectId) {
      skippedNoProject += 1;
      continue;
    }
    if (!level2) {
      skippedNoLevel2 += 1;
      continue;
    }

    const reference = subPhaseRef || parentRef || `${level1}|${level2}|${idx}`;
    const stableKey = `${projectId || 'UNMAPPED'}|${reference}|${projectRaw}|${level1}|${level2}|${idx}`;
    const id = makeStableId(projectId || 'UNMAPPED', stableKey, level2);

    rows.push({
      id,
      phase_id: (subPhaseRef || parentRef || `${id}_${idx}`).substring(0, 50),
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

  log('Prepared rows', {
    rows: rows.length,
    skippedNoProject,
    skippedNoLevel2,
  });

  if (rows.length === 0) {
    log('No rows to upsert');
    return { fetched: records.length, upserted: 0 };
  }

  const cols = ['id', 'phase_id', 'project_id', 'unit_id', 'unit', 'parent_id', 'hierarchy_type', 'outline_level', 'employee_id', 'name', 'sequence', 'is_active', 'updated_at'];
  const setClause = cols.filter((c) => c !== 'id').map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  const batchSize = 100;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.map((r) => cols.map((c) => r[c]));
    const placeholders = batch.map((_, bi) => '(' + cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(',') + ')').join(',');
    const sql = `INSERT INTO workday_phases (${cols.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`;
    try {
      await client.query(sql, values.flat());
      upserted += batch.length;
    } catch (err) {
      log('Upsert batch failed', { err: err.message });
      throw new Error(`workday_phases upsert failed: ${err.message}`);
    }
  }
  log('Upserted', { upserted, total: rows.length });
  return { fetched: records.length, upserted };
}

module.exports = { syncWorkdayPhases };
