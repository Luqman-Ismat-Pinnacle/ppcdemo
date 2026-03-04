import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [employeeUtilization, projectAllocation, departmentSummary, roleTimeHours, roleHeadcounts, scheduleWindow] = await Promise.all([
      query(
        `SELECT e.id, e.name, e.email, e.job_title, e.department,
              COALESCE(SUM(h.hours), 0) AS total_hours,
              COUNT(DISTINCT h.project_id) AS project_count,
              COUNT(DISTINCT h.date) AS days_worked
       FROM employees e
       LEFT JOIN hour_entries h ON h.employee_id = e.id
       WHERE e.is_active = true
       GROUP BY e.id, e.name, e.email, e.job_title, e.department
       ORDER BY total_hours DESC`
      ),
      query(
        `SELECT p.id AS project_id, p.name AS project_name,
                COUNT(DISTINCT h.employee_id) AS headcount,
                COALESCE(SUM(h.hours), 0) AS total_hours,
                p.actual_hours AS project_actual_hours,
                p.total_hours AS project_total_hours
         FROM projects p
         LEFT JOIN hour_entries h ON h.project_id = p.id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY p.id, p.name, p.actual_hours, p.total_hours
         ORDER BY total_hours DESC
         LIMIT 40`
      ),
      query(
        `SELECT COALESCE(e.department, 'Unassigned') AS department,
                COUNT(DISTINCT e.id) AS headcount,
                COALESCE(SUM(h.hours), 0) AS total_hours
         FROM employees e
         LEFT JOIN hour_entries h ON h.employee_id = e.id
         WHERE e.is_active = true
         GROUP BY e.department
         ORDER BY total_hours DESC`
      ),
      query(
        `WITH role_headcount AS (
           SELECT
             COALESCE(NULLIF(TRIM(job_title), ''), 'Unassigned Role') AS role,
             COUNT(*)::int AS headcount
           FROM employees
           WHERE is_active = true
           GROUP BY role
         )
         SELECT
           COALESCE(NULLIF(TRIM(e.job_title), ''), 'Unassigned Role') AS role,
           DATE_TRUNC('week', h.date)::date AS week_start,
           TO_CHAR(DATE_TRUNC('week', h.date), 'YYYY-MM-DD') AS week_label,
           TO_CHAR(DATE_TRUNC('month', h.date), 'YYYY-MM') AS month_label,
           CONCAT(TO_CHAR(DATE_TRUNC('quarter', h.date), 'YYYY'), '-Q', EXTRACT(quarter FROM h.date)::int) AS quarter_label,
           COALESCE(SUM(h.hours), 0) AS hours,
           COALESCE(rh.headcount, 0) AS role_headcount
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN employees e ON e.id = h.employee_id
         LEFT JOIN role_headcount rh ON rh.role = COALESCE(NULLIF(TRIM(e.job_title), ''), 'Unassigned Role')
         WHERE p.is_active = true
           AND p.has_schedule = true
           AND h.date IS NOT NULL
         GROUP BY
           COALESCE(NULLIF(TRIM(e.job_title), ''), 'Unassigned Role'),
           DATE_TRUNC('week', h.date)::date,
           TO_CHAR(DATE_TRUNC('week', h.date), 'YYYY-MM-DD'),
           TO_CHAR(DATE_TRUNC('month', h.date), 'YYYY-MM'),
           CONCAT(TO_CHAR(DATE_TRUNC('quarter', h.date), 'YYYY'), '-Q', EXTRACT(quarter FROM h.date)::int),
           rh.headcount
         HAVING COALESCE(SUM(h.hours), 0) > 0
         ORDER BY role, week_start`
      ),
      query(
        `SELECT
           COALESCE(NULLIF(TRIM(job_title), ''), 'Unassigned Role') AS role,
           COUNT(*)::int AS headcount
         FROM employees
         WHERE is_active = true
         GROUP BY COALESCE(NULLIF(TRIM(job_title), ''), 'Unassigned Role')
         ORDER BY role`
      ),
      query(
        `SELECT
           MIN(COALESCE(p.baseline_start, p.actual_start)) AS schedule_start,
           MAX(COALESCE(p.baseline_end, p.actual_end)) AS schedule_end
         FROM projects p
         WHERE p.is_active = true AND p.has_schedule = true`
      ),
    ]);

    type UtilRow = Record<string, unknown>;
    const utilData = employeeUtilization.map((r: UtilRow) => {
      const totalHours = Number(r.total_hours || 0);
      const daysWorked = Number(r.days_worked || 0);
      const avgDailyHours = daysWorked > 0 ? totalHours / daysWorked : 0;
      const utilization = Math.round((avgDailyHours / 8) * 100);
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        jobTitle: r.job_title,
        department: r.department,
        totalHours,
        projectCount: Number(r.project_count || 0),
        daysWorked,
        avgDailyHours: Math.round(avgDailyHours * 10) / 10,
        utilization,
      };
    });

    const overUtilized = utilData.filter(e => e.utilization > 100 && e.totalHours > 0);
    const underUtilized = utilData.filter(e => e.utilization > 0 && e.utilization < 60);
    const balanced = utilData.filter(e => e.utilization >= 60 && e.utilization <= 100);

    return NextResponse.json(
      {
        success: true,
        kpis: {
          totalEmployees: utilData.length,
          overUtilized: overUtilized.length,
          underUtilized: underUtilized.length,
          balanced: balanced.length,
        },
        employees: utilData,
        overUtilized,
        underUtilized,
        projectAllocation,
        departmentSummary,
        roleTimeHours,
        roleHeadcounts,
        scheduleWindow: scheduleWindow[0] || { schedule_start: null, schedule_end: null },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
