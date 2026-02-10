/**
 * @fileoverview Data Sync API Route
 * 
 * Server-side route for syncing data to the database.
 * Supports PostgreSQL (primary) and Supabase (fallback).
 * 
 * @module app/api/data/sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery, withClient } from '@/lib/postgres';
import { DATA_KEY_TO_TABLE } from '@/lib/supabase';

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toDbFormat(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toDbFormat);

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = value;
  }
  return result;
}

// Null-like values to convert to actual NULL
const nullLike = new Set(['', '-', 'null', 'undefined', 'n/a']);

function cleanRecord(record: any, tableName: string) {
  const cleaned: any = {};
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

  const formatted = toDbFormat(cleaned);

  // tasks table: strip columns that don't exist in the DB schema
  if (tableName === 'tasks') {
    delete formatted.employee_id;
    delete formatted.predecessors;       // array of objects — lives in task_dependencies table
    delete formatted.predecessor_name;   // not a DB column
    delete formatted.task_name;          // tasks table uses 'name' not 'task_name'
    delete formatted.task_description;   // tasks table uses 'description' or 'notes'
  }

  // task_dependencies: strip columns not in schema
  if (tableName === 'task_dependencies') {
    delete formatted.predecessor_name;
    delete formatted.lag;
    delete formatted.task_id;
  }

  // Strip any remaining array/object values that can't be stored in flat columns
  for (const [key, value] of Object.entries(formatted)) {
    if (Array.isArray(value)) {
      delete formatted[key];
    }
  }

  return formatted;
}

// ============================================================================
// POSTGRESQL OPERATIONS
// ============================================================================

async function pgUpsert(tableName: string, records: any[]): Promise<{ success: boolean; count: number; error?: string }> {
  if (records.length === 0) return { success: true, count: 0 };

  try {
    let totalCount = 0;
    // Process in batches of 50 to avoid param limits
    const BATCH = 50;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const columns = Object.keys(batch[0]);
      const values: any[] = [];
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
  } catch (err: any) {
    console.error(`[Sync] PostgreSQL upsert error for ${tableName}:`, err.message);
    return { success: false, count: 0, error: err.message };
  }
}

async function pgDelete(tableName: string, ids: string[]): Promise<{ success: boolean; count: number; error?: string }> {
  if (ids.length === 0) return { success: true, count: 0 };
  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await pgQuery(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`, ids);
    return { success: true, count: ids.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message };
  }
}

async function pgDeleteByProjectId(tableName: string, projectId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await pgQuery(`DELETE FROM ${tableName} WHERE project_id = $1`, [projectId]);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function pgUpdate(tableName: string, id: string, updates: Record<string, any>): Promise<{ success: boolean; error?: string }> {
  try {
    const keys = Object.keys(updates).filter(k => k !== 'id');
    if (keys.length === 0) return { success: true };
    const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...keys.map(k => updates[k])];
    await pgQuery(`UPDATE ${tableName} SET ${setClauses} WHERE id = $1`, values);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
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
    const body = await req.json();
    const { dataKey, records, operation, projectId, storagePath, healthScore, healthCheckJson } = body;

    if (!dataKey) {
      return NextResponse.json({ success: false, error: 'Invalid request: dataKey required' }, { status: 400 });
    }

    const tableName = DATA_KEY_TO_TABLE[dataKey];
    if (!tableName) {
      return NextResponse.json({ success: false, error: `Unknown data key: ${dataKey}` }, { status: 400 });
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
      const idsToDelete = records.map((r: any) => typeof r === 'string' ? r : r.id).filter(Boolean);
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
    const cleanedRecords = records.map((r: any) => cleanRecord(r, tableName));

    // ---- Operation: update (single record) ----
    if (operation === 'update') {
      if (usePostgres) {
        const rec = cleanedRecords[0];
        const id = rec.id;
        delete rec.id;
        const result = await pgUpdate(tableName, id, rec);
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

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ success: false, count: 0, error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
}
