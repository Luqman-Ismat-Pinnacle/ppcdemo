import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [phaseRows, taskRows, weeklyRows, employeeRows] = await Promise.all([
      query<{
        id: string; name: string; project_id: string; project_name: string; unit_name: string;
        baseline_hours: string; actual_hours: string; remaining_hours: string; total_hours: string;
        percent_complete: string; baseline_start: string; baseline_end: string;
        actual_start: string; actual_end: string; is_critical: string;
        task_count: string; completed_count: string; overdue_count: string;
      }>(
        `SELECT
           ph.id, ph.name, ph.project_id, p.name AS project_name,
           COALESCE(u.name, '') AS unit_name,
           COALESCE(ph.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(ph.actual_hours, 0)::text AS actual_hours,
           COALESCE(ph.remaining_hours, 0)::text AS remaining_hours,
           COALESCE(ph.total_hours, 0)::text AS total_hours,
           COALESCE(ph.percent_complete, 0)::text AS percent_complete,
           ph.baseline_start::text, ph.baseline_end::text,
           ph.actual_start::text, ph.actual_end::text,
           ph.is_critical::text,
           COALESCE(tc.task_count, 0)::text AS task_count,
           COALESCE(tc.completed_count, 0)::text AS completed_count,
           COALESCE(tc.overdue_count, 0)::text AS overdue_count
         FROM phases ph
         JOIN projects p ON p.id = ph.project_id
         LEFT JOIN units u ON u.id = ph.unit_id
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::int AS task_count,
             SUM(CASE WHEN COALESCE(t.percent_complete, 0) >= 100 THEN 1 ELSE 0 END)::int AS completed_count,
             SUM(CASE WHEN COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue_count
           FROM tasks t WHERE t.phase_id = ph.id
         ) tc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY p.name, u.name NULLS LAST, ph.name`,
      ),
      query<{
        id: string; name: string; phase_id: string; phase_name: string;
        project_id: string; project_name: string;
        baseline_hours: string; actual_hours: string; remaining_hours: string;
        percent_complete: string; baseline_start: string; baseline_end: string;
        actual_start: string; actual_end: string;
        is_critical: string; is_milestone: string; predecessor_task_id: string; employee_id: string;
        baseline_count: string; baseline_metric: string; baseline_uom: string;
        actual_count: string; actual_metric: string; actual_uom: string;
      }>(
        `SELECT
           t.id, t.name, t.phase_id,
           COALESCE(ph.name, '') AS phase_name,
           t.project_id, p.name AS project_name,
           COALESCE(t.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(t.actual_hours, 0)::text AS actual_hours,
           COALESCE(t.remaining_hours, 0)::text AS remaining_hours,
           COALESCE(t.percent_complete, 0)::text AS percent_complete,
           t.baseline_start::text, t.baseline_end::text,
           t.actual_start::text, t.actual_end::text,
           COALESCE(t.is_critical, false)::text AS is_critical,
           COALESCE(t.is_milestone, false)::text AS is_milestone,
           COALESCE(t.predecessor_task_id, '') AS predecessor_task_id,
           COALESCE(t.employee_id, '') AS employee_id,
           COALESCE(t.baseline_count, 0)::text AS baseline_count,
           COALESCE(t.baseline_metric, '') AS baseline_metric,
           COALESCE(t.baseline_uom, '') AS baseline_uom,
           COALESCE(t.actual_count, 0)::text AS actual_count,
           COALESCE(t.actual_metric, '') AS actual_metric,
           COALESCE(t.actual_uom, '') AS actual_uom
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN phases ph ON ph.id = t.phase_id
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY p.name, ph.name NULLS LAST, t.name`,
      ),
      query<{ week: string; completed: string; started: string; total_hours: string }>(
        `SELECT
           TO_CHAR(DATE_TRUNC('week', h.date), 'YYYY-MM-DD') AS week,
           COUNT(DISTINCT CASE WHEN COALESCE(t.percent_complete, 0) >= 100 THEN t.id END)::int AS completed,
           COUNT(DISTINCT CASE WHEN COALESCE(t.percent_complete, 0) > 0 AND COALESCE(t.percent_complete, 0) < 100 THEN t.id END)::int AS started,
           ROUND(SUM(h.hours)::numeric, 1) AS total_hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN tasks t ON t.project_id = p.id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date >= CURRENT_DATE - INTERVAL '12 weeks'
           AND h.date IS NOT NULL
         GROUP BY DATE_TRUNC('week', h.date)
         ORDER BY week`,
      ),
      query<{
        employee_id: string; employee_name: string;
        task_count: string; completed_count: string; overdue_count: string;
        critical_open: string; avg_progress: string; actual_hours: string; remaining_hours: string;
      }>(
        `SELECT
           COALESCE(t.employee_id, 'unassigned') AS employee_id,
           COALESCE(NULLIF(TRIM(e.name), ''), 'Unassigned') AS employee_name,
           COUNT(*)::int AS task_count,
           SUM(CASE WHEN COALESCE(t.percent_complete, 0) >= 100 THEN 1 ELSE 0 END)::int AS completed_count,
           SUM(CASE WHEN COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE THEN 1 ELSE 0 END)::int AS overdue_count,
           SUM(CASE WHEN COALESCE(t.is_critical, false) = true AND COALESCE(t.percent_complete, 0) < 100 THEN 1 ELSE 0 END)::int AS critical_open,
           ROUND(AVG(COALESCE(t.percent_complete, 0))::numeric, 1)::text AS avg_progress,
           ROUND(SUM(COALESCE(t.actual_hours, 0))::numeric, 1)::text AS actual_hours,
           ROUND(SUM(COALESCE(t.remaining_hours, 0))::numeric, 1)::text AS remaining_hours
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN employees e ON e.id = t.employee_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY COALESCE(t.employee_id, 'unassigned'), COALESCE(NULLIF(TRIM(e.name), ''), 'Unassigned')
         ORDER BY task_count DESC, employee_name`,
      ),
    ]);

    return NextResponse.json({
      success: true,
      phases: phaseRows.map((r) => ({
        id: r.id, name: r.name, project_id: r.project_id, project_name: r.project_name,
        unit_name: r.unit_name,
        baseline_hours: Number(r.baseline_hours), actual_hours: Number(r.actual_hours),
        remaining_hours: Number(r.remaining_hours), total_hours: Number(r.total_hours),
        percent_complete: Number(r.percent_complete),
        baseline_start: r.baseline_start, baseline_end: r.baseline_end,
        actual_start: r.actual_start, actual_end: r.actual_end,
        is_critical: r.is_critical === 'true',
        task_count: Number(r.task_count), completed_count: Number(r.completed_count),
        overdue_count: Number(r.overdue_count),
      })),
      tasks: taskRows.map((r) => ({
        id: r.id, name: r.name, phase_id: r.phase_id, phase_name: r.phase_name,
        project_id: r.project_id, project_name: r.project_name,
        baseline_hours: Number(r.baseline_hours), actual_hours: Number(r.actual_hours),
        remaining_hours: Number(r.remaining_hours), percent_complete: Number(r.percent_complete),
        baseline_start: r.baseline_start, baseline_end: r.baseline_end,
        actual_start: r.actual_start, actual_end: r.actual_end,
        is_critical: r.is_critical === 'true', is_milestone: r.is_milestone === 'true',
        predecessor_task_id: r.predecessor_task_id, employee_id: r.employee_id,
        baseline_count: Number(r.baseline_count),
        baseline_metric: r.baseline_metric,
        baseline_uom: r.baseline_uom,
        actual_count: Number(r.actual_count),
        actual_metric: r.actual_metric,
        actual_uom: r.actual_uom,
      })),
      weeklyProgress: weeklyRows.map((r) => ({
        week: r.week, completed: Number(r.completed), started: Number(r.started),
        total_hours: Number(r.total_hours),
      })),
      employeeSummary: employeeRows.map((r) => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        task_count: Number(r.task_count),
        completed_count: Number(r.completed_count),
        overdue_count: Number(r.overdue_count),
        critical_open: Number(r.critical_open),
        avg_progress: Number(r.avg_progress),
        actual_hours: Number(r.actual_hours),
        remaining_hours: Number(r.remaining_hours),
      })),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
