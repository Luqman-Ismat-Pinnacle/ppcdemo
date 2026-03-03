import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

type FeedbackType = 'issue' | 'feature';
type FeedbackStatus = 'open' | 'triaged' | 'in_progress' | 'planned' | 'resolved' | 'released' | 'closed';

const STATUS_PROGRESS: Record<FeedbackStatus, number> = {
  open: 10,
  triaged: 25,
  planned: 40,
  in_progress: 65,
  resolved: 90,
  released: 100,
  closed: 100,
};

function asText(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}
function asNullableText(v: unknown): string | null {
  const t = asText(v, '');
  return t.length ? t : null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const status = asText(searchParams.get('status'), '');
    const limit = Math.max(1, Math.min(500, Number(searchParams.get('limit') || 200)));

    const where: string[] = [];
    const params: unknown[] = [];

    if (type === 'issue' || type === 'feature') {
      params.push(type);
      where.push(`item_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    params.push(limit);
    const sql = `
      SELECT id, item_type AS "itemType", title, description,
             page_path AS "pagePath", user_action AS "userAction",
             expected_result AS "expectedResult", actual_result AS "actualResult",
             error_message AS "errorMessage", severity, status,
             progress_percent AS "progressPercent", notes, source,
             created_by_name AS "createdByName", created_by_email AS "createdByEmail",
             created_by_employee_id AS "createdByEmployeeId",
             browser_info AS "browserInfo",
             runtime_error_name AS "runtimeErrorName", runtime_stack AS "runtimeStack",
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM feedback_items
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE status
          WHEN 'open' THEN 0 WHEN 'triaged' THEN 1 WHEN 'in_progress' THEN 2
          WHEN 'planned' THEN 3 WHEN 'resolved' THEN 4 WHEN 'released' THEN 5
          WHEN 'closed' THEN 6 ELSE 7
        END,
        created_at DESC
      LIMIT $${params.length}
    `;

    const rows = await query(sql, params);
    return NextResponse.json({ items: rows, error: null });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch feedback';
    return NextResponse.json({ items: [], error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const itemType = asText(body?.itemType, 'issue') as FeedbackType;
    const title = asText(body?.title, '');
    const description = asText(body?.description, '');

    if (!['issue', 'feature'].includes(itemType)) {
      return NextResponse.json({ item: null, error: 'Invalid itemType' }, { status: 400 });
    }
    if (!title) return NextResponse.json({ item: null, error: 'Title is required' }, { status: 400 });
    if (!description) return NextResponse.json({ item: null, error: 'Description is required' }, { status: 400 });

    const status: FeedbackStatus = itemType === 'feature' ? 'planned' : 'open';
    const severity = asText(body?.severity, itemType === 'issue' ? 'medium' : 'low');
    const progress = STATUS_PROGRESS[status];

    const sql = `
      INSERT INTO feedback_items (
        item_type, title, description, page_path, user_action,
        expected_result, actual_result, error_message, severity,
        status, progress_percent, notes, source,
        created_by_name, created_by_email, created_by_employee_id,
        browser_info, runtime_error_name, runtime_stack
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING id, item_type AS "itemType", title, status, severity,
                progress_percent AS "progressPercent",
                created_at AS "createdAt"
    `;

    const params = [
      itemType, title, description,
      asNullableText(body?.pagePath), asNullableText(body?.userAction),
      asNullableText(body?.expectedResult), asNullableText(body?.actualResult),
      asNullableText(body?.errorMessage), severity,
      status, progress, asNullableText(body?.notes),
      asText(body?.source, 'manual'),
      asNullableText(body?.createdByName), asNullableText(body?.createdByEmail),
      asNullableText(body?.createdByEmployeeId),
      asNullableText(body?.browserInfo),
      asNullableText(body?.runtimeErrorName), asNullableText(body?.runtimeStack),
    ];

    const rows = await query(sql, params);
    return NextResponse.json({ item: rows[0] || null, error: null }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create feedback item';
    return NextResponse.json({ item: null, error: msg }, { status: 500 });
  }
}
