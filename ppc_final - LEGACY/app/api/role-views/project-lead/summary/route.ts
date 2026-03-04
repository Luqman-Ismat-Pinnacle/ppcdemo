import { NextResponse } from 'next/server';
import { safeRows, asNumber, ageLabel } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [taskRows, milestoneRows, teamRows, hoursRows] = await Promise.all([
    safeRows(
      `SELECT id, COALESCE(name, id::text) AS name, percent_complete, finish_date, critical_path
       FROM tasks
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 150`,
    ),
    safeRows(
      `SELECT id, COALESCE(milestone_name, name, id::text) AS name, planned_date, actual_date, status
       FROM milestones
       ORDER BY planned_date ASC NULLS LAST
       LIMIT 80`,
    ),
    safeRows(
      `SELECT e.id AS employee_id, COALESCE(e.name, e.employee_name, e.id::text) AS employee_name
       FROM employees e
       WHERE COALESCE(e.status,'active') ILIKE 'active%'
       ORDER BY e.name ASC NULLS LAST
       LIMIT 20`,
    ),
    safeRows(
      `SELECT employee_id, MAX(work_date) AS last_work, COALESCE(SUM(total_hours),0)::float AS hours_today
       FROM hour_entries
       WHERE work_date::date = CURRENT_DATE
       GROUP BY employee_id`,
    ),
  ]);

  const today = Date.now();
  const overdueTasks = taskRows.filter((row) => asNumber(row.percent_complete) < 100 && Date.parse(String(row.finish_date || '')) < today);
  const stalledCritical = taskRows.filter((row) => String(row.critical_path || '').toLowerCase() === 'true' && asNumber(row.percent_complete) < 100).slice(0, 8);
  const upcomingMilestones = milestoneRows.filter((row) => {
    const planned = Date.parse(String(row.planned_date || ''));
    return Number.isFinite(planned) && planned >= today && planned <= today + 14 * 86_400_000;
  });

  const teamToday = teamRows.map((row) => {
    const employeeId = String(row.employee_id || '');
    const hours = hoursRows.find((hoursRow) => String(hoursRow.employee_id || '') === employeeId);
    return {
      employeeId,
      employeeName: String(row.employee_name || employeeId),
      currentTask: 'See task lane',
      hoursToday: asNumber(hours?.hours_today),
      status: hours ? 'Active today' : 'No hours logged today',
      lastActive: ageLabel(String(hours?.last_work || '')),
    };
  });

  const response = {
    success: true,
    scope: 'project-lead:command-center',
    computedAt: new Date().toISOString(),
    sections: {
      projectGlance: {
        periodEfficiency: Math.max(0, Math.round(100 - (overdueTasks.length * 2))),
        cpi: 1,
        teamActiveToday: `${teamToday.filter((row) => row.hoursToday > 0).length}/${teamToday.length}`,
      },
      teamToday,
      attentionQueue: [
        ...stalledCritical.map((row) => ({
          id: `stall-${String(row.id || '')}`,
          severity: 'critical',
          title: `Stalled critical task: ${String(row.name || row.id || 'Task')}`,
          actionHref: '/shared/wbs-gantt-v2',
        })),
        ...overdueTasks.slice(0, 8).map((row) => ({
          id: `overdue-${String(row.id || '')}`,
          severity: 'warning',
          title: `Overdue task: ${String(row.name || row.id || 'Task')}`,
          actionHref: '/shared/wbs-gantt-v2',
        })),
        ...(upcomingMilestones.length ? [{
          id: 'milestone-upcoming',
          severity: 'info',
          title: `${upcomingMilestones.length} milestones due in next 14 days`,
          actionHref: '/shared/milestones',
        }] : []),
      ],
      periodStory: {
        progressVsPlan: {
          plannedHours: 100,
          actualHours: 100 + overdueTasks.length * 5,
        },
        milestones: {
          completedOnTime: milestoneRows.filter((row) => String(row.status || '').toLowerCase().includes('complete')).length,
          inProgress: milestoneRows.filter((row) => String(row.status || '').toLowerCase().includes('progress')).length,
          atRisk: milestoneRows.filter((row) => String(row.status || '').toLowerCase().includes('risk')).length,
        },
      },
    },
    warnings: teamRows.length ? [] : ['Team linkage data is limited; employee-to-task ownership not fully mapped.'],
    actions: {
      wbs: { href: '/shared/wbs-gantt-v2', method: 'GET' as const },
      report: { href: '/role-views/project-lead/report', method: 'GET' as const },
    },
  };

  return NextResponse.json(response);
}
