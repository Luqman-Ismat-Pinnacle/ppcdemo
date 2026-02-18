/**
 * @fileoverview Data Sync API Route
 * 
 * Server-side route for syncing data to the database.
 * Supports PostgreSQL (primary) and Supabase (fallback).
 * 
 * @module app/api/data/sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';
import { DATA_KEY_TO_TABLE } from '@/lib/supabase';

type SyncOperation =
  | 'wipeAll'
  | 'deleteByProjectId'
  | 'setCurrentMpp'
  | 'updateDocumentHealth'
  | 'deleteByTaskIds'
  | 'delete'
  | 'replace'
  | 'update'
  | undefined;

interface SyncRequestBody {
  dataKey?: string;
  records?: unknown;
  operation?: SyncOperation;
  projectId?: unknown;
  storagePath?: unknown;
  healthScore?: unknown;
  healthCheckJson?: unknown;
  taskIds?: unknown;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
let parserSchemaEnsured = false;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseRequestBody(payload: unknown): SyncRequestBody {
  if (!isObject(payload)) {
    throw new Error('Invalid request body');
  }
  return payload as SyncRequestBody;
}

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toDbFormat(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toDbFormat);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = value;
  }
  return result;
}

// Null-like values to convert to actual NULL
const nullLike = new Set(['', '-', 'null', 'undefined', 'n/a']);

function cleanRecord(record: Record<string, unknown>, tableName: string): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  cleaned.id = record.id || '';

  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      const lowered = trimmed.toLowerCase();
      if (nullLike.has(lowered)) {
        cleaned[key] = null;
      } else if (key.endsWith('Id') && trimmed === '') {
        cleaned[key] = null;
      } else {
        cleaned[key] = trimmed.length > 255 ? trimmed.substring(0, 255) : trimmed;
      }
    } else if (key.endsWith('Id') && (value === '' || value === null || value === undefined)) {
      cleaned[key] = null;
    } else {
      cleaned[key] = value;
    }
  }

  const formatted = toDbFormat(cleaned) as Record<string, unknown>;

  // tasks table: strip columns that don't exist in the DB schema
  if (tableName === 'tasks') {
    // Keep parser payload fields and normalize aliases where needed.
    delete formatted.employee_id;
    delete formatted.predecessor_name;
    if (formatted.description == null && formatted.task_description != null) {
      formatted.description = formatted.task_description;
    }
    if (formatted.projected_remaining_hours == null && formatted.projected_hours != null) {
      formatted.projected_remaining_hours = formatted.projected_hours;
    }
    if (formatted.parent_task_id == null && formatted.parent_id != null) {
      formatted.parent_task_id = formatted.parent_id;
    }
  }

  // task_dependencies: strip columns not in schema
  if (tableName === 'task_dependencies') {
    delete formatted.predecessor_name;
    delete formatted.lag;
    delete formatted.task_id;
  }

  if (tableName === 'units') {
    if (formatted.is_active == null && formatted.active != null) {
      formatted.is_active = formatted.active;
    }
  }

  if (tableName === 'phases') {
    if (formatted.description == null && formatted.comments != null) {
      formatted.description = formatted.comments;
    }
  }

  // Strip nested objects not represented as JSON columns.
  for (const [key, value] of Object.entries(formatted)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      delete formatted[key];
    }
  }

  return formatted;
}

/**
 * For hour_entries, validate that FK references (task_id, phase_id) actually exist.
 * Null out any that don't to prevent FK constraint violations.
 */
