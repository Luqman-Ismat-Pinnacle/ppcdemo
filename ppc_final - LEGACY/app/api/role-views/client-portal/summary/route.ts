import { NextResponse } from 'next/server';
import { safeRows, asNumber } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [projectRows, milestoneRows, docRows] = await Promise.all([
    safeRows(
      `SELECT p.id, COALESCE(p.name, p.id::text) AS name, COALESCE(ph.percent_complete, 0)::float AS percent_complete
       FROM projects p
       LEFT JOIN project_health ph ON ph.project_id = p.id
       WHERE COALESCE(p.status,'active') ILIKE 'active%'
       ORDER BY p.updated_at DESC NULLS LAST
       LIMIT 1`,
    ),
    safeRows(
      `SELECT id, COALESCE(milestone_name, name, id::text) AS name, status, planned_date, actual_date
       FROM milestones
       WHERE COALESCE(is_client_visible, false) = true
       ORDER BY planned_date ASC NULLS LAST
       LIMIT 30`,
    ),
    safeRows(
      `SELECT id, COALESCE(file_name, document_name, id::text) AS name, status, updated_at
       FROM project_documents
       WHERE COALESCE(status,'') IN ('customer_signed_off','in_review')
       ORDER BY updated_at DESC NULLS LAST
       LIMIT 20`,
    ),
  ]);

  const project = projectRows[0] || {};
  const milestones = milestoneRows.map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    status: String(row.status || 'upcoming'),
    plannedDate: String(row.planned_date || ''),
    actualDate: String(row.actual_date || ''),
  }));
  const deliverables = docRows.map((row) => ({
    id: String(row.id || ''),
    name: String(row.name || ''),
    status: String(row.status || ''),
    updatedAt: String(row.updated_at || ''),
  }));

  return NextResponse.json({
    success: true,
    scope: 'client-portal:command-center',
    computedAt: new Date().toISOString(),
    sections: {
      projectStatus: {
        projectId: String(project.id || ''),
        projectName: String(project.name || 'Project'),
        plainStatus: asNumber(project.percent_complete) >= 80 ? 'On Track' : asNumber(project.percent_complete) >= 50 ? 'Minor Delays' : 'Requires Attention',
        percentComplete: asNumber(project.percent_complete),
        scheduleStatus: 'See milestones and progress pages for detailed schedule status.',
      },
      milestones,
      deliverables,
      upcomingWork: milestones.slice(0, 3).map((row) => `${row.name} planned ${row.plannedDate || 'TBD'}`),
    },
    warnings: milestones.length ? [] : ['No milestones flagged is_client_visible=true are available.'],
    actions: {
      wbs: { href: '/role-views/client-portal/wbs', method: 'GET' as const },
      progress: { href: '/role-views/client-portal/progress', method: 'GET' as const },
    },
  });
}
