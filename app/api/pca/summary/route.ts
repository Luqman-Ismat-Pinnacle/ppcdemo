import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [
      [projectRow], [schedRow], [taskRow], [unmappedRow],
      [hoursRow], [overdueRow], [empRow], [contractRow],
      [costRow], [wdPhaseRow], [mappedHrsRow],
    ] = await Promise.all([
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE is_active = true'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE is_active = true AND has_schedule = true'),
      query<{ cnt: string }>(`SELECT count(*) cnt
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        WHERE p.is_active = true AND p.has_schedule = true`),
      query<{ cnt: string }>(`SELECT count(*) cnt
        FROM hour_entries h
        JOIN projects p ON p.id = h.project_id
        WHERE p.is_active = true AND p.has_schedule = true
          AND COALESCE(h.mpp_phase_task, '') = ''`),
      query<{ total: string }>(`SELECT COALESCE(SUM(h.hours),0) total
        FROM hour_entries h
        JOIN projects p ON p.id = h.project_id
        WHERE p.is_active = true AND p.has_schedule = true`),
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE is_active = true AND has_schedule = false'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM employees WHERE is_active = true'),
      query<{ total: string }>(`SELECT COALESCE(SUM(cc.line_amount),0) total
        FROM customer_contracts cc
        JOIN projects p ON p.id = cc.project_id
        WHERE p.is_active = true AND p.has_schedule = true`),
      query<{ total: string }>(`SELECT COALESCE(SUM(h.actual_cost),0) total
        FROM hour_entries h
        JOIN projects p ON p.id = h.project_id
        WHERE p.is_active = true AND p.has_schedule = true`),
      query<{ cnt: string }>(`SELECT count(*) cnt
        FROM workday_phases wp
        JOIN projects p ON p.id = wp.project_id
        WHERE p.is_active = true AND p.has_schedule = true`),
      query<{ cnt: string }>(`SELECT count(*) cnt
        FROM hour_entries h
        JOIN projects p ON p.id = h.project_id
        WHERE p.is_active = true AND p.has_schedule = true
          AND COALESCE(h.mpp_phase_task, '') <> ''`),
    ]);

    const recentHours = await query(
      `SELECT h.project_id, p.name as project_name, SUM(h.hours) as total_hours, COUNT(*) as entries
       FROM hour_entries h LEFT JOIN projects p ON h.project_id = p.id
       WHERE h.date >= CURRENT_DATE - INTERVAL '7 days'
         AND p.is_active = true
         AND p.has_schedule = true
       GROUP BY h.project_id, p.name ORDER BY total_hours DESC LIMIT 8`
    );

    const topProjects = await query(
      `SELECT p.id, p.name, p.percent_complete, p.actual_hours, p.remaining_hours,
              p.actual_cost, p.has_schedule
       FROM projects p WHERE p.is_active = true AND p.has_schedule = true
       ORDER BY p.actual_hours DESC NULLS LAST LIMIT 10`
    );

    const actionProjects = await query(
      `SELECT p.id,
              p.name,
              COUNT(h.id) AS total_entries,
              SUM(CASE WHEN COALESCE(h.mpp_phase_task, '') = '' THEN 1 ELSE 0 END) AS unmapped_entries,
              ROUND(
                CASE WHEN COUNT(h.id) > 0
                  THEN 100.0 * SUM(CASE WHEN COALESCE(h.mpp_phase_task, '') <> '' THEN 1 ELSE 0 END) / COUNT(h.id)
                  ELSE 0
                END, 1
              ) AS mapped_pct
       FROM projects p
       LEFT JOIN hour_entries h ON h.project_id = p.id
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY p.id, p.name
       HAVING COUNT(h.id) > 0
       ORDER BY unmapped_entries DESC, mapped_pct ASC, p.name
       LIMIT 8`
    );

    const hoursByMonth = await query(
      `SELECT TO_CHAR(h.date, 'YYYY-MM') as month, SUM(h.hours) as hours, SUM(h.actual_cost) as cost
       FROM hour_entries h
       JOIN projects p ON p.id = h.project_id
       WHERE h.date >= CURRENT_DATE - INTERVAL '6 months'
         AND p.is_active = true
         AND p.has_schedule = true
       GROUP BY TO_CHAR(h.date, 'YYYY-MM') ORDER BY month`
    );

    const topIssues: Array<{ id: string; severity: string; title: string; reason: string }> = [];
    const unmapped = Number(unmappedRow.cnt);
    const noSched = Number(overdueRow.cnt);
    if (unmapped > 0) topIssues.push({ id: 'unmapped', severity: 'warning', title: `${unmapped.toLocaleString()} unmapped hour entries`, reason: 'Hours not linked to MPP tasks' });
    if (noSched > 0) topIssues.push({ id: 'no-schedule', severity: 'critical', title: `${noSched} projects without schedule`, reason: 'No MPP plan uploaded' });
    const totalH = Number(hoursRow.total);
    const mappedH = Number(mappedHrsRow.cnt);
    if (totalH > 0 && mappedH / (unmapped + mappedH) < 0.5) {
      topIssues.push({ id: 'low-mapping', severity: 'warning', title: `Mapping coverage below 50%`, reason: `${mappedH.toLocaleString()} of ${(unmapped + mappedH).toLocaleString()} entries mapped` });
    }

    return NextResponse.json(
      {
        success: true,
        kpis: {
          totalProjects: Number(projectRow.cnt),
          withSchedule: Number(schedRow.cnt),
          totalTasks: Number(taskRow.cnt),
          unmappedHours: unmapped,
          totalHoursLogged: totalH,
          projectsNoSchedule: noSched,
          employees: Number(empRow.cnt),
          contractValue: Number(contractRow.total),
          totalCost: Number(costRow.total),
          workdayPhases: Number(wdPhaseRow.cnt),
          mappedEntries: mappedH,
        },
        queue: topIssues,
        recentActivity: recentHours,
        topProjects,
        actionProjects,
        hoursByMonth,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
