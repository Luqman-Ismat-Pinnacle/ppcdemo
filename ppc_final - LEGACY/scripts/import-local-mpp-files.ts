#!/usr/bin/env tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Parse local .mpp files with the configured MPP parser and upsert schedule data.
 *
 * Usage:
 *   npx tsx scripts/import-local-mpp-files.ts
 */

import { readFileSync, existsSync } from 'fs';
import { basename, resolve } from 'path';
import { spawnSync } from 'child_process';
import pg from 'pg';
import { convertProjectPlanJSON } from '../lib/data-converter';
import { toSupabaseFormat } from '../lib/supabase';

type PlanInput = {
  filePath: string;
  projectId: string;
  label: string;
};

const INPUTS: PlanInput[] = [
  {
    filePath: '/Users/luqmanismat/Downloads/1769399255819_30005 Syncrude - Fort McMurray - 2025 Equipment Strategy Development (1).mpp',
    projectId: '30005',
    label: 'Syncrude',
  },
  {
    filePath: '/Users/luqmanismat/Downloads/1771238485383_Chevron_CNL-Okan_RCM_Baseline0 - 260125 - Copy.mpp',
    projectId: '30060',
    label: 'Chevron',
  },
  {
    filePath: '/Users/luqmanismat/Downloads/1771239591329_PSD_FEAS-Piping_Schedule_Baseline4_260125 - Copy.mpp',
    projectId: '30121',
    label: 'PSD_FEAS',
  },
  {
    filePath: '/Users/luqmanismat/Downloads/1771312640750_Archaea - 30345.mpp',
    projectId: '30345',
    label: 'Archaea',
  },
  {
    filePath: '/Users/luqmanismat/Downloads/1771313603902_MPC Anacortes PSI Safety Systems (30007).mpp',
    projectId: '30007',
    label: 'MPC Anacortes',
  },
];

const DEFAULT_MPP_PARSER_URL = 'https://ppcdemo-production.up.railway.app';
const JSONB_COLUMNS = new Set(['predecessors', 'successors']);
const MAX_VARCHAR_LENGTH = 255;

function loadEnv() {
  for (const rel of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) process.env[key] = value;
    }
  }
}

function truncateForVarchar(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string' && value.length > MAX_VARCHAR_LENGTH) return value.slice(0, MAX_VARCHAR_LENGTH);
  return value;
}

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
    `SELECT column_name, data_type, character_maximum_length
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  const columns = new Set<string>();
  const varcharLimit = new Map<string, number>();
  for (const row of result.rows as any[]) {
    const name = String(row.column_name);
    columns.add(name);
    const maxLen = Number(row.character_maximum_length || 0);
    if (maxLen > 0) varcharLimit.set(name, maxLen);
  }
  return { columns, varcharLimit };
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
  rows: Record<string, unknown>[],
): Promise<number> {
  if (!rows.length) return 0;
  const tableMeta = await getTableColumns(client, tableName);

  const formattedRows = rows
    .map((row) => sanitizeRow(toSupabaseFormat(row) as Record<string, unknown>))
    .map((row) => {
      ensureRowId(row, tableName);
      const filtered: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (!tableMeta.columns.has(key)) continue;
        if (JSONB_COLUMNS.has(key)) {
          filtered[key] = value;
          continue;
        }
        const maxLen = tableMeta.varcharLimit.get(key);
        if (typeof value === 'string' && maxLen && value.length > maxLen) {
          filtered[key] = value.slice(0, maxLen);
        } else {
          filtered[key] = truncateForVarchar(value);
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
    }, new Set<string>()),
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

    const updateSet = columns.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
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
    preds.forEach((p: any) =>
      add(
        String(p.predecessorTaskId || p.predecessor_task_id || '').trim(),
        succId,
        String(p.relationship || p.relationshipType || p.relationship_type || 'FS'),
        Number(p.lagDays || p.lag_days || p.lag || 0),
      ));

    const succs = Array.isArray(task.successors) ? task.successors : [];
    succs.forEach((s: any) =>
      add(
        succId,
        String(s.successorTaskId || s.successor_task_id || '').trim(),
        String(s.relationship || s.relationshipType || s.relationship_type || 'FS'),
        Number(s.lagDays || s.lag_days || s.lag || 0),
      ));
  });

  return rows;
}

async function callParser(parserUrl: string, filePath: string): Promise<Record<string, unknown>> {
  const fileName = basename(filePath);
  const parseUrl = `${parserUrl.replace(/\/$/, '')}/parse`;
  const result = spawnSync(
    'curl',
    ['-sS', '-f', '-F', `file=@${filePath}`, parseUrl],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`Parser failed (${fileName}): ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
  let payload: any = null;
  try {
    payload = JSON.parse(result.stdout || '{}');
  } catch (error) {
    throw new Error(`Parser JSON decode failed (${fileName}): ${(error as Error).message}`);
  }
  if (!payload || payload.success !== true) {
    throw new Error(`Parser returned invalid payload (${fileName})`);
  }
  return payload as Record<string, unknown>;
}

