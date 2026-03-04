import { NextRequest, NextResponse } from 'next/server';
import { query, execute, isValidTable, refreshRollups } from '@/lib/db';
import { toIsoDateOnly } from '@/lib/date-utils';
import { deleteFile } from '@/lib/azure-storage';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

type RouteContext = { params: Promise<{ table: string }> };
const columnTypeCache = new Map<string, Map<string, string>>();
const NUMERIC_TYPES = new Set(['integer', 'smallint', 'bigint', 'numeric', 'real', 'double precision', 'decimal']);

async function getColumnTypes(table: string): Promise<Map<string, string>> {
  if (columnTypeCache.has(table)) return columnTypeCache.get(table)!;
  const rows = await query<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  const map = new Map<string, string>();
  rows.forEach((r) => map.set(r.column_name, r.data_type));
  columnTypeCache.set(table, map);
  return map;
}

function toBool(val: unknown): boolean | null {
  if (val == null) return null;
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return null;
}

function sanitizeByType(value: unknown, dataType?: string): unknown {
  if (value == null) return null;
  if (!dataType) return value;
  if (typeof value === 'string' && value.trim() === '') return null;
  switch (dataType) {
    case 'integer':
    case 'smallint':
    case 'bigint': {
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(n) : null;
    }
    case 'numeric':
    case 'real':
    case 'double precision':
    case 'decimal': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return toBool(value);
    case 'date':
      return toIsoDateOnly(value);
    default:
      return value;
  }
}

function isNumericType(dataType?: string): boolean {
  return Boolean(dataType && NUMERIC_TYPES.has(dataType));
}

type VarianceNoteInsert = {
  id: string;
  role: string | null;
  tableName: string;
  recordId: string;
  metricKey: string;
  baselineValue: number | null;
  currentValue: number | null;
  varianceValue: number | null;
  comment: string;
  createdBy: string;
};

async function ensureVarianceTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS variance_notes (
      id TEXT PRIMARY KEY,
      role TEXT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      baseline_value NUMERIC(14,2),
      current_value NUMERIC(14,2),
      variance_value NUMERIC(14,2),
      status TEXT DEFAULT 'open',
      comment TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  );
}

