import { NextRequest, NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type NoteRow = {
  table_name: string;
  metric_key: string;
  record_id: string;
  comment: string | null;
  created_at: string;
};

function metricFor(scope: string) {
  return `coo_comment_${scope}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = (searchParams.get('page') || '').trim();
    if (!page) return NextResponse.json({ success: false, error: 'page is required' }, { status: 400 });

    const rows = await query<NoteRow>(
      `SELECT DISTINCT ON (metric_key, record_id)
         table_name, metric_key, record_id, comment, created_at::text
       FROM variance_notes
       WHERE role = 'COO' AND table_name = $1 AND metric_key LIKE 'coo_comment_%'
       ORDER BY metric_key, record_id, created_at DESC`,
      [page],
    );

    const comments: Record<string, string> = {};
    rows.forEach((r) => {
      const scope = r.metric_key.replace('coo_comment_', '');
      comments[`${scope}:${r.record_id}`] = r.comment || '';
    });

    return NextResponse.json({ success: true, comments }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
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
    const comment = String(body.comment ?? '');
    if (!page || !scope || !recordId) {
      return NextResponse.json({ success: false, error: 'page, scope, and recordId are required' }, { status: 400 });
    }

    await execute(
      `INSERT INTO variance_notes (
         id, role, table_name, record_id, metric_key, status, comment, created_by
       ) VALUES ($1, 'COO', $2, $3, $4, 'open', $5, 'coo_ui')`,
      [`coo-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, page, recordId, metricFor(scope), comment],
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
