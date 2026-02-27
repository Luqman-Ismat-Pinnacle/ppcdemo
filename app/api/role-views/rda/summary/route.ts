import { NextResponse } from 'next/server';
import { basePortfolioSummary } from '@/lib/role-summary-db';
import { buildMetric, type RoleSummaryResponse } from '@/lib/metrics/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await basePortfolioSummary();

  const data = {
    metrics: [
      buildMetric({
        metricId: 'rda_overdue_tasks',
        formulaId: 'overdue_tasks_count_v1',
        label: 'Overdue Tasks',
        value: base.overdueTasks,
        unit: 'count',
        sourceTables: ['tasks'],
        nullSemantics: 'no overdue tasks',
        drillDownUrl: '/role-views/rda/tasks',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'rda_open_tasks',
        formulaId: 'open_tasks_proxy_v1',
        label: 'Open Tasks',
        value: Math.max(0, base.totalTasks - Math.floor(base.totalTasks * 0.25)),
        unit: 'count',
        sourceTables: ['tasks'],
        nullSemantics: 'no open tasks',
        drillDownUrl: '/role-views/rda/tasks',
        computedAt: base.computedAt,
      }),
    ],
  };

  const response: RoleSummaryResponse<typeof data> = {
    success: true,
    scope: 'rda:command-center',
    computedAt: base.computedAt,
    data,
  };
  return NextResponse.json(response);
}
