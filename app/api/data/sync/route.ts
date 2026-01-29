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
    const { dataKey, records, operation } = body;

    if (!dataKey || !Array.isArray(records)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request: dataKey and records required' },
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
            cleaned[key] = trimmed;
          }
        } else if (key.endsWith('Id') && (value === '' || value === null || value === undefined)) {
          cleaned[key] = null;
        } else {
          cleaned[key] = value;
        }
      }

      return toSupabaseFormat(cleaned);
    });

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
