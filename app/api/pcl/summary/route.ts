import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [
      [projectRow], [schedRow], [empRow], [portfolioSpiRow],
    ] = await Promise.all([
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE is_active = true'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE is_active = true AND has_schedule = true'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM employees WHERE is_active = true'),
      query<{ spi: string }>(
        `WITH task_agg AS (
           SELECT project_id,
             COALESCE(SUM(COALESCE(actual_hours,0)),0) AS ah,
             COALESCE(SUM(COALESCE(baseline_hours,0)),0) AS bh
           FROM tasks
           GROUP BY project_id
         )
         SELECT ROUND(
           CASE
             WHEN SUM(COALESCE(ta.bh, 0)) > 0 THEN SUM(COALESCE(ta.ah, 0)) / SUM(COALESCE(ta.bh, 0))
             WHEN SUM(COALESCE(p.total_hours, 0)) > 0 THEN SUM(COALESCE(p.actual_hours, 0)) / SUM(COALESCE(p.total_hours, 0))
             ELSE 0
           END::numeric, 2
         ) AS spi
         FROM projects p
         LEFT JOIN task_agg ta ON ta.project_id = p.id
         WHERE p.is_active = true AND p.has_schedule = true`
      ),
    ]);

    const cpiRows = await query<{
      id: string;
      name: string;
      actual_cost: string;
      contract_value: string;
      task_actual_hours: string;
      task_baseline_hours: string;
      project_actual_hours: string;
      project_total_hours: string;
      percent_complete: string;
      overdue_count: string;
    }>(
      `WITH task_agg AS (
         SELECT
           t.project_id,
           COALESCE(SUM(COALESCE(t.actual_hours, 0)), 0) AS task_actual_hours,
           COALESCE(SUM(COALESCE(t.baseline_hours, 0)), 0) AS task_baseline_hours,
           SUM(CASE WHEN t.baseline_end < CURRENT_DATE AND COALESCE(t.percent_complete, 0) < 100 THEN 1 ELSE 0 END)::int AS overdue_count
         FROM tasks t
         GROUP BY t.project_id
       )
       SELECT p.id, p.name,
              COALESCE(p.actual_cost, 0) AS actual_cost,
              COALESCE(cc.cv, 0) AS contract_value,
              COALESCE(ta.task_actual_hours, 0) AS task_actual_hours,
              COALESCE(ta.task_baseline_hours, 0) AS task_baseline_hours,
              COALESCE(p.actual_hours, 0) AS project_actual_hours,
              COALESCE(p.total_hours, 0) AS project_total_hours,
              COALESCE(p.percent_complete, 0) AS percent_complete,
              COALESCE(ta.overdue_count, 0) AS overdue_count
       FROM projects p
       LEFT JOIN task_agg ta ON ta.project_id = p.id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(c.line_amount), 0) AS cv
         FROM customer_contracts c
         WHERE c.project_id IN (p.id, COALESCE(p.site_id,''), COALESCE(p.customer_id,''))
       ) cc ON true
       WHERE p.is_active = true AND p.has_schedule = true`
    );

    const cpiData = cpiRows.map(r => {
      const ac = Number(r.actual_cost);
      const cv = Number(r.contract_value);
      const taskAh = Number(r.task_actual_hours);
      const taskBh = Number(r.task_baseline_hours);
      const projAh = Number(r.project_actual_hours);
      const projTh = Number(r.project_total_hours);
      const cpi = ac > 0 && cv > 0 ? cv / ac : 0;
      const spiRaw = taskBh > 0 ? (taskAh / taskBh) : (projTh > 0 ? (projAh / projTh) : 0);
      return {
        id: r.id,
        name: r.name,
        cpi: Math.round(cpi * 100) / 100,
        spi: Math.round(spiRaw * 100) / 100,
        percent_complete: Number(r.percent_complete),
        overdue_count: Number(r.overdue_count || 0),
      };
    });
    const cpiDistribution = {
      high: cpiData.filter(r => r.cpi > 0.9).length,
      medium: cpiData.filter(r => r.cpi <= 0.9 && r.cpi >= 0.8).length,
      low: cpiData.filter(r => r.cpi > 0 && r.cpi < 0.8).length,
      projects: cpiData.sort((a, b) => a.cpi - b.cpi),
    };

    const mappingHealth = await query(
      `SELECT h.project_id, p.name AS project_name, p.pca_email,
              em.pca_name,
              COUNT(*)::int AS total_entries,
              SUM(CASE WHEN COALESCE(h.mpp_phase_task,'') <> '' THEN 1 ELSE 0 END)::int AS mapped_entries,
              SUM(CASE WHEN COALESCE(h.mpp_phase_task,'') = '' THEN 1 ELSE 0 END)::int AS unmapped_entries,
              ROUND(
                CASE WHEN COUNT(*) > 0
                  THEN 100.0 * SUM(CASE WHEN COALESCE(h.mpp_phase_task,'') <> '' THEN 1 ELSE 0 END) / COUNT(*)
                  ELSE 0
                END, 1
              ) AS coverage_pct
       FROM hour_entries h
       JOIN projects p ON p.id = h.project_id
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(e.name), '') AS pca_name
         FROM employees e
         WHERE LOWER(e.email) = LOWER(p.pca_email)
         ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC NULLS LAST, e.name
         LIMIT 1
       ) em ON true
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY h.project_id, p.name, p.pca_email, em.pca_name
       HAVING COUNT(*) > 0
       ORDER BY unmapped_entries DESC
       LIMIT 20`
    );

    const planFreshness = await query(
      `SELECT p.id AS project_id, p.name AS project_name,
              p.pca_email,
              em.pca_name,
              MAX(pd.uploaded_at) AS last_upload,
              CASE WHEN MAX(pd.uploaded_at) IS NOT NULL
                THEN EXTRACT(DAY FROM NOW() - MAX(pd.uploaded_at))::int
                ELSE NULL
              END AS days_since_upload
       FROM projects p
       LEFT JOIN project_documents pd ON pd.project_id = p.id
       LEFT JOIN LATERAL (
         SELECT NULLIF(TRIM(e.name), '') AS pca_name
         FROM employees e
         WHERE LOWER(e.email) = LOWER(p.pca_email)
         ORDER BY e.updated_at DESC NULLS LAST, e.created_at DESC NULLS LAST, e.name
         LIMIT 1
       ) em ON true
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY p.id, p.name, p.pca_email, em.pca_name
       ORDER BY last_upload ASC NULLS FIRST
       LIMIT 20`
    );

    const exceptionQueue = await query(
      `SELECT p.id AS project_id, p.name AS project_name,
              CASE
                WHEN p.percent_complete < 25 AND p.actual_cost > p.scheduled_cost * 0.5 THEN 'critical'
                WHEN p.actual_hours > p.total_hours THEN 'warning'
                WHEN p.percent_complete < 50 AND p.actual_cost > p.scheduled_cost * 0.75 THEN 'warning'
                ELSE 'info'
              END AS severity,
              CASE
                WHEN p.percent_complete < 25 AND p.actual_cost > p.scheduled_cost * 0.5 THEN 'Cost overrun at low completion'
                WHEN p.actual_hours > p.total_hours THEN 'Hours exceed estimate'
                WHEN p.percent_complete < 50 AND p.actual_cost > p.scheduled_cost * 0.75 THEN 'Budget burn rate high'
                ELSE 'Review recommended'
              END AS reason,
              p.percent_complete, p.actual_cost, p.scheduled_cost, p.actual_hours, p.total_hours
       FROM projects p
       WHERE p.is_active = true AND p.has_schedule = true
       ORDER BY
         CASE
           WHEN p.percent_complete < 25 AND p.actual_cost > p.scheduled_cost * 0.5 THEN 3
           WHEN p.actual_hours > p.total_hours THEN 2
           WHEN p.percent_complete < 50 AND p.actual_cost > p.scheduled_cost * 0.75 THEN 2
           ELSE 1
         END DESC,
         p.actual_cost DESC,
         p.actual_hours DESC
       LIMIT 15`
    );

    const overdueTasks = await query<{ cnt: string }>(
      `SELECT count(*) cnt FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true
         AND t.baseline_end < CURRENT_DATE
         AND COALESCE(t.percent_complete,0) < 100`
    );

    const criticalTasks = await query<{ cnt: string }>(
      `SELECT count(*) cnt FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true
         AND t.is_critical = true`
    );

    const plansWithoutSprints = await query(
      `SELECT p.id, p.name
       FROM projects p
       LEFT JOIN sprints s ON s.project_id = p.id
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY p.id, p.name
       HAVING COUNT(s.id) = 0
       ORDER BY p.name
       LIMIT 20`
    );

    const staleSprintProjects = await query(
      `SELECT p.id, p.name, MAX(s.updated_at) AS last_sprint_update
       FROM projects p
       JOIN sprints s ON s.project_id = p.id
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY p.id, p.name
       HAVING MAX(s.updated_at) < NOW() - INTERVAL '14 days'
       ORDER BY last_sprint_update ASC
       LIMIT 20`
    );

    const slowMovers = await query(
      `SELECT p.id, p.name, p.percent_complete, COALESCE(SUM(h.hours), 0) AS recent_hours
       FROM projects p
       LEFT JOIN hour_entries h ON h.project_id = p.id AND h.date >= CURRENT_DATE - INTERVAL '30 days'
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY p.id, p.name, p.percent_complete
       ORDER BY
         CASE WHEN COALESCE(p.percent_complete, 0) < 90 THEN 0 ELSE 1 END,
         recent_hours ASC,
         p.percent_complete ASC
       LIMIT 20`
    );

    const highVariance = await query(
      `SELECT p.id, p.name, p.actual_hours, p.total_hours,
              ROUND(
                CASE
                  WHEN COALESCE(p.total_hours, 0) > 0 THEN ABS(p.actual_hours - p.total_hours) / p.total_hours * 100
                  ELSE 0
                END::numeric, 1
              ) AS variance_pct
       FROM projects p
       WHERE p.is_active = true AND COALESCE(p.total_hours, 0) > 0
       ORDER BY variance_pct DESC
       LIMIT 20`
    );

    const slowProgress = await query(
      `SELECT p.id, p.name, p.percent_complete, p.actual_hours, p.total_hours
       FROM projects p
       WHERE p.is_active = true AND p.has_schedule = true
         AND COALESCE(p.total_hours, 0) > 0
       ORDER BY
         CASE
           WHEN COALESCE(p.percent_complete, 0) < 30
             AND COALESCE(p.actual_hours, 0) > COALESCE(p.total_hours, 0) * 0.4
           THEN 0 ELSE 1
         END,
         p.percent_complete ASC,
         (COALESCE(p.actual_hours, 0) / NULLIF(COALESCE(p.total_hours, 0), 0)) DESC
       LIMIT 20`
    );

    return NextResponse.json(
      {
        success: true,
        kpis: {
          totalProjects: Number(projectRow.cnt),
          withSchedule: Number(schedRow.cnt),
          employees: Number(empRow.cnt),
          overdueTasks: Number(overdueTasks[0]?.cnt || 0),
          criticalTasks: Number(criticalTasks[0]?.cnt || 0),
          portfolioSpi: Number(portfolioSpiRow.spi || 0),
          plansWithoutSprints: plansWithoutSprints.length,
          staleSprints: staleSprintProjects.length,
          slowMovers: slowMovers.length,
          highVariance: highVariance.filter((r: any) => Number(r.variance_pct) >= 25).length,
          slowProgress: slowProgress.length,
        },
        cpiDistribution,
        spiCpiMatrix: cpiData.map((r) => ({
          id: r.id,
          name: r.name,
          cpi: r.cpi,
          spi: r.spi,
          percent_complete: r.percent_complete,
          overdue_count: r.overdue_count,
        })),
        exceptionQueue,
        mappingHealth,
        planFreshness,
        sprintHealth: {
          plansWithoutSprints,
          staleSprintProjects,
        },
        executionRisks: {
          slowMovers,
          highVariance,
          slowProgress,
        },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
