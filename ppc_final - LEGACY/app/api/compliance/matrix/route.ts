/**
 * @fileoverview PCL compliance matrix aggregation API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';
import { hasRolePermission, roleContextFromRequest } from '@/lib/api-role-guard';

export const dynamic = 'force-dynamic';

type ComplianceRow = {
  projectId: string;
  projectName: string;
  openIssues: number;
  overdueTasks: number;
  healthScore: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export async function GET(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'viewPortfolioCompliance')) {
      return NextResponse.json({ success: false, error: 'Forbidden for active role view' }, { status: 403 });
    }

    const pool = getPool();
    if (!pool) return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(300, Number(searchParams.get('limit') || 80));

    const safeQuery = async (sql: string) => {
      try {
        return await pool.query(sql);
      } catch {
        return { rows: [] } as { rows: Record<string, unknown>[] };
      }
    };

    const [projectsResult, tasksResult] = await Promise.all([
      safeQuery(`SELECT * FROM projects LIMIT ${limit}`),
      safeQuery(`SELECT * FROM tasks LIMIT 2000`),
    ]);

    const tasksByProject = new Map<string, Record<string, unknown>[]>();
    for (const taskRaw of tasksResult.rows || []) {
      const task = asRecord(taskRaw);
      const projectId = String(task.project_id ?? task.projectId ?? '');
      if (!projectId) continue;
      const list = tasksByProject.get(projectId) || [];
      list.push(task);
      tasksByProject.set(projectId, list);
    }

    const now = Date.now();
    const rows: ComplianceRow[] = (projectsResult.rows || []).map((projectRaw) => {
      const project = asRecord(projectRaw);
      const projectId = String(project.id ?? project.projectId ?? '');
      const projectName = String((project.name ?? project.projectName ?? projectId) || 'Project');
      const tasks = tasksByProject.get(projectId) || [];

      let openIssues = 0;
      let overdueTasks = 0;
      for (const task of tasks) {
        const progress = Number(task.percent_complete ?? task.percentComplete ?? 0);
        const start = task.start_date ?? task.startDate;
        const finish = task.finish_date ?? task.finishDate ?? task.end_date ?? task.endDate;
        if (!start || !finish) openIssues += 1;
        const finishDate = finish ? new Date(String(finish)) : null;
        if ((Number.isFinite(progress) ? progress < 100 : true) && finishDate && Number.isFinite(finishDate.getTime()) && finishDate.getTime() < now) {
          overdueTasks += 1;
        }
      }

      const healthScore = Math.max(0, 100 - (openIssues * 10) - (overdueTasks * 2));
      return { projectId, projectName, openIssues, overdueTasks, healthScore };
    });

    rows.sort((a, b) => (b.openIssues - a.openIssues) || (b.overdueTasks - a.overdueTasks));
    return NextResponse.json({ success: true, rows: rows.slice(0, limit) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
