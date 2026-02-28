import { NextResponse } from 'next/server';
import { safeRows, asNumber, ageLabel } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pcaEmail = searchParams.get('email')?.trim().toLowerCase() || '';

  const projectScopeClause = pcaEmail
    ? `AND LOWER(p.pca_email) = '${pcaEmail.replace(/'/g, "''")}'`
    : '';

  const projectIdSubquery = pcaEmail
    ? `(SELECT id FROM projects WHERE LOWER(pca_email) = '${pcaEmail.replace(/'/g, "''")}')`
    : null;

  const hourEntriesScope = projectIdSubquery
    ? `WHERE h.project_id IN ${projectIdSubquery}`
    : '';

  const tasksScope = projectIdSubquery
    ? `WHERE t.project_id IN ${projectIdSubquery}`
    : '';

  const [mappingRows, planRows, issuesRows] = await Promise.all([
    safeRows(
      `SELECT h.project_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE h.task_id IS NOT NULL)::int AS mapped
       FROM hour_entries h
       ${hourEntriesScope}
       GROUP BY h.project_id
       ORDER BY (COUNT(*) - COUNT(*) FILTER (WHERE h.task_id IS NOT NULL)) DESC
       LIMIT 25`,
    ),
    safeRows(
      `SELECT p.id AS project_id, COALESCE(p.name, p.id::text) AS project_name, MAX(d.uploaded_at) AS last_upload
       FROM projects p
       LEFT JOIN project_documents d ON d.project_id = p.id
       WHERE COALESCE(p.status,'active') ILIKE 'active%' ${projectScopeClause}
       GROUP BY p.id, p.name
       ORDER BY last_upload ASC NULLS FIRST
       LIMIT 20`,
    ),
    safeRows(
      `SELECT COUNT(*)::int AS unassigned_tasks
       FROM tasks t
       WHERE t.employee_id IS NULL ${tasksScope ? 'AND t.project_id IN ' + projectIdSubquery : ''}`,
    ),
  ]);

  const projectCards = mappingRows.map((row) => {
    const total = asNumber(row.total);
    const mapped = asNumber(row.mapped);
    const unmapped = Math.max(0, total - mapped);
    const coverage = total > 0 ? Math.round((mapped / total) * 100) : 100;
    return {
      projectId: String(row.project_id || ''),
      mappingCoverage: coverage,
      unmappedHours: unmapped,
      planFreshness: 'Unknown',
      dataIssues: unmapped > 0 ? 1 : 0,
    };
  });

  const overduePlans = planRows.filter((row) => {
    const label = ageLabel(String(row.last_upload || ''));
    return label === 'No run history' || label.endsWith('d ago');
  });

  const myQueue = [
    ...(asNumber(issuesRows[0]?.unassigned_tasks) > 0 ? [{
      id: 'critical-data-issues',
      severity: 'critical',
      title: `${asNumber(issuesRows[0]?.unassigned_tasks)} tasks missing assignment`,
      actionHref: '/shared/data-management',
      reason: 'Blocks role-scoped queues and assignment health.',
    }] : []),
    ...(projectCards.filter((row) => row.unmappedHours > 0).slice(0, 5).map((row) => ({
      id: `map-${row.projectId}`,
      severity: row.unmappedHours > 50 ? 'critical' : 'warning',
      title: `Map ${row.unmappedHours} unmapped hours`,
      actionHref: '/shared/mapping',
      reason: `Project ${row.projectId} mapping coverage is ${row.mappingCoverage}%`,
    }))),
    ...(overduePlans.slice(0, 5).map((row) => ({
      id: `plan-${String(row.project_id || '')}`,
      severity: 'warning',
      title: `Upload/update project plan`,
      actionHref: '/shared/project-plans',
      reason: `${String(row.project_name || row.project_id || 'Project')} has stale plan data.`,
    }))),
  ];

  const response = {
    success: true,
    scope: pcaEmail ? `pca:${pcaEmail}` : 'pca:all',
    computedAt: new Date().toISOString(),
    sections: {
      myQueue,
      projectCards,
      periodProgress: {
        mappedThisPeriod: projectCards.reduce((sum, row) => sum + row.unmappedHours, 0),
        issuesResolvedThisPeriod: 0,
      },
    },
    actions: {
      mapping: { href: '/shared/mapping', method: 'GET' as const },
      plans: { href: '/shared/project-plans', method: 'GET' as const },
    },
  };
  return NextResponse.json(response);
}
