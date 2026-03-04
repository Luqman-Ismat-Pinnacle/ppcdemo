import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [projectRows, trendRows, milestoneRows, actionRows] = await Promise.all([
      query<{
        id: string; name: string; customer_name: string; portfolio_name: string;
        actual_hours: string; baseline_hours: string; remaining_hours: string; total_hours: string;
        actual_cost: string; remaining_cost: string; contract_value: string;
        percent_complete: string; baseline_start: string; baseline_end: string;
        actual_start: string; critical_open: string; total_tasks: string; completed_tasks: string;
        overdue_tasks: string; spi: string; variance_pct: string;
      }>(
        `SELECT
           p.id, p.name,
           COALESCE(NULLIF(TRIM(cu.name), ''), p.customer_id, 'Unknown') AS customer_name,
           COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned') AS portfolio_name,
           COALESCE(p.actual_hours, 0)::text AS actual_hours,
           COALESCE(p.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(p.remaining_hours, 0)::text AS remaining_hours,
           COALESCE(p.total_hours, 0)::text AS total_hours,
           COALESCE(p.actual_cost, 0)::text AS actual_cost,
           COALESCE(p.remaining_cost, 0)::text AS remaining_cost,
           COALESCE(cc.cv, 0)::text AS contract_value,
           COALESCE(p.percent_complete, 0)::text AS percent_complete,
           p.baseline_start::text, p.baseline_end::text, p.actual_start::text,
           COALESCE(tc.critical_open, 0)::text AS critical_open,
           COALESCE(tc.total_tasks, 0)::text AS total_tasks,
           COALESCE(tc.completed_tasks, 0)::text AS completed_tasks,
           COALESCE(tc.overdue_tasks, 0)::text AS overdue_tasks,
           ROUND(CASE WHEN COALESCE(p.baseline_hours, 0) > 0
             THEN COALESCE(p.actual_hours, 0)::numeric / p.baseline_hours ELSE 0 END, 2)::text AS spi,
           ROUND(CASE WHEN COALESCE(p.baseline_hours, 0) > 0
             THEN ((COALESCE(p.actual_hours, 0) - p.baseline_hours) / p.baseline_hours) * 100 ELSE 0 END::numeric, 1)::text AS variance_pct
         FROM projects p
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(c.line_amount), 0) AS cv
           FROM customer_contracts c
           WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
         ) cc ON true
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS total_tasks,
             SUM(CASE WHEN COALESCE(t.percent_complete, 0) >= 100 THEN 1 ELSE 0 END)::int AS completed_tasks,
             SUM(CASE WHEN t.is_critical AND COALESCE(t.percent_complete, 0) < 100 THEN 1 ELSE 0 END)::int AS critical_open,
             SUM(CASE WHEN COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue_tasks
           FROM tasks t WHERE t.project_id = p.id
         ) tc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY p.name`,
      ),

      query<{ month: string; hours: string; cost: string }>(
        `SELECT
           TO_CHAR(h.date, 'YYYY-MM') AS month,
           ROUND(SUM(h.hours)::numeric, 1) AS hours,
           ROUND(SUM(COALESCE(h.actual_cost, 0))::numeric, 0) AS cost
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true AND h.date IS NOT NULL
           AND h.date >= CURRENT_DATE - INTERVAL '12 months'
         GROUP BY TO_CHAR(h.date, 'YYYY-MM')
         ORDER BY month`,
      ),

      query<{ project_id: string; status_bucket: string; cnt: string }>(
        `SELECT
           t.project_id,
           CASE
             WHEN COALESCE(t.percent_complete, 0) >= 100 THEN 'completed'
             WHEN t.is_critical AND COALESCE(t.percent_complete, 0) < 100 THEN 'critical'
             WHEN COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE THEN 'overdue'
             WHEN COALESCE(t.percent_complete, 0) > 0 THEN 'in_progress'
             ELSE 'not_started'
           END AS status_bucket,
           COUNT(*)::int AS cnt
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY t.project_id,
           CASE
             WHEN COALESCE(t.percent_complete, 0) >= 100 THEN 'completed'
             WHEN t.is_critical AND COALESCE(t.percent_complete, 0) < 100 THEN 'critical'
             WHEN COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE THEN 'overdue'
             WHEN COALESCE(t.percent_complete, 0) > 0 THEN 'in_progress'
             ELSE 'not_started'
           END`,
      ),

      query<{
        id: string; item_type: string; title: string; message: string;
        project_name: string; status: string; priority: string; created_at: string;
      }>(
        `WITH pending_forecasts AS (
           SELECT
             CONCAT('fc-', f.id) AS id, 'forecast'::text AS item_type,
             CASE WHEN f.status = 'revision_requested' THEN 'Revision requested by SM' ELSE 'Forecast pending review' END AS title,
             COALESCE(NULLIF(TRIM(f.review_comment), ''), COALESCE(NULLIF(TRIM(f.notes), ''), 'No details')) AS message,
             COALESCE(p.name, f.project_id) AS project_name,
             COALESCE(f.status, 'pending') AS status,
             CASE WHEN f.status = 'revision_requested' THEN 'P1' ELSE 'P2' END AS priority,
             f.created_at::text
           FROM forecasts f
           LEFT JOIN projects p ON p.id = f.project_id
           WHERE COALESCE(f.status, 'pending') IN ('pending', 'revision_requested')
         ),
         overdue_tasks AS (
           SELECT
             CONCAT('od-', t.id) AS id, 'overdue_task'::text AS item_type,
             'Overdue task needs recovery' AS title,
             COALESCE(NULLIF(TRIM(t.name), ''), 'Task') AS message,
             COALESCE(p.name, t.project_id) AS project_name,
             'open'::text AS status,
             'P1'::text AS priority,
             COALESCE(t.baseline_end::text, NOW()::text) AS created_at
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           WHERE p.is_active = true AND p.has_schedule = true
             AND COALESCE(t.percent_complete, 0) < 100
             AND t.baseline_end < CURRENT_DATE
           ORDER BY t.baseline_end ASC
           LIMIT 12
         ),
         critical_tasks AS (
           SELECT
             CONCAT('cr-', t.id) AS id, 'critical_task'::text AS item_type,
             'Critical path task open' AS title,
             COALESCE(NULLIF(TRIM(t.name), ''), 'Task') AS message,
             COALESCE(p.name, t.project_id) AS project_name,
             'open'::text AS status,
             'P1'::text AS priority,
             NOW()::text AS created_at
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           WHERE p.is_active = true AND p.has_schedule = true
             AND COALESCE(t.is_critical, false) = true
             AND COALESCE(t.percent_complete, 0) < 100
           ORDER BY COALESCE(t.total_float, 0) ASC, t.baseline_end ASC NULLS LAST
           LIMIT 10
         ),
         cost_pressure AS (
           SELECT
             CONCAT('cp-', p.id) AS id, 'cost_pressure'::text AS item_type,
             'Cost pressure nearing contract' AS title,
             CONCAT('EAC vs contract at ', ROUND(CASE WHEN cc.cv > 0 THEN ((COALESCE(p.actual_cost,0)+COALESCE(p.remaining_cost,0))/cc.cv)*100 ELSE 0 END::numeric, 1), '%') AS message,
             p.name AS project_name,
             'open'::text AS status,
             'P2'::text AS priority,
             NOW()::text AS created_at
           FROM projects p
           LEFT JOIN LATERAL (
             SELECT COALESCE(SUM(c.line_amount), 0) AS cv
             FROM customer_contracts c
             WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
           ) cc ON true
           WHERE p.is_active = true AND p.has_schedule = true
             AND cc.cv > 0
             AND (COALESCE(p.actual_cost,0)+COALESCE(p.remaining_cost,0)) >= cc.cv * 0.9
           ORDER BY ((COALESCE(p.actual_cost,0)+COALESCE(p.remaining_cost,0))/NULLIF(cc.cv,0)) DESC
           LIMIT 8
         ),
         schedule_variance AS (
           SELECT
             CONCAT('sv-', p.id) AS id, 'schedule_variance'::text AS item_type,
             'Schedule variance needs attention' AS title,
             CONCAT('Baseline finish variance: ', (CURRENT_DATE - p.baseline_end), ' day(s)') AS message,
             p.name AS project_name,
             'open'::text AS status,
             'P2'::text AS priority,
             NOW()::text AS created_at
           FROM projects p
           WHERE p.is_active = true AND p.has_schedule = true
             AND p.baseline_end IS NOT NULL
             AND p.baseline_end < CURRENT_DATE
             AND COALESCE(p.percent_complete, 0) < 100
           ORDER BY p.baseline_end ASC
           LIMIT 8
         ),
         stale_counts AS (
           SELECT
             CONCAT('sc-', t.id) AS id, 'stale_count'::text AS item_type,
             'Actual count needs update' AS title,
             COALESCE(NULLIF(TRIM(t.name), ''), 'Task') AS message,
             COALESCE(p.name, t.project_id) AS project_name,
             'open'::text AS status,
             'P2'::text AS priority,
             COALESCE(t.actual_count_updated_at::text, t.created_at::text, NOW()::text) AS created_at
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           WHERE p.is_active = true AND p.has_schedule = true
             AND COALESCE(t.baseline_count, 0) > 0
             AND COALESCE(t.percent_complete, 0) < 100
             AND (t.actual_count_updated_at IS NULL OR t.actual_count_updated_at < NOW() - INTERVAL '14 days')
           ORDER BY t.actual_count_updated_at ASC NULLS FIRST
           LIMIT 10
         ),
         stale_phase_counts AS (
           SELECT
             CONCAT('spc-', ph.id) AS id, 'stale_count'::text AS item_type,
             'Phase actual count needs update' AS title,
             COALESCE(NULLIF(TRIM(ph.name), ''), 'Phase') AS message,
             COALESCE(p.name, ph.project_id) AS project_name,
             'open'::text AS status,
             'P2'::text AS priority,
             COALESCE(ph.actual_count_updated_at::text, ph.created_at::text, NOW()::text) AS created_at
           FROM phases ph
           JOIN projects p ON p.id = ph.project_id
           WHERE p.is_active = true AND p.has_schedule = true
             AND COALESCE(ph.baseline_count, 0) > 0
             AND COALESCE(ph.percent_complete, 0) < 100
             AND (ph.actual_count_updated_at IS NULL OR ph.actual_count_updated_at < NOW() - INTERVAL '14 days')
           ORDER BY ph.actual_count_updated_at ASC NULLS FIRST
           LIMIT 10
         )
         SELECT * FROM (
           SELECT * FROM pending_forecasts
           UNION ALL SELECT * FROM overdue_tasks
           UNION ALL SELECT * FROM critical_tasks
           UNION ALL SELECT * FROM cost_pressure
           UNION ALL SELECT * FROM schedule_variance
           UNION ALL SELECT * FROM stale_counts
           UNION ALL SELECT * FROM stale_phase_counts
         ) a
         ORDER BY
           CASE a.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,
           a.created_at DESC
         LIMIT 40`,
      ),
    ]);

    const projects = projectRows.map((r) => ({
      id: r.id, name: r.name, customer_name: r.customer_name, portfolio_name: r.portfolio_name,
      actual_hours: Number(r.actual_hours || 0), baseline_hours: Number(r.baseline_hours || 0),
      remaining_hours: Number(r.remaining_hours || 0), total_hours: Number(r.total_hours || 0),
      actual_cost: Number(r.actual_cost || 0), remaining_cost: Number(r.remaining_cost || 0),
      contract_value: Number(r.contract_value || 0),
      eac: Number(r.actual_cost || 0) + Number(r.remaining_cost || 0),
      margin: Number(r.contract_value || 0) > 0
        ? Math.round(((Number(r.contract_value || 0) - (Number(r.actual_cost || 0) + Number(r.remaining_cost || 0))) / Number(r.contract_value || 0)) * 1000) / 10
        : 0,
      percent_complete: Number(r.percent_complete || 0),
      baseline_start: r.baseline_start, baseline_end: r.baseline_end, actual_start: r.actual_start,
      critical_open: Number(r.critical_open || 0),
      total_tasks: Number(r.total_tasks || 0), completed_tasks: Number(r.completed_tasks || 0),
      overdue_tasks: Number(r.overdue_tasks || 0),
      spi: Number(r.spi || 0), variance_pct: Number(r.variance_pct || 0),
    }));

    const totalTasks = projects.reduce((s, p) => s + p.total_tasks, 0);
    const completedTasks = projects.reduce((s, p) => s + p.completed_tasks, 0);
    const overdueTasks = projects.reduce((s, p) => s + p.overdue_tasks, 0);
    const criticalOpen = projects.reduce((s, p) => s + p.critical_open, 0);
    const totalActual = projects.reduce((s, p) => s + p.actual_cost, 0);
    const totalEac = projects.reduce((s, p) => s + p.eac, 0);
    const totalContract = projects.reduce((s, p) => s + p.contract_value, 0);

    const milestoneByProject: Record<string, Record<string, number>> = {};
    milestoneRows.forEach((r) => {
      if (!milestoneByProject[r.project_id]) milestoneByProject[r.project_id] = {};
      milestoneByProject[r.project_id][r.status_bucket] = Number(r.cnt);
    });

    return NextResponse.json({
      success: true,
      kpis: {
        activeProjects: projects.length,
        totalTasks, completedTasks, overdueTasks, criticalOpen,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 1000) / 10 : 0,
        totalActual, totalEac, totalContract, avgCompletion: projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.percent_complete, 0) / projects.length * 10) / 10 : 0,
        portfolioMargin: totalContract > 0 ? Math.round(((totalContract - totalEac) / totalContract) * 1000) / 10 : 0,
      },
      projects,
      costTrend: trendRows.map((r) => ({ month: r.month, hours: Number(r.hours), cost: Number(r.cost) })),
      taskStatusByProject: milestoneByProject,
      actionItems: actionRows,
      updatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
