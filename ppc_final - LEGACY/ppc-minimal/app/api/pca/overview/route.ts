import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [[activeProjects], [scheduledProjects]] = await Promise.all([
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE is_active = true'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE is_active = true AND has_schedule = true'),
    ]);

    const projects = await query(
      `WITH task_agg AS (
         SELECT
           project_id,
           COALESCE(SUM(COALESCE(actual_hours, 0)), 0) AS task_actual_hours,
           COALESCE(SUM(COALESCE(baseline_hours, 0)), 0) AS task_baseline_hours
         FROM tasks
         GROUP BY project_id
       )
       SELECT
         p.id,
         p.name,
         p.percent_complete,
         p.actual_hours,
         p.total_hours,
         p.scheduled_cost,
         p.has_schedule,
         p.baseline_start,
         p.baseline_end,
         p.actual_start,
         p.actual_end,
         p.progress,
         p.tf,
         CASE
           WHEN COALESCE(ta.task_baseline_hours, 0) > 0 THEN ROUND((ta.task_actual_hours / ta.task_baseline_hours)::numeric, 2)
           ELSE 0
         END AS spi
       FROM projects p
       LEFT JOIN task_agg ta ON ta.project_id = p.id
       WHERE p.is_active = true AND p.has_schedule = true
       ORDER BY p.name`
    );

    const [hourAgg] = await query<{ total: string; mapped: string }>(
      `SELECT COALESCE(SUM(hours),0) total,
              SUM(CASE WHEN COALESCE(mpp_phase_task,'') <> '' THEN hours ELSE 0 END) mapped
       FROM hour_entries h
       JOIN projects p ON p.id = h.project_id
       WHERE p.is_active = true AND p.has_schedule = true`
    );

    const phaseHealth = await query(
      `SELECT ph.project_id, COUNT(*) as phase_count,
              SUM(CASE WHEN ph.percent_complete >= 100 THEN 1 ELSE 0 END) as completed,
              ROUND(AVG(ph.percent_complete)::numeric, 1) as avg_progress
       FROM phases ph
       JOIN projects p ON p.id = ph.project_id
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY ph.project_id`
    );

    const costSummary = await query(
      `SELECT COALESCE(SUM(actual_cost),0) as total_actual_cost,
              COALESCE(SUM(remaining_cost),0) as total_remaining_cost,
              COALESCE(SUM(scheduled_cost),0) as total_scheduled_cost
       FROM projects WHERE is_active = true AND has_schedule = true`
    );

    const [scheduleKpis] = await query<{
      portfolio_spi: string;
      at_risk_projects: string;
      healthy_projects: string;
    }>(
      `WITH task_agg AS (
         SELECT
           t.project_id,
           COALESCE(SUM(COALESCE(t.actual_hours, 0)), 0) AS actual_hours,
           COALESCE(SUM(COALESCE(t.baseline_hours, 0)), 0) AS baseline_hours
         FROM tasks t
         GROUP BY t.project_id
       ),
       project_spi AS (
         SELECT
           p.id,
           CASE
             WHEN COALESCE(ta.baseline_hours, 0) > 0 THEN (ta.actual_hours / ta.baseline_hours)
             ELSE 0
           END AS spi
         FROM projects p
         LEFT JOIN task_agg ta ON ta.project_id = p.id
         WHERE p.is_active = true AND p.has_schedule = true
       )
       SELECT
         ROUND(
           CASE WHEN SUM(COALESCE(ta.baseline_hours, 0)) > 0
             THEN SUM(COALESCE(ta.actual_hours, 0)) / SUM(COALESCE(ta.baseline_hours, 0))
             ELSE 0
           END::numeric, 2
         ) AS portfolio_spi,
         SUM(CASE WHEN ps.spi > 0 AND ps.spi < 0.9 THEN 1 ELSE 0 END)::int AS at_risk_projects,
         SUM(CASE WHEN ps.spi >= 0.95 THEN 1 ELSE 0 END)::int AS healthy_projects
       FROM projects p
       LEFT JOIN task_agg ta ON ta.project_id = p.id
       LEFT JOIN project_spi ps ON ps.id = p.id
       WHERE p.is_active = true AND p.has_schedule = true`
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
       HAVING COALESCE(SUM(h.hours), 0) < 8 AND COALESCE(p.percent_complete, 0) < 90
       ORDER BY recent_hours ASC, p.percent_complete ASC
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
       WHERE p.is_active = true AND p.has_schedule = true AND COALESCE(p.total_hours, 0) > 0
       ORDER BY variance_pct DESC
       LIMIT 20`
    );

    const slowProgress = await query(
      `SELECT p.id, p.name, p.percent_complete, p.actual_hours, p.total_hours
       FROM projects p
       WHERE p.is_active = true AND p.has_schedule = true
         AND COALESCE(p.percent_complete, 0) < 30
         AND COALESCE(p.actual_hours, 0) > COALESCE(p.total_hours, 0) * 0.4
       ORDER BY p.percent_complete ASC, p.actual_hours DESC
       LIMIT 20`
    );

    return NextResponse.json(
      {
        success: true,
        projects,
        metrics: {
          activeProjects: Number(activeProjects.cnt || 0),
          scheduledProjects: Number(scheduledProjects.cnt || 0),
          portfolioSpi: Number(scheduleKpis?.portfolio_spi || 0),
          atRiskProjects: Number(scheduleKpis?.at_risk_projects || 0),
          healthyProjects: Number(scheduleKpis?.healthy_projects || 0),
          plansWithoutSprints: plansWithoutSprints.length,
          staleSprints: staleSprintProjects.length,
          slowMovers: slowMovers.length,
          highVariance: highVariance.filter((r: any) => Number(r.variance_pct) >= 25).length,
          slowProgress: slowProgress.length,
        },
        hourSummary: { total: Number(hourAgg.total), mapped: Number(hourAgg.mapped) },
        phaseHealth,
        costSummary: costSummary[0] || {},
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
