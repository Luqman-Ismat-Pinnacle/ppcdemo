import { NextResponse } from 'next/server';
import { basePortfolioSummary } from '@/lib/role-summary-db';
import { buildMetric, type RoleSummaryResponse } from '@/lib/metrics/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await basePortfolioSummary();
  const health = Math.max(0, 100 - (base.overdueTasks * 2 + base.criticalAlerts * 8));

  const data = {
    metrics: [
      buildMetric({
        metricId: 'sm_portfolio_health_proxy',
        formulaId: 'health_proxy_v1',
        label: 'Portfolio Health',
        value: Math.min(100, health),
        unit: 'score',
        sourceTables: ['tasks', 'alert_events'],
        nullSemantics: 'default healthy state',
        drillDownUrl: '/role-views/senior-manager/portfolio-health',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'sm_active_projects',
        formulaId: 'active_project_count_v1',
        label: 'Active Projects',
        value: base.activeProjects,
        unit: 'count',
        sourceTables: ['projects'],
        nullSemantics: 'no active projects',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'sm_open_alerts',
        formulaId: 'open_alert_count_v1',
        label: 'Open Alerts',
        value: base.openAlerts,
        unit: 'count',
        sourceTables: ['alert_events'],
        nullSemantics: 'no open alerts',
        drillDownUrl: '/role-views/senior-manager',
        computedAt: base.computedAt,
      }),
    ],
  };

  const response: RoleSummaryResponse<typeof data> = {
    success: true,
    scope: 'senior-manager:command-center',
    computedAt: base.computedAt,
    data,
  };
  return NextResponse.json(response);
}
