import { NextResponse } from 'next/server';
import { basePortfolioSummary, safeRows, asNumber } from '@/lib/role-summary-db';
import { buildMetric, type RoleSummaryResponse } from '@/lib/metrics/contracts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await basePortfolioSummary();
  const [planRows, issuesRows] = await Promise.all([
    safeRows(
      `SELECT COUNT(DISTINCT p.id)::int AS overdue_plans
       FROM projects p
       LEFT JOIN project_documents d ON d.project_id = p.id
       WHERE COALESCE(p.status,'active') ILIKE 'active%'
       GROUP BY p.id
       HAVING MAX(d.uploaded_at) IS NULL OR MAX(d.uploaded_at) < NOW() - INTERVAL '14 days'`,
    ),
    safeRows("SELECT COUNT(*)::int AS count FROM tasks WHERE employee_id IS NULL"),
  ]);
  const overduePlans = planRows.length;
  const dataIssues = asNumber(issuesRows[0]?.count);
  const unmappedHours = Math.max(0, Math.round((100 - base.mappingCoverage) * 10) / 10);

  const data = {
    metrics: [
      buildMetric({
        metricId: 'pca_unmapped_hours_proxy',
        formulaId: 'unmapped_proxy_v1',
        label: 'Unmapped Hours',
        value: unmappedHours,
        unit: 'hours',
        sourceTables: ['hour_entries'],
        nullSemantics: 'no unmapped hours',
        drillDownUrl: '/project-controls/mapping',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'pca_overdue_plans',
        formulaId: 'plans_overdue_14d_v1',
        label: 'Overdue Plan Uploads',
        value: overduePlans,
        unit: 'count',
        sourceTables: ['project_documents', 'projects'],
        nullSemantics: 'all plans current',
        drillDownUrl: '/project-controls/project-plans',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'pca_data_issues',
        formulaId: 'unassigned_task_count_v1',
        label: 'Data Issues',
        value: dataIssues,
        unit: 'count',
        sourceTables: ['tasks'],
        nullSemantics: 'no data issues',
        drillDownUrl: '/role-views/pca?section=data-quality',
        computedAt: base.computedAt,
      }),
      buildMetric({
        metricId: 'pca_mapping_coverage',
        formulaId: 'mapped_hours_over_total_v1',
        label: 'Mapping Coverage',
        value: Number(base.mappingCoverage.toFixed(1)),
        unit: 'percent',
        sourceTables: ['hour_entries'],
        nullSemantics: 'no hour entries',
        drillDownUrl: '/project-controls/mapping',
        computedAt: base.computedAt,
      }),
    ],
  };

  const response: RoleSummaryResponse<typeof data> = {
    success: true,
    scope: 'pca:command-center',
    computedAt: base.computedAt,
    data,
  };
  return NextResponse.json(response);
}