async function processOne(client: any, parserUrl: string, input: PlanInput) {
  const parsed = await callParser(parserUrl, input.filePath);
  const converted = convertProjectPlanJSON(parsed, input.projectId) as any;
  const now = new Date().toISOString();
  const units = (converted.units || []) as any[];
  const phases = (converted.phases || []) as any[];
  const tasks = (converted.tasks || []) as any[];
  units.forEach((row) => {
    row.projectId = input.projectId;
    row.project_id = input.projectId;
    row.updatedAt = now;
    row.createdAt = row.createdAt || now;
  });
  phases.forEach((row) => {
    row.projectId = input.projectId;
    row.project_id = input.projectId;
    row.updatedAt = now;
    row.createdAt = row.createdAt || now;
  });
  tasks.forEach((row) => {
    row.projectId = input.projectId;
    row.project_id = input.projectId;
    row.taskId = row.taskId || row.id || row.task_id;
    row.updatedAt = now;
    row.createdAt = row.createdAt || now;
  });
  const dependencyRows = buildDependencyRows(tasks);

  await client.query('BEGIN');
  try {
    await client.query('UPDATE projects SET has_schedule = true, updated_at = NOW() WHERE id = $1', [input.projectId]);
    await client.query(
      `DELETE FROM task_dependencies
       WHERE successor_task_id IN (SELECT id FROM tasks WHERE project_id = $1)
          OR predecessor_task_id IN (SELECT id FROM tasks WHERE project_id = $1)`,
      [input.projectId],
    );
    await client.query(
      `UPDATE tasks
       SET parent_task_id = NULL
       WHERE parent_task_id IN (SELECT id FROM tasks WHERE project_id = $1)
         AND COALESCE(project_id, '') <> $1`,
      [input.projectId],
    );
    await client.query('DELETE FROM tasks WHERE project_id = $1', [input.projectId]);
    await client.query('DELETE FROM units WHERE project_id = $1', [input.projectId]);
    await client.query('UPDATE tasks SET phase_id = NULL WHERE phase_id IN (SELECT id FROM phases WHERE project_id = $1)', [input.projectId]);
    await client.query('DELETE FROM phases WHERE project_id = $1', [input.projectId]);
    await client.query('DELETE FROM project_log WHERE project_id = $1', [input.projectId]);

    const unitsSaved = await upsertRows(client, 'units', units as Record<string, unknown>[]);
    const phasesSaved = await upsertRows(client, 'phases', phases as Record<string, unknown>[]);
    const tasksSaved = await upsertRows(client, 'tasks', tasks as Record<string, unknown>[]);
    const depsSaved = await upsertRows(client, 'task_dependencies', dependencyRows);

    await client.query(
      `INSERT INTO workflow_audit_log (
         event_type, role_key, actor_email, project_id, entity_type, entity_id, payload, created_at
       ) VALUES (
         'mpp_parser', 'system', 'system@internal', $1, 'project', $1, $2::jsonb, NOW()
       )`,
      [
        input.projectId,
        JSON.stringify({
          label: input.label,
          fileName: basename(input.filePath),
          unitsSaved,
          phasesSaved,
          tasksSaved,
          depsSaved,
        }),
      ],
    );

    await client.query('COMMIT');
    return { unitsSaved, phasesSaved, tasksSaved, depsSaved };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  loadEnv();
  const parserUrl = process.env.MPP_PARSER_URL || process.env.NEXT_PUBLIC_MPP_PARSER_URL || DEFAULT_MPP_PARSER_URL;
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.AZURE_POSTGRES_CONNECTION_STRING ||
    process.env.POSTGRES_CONNECTION_STRING ||
    process.env.AZURE_DATABASE_URL;
  if (!dbUrl) throw new Error('Missing DB URL in env');

  for (const input of INPUTS) {
    if (!existsSync(input.filePath)) throw new Error(`File not found: ${input.filePath}`);
  }

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const input of INPUTS) {
      console.log(`[MPP Import] ${input.label} (${input.projectId}) -> parsing ${basename(input.filePath)}`);
      const result = await processOne(client, parserUrl, input);
      console.log(`[MPP Import] ${input.label} done: units=${result.unitsSaved} phases=${result.phasesSaved} tasks=${result.tasksSaved} deps=${result.depsSaved}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[MPP Import] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
