import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

type FeedbackStatus = 'open' | 'triaged' | 'in_progress' | 'planned' | 'resolved' | 'released' | 'closed';

const STATUS_PROGRESS: Record<FeedbackStatus, number> = {
  open: 10, triaged: 25, planned: 40, in_progress: 65,
  resolved: 90, released: 100, closed: 100,
};

function asNullableText(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t.length ? t : null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const status = (body?.status || '') as FeedbackStatus;
    const notes = body?.notes !== undefined ? asNullableText(body.notes) : undefined;
    const severity = body?.severity !== undefined ? asNullableText(body.severity) : undefined;

    const updates: string[] = [];
    const params: unknown[] = [];

    if (status && status in STATUS_PROGRESS) {
      params.push(status);
      updates.push(`status = $${params.length}`);
      params.push(STATUS_PROGRESS[status]);
      updates.push(`progress_percent = $${params.length}`);
    }
    if (notes !== undefined) {
      params.push(notes);
      updates.push(`notes = $${params.length}`);
    }
    if (severity !== undefined) {
      params.push(severity);
      updates.push(`severity = $${params.length}`);
    }

    if (!updates.length) {
      return NextResponse.json({ item: null, error: 'No fields to update' }, { status: 400 });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const sql = `
      UPDATE feedback_items SET ${updates.join(', ')}
      WHERE id = $${params.length}
      RETURNING id, item_type AS "itemType", title, description,
                severity, status, progress_percent AS "progressPercent",
                notes, created_at AS "createdAt", updated_at AS "updatedAt"
    `;

    const rows = await query(sql, params);
    if (!rows.length) return NextResponse.json({ item: null, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ item: rows[0], error: null });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update item';
    return NextResponse.json({ item: null, error: msg }, { status: 500 });
  }
}
