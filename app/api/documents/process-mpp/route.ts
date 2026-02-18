import { NextRequest, NextResponse } from 'next/server';
import { convertProjectPlanJSON } from '@/lib/data-converter';
import { toSupabaseFormat } from '@/lib/supabase';
import { downloadFile } from '@/lib/azure-storage';
import { withClient } from '@/lib/postgres';

type ProcessLogType = 'info' | 'success' | 'warning';

interface ProcessLog {
  type: ProcessLogType;
  message: string;
}

const DEFAULT_MPP_PARSER_URL = 'https://ppcdemo-production.up.railway.app';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function requireString(formData: FormData, field: string): string {
  const value = readString(formData, field);
  if (!value) throw new Error(`Missing required field: ${field}`);
  return value;
}

async function callParser(parserUrl: string, fileName: string, fileBuffer: Buffer): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const parserFormData = new FormData();
    parserFormData.append('file', new Blob([fileBuffer as any], { type: 'application/octet-stream' }), fileName);

    const response = await fetch(`${parserUrl.replace(/\/$/, '')}/parse`, {
      method: 'POST',
      body: parserFormData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Parser failed: ${text || `HTTP ${response.status}`}`);
    }

    const payload = await response.json();
    if (!isRecord(payload) || payload.success !== true) {
      throw new Error('Parser returned invalid payload');
    }
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

const JSONB_COLUMNS = new Set(['predecessors', 'successors']);

function serializeJsonb(value: unknown): string {
  if (value === null || value === undefined) return '[]';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(Array.isArray(parsed) ? parsed : []);
    } catch {
      return '[]';
    }
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return '[]';
}

async function getTableColumns(client: any, tableName: 'units' | 'phases' | 'tasks' | 'task_dependencies') {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(result.rows.map((r: any) => String(r.column_name)));
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (value === undefined) return;
    cleaned[key] = value;
  });
  return cleaned;
}

function ensureRowId(row: Record<string, unknown>, tableName: string): void {
  if (row.id !== undefined && row.id !== null && String(row.id).trim() !== '') return;
  const fallback =
    tableName === 'tasks' ? row.task_id ?? (row as any).taskId
    : tableName === 'units' ? row.unit_id ?? (row as any).unitId
    : tableName === 'phases' ? row.phase_id ?? (row as any).phaseId
    : null;
  if (fallback != null) row.id = String(fallback);
}

async function upsertRows(
  client: any,
  tableName: 'units' | 'phases' | 'tasks' | 'task_dependencies',
  rows: Record<string, unknown>[]
): Promise<number> {
  if (!rows.length) return 0;

  const tableColumns = await getTableColumns(client, tableName);
  const formattedRows = rows
    .map((row) => sanitizeRow(toSupabaseFormat(row) as Record<string, unknown>))
    .map((row) => {
      ensureRowId(row, tableName);
      const filtered: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (tableColumns.has(key)) {
          filtered[key] = value;
        }
      }
      return filtered;
    })
    .filter((row) => row.id !== undefined && row.id !== null && String(row.id).trim() !== '');

  if (!formattedRows.length) return 0;

  const columns = Array.from(
    formattedRows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>())
  );

  if (!columns.includes('id')) columns.unshift('id');

  const BATCH_SIZE = 200;
  let upserted = 0;

  for (let offset = 0; offset < formattedRows.length; offset += BATCH_SIZE) {
    const batch = formattedRows.slice(offset, offset + BATCH_SIZE);
    const values: unknown[] = [];
    const tuples: string[] = [];

    batch.forEach((row, rowIdx) => {
      const placeholders: string[] = [];
      columns.forEach((col, colIdx) => {
        const paramNum = rowIdx * columns.length + colIdx + 1;
        const raw = row[col] ?? null;
        if (JSONB_COLUMNS.has(col)) {
          values.push(raw === null ? null : serializeJsonb(raw));
          placeholders.push(`$${paramNum}::jsonb`);
        } else {
          values.push(raw);
          placeholders.push(`$${paramNum}`);
        }
      });
      tuples.push(`(${placeholders.join(', ')})`);
    });

    const updateSet = columns
      .filter((c) => c !== 'id')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');

    const sql = updateSet
      ? `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (id) DO UPDATE SET ${updateSet}`
      : `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (id) DO NOTHING`;

    await client.query(sql, values);
    upserted += batch.length;
  }

  return upserted;
}

function buildDependencyRows(tasks: any[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const taskIds = new Set(tasks.map((t) => String(t.id || t.taskId || '').trim()).filter(Boolean));

  const add = (pred: string, succ: string, rel: string, lag: number) => {
    if (!pred || !succ || pred === succ) return;
    if (!taskIds.has(pred) || !taskIds.has(succ)) return;
    const relationship = ['FS', 'SS', 'FF', 'SF'].includes((rel || '').toUpperCase()) ? rel.toUpperCase() : 'FS';
    const lagDays = Number(lag) || 0;
    const key = `${pred}|${succ}|${relationship}|${lagDays}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      id: `dep-${pred}-${succ}-${relationship}-${lagDays}`,
      predecessorTaskId: pred,
      successorTaskId: succ,
      relationshipType: relationship,
      lagDays,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  tasks.forEach((task: any) => {
    const succId = String(task.id || task.taskId || '').trim();
    const preds = Array.isArray(task.predecessors) ? task.predecessors : [];
    preds.forEach((p: any) => {
      add(
        String(p.predecessorTaskId || p.predecessor_task_id || '').trim(),
        succId,
        String(p.relationship || p.relationshipType || p.relationship_type || 'FS'),
        Number(p.lagDays || p.lag_days || p.lag || 0)
      );
    });

    const succs = Array.isArray(task.successors) ? task.successors : [];
    succs.forEach((s: any) => {
      add(
        succId,
        String(s.successorTaskId || s.successor_task_id || '').trim(),
        String(s.relationship || s.relationshipType || s.relationship_type || 'FS'),
        Number(s.lagDays || s.lag_days || s.lag || 0)
      );
    });
  });

  return rows;
}

export async function POST(req: NextRequest) {
  const diagnostics: string[] = [];
  const logDiag = (msg: string) => diagnostics.push(`${new Date().toISOString()} ${msg}`);
  try {
    const parserUrl =
      process.env.MPP_PARSER_URL ||
      process.env.NEXT_PUBLIC_MPP_PARSER_URL ||
      DEFAULT_MPP_PARSER_URL;

    const formData = await req.formData();
    const documentId = requireString(formData, 'documentId');
    const projectId = requireString(formData, 'projectId');
    const portfolioId = readString(formData, 'portfolioId');
    const customerId = readString(formData, 'customerId');
    const siteId = readString(formData, 'siteId');
    const storagePathParam = readString(formData, 'storagePath');
    logDiag(`[Input] documentId=${documentId} projectId=${projectId}`);

    const docResult = await withClient((client) =>
      client.query('SELECT id, file_name, storage_path FROM project_documents WHERE id = $1 LIMIT 1', [documentId])
    );

    let doc = docResult?.rows?.[0] as { id: string; file_name: string; storage_path: string } | undefined;
    if (!doc && storagePathParam) {
      const byPathResult = await withClient((client) =>
        client.query('SELECT id, file_name, storage_path FROM project_documents WHERE storage_path = $1 LIMIT 1', [storagePathParam])
      );
      doc = byPathResult?.rows?.[0] as { id: string; file_name: string; storage_path: string } | undefined;
      if (doc) logDiag(`[Document] found by storage_path (id=${doc.id})`);
    }
    if (!doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }
    logDiag(`[Document] file=${doc.file_name} path=${doc.storage_path}`);

    const { data: fileBuffer, error: downloadError } = await downloadFile(doc.storage_path);
    if (downloadError || !fileBuffer) {
      return NextResponse.json({ success: false, error: `Failed to download file: ${downloadError || 'unknown'}` }, { status: 500 });
    }
    logDiag(`[Storage] Downloaded file bytes=${(fileBuffer as Buffer).length || 0}`);

    const parsed = await callParser(parserUrl, doc.file_name, fileBuffer as Buffer);
    logDiag(`[Parser] success=true tasks=${Array.isArray((parsed as any).tasks) ? (parsed as any).tasks.length : 0}`);
    let converted: Partial<Record<string, unknown>>;
    try {
      converted = convertProjectPlanJSON(parsed, projectId);
    } catch (conversionError) {
      logDiag(`[Convert] FAILED ${(conversionError as Error)?.message || String(conversionError)}`);
      return NextResponse.json(
        {
          success: false,
          error: `Conversion failed: ${(conversionError as Error)?.message || String(conversionError)}`,
          diagnostics,
          parserSample: Array.isArray((parsed as any).tasks) ? (parsed as any).tasks.slice(0, 3) : [],
        },
        { status: 500 }
      );
    }

    const units = (converted.units || []) as any[];
    const phases = (converted.phases || []) as any[];
    const tasks = (converted.tasks || []) as any[];
    logDiag(`[Convert] units=${units.length} phases=${phases.length} tasks=${tasks.length}`);
    if ((Array.isArray((parsed as any).tasks) ? (parsed as any).tasks.length : 0) > 0 && units.length === 0 && phases.length === 0 && tasks.length === 0) {
      logDiag('[Convert] WARNING parsed tasks exist but conversion produced no rows');
    }

    const now = new Date().toISOString();
    units.forEach((row) => {
      row.projectId = projectId;
      row.project_id = projectId;
      if (portfolioId) row.portfolioId = portfolioId;
      if (customerId) row.customerId = customerId;
      if (siteId) row.siteId = siteId;
      row.updatedAt = now;
      row.createdAt = row.createdAt || now;
    });
    phases.forEach((row) => {
      row.projectId = projectId;
      row.project_id = projectId;
      if (portfolioId) row.portfolioId = portfolioId;
      if (customerId) row.customerId = customerId;
      if (siteId) row.siteId = siteId;
      row.updatedAt = now;
      row.createdAt = row.createdAt || now;
    });
    tasks.forEach((row) => {
      row.projectId = projectId;
      row.project_id = projectId;
      row.taskId = row.taskId || row.id || row.task_id;
      if (portfolioId) row.portfolioId = portfolioId;
      if (customerId) row.customerId = customerId;
      if (siteId) row.siteId = siteId;
      row.updatedAt = now;
      row.createdAt = row.createdAt || now;
    });

    const dependencyRows = buildDependencyRows(tasks);

    const summary = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        logDiag('[DB] BEGIN transaction');
        await client.query('UPDATE projects SET has_schedule = true, updated_at = NOW() WHERE id = $1', [projectId]);

        // Full replace per project (atomic)
        await client.query(
          `DELETE FROM task_dependencies
           WHERE successor_task_id IN (SELECT id FROM tasks WHERE project_id = $1)
              OR predecessor_task_id IN (SELECT id FROM tasks WHERE project_id = $1)`,
          [projectId]
        );
        await client.query('DELETE FROM tasks WHERE project_id = $1', [projectId]);
        await client.query('DELETE FROM units WHERE project_id = $1', [projectId]);
        await client.query('DELETE FROM phases WHERE project_id = $1', [projectId]);
        await client.query('DELETE FROM project_log WHERE project_id = $1', [projectId]);

        const unitsSaved = await upsertRows(client, 'units', units as Record<string, unknown>[]);
        logDiag(`[DB] units upserted=${unitsSaved}`);
        const phasesSaved = await upsertRows(client, 'phases', phases as Record<string, unknown>[]);
        logDiag(`[DB] phases upserted=${phasesSaved}`);
        const tasksSaved = await upsertRows(client, 'tasks', tasks as Record<string, unknown>[]);
        logDiag(`[DB] tasks upserted=${tasksSaved}`);
        const depsSaved = await upsertRows(client, 'task_dependencies', dependencyRows);
        logDiag(`[DB] dependencies upserted=${depsSaved}`);

        await client.query(
          "UPDATE project_documents SET is_current_version = false WHERE project_id = $1 AND document_type = 'MPP'",
          [projectId]
        );
        await client.query(
          'UPDATE project_documents SET project_id = $1, is_current_version = true, updated_at = NOW() WHERE id = $2',
          [projectId, documentId]
        );

        await client.query('COMMIT');
        logDiag('[DB] COMMIT');
        return { unitsSaved, phasesSaved, tasksSaved, depsSaved };
      } catch (error) {
        await client.query('ROLLBACK');
        logDiag(`[DB] ROLLBACK ${(error as Error)?.message || String(error)}`);
        throw error;
      }
    });

    const totalParsed = Number((parsed as any)?.summary?.total_rows || (parsed as any)?.summary?.total_tasks || (parsed as any)?.tasks?.length || 0);
    const logs: ProcessLog[] = [
      { type: 'info', message: `Parsed ${totalParsed} rows from MPP parser` },
      { type: 'success', message: `Synced ${summary.unitsSaved} units, ${summary.phasesSaved} phases, ${summary.tasksSaved} tasks` },
      { type: 'success', message: `Synced ${summary.depsSaved} task dependencies` },
      { type: 'success', message: 'Replaced existing project schedule data atomically' },
    ];

    return NextResponse.json({
      success: true,
      logs,
      diagnostics,
      summary,
      taskCount: tasks.length,
      tasks,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('[process-mpp] error:', message);
    return NextResponse.json({ success: false, error: message, diagnostics }, { status: 500 });
  }
}
