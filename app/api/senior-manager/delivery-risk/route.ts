import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Senior Manager Delivery Risk: variance drivers, SPI, critical path,
 * at-risk projects, and risk register.
 */
export async function GET() {
  try {
    const [projectRows, weeklyRows, rootCauseRows, hierarchyRows, predecessorRows] = await Promise.all([
      query<{
        id: string; name: string; owner: string; customer_name: string;
        variance_hours: string; variance_pct: string; spi: string;
        critical_open: string; remaining_hours: string; percent_complete: string;
        actual_hours: string; baseline_hours: string; task_count: string;
        margin_pct: string; total_hours: string; trend_hours_pct: string;
        actual_cost: string; remaining_cost: string;
      }>(
        `WITH hours_trend AS (
           SELECT h.project_id,
             COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS recent_hours,
             COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '6 months' AND h.date < CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS prior_hours
           FROM hour_entries h GROUP BY h.project_id
         )
         SELECT
           p.id, p.name,
           COALESCE(NULLIF(TRIM(lead.pca_name), ''), COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned')) AS owner,
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           ROUND(COALESCE(SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)),0)::numeric, 1)::text AS variance_hours,
           ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN (SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / SUM(COALESCE(t.baseline_hours,0))) * 100 ELSE 0 END::numeric, 1)::text AS variance_pct,
           ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN SUM(COALESCE(t.actual_hours,0)) / NULLIF(SUM(COALESCE(t.baseline_hours,0)),0) ELSE 0 END::numeric, 2)::text AS spi,
           SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END)::text AS critical_open,
           ROUND(COALESCE(SUM(t.remaining_hours),0)::numeric, 1)::text AS remaining_hours,
           ROUND(COALESCE(AVG(t.percent_complete),0)::numeric, 0)::text AS percent_complete,
           ROUND(COALESCE(SUM(t.actual_hours),0)::numeric, 1)::text AS actual_hours,
           ROUND(COALESCE(SUM(t.baseline_hours),0)::numeric, 1)::text AS baseline_hours,
           COUNT(t.id)::text AS task_count,
           ROUND(COALESCE(SUM(t.baseline_hours),0) + COALESCE(SUM(t.remaining_hours),0), 1)::text AS total_hours,
           ROUND(CASE WHEN ht.prior_hours > 0 THEN ((ht.recent_hours - ht.prior_hours) / ht.prior_hours) * 100 ELSE 0 END::numeric, 1)::text AS trend_hours_pct,
           ROUND(CASE WHEN cc.cv > 0 THEN ((cc.cv - (COALESCE(p.actual_cost,0) + COALESCE(p.remaining_cost,0))) / cc.cv) * 100 ELSE 0 END::numeric, 1)::text AS margin_pct,
           COALESCE(p.actual_cost, 0)::text AS actual_cost,
           COALESCE(p.remaining_cost, 0)::text AS remaining_cost
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN hours_trend ht ON ht.project_id = p.id
         LEFT JOIN LATERAL (SELECT NULLIF(TRIM(e.name), '') AS pca_name FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1) lead ON true
         LEFT JOIN LATERAL (SELECT COALESCE(SUM(c.line_amount), 0) AS cv FROM customer_contracts c WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))) cc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY p.id, p.name, pf.name, cu.name, lead.pca_name, ht.recent_hours, ht.prior_hours, cc.cv, p.actual_cost, p.remaining_cost
         ORDER BY
           CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN (SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / SUM(COALESCE(t.baseline_hours,0))) * 100 ELSE 0 END ASC,
           SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END) DESC`,
      ),

      query<{ week: string; hours: string; cost: string }>(
        `SELECT
           TO_CHAR(DATE_TRUNC('week', h.date), 'YYYY-MM-DD') AS week,
           ROUND(COALESCE(SUM(h.hours), 0)::numeric, 1)::text AS hours,
           ROUND(COALESCE(SUM(h.actual_cost), 0)::numeric, 1)::text AS cost
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date IS NOT NULL AND h.date >= CURRENT_DATE - INTERVAL '12 weeks'
         GROUP BY DATE_TRUNC('week', h.date)
         ORDER BY week`,
      ),

      query<{ charge_category: string; variance_hours: string; project_count: string }>(
        `SELECT
           CASE
             WHEN LOWER(COALESCE(h.charge_code, '')) LIKE '%qc%' OR LOWER(COALESCE(h.charge_code, '')) LIKE '%quality%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%rework%' THEN 'Quality / Rework'
             WHEN LOWER(COALESCE(h.charge_code, '')) LIKE '%admin%' OR LOWER(COALESCE(h.charge_code, '')) LIKE '%meeting%' THEN 'Non-Execute'
             ELSE 'Execute'
           END AS charge_category,
           ROUND(COALESCE(SUM(h.hours), 0)::numeric, 1)::text AS variance_hours,
           COUNT(DISTINCT h.project_id)::text AS project_count
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY 1`,
      ),

      query<{
        project_id: string; project_name: string; phase_id: string; phase_name: string;
        task_id: string; task_name: string; baseline_hours: string; actual_hours: string;
        percent_complete: string; is_critical: string; total_float: string;
        baseline_start: string; baseline_end: string; subtask_count: string; variance: string;
        early_start: string; early_finish: string; late_start: string; late_finish: string;
        resource: string; actual_cost: string; remaining_cost: string;
      }>(
        `SELECT
           p.id AS project_id, p.name AS project_name,
           COALESCE(ph.id, '') AS phase_id, COALESCE(ph.name, 'Unassigned') AS phase_name,
           t.id AS task_id, t.name AS task_name,
           COALESCE(t.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(t.actual_hours, 0)::text AS actual_hours,
           COALESCE(t.percent_complete, 0)::text AS percent_complete,
           COALESCE(t.is_critical, false)::text AS is_critical,
           COALESCE(t.total_float, 0)::text AS total_float,
           t.baseline_start::text, t.baseline_end::text,
           (SELECT COUNT(*)::text FROM sub_tasks st WHERE st.task_id = t.id) AS subtask_count,
           ROUND(COALESCE(t.actual_hours, 0) - COALESCE(t.baseline_hours, 0), 1)::text AS variance,
           t.early_start::text, t.early_finish::text, t.late_start::text, t.late_finish::text,
           COALESCE(NULLIF(TRIM(t.resource), ''), COALESCE(NULLIF(TRIM(t.resources), ''), '—')) AS resource,
           COALESCE(t.actual_cost, 0)::text AS actual_cost,
           COALESCE(t.remaining_cost, 0)::text AS remaining_cost
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN phases ph ON ph.id = t.phase_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND (t.baseline_start IS NOT NULL OR t.baseline_end IS NOT NULL)
         ORDER BY p.name, ph.name NULLS LAST, t.baseline_end ASC NULLS LAST
         LIMIT 500`,
      ),

      query<{ task_id: string; predecessor_id: string }>(
        `SELECT t.id AS task_id, t.predecessor_task_id AS predecessor_id
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND t.predecessor_task_id IS NOT NULL AND TRIM(t.predecessor_task_id) != ''`,
      ),
    ]);

    const projects = projectRows.map((r) => ({
      id: r.id,
      name: r.name,
      owner: r.owner || 'Unassigned',
      customer_name: r.customer_name || 'Unassigned',
      variance_hours: Number(r.variance_hours || 0),
      variance_pct: Number(r.variance_pct || 0),
      spi: Number(r.spi || 0),
      critical_open: Number(r.critical_open || 0),
      remaining_hours: Number(r.remaining_hours || 0),
      percent_complete: Number(r.percent_complete || 0),
      actual_hours: Number(r.actual_hours || 0),
      baseline_hours: Number(r.baseline_hours || 0),
      task_count: Number(r.task_count || 0),
      total_hours: Number(r.total_hours || 0),
      trend_hours_pct: Number(r.trend_hours_pct || 0),
      margin_pct: Number(r.margin_pct || 0),
      avg_progress: Number(r.percent_complete || 0),
      actual_cost: Number(r.actual_cost || 0),
      remaining_cost: Number(r.remaining_cost || 0),
    }));

    const totalProjects = projects.length;
    const atRiskProjects = projects.filter((p) => p.variance_pct < -10 || p.spi < 0.9 || p.critical_open >= 2).length;
    const totalVarianceHours = projects.reduce((s, p) => s + p.variance_hours, 0);
    const avgSpi = totalProjects > 0 ? projects.reduce((s, p) => s + p.spi, 0) / totalProjects : 0;
    const criticalOpen = projects.reduce((s, p) => s + p.critical_open, 0);
    const remainingHours = projects.reduce((s, p) => s + p.remaining_hours, 0);
    const avgProgress = totalProjects > 0 ? projects.reduce((s, p) => s + p.percent_complete, 0) / totalProjects : 0;

    const rootCauses = rootCauseRows.map((r) => ({
      root_cause: r.charge_category,
      impact_hours: Number(r.variance_hours || 0),
      project_count: Number(r.project_count || 0),
    }));

    const hierarchy = hierarchyRows.map((r) => ({
      project_id: r.project_id,
      project_name: r.project_name,
      phase_id: r.phase_id,
      phase_name: r.phase_name,
      task_id: r.task_id,
      task_name: r.task_name,
      baseline_hours: Number(r.baseline_hours || 0),
      actual_hours: Number(r.actual_hours || 0),
      percent_complete: Number(r.percent_complete || 0),
      is_critical: r.is_critical === 'true',
      total_float: Number(r.total_float || 0),
      baseline_start: r.baseline_start || '',
      baseline_end: r.baseline_end || '',
      subtask_count: Number(r.subtask_count || 0),
      variance: Number(r.variance || 0),
      early_start: r.early_start || r.baseline_start || '',
      early_finish: r.early_finish || r.baseline_end || '',
      late_start: r.late_start || r.baseline_start || '',
      late_finish: r.late_finish || r.baseline_end || '',
      resource: r.resource || '—',
      actual_cost: Number(r.actual_cost || 0),
      remaining_cost: Number(r.remaining_cost || 0),
    }));

    const predecessors = predecessorRows
      .filter((r) => r.predecessor_id)
      .map((r) => ({ task_id: r.task_id, predecessor_id: r.predecessor_id }));

    return NextResponse.json(
      {
        success: true,
        kpis: {
          totalProjects,
          projectsAtRisk: atRiskProjects,
          totalVarianceHours,
          avgSpi: Math.round(avgSpi * 100) / 100,
          totalCriticalOpen: criticalOpen,
          totalRemainingHours: remainingHours,
          avgProgress: Math.round(avgProgress * 10) / 10,
        },
        projects,
        weeklyThroughput: weeklyRows.map((r) => ({ week: r.week, hours: Number(r.hours || 0), cost: Number(r.cost || 0) })),
        rootCauses,
        hierarchy,
        predecessors,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
