import { NextResponse } from 'next/server';
import { basePortfolioSummary, safeRows, asNumber, severityRank, ageLabel } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await basePortfolioSummary();
  const [escalationsRows, smRows, moversRows] = await Promise.all([
    safeRows(
      `SELECT id, severity, title, message, created_at
       FROM alert_events
       WHERE COALESCE(status,'open') = 'open'
       ORDER BY created_at ASC
       LIMIT 40`,
    ),
    safeRows(
      `SELECT COALESCE(role_key,'senior_manager') AS manager, COUNT(*)::int AS alert_count
       FROM workflow_audit_log
       WHERE event_type = 'alert_status_update'
       GROUP BY 1
       ORDER BY 2 DESC
       LIMIT 12`,
    ),
    safeRows(
      `SELECT COALESCE(name, id::text) AS name, COALESCE(health_score, score, 0)::float AS health
       FROM project_health
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 20`,
    ),
  ]);

  const queue = escalationsRows
    .map((row) => ({
      id: String(row.id || ''),
      severity: String(row.severity || 'info').toLowerCase(),
      title: String(row.title || 'Alert'),
      detail: String(row.message || ''),
      age: ageLabel(String(row.created_at || '')),
    }))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 7);

  const topThree = {
    portfolioHealth: Math.max(0, 100 - (base.overdueTasks * 2 + base.criticalAlerts * 8)),
    periodEfficiency: Math.max(0, Math.round(base.mappingCoverage)),
    decisionsRequired: queue.length,
  };

  const response = {
    success: true,
    scope: 'coo:command-center',
    computedAt: base.computedAt,
    sections: {
      topThree,
      decisionQueue: queue,
      periodPerformance: {
        completionRate: base.totalTasks > 0 ? Math.round(((base.totalTasks - base.overdueTasks) / base.totalTasks) * 100) : 100,
        openCommitments: base.openCommitments,
        topMovers: moversRows.slice(0, 6).map((row) => ({
          name: String(row.name || ''),
          health: asNumber(row.health),
        })),
      },
      bySeniorManager: smRows.map((row) => ({
        manager: String(row.manager || 'Senior Manager'),
        projectCount: 0,
        avgHealth: null,
        alertCount: asNumber(row.alert_count),
      })),
    },
    warnings: moversRows.length ? [] : ['Project health trend data unavailable; project_health rows not found.'],
    actions: {
      commitments: { href: '/role-views/coo/commitments', method: 'GET' as const },
      alerts: { href: '/api/alerts?status=open', method: 'GET' as const },
    },
  };
  return NextResponse.json(response);
}
