/**
 * @fileoverview Data Sync API Route
 * 
 * Server-side route for syncing data to Supabase using service role key.
 * This ensures proper permissions for write operations.
 * 
 * @module app/api/data/sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DATA_KEY_TO_TABLE } from '@/lib/supabase';

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toSupabaseFormat(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toSupabaseFormat);

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = value;
  }
  return result;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { dataKey, records, operation, projectId, storagePath, healthScore, healthCheckJson } = body;

    if (!dataKey) {
      return NextResponse.json(
        { success: false, error: 'Invalid request: dataKey required' },
        { status: 400 }
      );
    }

    const tableName = DATA_KEY_TO_TABLE[dataKey];
    if (!tableName) {
      return NextResponse.json(
        { success: false, error: `Unknown data key: ${dataKey}` },
        { status: 400 }
      );
    }

    // Delete all rows for a project (used before MPP import so only MPP hierarchy exists, no Workday extras)
    if (operation === 'deleteByProjectId' && projectId != null && projectId !== '') {
      const pid = String(projectId);
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('project_id', pid);

      if (error) {
        console.error(`Error deleting by project_id from ${tableName}:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Mark one MPP document as the current version for a project (clear others; set project_id if doc had none)
    if (operation === 'setCurrentMpp' && dataKey === 'projectDocuments' && projectId != null && projectId !== '' && storagePath) {
      const pid = String(projectId);
      const path = String(storagePath).trim();
      const { error: clearError } = await supabase
        .from('project_documents')
        .update({ is_current_version: false })
        .eq('project_id', pid)
        .eq('document_type', 'MPP');
      if (clearError) {
        console.error('Error clearing current MPP:', clearError);
        return NextResponse.json({ success: false, error: clearError.message }, { status: 500 });
      }
      // Match by storage_path so we find the doc even if it was saved with project_id null at upload
      const { error: setError } = await supabase
        .from('project_documents')
        .update({ project_id: pid, is_current_version: true })
        .eq('storage_path', path)
        .eq('document_type', 'MPP');
      if (setError) {
        console.error('Error setting current MPP:', setError);
        return NextResponse.json({ success: false, error: setError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Update project_document health (by storage_path) after MPXJ health check
    if (operation === 'updateDocumentHealth' && dataKey === 'projectDocuments' && storagePath != null && storagePath !== '') {
      const path = String(storagePath).trim();
      const updates: Record<string, unknown> = {};
      if (healthScore != null && healthScore !== '') updates.health_score = Number(healthScore);
      if (healthCheckJson != null) updates.health_check_json = healthCheckJson;
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ success: true });
      }
      const { error } = await supabase
        .from('project_documents')
        .update(updates)
        .eq('storage_path', path);
      if (error) {
        console.error('Error updating document health:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (!Array.isArray(records)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request: records array required' },
        { status: 400 }
      );
    }

    // Handle Delete Operation
    if (operation === 'delete') {
      const idsToDelete = records.map((r: any) => typeof r === 'string' ? r : r.id).filter(Boolean);
      if (idsToDelete.length === 0) {
        return NextResponse.json({ success: true, count: 0 });
      }

      const { error } = await supabase
        .from(tableName)
        .delete()
        .in('id', idsToDelete);

      if (error) {
        console.error(`Error deleting from ${tableName}:`, error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, count: idsToDelete.length });
    }

    // Handle Replace Operation (Clear and insert)
    if (operation === 'replace') {
      // Use a transaction if possible, otherwise delete all and insert
      // For now, delete all and insert
      await supabase.from(tableName).delete().neq('id', 'temp_id_impossible');
      // Then fall through to insert
    }

    if (records.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // Convert to snake_case and clean data
    const nullLike = new Set(['', '-', 'null', 'undefined', 'n/a']);
    const cleanedRecords = records.map((record: any) => {
      const cleaned: any = {};

      // Ensure id is set
      cleaned.id = record.id || '';

      // Process all fields
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
            // Truncate string fields to prevent database errors
            cleaned[key] = trimmed.length > 255 ? trimmed.substring(0, 255) : trimmed;
          }
        } else if (key.endsWith('Id') && (value === '' || value === null || value === undefined)) {
          cleaned[key] = null;
        } else {
          cleaned[key] = value;
        }
      }

      return toSupabaseFormat(cleaned);
    });

    // Handle Update Operation (partial update without upsert)
    if (operation === 'update') {
      // For projects table, use direct update to avoid name constraint
      if (tableName === 'projects') {
        const { data, error } = await supabase
          .from(tableName)
          .update(cleanedRecords[0])
          .eq('id', cleanedRecords[0].id)
          .select();

        if (error) {
          console.error(`Error updating ${dataKey} to ${tableName}:`, error);
          return NextResponse.json(
            {
              success: false,
              count: 0,
              error: error.message || 'Unknown error',
              details: error.details || error.hint || undefined,
            },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          count: data?.length || 0,
        });
      }
    }

    // Upsert records
    const { data, error } = await supabase
      .from(tableName)
      .upsert(cleanedRecords, { onConflict: 'id' })
      .select();

    if (error) {
      console.error(`Error syncing ${dataKey} to ${tableName}:`, error);
      return NextResponse.json(
        {
          success: false,
          count: 0,
          error: error.message || 'Unknown error',
          details: error.details || error.hint || undefined,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json(
      {
        success: false,
        count: 0,
        error: error.message || 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