async function insertVarianceNotes(notes: VarianceNoteInsert[]): Promise<void> {
  if (notes.length === 0) return;
  await ensureVarianceTable();
  const BATCH = 100;
  for (let i = 0; i < notes.length; i += BATCH) {
    const batch = notes.slice(i, i + BATCH);
    const values: unknown[] = [];
    const tuples: string[] = [];
    batch.forEach((n, idx) => {
      const base = idx * 11;
      values.push(
        n.id, n.role, n.tableName, n.recordId, n.metricKey,
        n.baselineValue, n.currentValue, n.varianceValue,
        'open', n.comment, n.createdBy,
      );
      tuples.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`,
      );
    });
    await execute(
      `INSERT INTO variance_notes
       (id, role, table_name, record_id, metric_key, baseline_value, current_value, variance_value, status, comment, created_by)
       VALUES ${tuples.join(',')}`,
      values,
    );
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { table } = await ctx.params;
  if (!isValidTable(table)) return json({ error: 'Invalid table' }, 400);

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 1000, 5000);
    const offset = Number(url.searchParams.get('offset')) || 0;
    const projectId = url.searchParams.get('project_id');
    const includeAll = url.searchParams.get('include_all') === '1';

    let sql = `SELECT * FROM ${table}`;
    const params: unknown[] = [];

    if (projectId && table !== 'employees' && table !== 'portfolios') {
      params.push(projectId);
      sql += ` WHERE project_id = $1`;
    } else if (table === 'projects' && !includeAll) {
      sql += ` WHERE is_active = true AND has_schedule = true`;
    }

    sql += ` ORDER BY created_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    const countSql = projectId && table !== 'employees' && table !== 'portfolios'
      ? `SELECT count(*) as total FROM ${table} WHERE project_id = $1`
      : table === 'projects' && !includeAll
        ? `SELECT count(*) as total FROM projects WHERE is_active = true AND has_schedule = true`
        : `SELECT count(*) as total FROM ${table}`;
    const countParams = projectId && table !== 'employees' && table !== 'portfolios' ? [projectId] : [];
    const [{ total }] = await query<{ total: string }>(countSql, countParams);

    return json({ rows, total: Number(total), limit, offset });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { table } = await ctx.params;
  if (!isValidTable(table)) return json({ error: 'Invalid table' }, 400);

  try {
    const body = await req.json();
    const url = new URL(req.url);
    const roleHint = (req.headers.get('x-role') || url.searchParams.get('role') || '').trim().toUpperCase() || null;
    const records: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
    if (records.length === 0) return json({ error: 'Empty payload' }, 400);
    const colTypes = await getColumnTypes(table);

    let upserted = 0;
    const BATCH = 50;

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const cols = Object.keys(batch[0]);
      const existingById = new Map<string, Record<string, unknown>>();
      if (cols.length > 0) {
        const ids = batch
          .map((r) => (r.id == null ? '' : String(r.id).trim()))
          .filter((id) => id.length > 0);
        if (ids.length > 0) {
          const existingRows = await query<Record<string, unknown>>(
            `SELECT id, ${cols.join(', ')} FROM ${table} WHERE id = ANY($1)`,
            [ids],
          );
          for (const row of existingRows) {
            const rowId = row.id == null ? '' : String(row.id);
            if (rowId) existingById.set(rowId, row);
          }
        }
      }
      const values: unknown[] = [];
      const tuples: string[] = [];

      batch.forEach((row, ri) => {
        const placeholders = cols.map((col, ci) => {
          values.push(sanitizeByType(row[col], colTypes.get(col)));
          return `$${ri * cols.length + ci + 1}`;
        });
        tuples.push(`(${placeholders.join(',')})`);
      });

      const updateSet = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
      const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')}
        ON CONFLICT (id) DO UPDATE SET ${updateSet}`;

      await execute(sql, values);

      if (cols.length > 0) {
        const varianceNotes: VarianceNoteInsert[] = [];
        let counter = 0;
        for (const row of batch) {
          const rowId = row.id == null ? '' : String(row.id).trim();
          if (!rowId) continue;
          const previous = existingById.get(rowId);
          if (!previous) continue; // skip new inserts; capture only updates
          for (const col of cols) {
            if (!(col in row)) continue;
            const dataType = colTypes.get(col);
            const prevRaw = sanitizeByType(previous[col], dataType);
            const nextRaw = sanitizeByType(row[col], dataType);

            if (isNumericType(dataType)) {
              const prevNum = prevRaw == null ? null : Number(prevRaw);
              const nextNum = nextRaw == null ? null : Number(nextRaw);
              if (!Number.isFinite(prevNum) || !Number.isFinite(nextNum)) continue;
              if (prevNum === nextNum) continue;
              const variance = (nextNum as number) - (prevNum as number);
              varianceNotes.push({
                id: `var-auto-${Date.now()}-${counter++}-${Math.random().toString(36).slice(2, 7)}`,
                role: roleHint,
                tableName: table,
                recordId: rowId,
                metricKey: col,
                baselineValue: prevNum,
                currentValue: nextNum,
                varianceValue: variance,
                comment: `Auto-captured on ${table} update`,
                createdBy: 'system',
              });
              continue;
            }

            const prevTxt = prevRaw == null ? '' : String(prevRaw);
            const nextTxt = nextRaw == null ? '' : String(nextRaw);
            if (prevTxt === nextTxt) continue;
            varianceNotes.push({
              id: `var-auto-${Date.now()}-${counter++}-${Math.random().toString(36).slice(2, 7)}`,
              role: roleHint,
              tableName: table,
              recordId: rowId,
              metricKey: col,
              baselineValue: null,
              currentValue: null,
              varianceValue: null,
              comment: JSON.stringify({ previous: prevTxt, current: nextTxt }),
              createdBy: 'system',
            });
          }
        }
        if (varianceNotes.length > 0) {
          await insertVarianceNotes(varianceNotes);
        }
      }
      upserted += batch.length;
    }

    const rollupTables = new Set(['sub_tasks','tasks','phases','units','projects','sites','customers','portfolios']);
    if (rollupTables.has(table)) {
      try { await refreshRollups(); } catch { /* non-fatal */ }
    }

    return json({ success: true, count: upserted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { table } = await ctx.params;
  if (!isValidTable(table)) return json({ error: 'Invalid table' }, 400);

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id param required' }, 400);

    if (table === 'project_documents') {
      const docs = await query<{ id: string; project_id: string; storage_path: string; is_current_version: boolean }>(
        'SELECT id, project_id, storage_path, is_current_version FROM project_documents WHERE id = $1',
        [id],
      );
      const doc = docs[0];
      if (!doc) return json({ error: 'Document not found' }, 404);

      try { await deleteFile(doc.storage_path); } catch { /* non-fatal */ }
      await execute('DELETE FROM project_documents WHERE id = $1', [id]);

      const [replacement] = await query<{ id: string }>(
        `SELECT id
         FROM project_documents
         WHERE project_id = $1
         ORDER BY uploaded_at DESC
         LIMIT 1`,
        [doc.project_id],
      );
      if (replacement) {
        await execute(
          `UPDATE project_documents
           SET is_current_version = CASE WHEN id = $1 THEN true ELSE false END,
               updated_at = NOW()
           WHERE project_id = $2`,
          [replacement.id, doc.project_id],
        );
      }

      if (doc.is_current_version) {
        await execute('DELETE FROM sub_tasks WHERE project_id = $1', [doc.project_id]);
        await execute('DELETE FROM tasks WHERE project_id = $1', [doc.project_id]);
        await execute('DELETE FROM phases WHERE project_id = $1', [doc.project_id]);
        await execute('DELETE FROM units WHERE project_id = $1', [doc.project_id]);
        await execute('UPDATE projects SET has_schedule = false, updated_at = NOW() WHERE id = $1', [doc.project_id]);
        try { await refreshRollups(); } catch { /* non-fatal */ }
      }

      return json({
        success: true,
        deleted: 1,
        scheduleCleared: Boolean(doc.is_current_version),
        replacementDocumentId: replacement?.id || null,
      });
    }

    if (table === 'tasks') {
      await execute('DELETE FROM sub_tasks WHERE task_id = $1 OR phase_id = $1 OR unit_id = $1', [id]);
      const count = await execute('DELETE FROM tasks WHERE id = $1', [id]);
      try { await refreshRollups(); } catch { /* non-fatal */ }
      return json({ success: true, deleted: count });
    }

    if (table === 'phases') {
      await execute(
        `DELETE FROM sub_tasks
         WHERE phase_id = $1
            OR task_id IN (SELECT id FROM tasks WHERE phase_id = $1)`,
        [id],
      );
      await execute('DELETE FROM tasks WHERE phase_id = $1', [id]);
      const count = await execute('DELETE FROM phases WHERE id = $1', [id]);
      try { await refreshRollups(); } catch { /* non-fatal */ }
      return json({ success: true, deleted: count });
    }

    if (table === 'units') {
      await execute(
        `DELETE FROM sub_tasks
         WHERE unit_id = $1
            OR phase_id IN (SELECT id FROM phases WHERE unit_id = $1)
            OR task_id IN (SELECT id FROM tasks WHERE unit_id = $1)`,
        [id],
      );
      await execute('DELETE FROM tasks WHERE unit_id = $1', [id]);
      await execute('DELETE FROM phases WHERE unit_id = $1', [id]);
      const count = await execute('DELETE FROM units WHERE id = $1', [id]);
      try { await refreshRollups(); } catch { /* non-fatal */ }
      return json({ success: true, deleted: count });
    }

    const count = await execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return json({ success: true, deleted: count });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
}
