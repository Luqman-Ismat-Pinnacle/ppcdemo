import { NextRequest, NextResponse } from 'next/server';
import { query, execute, refreshRollups } from '@/lib/db';
import { downloadFile } from '@/lib/azure-storage';
import { mapMppOutput } from '@/lib/ingest/mpp-mapper';

const DEFAULT_MPP_PARSER_URL = 'http://localhost:8080';

async function callParser(parserUrl: string, fileName: string, fileBuffer: Buffer) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const parserFormData = new FormData();
    parserFormData.append(
      'file',
      new Blob([new Uint8Array(fileBuffer)], { type: 'application/octet-stream' }),
      fileName,
    );

    const response = await fetch(`${parserUrl.replace(/\/$/, '')}/parse`, {
      method: 'POST',
      body: parserFormData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Parser failed: ${text || `HTTP ${response.status}`}`);
    }

    const payload = await response.json();
    if (!payload?.success) {
      throw new Error(payload?.error || 'Parser returned invalid payload');
    }
    return payload;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Parser fetch failed via MPP_PARSER_URL (${parserUrl}): ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

const columnTypeCache = new Map<string, Map<string, string>>();

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
    case 'boolean': {
      return toBool(value);
    }
    case 'date': {
      const d = new Date(String(value));
      return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
    }
    default:
      return value;
  }
}

async function batchUpsert(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return 0;
  const colTypes = await getColumnTypes(table);
  let total = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const cols = Object.keys(batch[0]);
    const vals: unknown[] = [];
    const tuples: string[] = [];
    batch.forEach((row, ri) => {
      const ph = cols.map((c, ci) => {
        vals.push(sanitizeByType(row[c], colTypes.get(c)));
        return `$${ri * cols.length + ci + 1}`;
      });
      tuples.push(`(${ph.join(',')})`);
    });
    const update = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
    await execute(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT (id) DO UPDATE SET ${update}`, vals);
    total += batch.length;
  }
  return total;
}

/**
 * POST /api/documents/process-mpp
 * Body (JSON): { documentId, projectId }
 * Downloads file from Azure, sends to parser, inserts into DB.
 */
export async function POST(req: NextRequest) {
  try {
    const { documentId, projectId } = await req.json();
    if (!documentId || !projectId) {
      return NextResponse.json({ error: 'documentId and projectId required' }, { status: 400 });
    }

    const [doc] = await query<{ storage_path: string; file_name: string }>(
      'SELECT storage_path, file_name FROM project_documents WHERE id = $1', [documentId]
    );
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

    const { data: fileBuffer } = await downloadFile(doc.storage_path);

    const parserUrl =
      process.env.MPP_PARSER_URL ||
      process.env.NEXT_PUBLIC_MPP_PARSER_URL ||
      DEFAULT_MPP_PARSER_URL;
    const parsed = await callParser(parserUrl, doc.file_name, fileBuffer as Buffer);

    const parserTasks = parsed.tasks || parsed.data?.tasks || [];
    const mapped = mapMppOutput(parserTasks, projectId);

    await execute('DELETE FROM sub_tasks WHERE project_id = $1', [projectId]);
    await execute('DELETE FROM tasks WHERE project_id = $1', [projectId]);
    await execute('DELETE FROM phases WHERE project_id = $1', [projectId]);
    await execute('DELETE FROM units WHERE project_id = $1', [projectId]);

    const counts = {
      units: await batchUpsert('units', mapped.units),
      phases: await batchUpsert('phases', mapped.phases),
      tasks: await batchUpsert('tasks', mapped.tasks),
      sub_tasks: await batchUpsert('sub_tasks', mapped.sub_tasks),
    };

    await execute('UPDATE projects SET has_schedule = true, updated_at = NOW() WHERE id = $1', [projectId]);
    try { await refreshRollups(); } catch { /* non-fatal */ }

    return NextResponse.json({ success: true, ...counts });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
