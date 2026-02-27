import { NextResponse } from 'next/server';
import { basePortfolioSummary } from '@/lib/role-summary-db';
import { buildMetric, type RoleSummaryResponse } from '@/lib/metrics/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await basePortfolioSummary();
  const completionRate = base.totalTasks > 0
    ? Math.round(((base.totalTasks - base.overdueTasks) / base.totalTasks) * 100)
    : 100;

  const data = {
    metrics: [
      buildMetric({
        metricId: 'pl_overdue_tasks',
        formulaId: 'overdue_tasks_count_v1',
        label: 'Overdue Open Tasks',
        value: base.overdueTasks,
        unit: 'count',
        sourceTables: ['tasks'],
        nullSemantics: 'no overdue open tasks',
        drillDownUrl: '/project-controls/wbs-gantt-v2?filter=overdue',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'pl_completion_proxy',
        formulaId: 'completion_proxy_v1',
        label: 'Execution Health',
        value: completionRate,
        unit: 'score',
        sourceTables: ['tasks'],
        nullSemantics: 'no tasks',
        drillDownUrl: '/role-views/project-lead/project-health',
        computedAt: base.computedAt,
      }),
    ],
  };

  const response: RoleSummaryResponse<typeof data> = {
    success: true,
    scope: 'project-lead:command-center',
    computedAt: base.computedAt,
    data,
  };
  return NextResponse.json(response);
}
