import { NextRequest, NextResponse } from 'next/server';
import { convertProjectPlanJSON } from '@/lib/data-converter';
import { toSupabaseFormat } from '@/lib/supabase';
import { downloadFile } from '@/lib/azure-storage';
import { withClient } from '@/lib/postgres';

type ProcessLogType = 'info' | 'success' | 'warning';
const DEFAULT_MPP_PARSER_URL = 'https://ppcdemo-production.up.railway.app';

interface ProcessLog {
  type: ProcessLogType;
  message: string;
}

interface ParserSuccessPayload {
  success: true;
  summary?: { total_tasks?: number };
  tasks?: unknown[];
}

interface ParsedInput {
  documentId: string;
  projectId: string;
  portfolioId: string;
  customerId: string;
  siteId: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRequiredString(formData: FormData, field: string): string {
  const value = formData.get(field);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required field: ${field}`);
  }
  return value.trim();
}

function parseFormData(formData: FormData): ParsedInput {
  return {
    documentId: readRequiredString(formData, 'documentId'),
    projectId: readRequiredString(formData, 'projectId'),
    portfolioId: readRequiredString(formData, 'portfolioId'),
    customerId: readRequiredString(formData, 'customerId'),
    siteId: readRequiredString(formData, 'siteId'),
  };
}

async function callParser(parserUrl: string, fileName: string, fileBuffer: Buffer): Promise<ParserSuccessPayload> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' });
    const parserFormData = new FormData();
    parserFormData.append('file', fileBlob, fileName);

    const response = await fetch(`${parserUrl.replace(/\/$/, '')}/parse`, {
      method: 'POST',
      body: parserFormData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const parserError = await response.text();
      throw new Error(`Parser failed: ${parserError || `HTTP ${response.status}`}`);
    }

    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || payload.success !== true) {
      throw new Error('Parser returned an invalid payload');
    }

    return payload as ParserSuccessPayload;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_\-.,;:()]+/g, ' ');
}

const UPSERT_ALLOWED_COLUMNS: Record<'units' | 'phases' | 'tasks', Set<string>> = {
  units: new Set([
    'id', 'unit_id', 'site_id', 'project_id', 'employee_id', 'name', 'description',
    'baseline_start_date', 'baseline_end_date', 'actual_start_date', 'actual_end_date',
    'start_date', 'end_date', 'percent_complete',
    'baseline_hours', 'actual_hours', 'remaining_hours',
    'baseline_cost', 'actual_cost', 'remaining_cost',
    'comments', 'is_active', 'created_at', 'updated_at',
    'portfolio_id', 'customer_id',
  ]),
  phases: new Set([
    'id', 'phase_id', 'project_id', 'unit_id', 'employee_id', 'name', 'methodology', 'sequence',
    'start_date', 'end_date', 'baseline_start_date', 'baseline_end_date', 'actual_start_date', 'actual_end_date',
    'percent_complete',
    'baseline_hours', 'actual_hours', 'remaining_hours',
    'baseline_cost', 'actual_cost', 'remaining_cost',
    'comments', 'is_active', 'created_at', 'updated_at',
    'portfolio_id', 'customer_id', 'site_id',
  ]),
  tasks: new Set([
    'id', 'task_id', 'project_id', 'phase_id', 'unit_id', 'site_id', 'customer_id', 'portfolio_id',
    'sub_project_id', 'resource_id', 'employee_id',
    'assigned_resource_id', 'assigned_resource_name', 'assigned_resource_type', 'assigned_resource',
    'task_name', 'task_description', 'name', 'description',
    'is_sub_task', 'parent_task_id',
    'status', 'priority',
    'start_date', 'end_date', 'planned_start_date', 'planned_end_date',
    'baseline_start_date', 'baseline_end_date', 'actual_start_date', 'actual_end_date',
    'days_required', 'percent_complete',
    'baseline_hours', 'actual_hours', 'remaining_hours', 'projected_remaining_hours', 'projected_hours',
    'baseline_cost', 'actual_cost', 'remaining_cost',
    'baseline_qty', 'actual_qty', 'completed_qty',
    'baseline_count', 'actual_count', 'completed_count',
    'baseline_metric', 'baseline_uom', 'uom',
    'is_critical', 'is_milestone',
    'predecessor_id', 'predecessor_relationship',
    'total_slack', 'total_float',
    'comments', 'notes',
    'created_at', 'updated_at', 'is_active',
  ]),
};

function sanitizeUpsertRow(
  tableName: 'units' | 'phases' | 'tasks',
  row: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = UPSERT_ALLOWED_COLUMNS[tableName];
  const sanitized: Record<string, unknown> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (allowed.has(key) && value !== undefined) {
      sanitized[key] = value;
    }
  });
  return sanitized;
}

export async function POST(req: NextRequest) {
  try {
    const parserUrl =
      process.env.MPP_PARSER_URL ||
      process.env.NEXT_PUBLIC_MPP_PARSER_URL ||
      DEFAULT_MPP_PARSER_URL;

    const formData = await req.formData();
    let input: ParsedInput;
    try {
      input = parseFormData(formData);
    } catch (validationError) {
      return NextResponse.json(
        { success: false, error: getErrorMessage(validationError) },
        { status: 400 }
      );
    }

    const documentResult = await withClient(async (client) => {
      return client.query(
        'SELECT id, file_name, storage_path FROM project_documents WHERE id = $1 LIMIT 1',
        [input.documentId]
      );
    });

    if (!documentResult.rows[0]) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    const doc = documentResult.rows[0] as { file_name: string; storage_path: string };
    const { data: fileBuffer, error: downloadError } = await downloadFile(doc.storage_path);

    if (downloadError || !fileBuffer) {
      return NextResponse.json(
        { success: false, error: `Failed to download file content: ${downloadError || 'unknown error'}` },
        { status: 500 }
      );
    }

    const parsedMpp = await callParser(parserUrl, doc.file_name, fileBuffer);
    const convertedData = convertProjectPlanJSON(parsedMpp, input.projectId);

    (convertedData.phases || []).forEach((phase: Record<string, unknown>) => {
      phase.projectId = input.projectId;
      phase.portfolioId = input.portfolioId;
      phase.customerId = input.customerId;
      phase.siteId = input.siteId;
    });

    (convertedData.units || []).forEach((unit: Record<string, unknown>) => {
      unit.projectId = input.projectId;
      unit.portfolioId = input.portfolioId;
      unit.customerId = input.customerId;
      unit.siteId = input.siteId;
    });

    (convertedData.tasks || []).forEach((task: Record<string, unknown>) => {
      task.projectId = input.projectId;
      task.portfolioId = input.portfolioId;
      task.customerId = input.customerId;
      task.siteId = input.siteId;
    });

    const transactionSummary = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const upsertRows = async (tableName: 'units' | 'phases' | 'tasks', rows: Array<Record<string, unknown>>) => {
          if (!rows.length) return 0;
          let count = 0;

          for (const sourceRow of rows) {
            const row = sanitizeUpsertRow(tableName, { ...toSupabaseFormat(sourceRow) } as Record<string, unknown>);
            if (!row.id) continue;
            if (tableName === 'tasks') {
              delete row.employee_id;
            }

            const cols = Object.keys(row);
            if (!cols.length) continue;

            const vals = Object.values(row);
            const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
            const updateSet = cols
              .filter((col) => col !== 'id')
              .map((col) => `${col} = EXCLUDED.${col}`)
              .join(', ');

            const sql = updateSet
              ? `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${updateSet}`
              : `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;

            await client.query(sql, vals);
            count += 1;
          }

