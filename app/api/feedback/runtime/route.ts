import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query } from '@/lib/postgres';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function asText(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function asNullableText(v: unknown): string | null {
  const text = asText(v, '');
  return text ? text : null;
}

export async function POST(request: NextRequest) {
  try {
    if (!isPostgresConfigured()) {
      return NextResponse.json({ item: null, error: 'PostgreSQL not configured' }, { status: 503 });
    }

    const body = await request.json();
    const title = asText(body?.title, 'Runtime error');
    const errorMessage = asText(body?.errorMessage, '');
    const pagePath = asText(body?.pagePath, '/');

    const sql = `
      INSERT INTO feedback_items (
        item_type,
        title,
        description,
        page_path,
        user_action,
        expected_result,
        actual_result,
        error_message,
        severity,
        status,
        progress_percent,
        notes,
        source,
        created_by_name,
        created_by_email,
        created_by_employee_id,
        browser_info,
        runtime_error_name,
        runtime_stack
      ) VALUES (
        'issue',
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'open',
        0,
        $9,
        'runtime',
        $10,
        $11,
        $12,
        $13,
        $14,
        $15
      )
      RETURNING
        id,
        item_type AS "itemType",
        title,
        description,
        page_path AS "pagePath",
        error_message AS "errorMessage",
        severity,
        status,
        progress_percent AS "progressPercent",
        notes,
        source,
        created_at AS "createdAt"
    `;

    const params = [
      title,
      asText(body?.description, errorMessage || 'A runtime error occurred while rendering this page.'),
      pagePath,
      asNullableText(body?.userAction),
      asNullableText(body?.expectedResult),
      asNullableText(body?.actualResult),
      asNullableText(errorMessage),
      asText(body?.severity, 'high'),
      asNullableText(body?.notes),
      asNullableText(body?.createdByName),
      asNullableText(body?.createdByEmail),
      asNullableText(body?.createdByEmployeeId),
      asNullableText(body?.browserInfo),
      asNullableText(body?.runtimeErrorName),
      asNullableText(body?.runtimeStack),
    ];

    const result = await query(sql, params);
    return NextResponse.json({ item: result.rows[0] || null, error: null }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ item: null, error: error?.message || 'Failed to log runtime issue' }, { status: 500 });
  }
}
