/**
 * @fileoverview PCL compliance matrix aggregation API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const pool = getPool();
    if (!pool) return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(200, Number(searchParams.get('limit') || 50));

    const result = await pool.query(
      `WITH task_rollup AS (
         SELECT
           t.project_id,
           COUNT(*) FILTER (
             WHERE COALESCE(NULLIF(t.percent_complete::text, ''), '0')::numeric < 100
               AND COALESCE(t.finish_date, t.end_date)::date < CURRENT_DATE
           ) AS overdue_tasks,
           COUNT(*) FILTER (WHERE t.start_date IS NULL OR COALESCE(t.finish_date, t.end_date) IS NULL) AS missing_schedule_fields
         FROM tasks t
         WHERE t.project_id IS NOT NULL
         GROUP BY t.project_id
       )
       SELECT
         p.id AS "projectId",
         COALESCE(p.name, p.id) AS "projectName",
         COALESCE(tr.missing_schedule_fields, 0) AS "openIssues",
         COALESCE(tr.overdue_tasks, 0) AS "overdueTasks",
         GREATEST(0, 100 - (COALESCE(tr.missing_schedule_fields, 0) * 10) - (COALESCE(tr.overdue_tasks, 0) * 2))::int AS "healthScore"
       FROM projects p
       LEFT JOIN task_rollup tr ON tr.project_id = p.id
       ORDER BY COALESCE(tr.missing_schedule_fields, 0) DESC, COALESCE(tr.overdue_tasks, 0) DESC, p.name
       LIMIT $1`,
      [limit],
    );

    return NextResponse.json({ success: true, rows: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
