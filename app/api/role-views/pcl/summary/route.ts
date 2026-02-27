import { NextResponse } from 'next/server';
import { basePortfolioSummary } from '@/lib/role-summary-db';
import { buildMetric, type RoleSummaryResponse } from '@/lib/metrics/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await basePortfolioSummary();
  const data = {
    metrics: [
      buildMetric({
        metricId: 'pcl_open_exceptions',
        formulaId: 'open_alert_count_v1',
        label: 'Open Issues',
        value: base.openAlerts,
        unit: 'count',
        sourceTables: ['alert_events'],
        nullSemantics: 'no alerts',
        drillDownUrl: '/role-views/pcl?section=exceptions',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'pcl_overdue_tasks',
        formulaId: 'overdue_tasks_count_v1',
        label: 'Overdue Tasks',
        value: base.overdueTasks,
        unit: 'count',
        sourceTables: ['tasks'],
        nullSemantics: 'no overdue open tasks',
        drillDownUrl: '/project-controls/wbs-gantt-v2?filter=overdue',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'pcl_at_risk_projects',
        formulaId: 'critical_alert_proxy_v1',
        label: 'At-Risk Projects',
        value: base.criticalAlerts,
        unit: 'count',
        sourceTables: ['alert_events'],
        nullSemantics: 'no critical-risk projects',
        drillDownUrl: '/project-controls/resourcing',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'pcl_mapping_coverage',
        formulaId: 'mapped_hours_over_total_v1',
        label: 'Mapping Coverage',
        value: Number(base.mappingCoverage.toFixed(1)),
        unit: 'percent',
        sourceTables: ['hour_entries'],
        nullSemantics: 'no hour entries in scope',
        drillDownUrl: '/project-controls/mapping',
        computedAt: base.computedAt,
      }),
    ],
  };

  const response: RoleSummaryResponse<typeof data> = {
    success: true,
    scope: 'pcl:command-center',
    computedAt: base.computedAt,
    data,
  };
  return NextResponse.json(response);
}
