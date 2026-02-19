/**
 * @fileoverview API route for Issues & Features log (Feedback page).
 * GET: list feedback items (issues and/or features). POST: create new issue or feature.
 * @module app/api/feedback
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function rowToItem(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: typeof row.id === 'string' ? parseInt(row.id, 10) : Number(row.id),
    itemType: row.item_type,
    title: row.title,
    description: row.description ?? null,
    pagePath: row.page_path ?? null,
    userAction: row.user_action ?? null,
    expectedResult: row.expected_result ?? null,
    actualResult: row.actual_result ?? null,
    errorMessage: row.error_message ?? null,
    severity: row.severity ?? 'medium',
    status: row.status ?? 'open',
    progressPercent: typeof row.progress_percent === 'number' ? row.progress_percent : parseInt(String(row.progress_percent || 0), 10),
    notes: row.notes ?? null,
    source: row.source ?? 'manual',
    createdByName: row.created_by_name ?? null,
    createdByEmail: row.created_by_email ?? null,
    createdByEmployeeId: row.created_by_employee_id ?? null,
    browserInfo: row.browser_info ?? null,
    runtimeErrorName: row.runtime_error_name ?? null,
    runtimeStack: row.runtime_stack ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'all' | 'issue' | 'feature'
    const limit = Math.min(500, parseInt(searchParams.get('limit') || '250', 10) || 250);

    let query = supabase
      .from('feedback_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type === 'issue' || type === 'feature') {
      query = query.eq('item_type', type);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('[API feedback] GET error:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to load feedback', items: [] },
        { status: 500 }
      );
    }

    const items = (rows || []).map((row: Record<string, unknown>) => rowToItem(row));
    return NextResponse.json({ items, error: null }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (e) {
    console.error('[API feedback] GET exception:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load feedback', items: [] },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const itemType = body?.itemType === 'feature' ? 'feature' : 'issue';

    const row: Record<string, unknown> = {
      item_type: itemType,
      title: body?.title ?? '',
      description: body?.description ?? null,
      page_path: body?.pagePath ?? null,
      user_action: body?.userAction ?? null,
      expected_result: body?.expectedResult ?? null,
      actual_result: body?.actualResult ?? null,
      error_message: body?.errorMessage ?? null,
      severity: body?.severity ?? 'medium',
      status: 'open',
      progress_percent: 0,
      notes: body?.notes ?? null,
      source: body?.source ?? 'manual',
      created_by_name: body?.createdByName ?? null,
      created_by_email: body?.createdByEmail ?? null,
      created_by_employee_id: body?.createdByEmployeeId ?? null,
      browser_info: body?.browserInfo ?? null,
      runtime_error_name: body?.runtimeErrorName ?? null,
      runtime_stack: body?.runtimeStack ?? null,
    };

    const { data: inserted, error } = await supabase
      .from('feedback_items')
      .insert(row)
      .select('*')
      .single();

    if (error) {
      console.error('[API feedback] POST error:', error);
      return NextResponse.json({ error: error.message || 'Failed to create feedback' }, { status: 500 });
    }

    return NextResponse.json(rowToItem(inserted as Record<string, unknown>), { status: 201 });
  } catch (e) {
    console.error('[API feedback] POST exception:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create feedback' },
      { status: 500 }
    );
  }
}