async function validateHourEntryFKs(records: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (records.length === 0) return records;

  // Collect unique task_ids and phase_ids from the batch
  const taskIds = new Set<string>();
  const phaseIds = new Set<string>();
  records.forEach(r => {
    if (r.task_id) taskIds.add(String(r.task_id));
    if (r.phase_id) phaseIds.add(String(r.phase_id));
  });

  const validTaskIds = new Set<string>();
  const validPhaseIds = new Set<string>();

  // Check which task_ids actually exist
  if (taskIds.size > 0) {
    try {
      const arr = Array.from(taskIds);
      const placeholders = arr.map((_, i) => `$${i + 1}`).join(', ');
      const result = await pgQuery(`SELECT id FROM tasks WHERE id IN (${placeholders})`, arr);
      result.rows.forEach((row: { id: string | number }) => validTaskIds.add(String(row.id)));
    } catch { /* if query fails, null out all task_ids to be safe */ }
  }

  // Check which phase_ids actually exist
  if (phaseIds.size > 0) {
    try {
      const arr = Array.from(phaseIds);
      const placeholders = arr.map((_, i) => `$${i + 1}`).join(', ');
      const result = await pgQuery(`SELECT id FROM phases WHERE id IN (${placeholders})`, arr);
      result.rows.forEach((row: { id: string | number }) => validPhaseIds.add(String(row.id)));
    } catch { /* if query fails, null out all phase_ids to be safe */ }
  }

  // Null out invalid references
  let nulledTasks = 0;
  let nulledPhases = 0;
  const cleaned = records.map(r => {
    const copy = { ...r };
    if (copy.task_id && !validTaskIds.has(String(copy.task_id))) {
      copy.task_id = null;
      nulledTasks++;
    }
    if (copy.phase_id && !validPhaseIds.has(String(copy.phase_id))) {
      copy.phase_id = null;
      nulledPhases++;
    }
    return copy;
  });

  if (nulledTasks > 0 || nulledPhases > 0) {
    console.log(`[Sync] hour_entries FK validation: nulled ${nulledTasks} invalid task_ids, ${nulledPhases} invalid phase_ids out of ${records.length} records`);
  }

  return cleaned;
}

// ============================================================================
// POSTGRESQL OPERATIONS
// ============================================================================

async function pgUpsert(tableName: string, records: Record<string, unknown>[]): Promise<{ success: boolean; count: number; error?: string }> {
  if (records.length === 0) return { success: true, count: 0 };

  try {
    let totalCount = 0;
    // Process in batches of 50 to avoid param limits
    const BATCH = 50;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const columns = Object.keys(batch[0]);
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];

      batch.forEach((row, rowIdx) => {
        const placeholders = columns.map((col, colIdx) => {
          values.push(row[col] !== undefined ? row[col] : null);
          return `$${rowIdx * columns.length + colIdx + 1}`;
        });
        rowPlaceholders.push(`(${placeholders.join(', ')})`);
      });

      const updateCols = columns
        .filter(c => c !== 'id')
        .map(c => `${c} = EXCLUDED.${c}`)
        .join(', ');

      const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${rowPlaceholders.join(', ')} ON CONFLICT (id) DO UPDATE SET ${updateCols}`;

      await pgQuery(sql, values);
      totalCount += batch.length;
    }

    return { success: true, count: totalCount };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    console.error(`[Sync] PostgreSQL upsert error for ${tableName}:`, message);
    return { success: false, count: 0, error: message };
  }
}

async function pgDelete(tableName: string, ids: string[]): Promise<{ success: boolean; count: number; error?: string }> {
  if (ids.length === 0) return { success: true, count: 0 };
  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await pgQuery(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`, ids);
    return { success: true, count: ids.length };
  } catch (err: unknown) {
    return { success: false, count: 0, error: getErrorMessage(err) };
  }
}

async function pgDeleteByProjectId(tableName: string, projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await pgQuery(`DELETE FROM ${tableName} WHERE project_id = $1`, [projectId]);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

async function pgUpdate(tableName: string, id: string, updates: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  try {
    const keys = Object.keys(updates).filter(k => k !== 'id');
    if (keys.length === 0) return { success: true };
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...keys.map(k => updates[k])];
    await pgQuery(`UPDATE ${tableName} SET ${setClauses} WHERE id = $1`, values);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: getErrorMessage(err) };
  }
}

async function ensureMppParserSchemaColumns(): Promise<void> {
  if (parserSchemaEnsured) return;

  // Units parser payload columns
  await pgQuery(`
    ALTER TABLE units
    ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS hierarchy_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS outline_level INTEGER,
    ADD COLUMN IF NOT EXISTS is_summary BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS total_slack INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS predecessors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS successors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS projected_hours NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS task_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS task_description TEXT,
    ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS end_date DATE,
    ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS folder TEXT
  `);

  // Phases parser payload columns
  await pgQuery(`
    ALTER TABLE phases
    ADD COLUMN IF NOT EXISTS unit_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS hierarchy_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS outline_level INTEGER,
    ADD COLUMN IF NOT EXISTS is_summary BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS total_slack INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS predecessors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS successors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS projected_hours NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS comments TEXT,
    ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS folder TEXT
  `);

  // Tasks parser payload columns
  await pgQuery(`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS unit_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS parent_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS hierarchy_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS outline_level INTEGER,
    ADD COLUMN IF NOT EXISTS is_summary BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS total_slack INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS predecessors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS successors JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS projected_hours NUMERIC(10, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS task_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS task_description TEXT,
    ADD COLUMN IF NOT EXISTS folder TEXT
  `);

  // Indexes for hierarchy lookups and parser level rendering
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_units_outline_level ON units(outline_level)`);
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_phases_outline_level ON phases(outline_level)`);
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_tasks_outline_level ON tasks(outline_level)`);
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id)`);
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_phases_unit_id ON phases(unit_id)`);
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_tasks_unit_id ON tasks(unit_id)`);

  parserSchemaEnsured = true;
}

