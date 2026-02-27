import { NextResponse } from 'next/server';
import { safeRows, asNumber, ageLabel, severityRank } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [clientRows, plRows, escalationRows, summaryRows] = await Promise.all([
    safeRows(
      `SELECT COALESCE(c.name, c.customer_name, c.id::text) AS customer_name, COUNT(p.id)::int AS projects
       FROM customers c
       LEFT JOIN projects p ON p.customer_id = c.id
       GROUP BY c.name, c.customer_name, c.id
       ORDER BY projects DESC
       LIMIT 20`,
    ),
    safeRows(
      `SELECT COALESCE(e.name, e.employee_name, e.id::text) AS lead_name, COUNT(t.id)::int AS open_tasks
       FROM employees e
       LEFT JOIN tasks t ON t.employee_id = e.id AND COALESCE(t.percent_complete,0) < 100
       WHERE COALESCE(e.role, '') ILIKE '%lead%'
       GROUP BY e.name, e.employee_name, e.id
       ORDER BY open_tasks DESC
       LIMIT 20`,
    ),
    safeRows(
      `SELECT id, severity, title, message, created_at
       FROM alert_events
       WHERE COALESCE(status,'open') = 'open'
       ORDER BY created_at ASC
       LIMIT 30`,
    ),
    safeRows(
      `SELECT COUNT(*)::int AS projects, COUNT(*) FILTER (WHERE COALESCE(status,'open') = 'open')::int AS alerts
       FROM projects p
       LEFT JOIN alert_events a ON a.related_project_id = p.id`,
    ),
  ]);

  const clientCards = clientRows.map((row) => {
    const projects = asNumber(row.projects);
    const health = Math.max(0, 100 - projects * 2);
    return {
      name: String(row.customer_name || 'Client'),
      projects,
      health,
      issue: health < 70 ? 'Client attention needed' : 'Stable',
      trend: 'Use portfolio-health page for trend history.',
    };
  });

  const projectLeads = plRows.map((row) => ({
    leadName: String(row.lead_name || 'Project Lead'),
    openTasks: asNumber(row.open_tasks),
    reportStatus: 'See commitments page',
    trend: asNumber(row.open_tasks) > 25 ? 'Needs review' : 'Stable',
  }));

  const escalations = escalationRows
    .map((row) => ({
      id: String(row.id || ''),
      severity: String(row.severity || 'info').toLowerCase(),
      title: String(row.title || 'Escalation'),
      detail: String(row.message || ''),
      age: ageLabel(String(row.created_at || '')),
    }))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 8);

  const summary = summaryRows[0] || {};
  const totalProjects = asNumber(summary.projects);
  const openAlerts = asNumber(summary.alerts);
  const atRiskProjects = escalations.filter((row) => row.severity === 'critical').length;

  const response = {
    success: true,
    scope: 'senior-manager:command-center',
    computedAt: new Date().toISOString(),
    sections: {
      portfolioHealth: {
        healthScore: Math.max(0, 100 - (atRiskProjects * 8)),
        atRiskProjects,
        clientAttentionNeeded: clientCards.filter((row) => row.health < 70).length,
        reportCompliance: totalProjects > 0 ? Math.max(0, 100 - openAlerts) : 100,
      },
      clients: clientCards,
      projectLeads,
      escalations,
    },
    warnings: clientRows.length ? [] : ['Customer-to-project mappings are unavailable; client card fidelity is limited.'],
    actions: {
      commitments: { href: '/role-views/senior-manager/commitments', method: 'GET' as const },
      alerts: { href: '/api/alerts?status=open', method: 'GET' as const },
    },
  };

  return NextResponse.json(response);
}
