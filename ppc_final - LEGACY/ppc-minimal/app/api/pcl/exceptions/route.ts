import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const costOverruns = await query(
      `SELECT p.id AS project_id, p.name AS project_name,
              'cost_overrun' AS exception_type, 'critical' AS severity,
              p.actual_cost, p.scheduled_cost, p.percent_complete,
              CASE WHEN COALESCE(p.scheduled_cost,0) > 0
                THEN ROUND((p.actual_cost / p.scheduled_cost * 100)::numeric, 1)
                ELSE 0
              END AS burn_pct
       FROM projects p
       WHERE p.is_active = true AND p.has_schedule = true
         AND p.actual_cost > COALESCE(p.scheduled_cost,0) * 0.9
         AND p.actual_cost > 0
       ORDER BY p.actual_cost DESC`
    );

    const hourOverruns = await query(
      `SELECT p.id AS project_id, p.name AS project_name,
              'hours_overrun' AS exception_type, 'warning' AS severity,
              p.actual_hours, p.total_hours, p.percent_complete,
              CASE WHEN COALESCE(p.total_hours,0) > 0
                THEN ROUND((p.actual_hours / p.total_hours * 100)::numeric, 1)
                ELSE 0
              END AS burn_pct
       FROM projects p
       WHERE p.is_active = true AND p.has_schedule = true
         AND p.actual_hours > COALESCE(p.total_hours,0)
         AND p.actual_hours > 0 AND COALESCE(p.total_hours,0) > 0
       ORDER BY (p.actual_hours - p.total_hours) DESC`
    );

    const lowCpi = await query(
      `SELECT p.id AS project_id, p.name AS project_name,
              'low_cpi' AS exception_type, 'warning' AS severity,
              p.actual_cost,
              COALESCE(cc.cv, 0) AS contract_value,
              CASE WHEN p.actual_cost > 0 AND COALESCE(cc.cv, 0) > 0
                THEN ROUND((COALESCE(cc.cv, 0) / p.actual_cost)::numeric, 2)
                ELSE 0
              END AS cpi,
              p.percent_complete
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(c.line_amount), 0) AS cv
         FROM customer_contracts c
         WHERE c.project_id IN (p.id, COALESCE(p.site_id,''), COALESCE(p.customer_id,''))
       ) cc ON true
       WHERE p.is_active = true AND p.has_schedule = true
         AND p.actual_cost > 0
         AND COALESCE(cc.cv, 0) > 0
         AND (COALESCE(cc.cv, 0) / p.actual_cost) < 0.85
       ORDER BY (COALESCE(cc.cv, 0) / p.actual_cost) ASC`
    );

    const overdueTasks = await query(
      `SELECT t.id AS task_id, t.name AS task_name, t.project_id,
              p.name AS project_name,
              'overdue_task' AS exception_type, 'warning' AS severity,
              t.baseline_end AS due_date, t.percent_complete,
              (CURRENT_DATE - t.baseline_end::date) AS days_overdue
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true
         AND t.baseline_end < CURRENT_DATE
         AND COALESCE(t.percent_complete, 0) < 100
       ORDER BY days_overdue DESC
       LIMIT 30`
    );

    const stalePlans = await query(
      `SELECT p.id AS project_id, p.name AS project_name,
              'stale_plan' AS exception_type, 'info' AS severity,
              MAX(pd.uploaded_at) AS last_upload,
              EXTRACT(DAY FROM NOW() - MAX(pd.uploaded_at))::int AS days_since
       FROM projects p
       LEFT JOIN project_documents pd ON pd.project_id = p.id
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY p.id, p.name
       HAVING MAX(pd.uploaded_at) IS NULL
          OR EXTRACT(DAY FROM NOW() - MAX(pd.uploaded_at)) > 60
       ORDER BY days_since DESC NULLS FIRST
       LIMIT 20`
    );

    const allExceptions = [
      ...costOverruns.map(r => ({ ...r, title: `Cost overrun: ${(r as Record<string, unknown>).project_name}`, message: `Budget burn at ${(r as Record<string, unknown>).burn_pct}% with ${(r as Record<string, unknown>).percent_complete}% complete` })),
      ...hourOverruns.map(r => ({ ...r, title: `Hours exceeded: ${(r as Record<string, unknown>).project_name}`, message: `Hours at ${(r as Record<string, unknown>).burn_pct}% of estimate` })),
      ...lowCpi.map(r => ({ ...r, title: `Low CPI: ${(r as Record<string, unknown>).project_name}`, message: `CPI at ${(r as Record<string, unknown>).cpi}` })),
      ...overdueTasks.map(r => ({ ...r, title: `Overdue: ${(r as Record<string, unknown>).task_name}`, message: `${(r as Record<string, unknown>).days_overdue} days past due on ${(r as Record<string, unknown>).project_name}` })),
      ...stalePlans.map(r => ({ ...r, title: `Stale plan: ${(r as Record<string, unknown>).project_name}`, message: (r as Record<string, unknown>).days_since ? `${(r as Record<string, unknown>).days_since} days since last upload` : 'No plan uploaded' })),
    ];

    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    allExceptions.sort((a, b) => {
      const sa = severityOrder[(a as Record<string, unknown>).severity as string] ?? 3;
      const sb = severityOrder[(b as Record<string, unknown>).severity as string] ?? 3;
      return sa - sb;
    });

    const summary = {
      total: allExceptions.length,
      critical: allExceptions.filter(e => (e as Record<string, unknown>).severity === 'critical').length,
      warning: allExceptions.filter(e => (e as Record<string, unknown>).severity === 'warning').length,
      info: allExceptions.filter(e => (e as Record<string, unknown>).severity === 'info').length,
    };

    return NextResponse.json(
      { success: true, summary, exceptions: allExceptions },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