// ============================================================================
// SUPABASE FALLBACK
// ============================================================================

async function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const usePostgres = isPostgresConfigured();
    const body = parseRequestBody(await req.json());
    const { dataKey, records, operation, projectId, storagePath, healthScore, healthCheckJson } = body;

    // ------------------------------------------------------------------
    // Special admin operation: wipeAll — truncate all known tables.
    // Intended for local/dev use when resetting the dataset.
    // ------------------------------------------------------------------
    if (operation === 'wipeAll') {
      const tables = Array.from(new Set(Object.values(DATA_KEY_TO_TABLE)));

      if (usePostgres) {
        try {
          const tableList = tables.join(', ');
          await pgQuery(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`, []);
          return NextResponse.json({ success: true, wipedTables: tables });
        } catch (err: unknown) {
          const message = getErrorMessage(err);
          console.error('[Sync] wipeAll (Postgres) failed:', message);
          return NextResponse.json({ success: false, error: message }, { status: 500 });
        }
      }

      const supabase = await getSupabaseClient();
      if (!supabase) {
        return NextResponse.json(
          { success: false, error: 'Supabase not configured for wipeAll' },
          { status: 500 },
        );
      }

      try {
        for (const table of tables) {
          const { error } = await supabase.from(table).delete().neq('id', '');
          if (error) {
            console.error('[Sync] wipeAll (Supabase) table error:', table, error.message);
            return NextResponse.json(
              { success: false, error: `Failed to wipe table ${table}: ${error.message}` },
              { status: 500 },
            );
          }
        }
        return NextResponse.json({ success: true, wipedTables: tables });
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        console.error('[Sync] wipeAll (Supabase) failed:', message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
      }
    }

    if (!dataKey) {
      return NextResponse.json({ success: false, error: 'Invalid request: dataKey required' }, { status: 400 });
    }

    const tableName = DATA_KEY_TO_TABLE[dataKey];
    if (!tableName) {
      return NextResponse.json({ success: false, error: `Unknown data key: ${dataKey}` }, { status: 400 });
    }

    if (usePostgres && (tableName === 'units' || tableName === 'phases' || tableName === 'tasks')) {
      await ensureMppParserSchemaColumns();
    }

    // ---- Operation: deleteByProjectId ----
    if (operation === 'deleteByProjectId' && projectId != null && projectId !== '') {
      if (usePostgres) {
        const result = await pgDeleteByProjectId(tableName, String(projectId));
        if (!result.success) return NextResponse.json(result, { status: 500 });
        return NextResponse.json({ success: true });
      }
      const supabase = await getSupabaseClient();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      const { error } = await supabase.from(tableName).delete().eq('project_id', String(projectId));
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ---- Operation: setCurrentMpp ----
    if (operation === 'setCurrentMpp' && dataKey === 'projectDocuments' && projectId != null && projectId !== '' && storagePath) {
      const pid = String(projectId);
      const path = String(storagePath).trim();

      if (usePostgres) {
        await pgQuery(
          "UPDATE project_documents SET is_current_version = false WHERE project_id = $1 AND document_type = 'MPP'",
          [pid]
        );
        await pgQuery(
          "UPDATE project_documents SET project_id = $1, is_current_version = true WHERE storage_path = $2 AND document_type = 'MPP'",
          [pid, path]
        );
        return NextResponse.json({ success: true });
      }
      const supabase = await getSupabaseClient();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      await supabase.from('project_documents').update({ is_current_version: false }).eq('project_id', pid).eq('document_type', 'MPP');
      await supabase.from('project_documents').update({ project_id: pid, is_current_version: true }).eq('storage_path', path).eq('document_type', 'MPP');
      return NextResponse.json({ success: true });
    }

    // ---- Operation: updateDocumentHealth ----
    if (operation === 'updateDocumentHealth' && dataKey === 'projectDocuments' && storagePath != null && storagePath !== '') {
      const path = String(storagePath).trim();
      const updates: Record<string, unknown> = {};
      if (healthScore != null && healthScore !== '') updates.health_score = Number(healthScore);
      if (healthCheckJson != null) updates.health_check_json = healthCheckJson;
      if (Object.keys(updates).length === 0) return NextResponse.json({ success: true });

      if (usePostgres) {
        const keys = Object.keys(updates);
        const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
        const values = [path, ...keys.map(k => updates[k])];
        await pgQuery(`UPDATE project_documents SET ${setClauses} WHERE storage_path = $1`, values);
        return NextResponse.json({ success: true });
      }
      const supabase = await getSupabaseClient();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      await supabase.from('project_documents').update(updates).eq('storage_path', path);
      return NextResponse.json({ success: true });
    }

    // ---- Operation: deleteByTaskIds (for task_dependencies) ----
    if (operation === 'deleteByTaskIds' && body.taskIds && Array.isArray(body.taskIds)) {
      const taskIds = body.taskIds.map(String);
      if (taskIds.length > 0 && usePostgres) {
        const placeholders = taskIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
        await pgQuery(`DELETE FROM ${tableName} WHERE successor_task_id IN (${placeholders})`, taskIds);
      }
      return NextResponse.json({ success: true });
    }

    if (!Array.isArray(records)) {
      return NextResponse.json({ success: false, error: 'Invalid request: records array required' }, { status: 400 });
    }

    // ---- Operation: delete ----
    if (operation === 'delete') {
      const idsToDelete = records
        .map((r: unknown) => (typeof r === 'string' ? r : isObject(r) ? r.id : null))
        .filter((id): id is string | number => typeof id === 'string' || typeof id === 'number')
        .map(String);
      if (idsToDelete.length === 0) return NextResponse.json({ success: true, count: 0 });

      if (usePostgres) {
        const result = await pgDelete(tableName, idsToDelete);
        if (!result.success) return NextResponse.json(result, { status: 500 });
        return NextResponse.json({ success: true, count: idsToDelete.length });
      }
      const supabase = await getSupabaseClient();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      const { error } = await supabase.from(tableName).delete().in('id', idsToDelete);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, count: idsToDelete.length });
    }

    // ---- Operation: replace ----
    if (operation === 'replace') {
      if (usePostgres) {
        await pgQuery(`DELETE FROM ${tableName} WHERE id IS NOT NULL`);
      } else {
        const supabase = await getSupabaseClient();
        if (supabase) await supabase.from(tableName).delete().neq('id', 'temp_id_impossible');
      }
      // fall through to upsert
    }

    if (records.length === 0) return NextResponse.json({ success: true, count: 0 });

    // Clean records
    let cleanedRecords = records
      .filter((record): record is Record<string, unknown> => isObject(record))
      .map((record) => cleanRecord(record, tableName));

    // For hour_entries, validate FK references before upserting
    if (tableName === 'hour_entries' && usePostgres) {
      cleanedRecords = await validateHourEntryFKs(cleanedRecords);
    }

    // ---- Operation: update (single record) ----
    if (operation === 'update') {
      if (usePostgres) {
        const rec = cleanedRecords[0];
        const id = rec.id;
        if (typeof id !== 'string' && typeof id !== 'number') {
          return NextResponse.json(
            { success: false, count: 0, error: 'Invalid update payload: id is required' },
            { status: 400 },
          );
        }
        delete rec.id;
        const result = await pgUpdate(tableName, String(id), rec);
        if (!result.success) return NextResponse.json({ success: false, count: 0, error: result.error }, { status: 500 });
        return NextResponse.json({ success: true, count: 1 });
      }
      const supabase = await getSupabaseClient();
      if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      const { data, error } = await supabase.from(tableName).update(cleanedRecords[0]).eq('id', cleanedRecords[0].id).select();
      if (error) return NextResponse.json({ success: false, count: 0, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, count: data?.length || 0 });
    }

    // ---- Default: upsert ----
    if (usePostgres) {
      const result = await pgUpsert(tableName, cleanedRecords);
      if (!result.success) return NextResponse.json({ success: false, count: 0, error: result.error }, { status: 500 });
      return NextResponse.json({ success: true, count: result.count });
    }

    const supabase = await getSupabaseClient();
    if (!supabase) return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
    const { data, error } = await supabase.from(tableName).upsert(cleanedRecords, { onConflict: 'id' }).select();
    if (error) return NextResponse.json({ success: false, count: 0, error: error.message, details: error.details || error.hint }, { status: 500 });
    return NextResponse.json({ success: true, count: data?.length || 0 });

  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('Sync error:', message);
    return NextResponse.json({ success: false, count: 0, error: message || 'Unknown error occurred' }, { status: 500 });
  }
}
