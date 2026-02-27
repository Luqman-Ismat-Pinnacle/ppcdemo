import { NextResponse } from 'next/server';
import { basePortfolioSummary, safeRows, asNumber, severityRank, ageLabel } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await basePortfolioSummary();
  const [escalationsRows, smRows, moversRows, fallbackMoversRows] = await Promise.all([
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
    safeRows(
      `SELECT
         COALESCE(p.name, p.id::text) AS name,
         COALESCE(
           CASE
             WHEN p.cpi IS NOT NULL OR p.spi IS NOT NULL
               THEN (COALESCE(p.cpi, 0.8) * 50.0) + (COALESCE(p.spi, 0.8) * 50.0)
             WHEN p.percent_complete IS NOT NULL
               THEN p.percent_complete
             ELSE 0
           END,
           0
         )::float AS health
       FROM projects p
       ORDER BY p.updated_at DESC NULLS LAST
       LIMIT 50`,
    ),
  ]);

  const resolvedMovers = moversRows.length > 0 ? moversRows : fallbackMoversRows;

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
        topMovers: resolvedMovers.slice(0, 6).map((row) => ({
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
    warnings: resolvedMovers.length ? [] : ['Top project health movers unavailable; neither project_health nor projects health proxies returned rows.'],
    actions: {
      commitments: { href: '/role-views/coo/commitments', method: 'GET' as const },
      alerts: { href: '/api/alerts?status=open', method: 'GET' as const },
    },
  };
  return NextResponse.json(response);
}
