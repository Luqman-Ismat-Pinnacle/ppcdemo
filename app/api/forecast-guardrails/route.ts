import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const projectId = url.searchParams.get('projectId');

    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (status) {
      where += ` AND fg.status = $${idx++}`;
      params.push(status);
    }
    if (projectId) {
      where += ` AND fg.project_id = $${idx++}`;
      params.push(projectId);
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT fg.*,
              COALESCE(p.name, fg.project_id) AS project_name,
              COALESCE(e_sm.name, '') AS sm_name,
              COALESCE(e_sm.email, '') AS sm_email
       FROM forecast_guardrails fg
       LEFT JOIN projects p ON p.id = fg.project_id
       LEFT JOIN employees e_sm ON LOWER(e_sm.name) = LOWER(fg.escalated_to)
       ${where}
       ORDER BY fg.created_at DESC
       LIMIT 200`,
      params,
    );

    return NextResponse.json({ success: true, guardrails: rows }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, id } = body;

    if (action === 'pca_approve') {
      await execute(
        `UPDATE forecast_guardrails SET status = 'pca_approved', pca_comment = $1, resolved_at = NOW() WHERE id = $2`,
        [body.pca_comment || '', id],
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'pca_escalate') {
      const row = await query<{ project_id: string }>(
        `SELECT project_id FROM forecast_guardrails WHERE id = $1`, [id],
      );
      const projectId = row[0]?.project_id;
      let smName = body.escalate_to || '';

      if (!smName && projectId) {
        const smRow = await query<{ senior_manager: string }>(
          `SELECT DISTINCT e.senior_manager
           FROM employees e
           WHERE e.employee_project = $1 AND e.senior_manager IS NOT NULL AND e.senior_manager != ''
           LIMIT 1`,
          [projectId],
        );
        smName = smRow[0]?.senior_manager || '';
      }

      await execute(
        `UPDATE forecast_guardrails SET status = 'escalated_sm', pca_comment = $1, escalated_to = $2, escalated_at = NOW() WHERE id = $3`,
        [body.pca_comment || '', smName, id],
      );
      return NextResponse.json({ success: true, escalated_to: smName });
    }

    if (action === 'sm_resolve') {
      await execute(
        `UPDATE forecast_guardrails SET status = 'sm_resolved', pca_comment = COALESCE(pca_comment, '') || ' | SM: ' || $1, resolved_at = NOW() WHERE id = $2`,
        [body.sm_comment || 'Resolved', id],
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
