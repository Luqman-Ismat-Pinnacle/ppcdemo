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
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE has_schedule = true AND is_active = true'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM tasks'),
      query<{ cnt: string }>(`SELECT count(*) cnt FROM hour_entries WHERE COALESCE(mpp_phase_task, '') = ''`),
      query<{ total: string }>('SELECT COALESCE(SUM(hours),0) total FROM hour_entries'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE has_schedule = false AND is_active = true'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM employees WHERE is_active = true'),
      query<{ total: string }>('SELECT COALESCE(SUM(line_amount),0) total FROM customer_contracts'),
      query<{ total: string }>('SELECT COALESCE(SUM(actual_cost),0) total FROM hour_entries'),
      query<{ cnt: string }>('SELECT count(*) cnt FROM workday_phases'),
      query<{ cnt: string }>(`SELECT count(*) cnt FROM hour_entries WHERE COALESCE(mpp_phase_task, '') <> ''`),
    ]);

    const recentHours = await query(
      `SELECT h.project_id, p.name as project_name, SUM(h.hours) as total_hours, COUNT(*) as entries
       FROM hour_entries h LEFT JOIN projects p ON h.project_id = p.id
       WHERE h.date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY h.project_id, p.name ORDER BY total_hours DESC LIMIT 8`
    );

    const topProjects = await query(
      `SELECT p.id, p.name, p.percent_complete, p.actual_hours, p.remaining_hours,
              p.actual_cost, p.has_schedule
       FROM projects p WHERE p.is_active = true
       ORDER BY p.actual_hours DESC NULLS LAST LIMIT 10`
    );

    const hoursByMonth = await query(
      `SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(hours) as hours, SUM(actual_cost) as cost
       FROM hour_entries WHERE date >= CURRENT_DATE - INTERVAL '6 months'
       GROUP BY TO_CHAR(date, 'YYYY-MM') ORDER BY month`
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
        hoursByMonth,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
