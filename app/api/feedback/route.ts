import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query } from '@/lib/postgres';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type FeedbackType = 'issue' | 'feature';

function normalizeType(value: string | null): FeedbackType | 'all' {
  if (value === 'issue' || value === 'feature') return value;
  return 'all';
}

function asText(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function asNullableText(v: unknown): string | null {
  const t = asText(v, '');
  return t.length ? t : null;
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: NextRequest) {
  try {
    if (!isPostgresConfigured()) {
      return NextResponse.json({ items: [], error: 'PostgreSQL not configured' }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const type = normalizeType(searchParams.get('type'));
    const status = asText(searchParams.get('status'), '');
    const limit = Math.max(1, Math.min(300, asNumber(searchParams.get('limit'), 120)));

    const where: string[] = [];
    const params: unknown[] = [];

    if (type !== 'all') {
      params.push(type);
      where.push(`item_type = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    params.push(limit);
    const sql = `
      SELECT
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
      FROM feedback_items
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE status
          WHEN 'open' THEN 0
          WHEN 'triaged' THEN 1
          WHEN 'in_progress' THEN 2
          WHEN 'planned' THEN 3
          WHEN 'resolved' THEN 4
          WHEN 'released' THEN 5
          WHEN 'closed' THEN 6
          ELSE 7
        END,
        created_at DESC
      LIMIT $${params.length}
    `;

    const result = await query(sql, params);
    return NextResponse.json({ items: result.rows, error: null }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ items: [], error: error?.message || 'Failed to fetch feedback' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isPostgresConfigured()) {
      return NextResponse.json({ item: null, error: 'PostgreSQL not configured' }, { status: 503 });
    }

    const body = await request.json();
    const itemType = normalizeType(asText(body?.itemType, 'issue'));
    const title = asText(body?.title, '');
    const description = asText(body?.description, '');

    if (itemType === 'all') {
      return NextResponse.json({ item: null, error: 'Invalid itemType' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ item: null, error: 'Title is required' }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ item: null, error: 'Description is required' }, { status: 400 });
    }

    const status = asText(body?.status, itemType === 'feature' ? 'planned' : 'open');
    const severity = asText(body?.severity, itemType === 'issue' ? 'medium' : 'low');
    const progress = Math.max(0, Math.min(100, asNumber(body?.progressPercent, 0)));

    const insertSql = `
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
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )
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

    const params = [
      itemType,
      title,
      description,
      asNullableText(body?.pagePath),
      asNullableText(body?.userAction),
      asNullableText(body?.expectedResult),
      asNullableText(body?.actualResult),
      asNullableText(body?.errorMessage),
      severity,
      status,
      progress,
      asNullableText(body?.notes),
      asText(body?.source, 'manual'),
      asNullableText(body?.createdByName),
      asNullableText(body?.createdByEmail),
      asNullableText(body?.createdByEmployeeId),
      asNullableText(body?.browserInfo),
      asNullableText(body?.runtimeErrorName),
      asNullableText(body?.runtimeStack),
    ];

    const result = await query(insertSql, params);
    return NextResponse.json({ item: result.rows[0] || null, error: null }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ item: null, error: error?.message || 'Failed to create feedback item' }, { status: 500 });
  }
}