          return count;
        };

        const unitsSaved = await upsertRows('units', (convertedData.units || []) as Array<Record<string, unknown>>);
        const phasesSaved = await upsertRows('phases', (convertedData.phases || []) as Array<Record<string, unknown>>);
        const tasksSaved = await upsertRows('tasks', (convertedData.tasks || []) as Array<Record<string, unknown>>);

        const hoursResult = await client.query(
          'SELECT id, task_id, workday_phase, workday_task FROM hour_entries WHERE project_id = $1',
          [input.projectId]
        );

        const unassignedHours = hoursResult.rows.filter((hour) => !hour.task_id);
        const tasksByName = new Map<string, { id?: string; taskId?: string; name?: string; phaseName?: string }>();

        ((convertedData.tasks || []) as Array<Record<string, unknown>>).forEach((task) => {
          const phaseName = String(task.phaseName || '');
          const taskName = String(task.name || task.taskName || '');
          const key = `${normalizeName(phaseName)}|${normalizeName(taskName)}`;
          tasksByName.set(key, task as { id?: string; taskId?: string; name?: string; phaseName?: string });

          const nameOnlyKey = normalizeName(taskName);
          if (nameOnlyKey && !tasksByName.has(nameOnlyKey)) {
            tasksByName.set(nameOnlyKey, task as { id?: string; taskId?: string; name?: string; phaseName?: string });
          }
        });

        let tasksMatched = 0;
        for (const hour of unassignedHours) {
          const workdayPhase = normalizeName(String(hour.workday_phase || ''));
          const workdayTask = normalizeName(String(hour.workday_task || ''));

          const phaseTaskKey = `${workdayPhase}|${workdayTask}`;
          const matchedTask = tasksByName.get(phaseTaskKey) || (workdayTask ? tasksByName.get(workdayTask) : undefined);
          const taskId = matchedTask?.id || matchedTask?.taskId;

          if (taskId) {
            await client.query('UPDATE hour_entries SET task_id = $1 WHERE id = $2', [taskId, hour.id]);
            tasksMatched += 1;
          }
        }

        await client.query('COMMIT');

        return {
          unitsSaved,
          phasesSaved,
          tasksSaved,
          unassignedHours: unassignedHours.length,
          tasksMatched,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    const totalParsed = parsedMpp.summary?.total_tasks || parsedMpp.tasks?.length || 0;
    const stillUnmatched = transactionSummary.unassignedHours - transactionSummary.tasksMatched;

    const logs: ProcessLog[] = [
      { type: 'info', message: `Parsed ${totalParsed} items from MPP` },
      {
        type: 'success',
        message: `Imported: ${transactionSummary.unitsSaved} units, ${transactionSummary.phasesSaved} phases, ${transactionSummary.tasksSaved} tasks`,
      },
      {
        type: 'info',
        message: `Found ${transactionSummary.unassignedHours} unassigned hour entries for this project`,
      },
    ];

    if (transactionSummary.tasksMatched > 0) {
      logs.push({ type: 'success', message: `Matched ${transactionSummary.tasksMatched} hour entries to tasks` });
    }

    if (stillUnmatched > 0) {
      logs.push({ type: 'warning', message: `${stillUnmatched} hour entries could not be matched` });
    }

    return NextResponse.json({
      success: true,
      message: 'Imported successfully',
      tasks: convertedData.tasks || [],
      logs,
      summary: transactionSummary,
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('Process error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
