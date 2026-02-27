#!/usr/bin/env node
/**
 * Import QC log workbook rows into qc_tasks.
 *
 * Usage:
 *   node scripts/import-qc-log-xlsx-to-db.mjs
 *   node scripts/import-qc-log-xlsx-to-db.mjs --file "All QC Log Entries 2-19-2026 2-08-47 PM.xlsx"
 *   node scripts/import-qc-log-xlsx-to-db.mjs --dry-run
 *   node scripts/import-qc-log-xlsx-to-db.mjs --append
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import XLSX from 'xlsx';
import pg from 'pg';

const DEFAULT_FILE = 'All QC Log Entries 2-19-2026 2-08-47 PM.xlsx';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) process.env[key] = value;
  }
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeStatus(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return 'Not Started';
  if (value.includes('complete')) return 'Complete';
  if (value.includes('progress')) return 'In Progress';
  if (value.includes('cancel')) return 'On Hold';
  if (value.includes('request')) return 'Not Started';
  return 'Not Started';
}

function excelDateToIso(value) {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const yyyy = String(parsed.y).padStart(4, '0');
    const mm = String(parsed.m).padStart(2, '0');
    const dd = String(parsed.d).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function parseProjectId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const token = raw.split('>')[0]?.trim();
  return token || null;
}

function pick(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return row[key];
  }
  return null;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampText(value, max = 255) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max) : text;
}

function buildQcTaskRow(row, index, projectIdMap) {
  const sourceId = clampText(pick(row, '(Do Not Modify) QC Log'), 50) || '';
  const qcTransaction = clampText(pick(row, 'QC Transaction'), 50) || '';
  const status = normalizeStatus(pick(row, 'QC Status'));
  const title = clampText(pick(row, 'Title') || qcTransaction || `QC Row ${index + 1}`, 255) || '';
  const taskWorker = clampText(pick(row, 'Task Worker'), 255) || '';
  const qcResource = clampText(pick(row, 'QC Resource'), 255) || '';
  const notes = clampText(pick(row, 'Notes'), 1000) || '';
  const descriptionIfs = clampText(pick(row, 'DESCRIPTION (Charge Code) (IFS - Activities)'), 3000) || '';
  const description = [descriptionIfs, notes].filter(Boolean).join('\n').slice(0, 4000);
  const pctItemsCorrect = toNumber(pick(row, 'Pct Items Correct'), 0);
  const itemsSubmitted = toNumber(pick(row, 'Items Submitted'), 0);
  const itemsCorrect = toNumber(pick(row, 'Items Correct'), 0);
  const qcHours = Math.max(itemsSubmitted, 0);
  const requestedDate = excelDateToIso(pick(row, 'QC Requested Date'));
  const completeDate = excelDateToIso(
    pick(row, 'QC Complete Date Override', 'QC Complete Date'),
  );
  const rawProjectId = parseProjectId(
    pick(row, 'Project_ID (Charge Code V2) (Workday - RPT - Project Plan Data - v2.0)', 'PROJECT_ID (Charge Code) (IFS - Activities)'),
  );
  const projectId = rawProjectId ? (projectIdMap.get(rawProjectId) || null) : null;
  const id = sourceId || `QCT-XLSX-${String(index + 1).padStart(8, '0')}`;

  return {
    id,
    qc_task_id: clampText(qcTransaction || id, 50),
    project_id: projectId,
    phase_id: null,
    task_id: null,
    name: clampText(title || `QC ${id}`, 255),
    description: description || null,
    status: clampText(status, 50),
    assigned_to: null,
    due_date: requestedDate,
    completed_date: completeDate,
    task_worker: taskWorker || null,
    qc_resource: qcResource || null,
    qc_score: pctItemsCorrect > 0 ? pctItemsCorrect : 0,
    qc_count: itemsSubmitted > 0 ? itemsSubmitted : itemsCorrect,
    qc_hours: qcHours,
    qc_comments: clampText(notes, 1000),
    client_ready: clampText(pick(row, 'Client Ready?'), 50),
    qc_gate: clampText(pick(row, 'QC Gate'), 100),
    charge_code_v2: clampText(pick(row, 'Charge Code V2'), 255),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function getTableColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return new Set(result.rows.map((row) => String(row.column_name)));
}

async function buildProjectIdMap(client) {
  const map = new Map();
  const { rows } = await client.query('SELECT id, project_id FROM projects');
  for (const row of rows || []) {
    const id = String(row.id || '').trim();
    const projectId = String(row.project_id || '').trim();
    if (id) map.set(id, id);
    if (projectId) map.set(projectId, id);
  }
  return map;
}

async function upsertRows(client, tableName, rows, tableColumns) {
  if (rows.length === 0) return 0;
  const filtered = rows.map((row) => {
    const next = {};
    for (const [key, value] of Object.entries(row)) {
      if (tableColumns.has(key)) next[key] = value;
    }
    return next;
  });

  const columns = Array.from(
    filtered.reduce((acc, row) => {
      for (const key of Object.keys(row)) acc.add(key);
      return acc;
    }, new Set()),
  );
  if (!columns.includes('id')) {
    throw new Error('qc_tasks table must include id column.');
  }

  const updateColumns = columns.filter((col) => col !== 'id');
  const batchSize = 250;
  let written = 0;

  for (let i = 0; i < filtered.length; i += batchSize) {
    const batch = filtered.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((row, rowIndex) => {
      const rowPlaceholders = columns.map((col, colIndex) => {
        values.push(row[col] ?? null);
        return `$${rowIndex * columns.length + colIndex + 1}`;
      });
      return `(${rowPlaceholders.join(', ')})`;
    });

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (id)
      DO UPDATE SET ${updateColumns.map((col) => `${col} = EXCLUDED.${col}`).join(', ')}
    `;
    await client.query(sql, values);
    written += batch.length;
  }

  return written;
}

async function main() {
  loadEnvLocal();

  const file = argValue('--file') || DEFAULT_FILE;
  const replace = !hasFlag('--append');
  const dryRun = hasFlag('--dry-run');
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.AZURE_POSTGRES_CONNECTION_STRING ||
    process.env.POSTGRES_CONNECTION_STRING ||
    process.env.AZURE_DATABASE_URL;

  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL/AZURE_POSTGRES_CONNECTION_STRING/POSTGRES_CONNECTION_STRING in env.');
  }
  if (!existsSync(resolve(process.cwd(), file))) {
    throw new Error(`Workbook not found: ${file}`);
  }

  const workbook = XLSX.readFile(file, { cellDates: false });
  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('qc')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`No worksheet found in ${file}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`[QC Import] Workbook: ${file}`);
  console.log(`[QC Import] Sheet: ${sheetName}`);
  console.log(`[QC Import] Parsed rows: ${rows.length}`);

  if (dryRun) {
    console.log('[QC Import] Dry-run enabled. No DB changes made.');
    return;
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const projectIdMap = await buildProjectIdMap(client);
    const mappedRows = rows.map((row, index) => buildQcTaskRow(row, index, projectIdMap));
    const tableColumns = await getTableColumns(client, 'qc_tasks');

    await client.query('BEGIN');
    if (replace) {
      await client.query('TRUNCATE TABLE qc_tasks');
      console.log('[QC Import] Truncated qc_tasks before import.');
    }

    const written = await upsertRows(client, 'qc_tasks', mappedRows, tableColumns);
    await client.query('COMMIT');
    console.log(`[QC Import] Upserted rows: ${written}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[QC Import] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
