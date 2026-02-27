import { NextResponse } from 'next/server';
import { safeRows, asNumber } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [taskRows, hourRows] = await Promise.all([
    safeRows(
      `SELECT id, COALESCE(name, id::text) AS name, percent_complete, finish_date
       FROM tasks
       ORDER BY finish_date ASC NULLS LAST
       LIMIT 120`,
    ),
    safeRows(
      `SELECT work_date::date AS day, COALESCE(SUM(total_hours),0)::float AS hours
       FROM hour_entries
       WHERE work_date::date >= CURRENT_DATE - INTERVAL '6 days'
       GROUP BY work_date::date
       ORDER BY day ASC`,
    ),
  ]);

  const now = Date.now();
  const openTasks = taskRows.filter((row) => asNumber(row.percent_complete) < 100);
  const overdue = openTasks.filter((row) => Date.parse(String(row.finish_date || '')) < now);
  const dueThisWeek = openTasks.filter((row) => {
    const due = Date.parse(String(row.finish_date || ''));
    return Number.isFinite(due) && due >= now && due <= now + 7 * 86_400_000;
  });

  const weeklyHours = hourRows.map((row) => ({
    day: String(row.day || ''),
    hours: asNumber(row.hours),
  }));
  const totalWeekHours = weeklyHours.reduce((sum, row) => sum + row.hours, 0);

  const response = {
    success: true,
    scope: 'rda:command-center',
    computedAt: new Date().toISOString(),
    sections: {
      dayGlance: {
        tasksDueThisWeek: dueThisWeek.length,
        hoursThisWeek: totalWeekHours,
        sprintProgress: openTasks.length ? Math.round(((taskRows.length - openTasks.length) / taskRows.length) * 100) : 100,
        activeTasks: openTasks.length,
      },
      taskQueue: openTasks.slice(0, 20).map((row) => ({
        id: String(row.id || ''),
        title: String(row.name || row.id || 'Task'),
        percentComplete: asNumber(row.percent_complete),
        dueDate: String(row.finish_date || ''),
        overdue: Date.parse(String(row.finish_date || '')) < now,
      })),
      sprintMiniBoard: {
        notStarted: openTasks.filter((row) => asNumber(row.percent_complete) === 0).length,
        inProgress: openTasks.filter((row) => asNumber(row.percent_complete) > 0 && asNumber(row.percent_complete) < 100).length,
        done: taskRows.filter((row) => asNumber(row.percent_complete) >= 100).length,
      },
      weeklyHours: weeklyHours,
      overdueCount: overdue.length,
    },
    warnings: ['RDA employee scoping depends on role filter context; explicit employee ownership mapping should be validated.'],
    actions: {
      tasks: { href: '/role-views/rda/tasks', method: 'GET' as const },
      hours: { href: '/role-views/rda/hours', method: 'GET' as const },
    },
  };

  return NextResponse.json(response);
}
