import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

function asText(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}
function asNullableText(v: unknown): string | null {
  const t = asText(v, '');
  return t.length ? t : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const title = asText(body?.title, 'Runtime error');
    const errorMessage = asText(body?.errorMessage, '');
    const pagePath = asText(body?.pagePath, '/');

    const sql = `
      INSERT INTO feedback_items (
        item_type, title, description, page_path, user_action,
        expected_result, actual_result, error_message, severity,
        status, progress_percent, notes, source,
        created_by_name, created_by_email, created_by_employee_id,
        browser_info, runtime_error_name, runtime_stack
      ) VALUES (
        'issue', $1, $2, $3, $4, $5, $6, $7, $8,
        'open', 0, $9, 'runtime', $10, $11, $12, $13, $14, $15
      )
      RETURNING id, item_type AS "itemType", title, status, severity,
                created_at AS "createdAt"
    `;

    const params = [
      title,
      asText(body?.description, errorMessage || 'A runtime error occurred.'),
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

    const rows = await query(sql, params);
    return NextResponse.json({ item: rows[0] || null, error: null }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to log runtime issue';
    return NextResponse.json({ item: null, error: msg }, { status: 500 });
  }
}
