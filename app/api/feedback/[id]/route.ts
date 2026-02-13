import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query } from '@/lib/postgres';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function asText(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function asNullableText(v: unknown): string | null {
  const value = asText(v, '');
  return value ? value : null;
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isPostgresConfigured()) {
      return NextResponse.json({ item: null, error: 'PostgreSQL not configured' }, { status: 503 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const status = asText(body?.status, '');
    const notes = body?.notes !== undefined ? asNullableText(body?.notes) : undefined;
    const progress = body?.progressPercent !== undefined
      ? Math.max(0, Math.min(100, asNumber(body?.progressPercent, 0)))
      : undefined;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      updates.push(`status = $${params.length}`);
    }
    if (notes !== undefined) {
      params.push(notes);
      updates.push(`notes = $${params.length}`);
    }
    if (progress !== undefined) {
      params.push(progress);
      updates.push(`progress_percent = $${params.length}`);
    }

    params.push(id);
    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return NextResponse.json({ item: null, error: 'No fields to update' }, { status: 400 });
    }

    const sql = `
      UPDATE feedback_items
      SET ${updates.join(', ')}
      WHERE id = $${params.length}
      RETURNING
        id,
        item_type AS "itemType",
        title,
        description,
        page_path AS "pagePath",
        user_action AS "userAction",
        expected_result AS "expectedResult",
        actual_result AS "actualResult",
        error_message AS "errorMessage",
        severity,
        status,
        progress_percent AS "progressPercent",
        notes,
        source,
        created_by_name AS "createdByName",
        created_by_email AS "createdByEmail",
        created_by_employee_id AS "createdByEmployeeId",
        browser_info AS "browserInfo",
        runtime_error_name AS "runtimeErrorName",
        runtime_stack AS "runtimeStack",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    const result = await query(sql, params);
    if (!result.rows.length) {
      return NextResponse.json({ item: null, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ item: result.rows[0], error: null }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ item: null, error: error?.message || 'Failed to update item' }, { status: 500 });
  }
}
