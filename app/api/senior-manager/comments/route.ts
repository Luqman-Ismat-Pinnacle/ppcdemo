import { NextRequest, NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Senior Manager comments: page-scoped notes with page, scope, recordId, metricKey, comment.
 * POST to add a note; GET to list by page (optional).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = (searchParams.get('page') || '').trim();

    const rows = await query<{ metric_key: string; record_id: string; comment: string }>(
      page
        ? `SELECT DISTINCT ON (metric_key, record_id) metric_key, record_id, comment
           FROM variance_notes
           WHERE role = 'SM' AND table_name = $1 AND metric_key LIKE 'sm_%'
           ORDER BY metric_key, record_id, created_at DESC
           LIMIT 500`
        : `SELECT DISTINCT ON (metric_key, record_id) metric_key, record_id, comment
           FROM variance_notes
           WHERE role = 'SM' AND metric_key LIKE 'sm_%'
           ORDER BY metric_key, record_id, created_at DESC
           LIMIT 500`,
      page ? [page] : ([] as string[]),
    );

    const comments: Record<string, string> = {};
    rows.forEach((r) => {
      const key = `${r.metric_key}:${r.record_id}`;
      comments[key] = r.comment || '';
    });

    return NextResponse.json(
      { success: true, comments },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const page = String(body.page || '').trim();
    const scope = String(body.scope || '').trim();
    const recordId = String(body.recordId || '').trim();
    const metricKey = String(body.metricKey || body.metric_key || '').trim();
    const comment = String(body.comment ?? '').trim();

    if (!page || !scope || !recordId) {
      return NextResponse.json({ success: false, error: 'page, scope, and recordId are required' }, { status: 400 });
    }

    const key = metricKey || `sm_comment_${scope}`;
    const id = `sm-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await execute(
      `INSERT INTO variance_notes (id, role, table_name, record_id, metric_key, status, comment, created_by)
       VALUES ($1, 'SM', $2, $3, $4, 'open', $5, 'sm_ui')`,
      [id, page, recordId, key, comment],
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
