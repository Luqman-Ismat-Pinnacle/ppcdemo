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
        metricId: 'coo_open_exceptions',
        formulaId: 'open_alert_count_v1',
        label: 'Open Exceptions',
        value: base.openAlerts,
        unit: 'count',
        sourceTables: ['alert_events'],
        nullSemantics: 'no open exceptions',
        drillDownUrl: '/role-views/coo/commitments',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'coo_decision_queue',
        formulaId: 'open_commitments_count_v1',
        label: 'Decision Queue',
        value: base.openCommitments,
        unit: 'count',
        sourceTables: ['commitments'],
        nullSemantics: 'no decisions pending',
        drillDownUrl: '/role-views/coo/commitments',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'coo_task_completion_proxy',
        formulaId: 'completion_proxy_v1',
        label: 'Task Completion',
        value: completionRate,
        unit: 'percent',
        sourceTables: ['tasks'],
        nullSemantics: 'no task data',
        computedAt: base.computedAt,
      }),
    ],
  };

  const response: RoleSummaryResponse<typeof data> = {
    success: true,
    scope: 'coo:command-center',
    computedAt: base.computedAt,
    data,
  };
  return NextResponse.json(response);
}
