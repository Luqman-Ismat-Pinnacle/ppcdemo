import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [spiRows, projectSpiRows] = await Promise.all([
      query<{
        total_actual_hrs: string; total_baseline_hrs: string;
      }>(
      `SELECT
         COALESCE(SUM(COALESCE(t.actual_hours, 0)), 0) AS total_actual_hrs,
         COALESCE(SUM(COALESCE(t.baseline_hours, 0)), 0) AS total_baseline_hrs
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true`
      ),
      query<{
        total_actual_hrs: string; total_planned_hrs: string;
      }>(
        `SELECT
           COALESCE(SUM(COALESCE(p.actual_hours, 0)), 0) AS total_actual_hrs,
           COALESCE(SUM(COALESCE(p.total_hours, 0)), 0) AS total_planned_hrs
         FROM projects p
         WHERE p.is_active = true AND p.has_schedule = true`
      ),
    ]);

    const taskActual = Number(spiRows[0]?.total_actual_hrs || 0);
    const taskBaseline = Number(spiRows[0]?.total_baseline_hrs || 0);
    const projActual = Number(projectSpiRows[0]?.total_actual_hrs || 0);
    const projPlanned = Number(projectSpiRows[0]?.total_planned_hrs || 0);
    const spiBase = taskBaseline > 0 ? (taskActual / taskBaseline) : (projPlanned > 0 ? (projActual / projPlanned) : 0);
    const spi = Math.round(spiBase * 100) / 100;

    const [overdueCnt] = await query<{ cnt: string }>(
      `SELECT count(*) cnt FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true
         AND t.baseline_end < CURRENT_DATE
         AND COALESCE(t.percent_complete, 0) < 100`
    );

    const [criticalCnt] = await query<{ cnt: string }>(
      `SELECT count(*) cnt FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true
         AND t.is_critical = true`
    );

    const [avgFloatRow] = await query<{ avg_float: string }>(
      `SELECT ROUND(AVG(COALESCE(t.total_float, t.tf, 0))::numeric, 1) AS avg_float
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true`
    );

    const overdueTasks = await query(
      `SELECT t.id, t.name AS task_name, t.project_id, p.name AS project_name,
              t.baseline_end AS finish_date, t.percent_complete,
              (CURRENT_DATE - t.baseline_end::date) AS days_overdue,
              COALESCE(t.total_float, t.tf, 0) AS total_float
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true
         AND t.baseline_end < CURRENT_DATE
         AND COALESCE(t.percent_complete, 0) < 100
       ORDER BY days_overdue DESC
       LIMIT 25`
    );

    const criticalPathTasks = await query(
      `SELECT t.id, t.name AS task_name, t.project_id, p.name AS project_name,
              t.baseline_start AS start_date, t.baseline_end AS finish_date,
              t.percent_complete,
              COALESCE(t.total_float, t.tf, 0) AS total_float
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.is_active = true AND p.has_schedule = true
         AND t.is_critical = true
       ORDER BY t.baseline_start ASC NULLS LAST
       LIMIT 25`
    );

    const projectScheduleHealth = await query(
      `WITH task_agg AS (
         SELECT
           t.project_id,
           COALESCE(SUM(COALESCE(t.actual_hours, 0)), 0) AS actual_hours,
           COALESCE(SUM(COALESCE(t.baseline_hours, 0)), 0) AS baseline_hours,
           SUM(CASE WHEN t.is_critical = true THEN 1 ELSE 0 END) AS critical_count,
           SUM(CASE WHEN t.baseline_end < CURRENT_DATE AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END) AS overdue_count
         FROM tasks t
         GROUP BY t.project_id
       )
       SELECT
         p.id,
         p.name,
         p.baseline_start,
         p.baseline_end,
         p.actual_start,
         p.actual_end,
         p.percent_complete,
         COALESCE(ta.actual_hours, p.actual_hours, 0) AS actual_hours,
         COALESCE(ta.baseline_hours, p.total_hours, 0) AS baseline_hours,
         CASE
           WHEN COALESCE(ta.baseline_hours, 0) > 0 THEN ROUND((ta.actual_hours / ta.baseline_hours)::numeric, 2)
           WHEN COALESCE(p.total_hours, 0) > 0 THEN ROUND((p.actual_hours / p.total_hours)::numeric, 2)
           ELSE 0
         END AS spi,
         COALESCE(ta.critical_count, 0) AS critical_count,
         COALESCE(ta.overdue_count, 0) AS overdue_count,
         (CASE WHEN p.baseline_end IS NOT NULL AND p.baseline_end::date < CURRENT_DATE THEN (CURRENT_DATE - p.baseline_end::date) ELSE 0 END)::int AS schedule_variance_days
       FROM projects p
       LEFT JOIN task_agg ta ON ta.project_id = p.id
       WHERE p.is_active = true AND p.has_schedule = true
       ORDER BY spi ASC NULLS LAST, p.name
       LIMIT 50`
    );

    const [extraKpis] = await query<{ low_spi_projects: string; slipped_projects: string; overdue_projects: string }>(
      `SELECT
         SUM(CASE WHEN COALESCE(p.baseline_end, CURRENT_DATE) < CURRENT_DATE AND COALESCE(p.percent_complete, 0) < 100 THEN 1 ELSE 0 END)::int AS slipped_projects,
         SUM(CASE
               WHEN COALESCE(ta.baseline_hours, 0) > 0 AND (ta.actual_hours / ta.baseline_hours) < 0.9 THEN 1
               WHEN COALESCE(ta.baseline_hours, 0) = 0 AND COALESCE(p.total_hours, 0) > 0 AND (p.actual_hours / p.total_hours) < 0.9 THEN 1
               ELSE 0
             END)::int AS low_spi_projects,
         SUM(CASE WHEN COALESCE(od.overdue_count, 0) > 0 THEN 1 ELSE 0 END)::int AS overdue_projects
       FROM projects p
       LEFT JOIN (
         SELECT project_id,
                COALESCE(SUM(COALESCE(actual_hours, 0)), 0) AS actual_hours,
                COALESCE(SUM(COALESCE(baseline_hours, 0)), 0) AS baseline_hours
         FROM tasks
         GROUP BY project_id
       ) ta ON ta.project_id = p.id
       LEFT JOIN (
         SELECT project_id, COUNT(*)::int AS overdue_count
         FROM tasks
         WHERE baseline_end < CURRENT_DATE AND COALESCE(percent_complete, 0) < 100
         GROUP BY project_id
       ) od ON od.project_id = p.id
       WHERE p.is_active = true AND p.has_schedule = true`
    );

    const monthTrend = await query(
      `WITH bounds AS (
         SELECT
           DATE_TRUNC('month', COALESCE(MIN(p.baseline_start), MIN(p.actual_start), CURRENT_DATE - INTERVAL '11 months')) AS min_month,
           DATE_TRUNC('month', GREATEST(COALESCE(MAX(p.baseline_end), CURRENT_DATE), CURRENT_DATE)) AS max_month
         FROM projects p
         WHERE p.is_active = true AND p.has_schedule = true
       ),
       calendar AS (
         SELECT TO_CHAR(gs.month_dt, 'YYYY-MM') AS month
         FROM bounds b,
         LATERAL generate_series(
           b.min_month,
           b.max_month + INTERVAL '6 months',
           INTERVAL '1 month'
         ) AS gs(month_dt)
       ),
       planned_month AS (
         SELECT
           TO_CHAR(DATE_TRUNC('month', COALESCE(t.baseline_start, t.baseline_end, p.baseline_start, CURRENT_DATE)), 'YYYY-MM') AS month,
           COALESCE(SUM(COALESCE(t.baseline_hours, 0)), 0) AS planned_hours
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY TO_CHAR(DATE_TRUNC('month', COALESCE(t.baseline_start, t.baseline_end, p.baseline_start, CURRENT_DATE)), 'YYYY-MM')
       ),
       actual_month AS (
         SELECT
           TO_CHAR(DATE_TRUNC('month', h.date), 'YYYY-MM') AS month,
           COALESCE(SUM(COALESCE(h.hours, 0)), 0) AS actual_hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true AND h.date IS NOT NULL
         GROUP BY TO_CHAR(DATE_TRUNC('month', h.date), 'YYYY-MM')
       ),
       overdue_month AS (
         SELECT
           TO_CHAR(DATE_TRUNC('month', COALESCE(t.baseline_end, CURRENT_DATE)), 'YYYY-MM') AS month,
           SUM(CASE WHEN t.baseline_end < CURRENT_DATE AND COALESCE(t.percent_complete, 0) < 100 THEN 1 ELSE 0 END)::int AS overdue_tasks
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY TO_CHAR(DATE_TRUNC('month', COALESCE(t.baseline_end, CURRENT_DATE)), 'YYYY-MM')
       ),
       month_union AS (
         SELECT
           c.month,
           COALESCE(pm.planned_hours, 0) AS planned_hours,
           COALESCE(am.actual_hours, 0) AS actual_hours,
           COALESCE(om.overdue_tasks, 0) AS overdue_tasks
         FROM calendar c
         LEFT JOIN planned_month pm ON pm.month = c.month
         LEFT JOIN actual_month am ON am.month = c.month
         LEFT JOIN overdue_month om ON om.month = c.month
       )
       SELECT
         month,
         ROUND(
           CASE
             WHEN SUM(planned_hours) OVER (ORDER BY month) > 0
               THEN SUM(actual_hours) OVER (ORDER BY month) / NULLIF(SUM(planned_hours) OVER (ORDER BY month), 0)
             ELSE 0
           END::numeric,
           2
         ) AS spi,
         overdue_tasks
       FROM month_union
       ORDER BY month
       LIMIT 24`
    );

    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    const projectScheduleHealthWithScore = (projectScheduleHealth as Array<{ overdue_count?: number; schedule_variance_days?: number }>).map((p) => {
      const overdueCount = Number(p.overdue_count || 0);
      const scheduleVarianceDays = Number(p.schedule_variance_days || 0);
      const overduePenalty = Math.min(40, overdueCount * 8);
      const varianceDaysPenalty = Math.min(30, scheduleVarianceDays);
      const schedule_health = Math.round(clamp(100 - overduePenalty - varianceDaysPenalty));
      return { ...p, schedule_health };
    });

    return NextResponse.json(
      {
        success: true,
        kpis: {
          spi,
          overdueTasks: Number(overdueCnt?.cnt || 0),
          criticalTasks: Number(criticalCnt?.cnt || 0),
          avgFloat: Number(avgFloatRow?.avg_float || 0),
          slippedProjects: Number(extraKpis?.slipped_projects || 0),
          lowSpiProjects: Number(extraKpis?.low_spi_projects || 0),
          overdueProjects: Number(extraKpis?.overdue_projects || 0),
        },
        overdueTasks,
        criticalPathTasks,
        projectScheduleHealth: projectScheduleHealthWithScore,
        monthTrend,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
