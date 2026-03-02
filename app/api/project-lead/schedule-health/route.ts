import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [projectRows, phaseRows, criticalPathRows, floatRows, employeeRows] = await Promise.all([
      query<{ id: string; name: string; percent_complete: string; total_tasks: string; on_track: string; overdue: string; spi: string; total_float: string; schedule_variance_days: string }>(
        `SELECT p.id, p.name, COALESCE(p.percent_complete, 0)::text AS percent_complete,
           COALESCE(tc.total_tasks, 0)::text AS total_tasks,
           COALESCE(tc.on_track, 0)::text AS on_track,
           COALESCE(tc.overdue, 0)::text AS overdue,
           ROUND(CASE WHEN COALESCE(p.baseline_hours, 0) > 0 THEN COALESCE(p.actual_hours, 0)::numeric / p.baseline_hours ELSE 0 END, 2)::text AS spi,
           COALESCE(p.tf, 0)::text AS total_float,
           CASE WHEN p.baseline_end IS NOT NULL THEN (CURRENT_DATE - p.baseline_end)::text ELSE '0' END AS schedule_variance_days
         FROM projects p
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS total_tasks,
             SUM(CASE WHEN COALESCE(t.percent_complete, 0) > 0 AND COALESCE(t.percent_complete, 0) < 100 AND (t.baseline_end IS NULL OR t.baseline_end >= CURRENT_DATE) THEN 1 ELSE 0 END)::int AS on_track,
             SUM(CASE WHEN COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue
           FROM tasks t WHERE t.project_id = p.id
         ) tc ON true
         WHERE p.is_active = true AND p.has_schedule = true ORDER BY p.name`),
      query<{
        id: string; name: string; project_name: string; unit_name: string;
        percent_complete: string; task_count: string; overdue: string;
        spi: string; total_float: string; schedule_variance_days: string;
      }>(
        `SELECT
           ph.id, ph.name,
           p.name AS project_name,
           COALESCE(u.name, '') AS unit_name,
           COALESCE(ph.percent_complete, 0)::text AS percent_complete,
           COALESCE(tc.task_count, 0)::text AS task_count,
           COALESCE(tc.overdue, 0)::text AS overdue,
           ROUND(CASE WHEN COALESCE(ph.baseline_hours, 0) > 0
             THEN COALESCE(ph.actual_hours, 0)::numeric / ph.baseline_hours
             ELSE 0 END, 2)::text AS spi,
           COALESCE(ph.total_float, 0)::text AS total_float,
           CASE WHEN ph.baseline_end IS NOT NULL THEN (CURRENT_DATE - ph.baseline_end)::text ELSE '0' END AS schedule_variance_days
         FROM phases ph
         JOIN projects p ON p.id = ph.project_id
         LEFT JOIN units u ON u.id = ph.unit_id
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS task_count,
             SUM(CASE WHEN COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue
           FROM tasks t WHERE t.phase_id = ph.id
         ) tc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY p.name, u.name NULLS LAST, ph.name`
      ),
      query<{ id: string; name: string; phase_name: string; project_name: string; percent_complete: string; total_float: string; baseline_end: string }>(
        `SELECT t.id, t.name, COALESCE(ph.name, '') AS phase_name, p.name AS project_name,
           COALESCE(t.percent_complete, 0)::text AS percent_complete,
           COALESCE(t.total_float, 0)::text AS total_float,
           t.baseline_end::text
         FROM tasks t JOIN projects p ON p.id = t.project_id
         LEFT JOIN phases ph ON ph.id = t.phase_id
         WHERE p.is_active = true AND p.has_schedule = true AND t.is_critical = true
         ORDER BY p.name, t.baseline_end NULLS LAST`),
      query<{ float_bucket: string; cnt: string }>(
        `SELECT CASE
            WHEN COALESCE(t.total_float, 0) <= 0 THEN 'Zero / Negative'
            WHEN COALESCE(t.total_float, 0) <= 5 THEN '1–5 days'
            WHEN COALESCE(t.total_float, 0) <= 15 THEN '6–15 days'
            ELSE '> 15 days' END AS float_bucket,
           COUNT(*)::int AS cnt
         FROM tasks t JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true AND COALESCE(t.percent_complete, 0) < 100
         GROUP BY 1 ORDER BY MIN(COALESCE(t.total_float, 0))`),
      query<{
        employee_id: string; employee_name: string;
        total_tasks: string; overdue: string; critical_open: string;
        avg_spi: string; avg_progress: string; avg_float: string;
      }>(
        `SELECT
           COALESCE(t.employee_id, 'unassigned') AS employee_id,
           COALESCE(NULLIF(TRIM(e.name), ''), 'Unassigned') AS employee_name,
           COUNT(*)::int AS total_tasks,
           SUM(CASE WHEN COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue,
           SUM(CASE WHEN COALESCE(t.is_critical, false) = true AND COALESCE(t.percent_complete, 0) < 100 THEN 1 ELSE 0 END)::int AS critical_open,
           ROUND(AVG(CASE
             WHEN COALESCE(t.baseline_hours, 0) > 0
             THEN COALESCE(t.actual_hours, 0)::numeric / t.baseline_hours
             ELSE 0 END)::numeric, 2)::text AS avg_spi,
           ROUND(AVG(COALESCE(t.percent_complete, 0))::numeric, 1)::text AS avg_progress,
           ROUND(AVG(COALESCE(t.total_float, 0))::numeric, 1)::text AS avg_float
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN employees e ON e.id = t.employee_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY COALESCE(t.employee_id, 'unassigned'), COALESCE(NULLIF(TRIM(e.name), ''), 'Unassigned')
         ORDER BY overdue DESC, critical_open DESC, total_tasks DESC`
      ),
    ]);

    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    return NextResponse.json({
      success: true,
      projects: projectRows.map((r) => {
        const overdue = Number(r.overdue);
        const scheduleVarianceDays = Number(r.schedule_variance_days);
        const overduePenalty = Math.min(40, overdue * 8);
        const varianceDaysPenalty = Math.min(30, scheduleVarianceDays);
        const schedule_health = Math.round(clamp(100 - overduePenalty - varianceDaysPenalty));
        return { id: r.id, name: r.name, percent_complete: Number(r.percent_complete), total_tasks: Number(r.total_tasks), on_track: Number(r.on_track), overdue, spi: Number(r.spi), total_float: Number(r.total_float), schedule_variance_days: scheduleVarianceDays, schedule_health };
      }),
      phases: phaseRows.map((r) => ({
        id: r.id,
        name: r.name,
        project_name: r.project_name,
        unit_name: r.unit_name,
        percent_complete: Number(r.percent_complete),
        task_count: Number(r.task_count),
        overdue: Number(r.overdue),
        spi: Number(r.spi),
        total_float: Number(r.total_float),
        schedule_variance_days: Number(r.schedule_variance_days),
      })),
      criticalPath: criticalPathRows.map((r) => ({ id: r.id, name: r.name, phase_name: r.phase_name, project_name: r.project_name, percent_complete: Number(r.percent_complete), total_float: Number(r.total_float), baseline_end: r.baseline_end })),
      floatDistribution: floatRows.map((r) => ({ float_bucket: r.float_bucket, count: Number(r.cnt) })),
      employeeSummary: employeeRows.map((r) => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        total_tasks: Number(r.total_tasks),
        overdue: Number(r.overdue),
        critical_open: Number(r.critical_open),
        avg_spi: Number(r.avg_spi),
        avg_progress: Number(r.avg_progress),
        avg_float: Number(r.avg_float),
      })),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
