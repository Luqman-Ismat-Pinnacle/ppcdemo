import { NextRequest, NextResponse } from 'next/server';
import { execute, query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CommitmentRow = {
  id: string;
  project_id: string;
  project_name: string;
  accountable_owner: string;
  workstream: string;
  intervention_priority: 'P1' | 'P2' | 'P3';
  status: string;
  decision_sla_days: number;
  executive_note: string;
  review_note: string;
  variance_pct: number;
  spi: number;
  avg_progress: number;
  critical_open: number;
  updated_at: string;
};

const VALID_STATUS = new Set(['open', 'in_review', 'committed', 'blocked', 'escalated', 'approved', 'rejected']);

async function listCommitments() {
  const rows = await query<{
    project_id: string; project_name: string; accountable_owner: string; workstream: string;
    intervention_priority: string; decision_sla_days: string;
    variance_pct: string; spi: string; avg_progress: string; critical_open: string;
    status: string; executive_note: string; review_note: string; updated_at: string;
  }>(
    `WITH base AS (
       SELECT
         p.id AS project_id,
         p.name AS project_name,
        COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned') AS accountable_owner,
         COALESCE(
           NULLIF((SELECT u.name FROM units u WHERE u.project_id = p.id ORDER BY u.updated_at DESC NULLS LAST LIMIT 1), ''),
           'Core Program'
         ) AS workstream,
         CASE
           WHEN SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END) >= 8 THEN 'P1'
           WHEN SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END) >= 5 THEN 'P2'
           ELSE 'P3'
         END AS intervention_priority,
         CASE
           WHEN SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END) >= 8 THEN 3
           WHEN SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END) >= 5 THEN 7
           ELSE 14
         END AS decision_sla_days,
         ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
           THEN (SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / SUM(COALESCE(t.baseline_hours,0))) * 100
           ELSE 0 END::numeric, 1) AS variance_pct,
         ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
           THEN SUM(COALESCE(t.actual_hours,0)) / NULLIF(SUM(COALESCE(t.baseline_hours,0)),0) ELSE 0 END::numeric, 2) AS spi,
         ROUND(AVG(COALESCE(t.percent_complete,0))::numeric, 0) AS avg_progress,
         SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END)::int AS critical_open
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
      LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
       WHERE p.is_active = true AND p.has_schedule = true
      GROUP BY p.id, p.name, pf.name
     ),
     latest_note AS (
       SELECT DISTINCT ON (record_id)
         record_id, comment, created_at
       FROM variance_notes
       WHERE role = 'COO' AND table_name = 'projects' AND metric_key = 'coo_commitment'
       ORDER BY record_id, created_at DESC
     )
     SELECT
       b.project_id,
       b.project_name,
       b.accountable_owner,
       b.workstream,
       b.intervention_priority,
       b.decision_sla_days,
       b.variance_pct,
       b.spi,
       b.avg_progress,
       b.critical_open,
       COALESCE((ln.comment::jsonb ->> 'status'), 'open')::text AS status,
       COALESCE((ln.comment::jsonb ->> 'executive_note'), '')::text AS executive_note,
       COALESCE((ln.comment::jsonb ->> 'review_note'), '')::text AS review_note,
       COALESCE(ln.created_at::text, NOW()::text) AS updated_at
     FROM base b
     LEFT JOIN latest_note ln ON ln.record_id = b.project_id
     ORDER BY
       CASE b.intervention_priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
       b.project_name
     LIMIT 80`,
  );

  const commitments: CommitmentRow[] = rows.map((r) => ({
    id: `cm-${r.project_id}`,
    project_id: r.project_id,
    project_name: r.project_name,
    accountable_owner: r.accountable_owner,
    workstream: r.workstream,
    intervention_priority: r.intervention_priority as 'P1' | 'P2' | 'P3',
    decision_sla_days: Number(r.decision_sla_days || 0),
    variance_pct: Number(r.variance_pct || 0),
    spi: Number(r.spi || 0),
    avg_progress: Number(r.avg_progress || 0),
    critical_open: Number(r.critical_open || 0),
    status: VALID_STATUS.has(r.status) ? r.status : 'open',
    executive_note: r.executive_note || '',
    review_note: r.review_note || '',
    updated_at: r.updated_at,
  }));

  const summary = {
    total: commitments.length,
    open: commitments.filter((c) => c.status === 'open').length,
    in_review: commitments.filter((c) => c.status === 'in_review').length,
    committed: commitments.filter((c) => c.status === 'committed').length,
    blocked: commitments.filter((c) => c.status === 'blocked').length,
    escalated: commitments.filter((c) => c.status === 'escalated').length,
    approved: commitments.filter((c) => c.status === 'approved').length,
    rejected: commitments.filter((c) => c.status === 'rejected').length,
  };

  return { commitments, summary };
}

export async function GET() {
  try {
    const { commitments, summary } = await listCommitments();
    return NextResponse.json({ success: true, commitments, summary }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    const status = String(body.status || '').trim();
    const executiveNote = body.executive_note != null ? String(body.executive_note) : null;
    const reviewNote = body.review_note != null ? String(body.review_note) : null;

    if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    const projectId = id.startsWith('cm-') ? id.slice(3) : id;
    if (status && !VALID_STATUS.has(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const existing = await query<{ comment: string | null }>(
      `SELECT comment FROM variance_notes
       WHERE role = 'COO' AND table_name = 'projects' AND metric_key = 'coo_commitment' AND record_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [projectId],
    );

    let currentStatus = 'open';
    let currentNote = '';
    let currentReview = '';
    const prior = existing[0]?.comment;
    if (prior) {
      try {
        const parsed = JSON.parse(prior) as { status?: string; executive_note?: string; review_note?: string };
        if (parsed.status && VALID_STATUS.has(parsed.status)) currentStatus = parsed.status;
        if (parsed.executive_note) currentNote = parsed.executive_note;
        if (parsed.review_note) currentReview = parsed.review_note;
      } catch { /* overwrite */ }
    }

    const nextStatus = status || currentStatus;
    const nextNote = executiveNote ?? currentNote;
    const nextReview = reviewNote ?? currentReview;
    const payload = JSON.stringify({ status: nextStatus, executive_note: nextNote, review_note: nextReview });

    await execute(
      `INSERT INTO variance_notes (id, role, table_name, record_id, metric_key, status, comment, created_by)
       VALUES ($1, 'COO', 'projects', $2, 'coo_commitment', $3, $4, 'coo_ui')`,
      [`coo-cm-${projectId}-${Date.now()}`, projectId, nextStatus, payload],
    );

    const { commitments, summary } = await listCommitments();
    return NextResponse.json({ success: true, commitments, summary });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
