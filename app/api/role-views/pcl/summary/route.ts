import { NextResponse } from 'next/server';
import { safeRows, asNumber, ageLabel, severityRank } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [alertsRows, mappingRows, plansRows, cpiRows, pcaRows] = await Promise.all([
    safeRows(
      `SELECT id, severity, title, message, related_project_id, created_at
       FROM alert_events
       WHERE COALESCE(status,'open') = 'open'
       ORDER BY created_at ASC
       LIMIT 50`,
    ),
    safeRows(
      `SELECT h.project_id, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE h.task_id IS NOT NULL)::int AS mapped
       FROM hour_entries h
       GROUP BY h.project_id
       ORDER BY (COUNT(*) - COUNT(*) FILTER (WHERE h.task_id IS NOT NULL)) DESC
       LIMIT 20`,
    ),
    safeRows(
      `SELECT p.id AS project_id, COALESCE(p.name, p.id::text) AS project_name, MAX(d.uploaded_at) AS last_upload
       FROM projects p
       LEFT JOIN project_documents d ON d.project_id = p.id
       WHERE COALESCE(p.status,'active') ILIKE 'active%'
       GROUP BY p.id, p.name
       ORDER BY last_upload ASC NULLS FIRST
       LIMIT 20`,
    ),
    safeRows(
      `SELECT project_id, ROUND(AVG(cpi)::numeric, 2) AS cpi
       FROM project_health
       GROUP BY project_id
       ORDER BY cpi ASC NULLS LAST
       LIMIT 20`,
    ),
    safeRows(
      `SELECT p.id AS project_id, p.pca_email, COALESCE(e.name, p.pca_email, 'Unassigned') AS pca_name
       FROM projects p
       LEFT JOIN employees e ON LOWER(e.email) = LOWER(p.pca_email)
       WHERE p.pca_email IS NOT NULL AND p.pca_email != ''`,
    ),
  ]);

  const pcaByProject = new Map<string, string>();
  for (const row of pcaRows) {
    pcaByProject.set(String(row.project_id || ''), String(row.pca_name || 'Unassigned'));
  }

  const exceptionQueue = alertsRows
    .map((row) => ({
      id: String(row.id || ''),
      severity: String(row.severity || 'info').toLowerCase(),
      title: String(row.title || 'Alert'),
      detail: String(row.message || ''),
      projectId: String(row.related_project_id || ''),
      ageLabel: ageLabel(String(row.created_at || '')),
    }))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 12);

  const mappingHealth = mappingRows.map((row) => {
    const total = asNumber(row.total);
    const mapped = asNumber(row.mapped);
    const unmapped = Math.max(0, total - mapped);
    const coverage = total > 0 ? Math.round((mapped / total) * 100) : 100;
    const projectId = String(row.project_id || '');
    return {
      projectId,
      coverage,
      unmapped,
      responsiblePca: pcaByProject.get(projectId) || 'Unassigned',
    };
  });

  const planFreshness = plansRows.map((row) => {
    const projectId = String(row.project_id || '');
    return {
      projectId,
      projectName: String(row.project_name || row.project_id || 'Project'),
      daysSinceUpload: ageLabel(String(row.last_upload || '')),
      responsiblePca: pcaByProject.get(projectId) || 'Unassigned',
    };
  });

  const cpiDistribution = {
    buckets: {
      high: cpiRows.filter((row) => asNumber(row.cpi) > 0.9).length,
      medium: cpiRows.filter((row) => asNumber(row.cpi) <= 0.9 && asNumber(row.cpi) >= 0.8).length,
      low: cpiRows.filter((row) => asNumber(row.cpi) < 0.8).length,
    },
    rows: cpiRows.map((row) => ({ projectId: String(row.project_id || ''), cpi: asNumber(row.cpi) })),
  };

  const response = {
    success: true,
    scope: 'pcl:command-center',
    computedAt: new Date().toISOString(),
    sections: {
      exceptionQueue,
      mappingHealth,
      planFreshness,
      cpiDistribution,
    },
    actions: {
      alerts: { href: '/api/alerts?status=open', method: 'GET' as const },
      scan: { href: '/api/alerts/scan', method: 'POST' as const },
      mapping: { href: '/shared/mapping', method: 'GET' as const },
    },
  };

  return NextResponse.json(response);
}
