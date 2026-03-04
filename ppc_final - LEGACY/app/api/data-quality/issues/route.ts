/**
 * @fileoverview Data quality issue API for PCA triage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';
import { hasRolePermission, roleContextFromRequest } from '@/lib/api-role-guard';

export const dynamic = 'force-dynamic';

type DataQualityIssue = {
  id: string;
  issueType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  projectId: string | null;
  sourceTable: string;
  sourceColumn: string | null;
  suggestedAction: string;
};

export async function GET(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'editMapping')) {
      return NextResponse.json({ success: false, error: 'Forbidden for active role view' }, { status: 403 });
    }

    const pool = getPool();
    if (!pool) return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(500, Number(searchParams.get('limit') || 200));
    const projectId = String(searchParams.get('projectId') || '').trim();
    const severityFilter = String(searchParams.get('severity') || '').trim().toLowerCase();

    const safeQuery = async (sql: string, params: unknown[]) => {
      try {
        return await pool.query(sql, params);
      } catch {
        return { rows: [] } as { rows: Record<string, unknown>[] };
      }
    };

    const [hourEntries, tasks] = await Promise.all([
      safeQuery(
        `SELECT *
         FROM hour_entries
         LIMIT $1`,
        [Math.floor(limit / 2)],
      ),
      safeQuery(
        `SELECT *
         FROM tasks
         LIMIT $1`,
        [Math.floor(limit / 2)],
      ),
    ]);

    const issues: DataQualityIssue[] = [];
    for (const row of hourEntries.rows) {
      const rec = row as Record<string, unknown>;
      const taskId = String(rec.task_id ?? rec.taskId ?? '').trim();
      if (taskId) continue;
      const id = String(rec.id ?? rec.entry_id ?? rec.hour_id ?? Math.random().toString(36).slice(2, 8));
      const project = String(rec.project_id ?? rec.projectId ?? '') || null;
      issues.push({
        id: `hour_${id}`,
        issueType: 'unmapped_hours',
        severity: 'warning',
        title: 'Unmapped hour entry',
        detail: `Hour entry ${id} is missing task mapping.`,
        projectId: project,
        sourceTable: 'hour_entries',
        sourceColumn: 'task_id',
        suggestedAction: 'Fix in mapping',
      });
    }
    for (const row of tasks.rows) {
      const rec = row as Record<string, unknown>;
      const hasStart = Boolean(rec.start_date ?? rec.startDate);
      const hasFinish = Boolean(rec.finish_date ?? rec.finishDate ?? rec.end_date ?? rec.endDate);
      if (hasStart && hasFinish) continue;
      const id = String(rec.id ?? rec.task_id ?? rec.taskId ?? Math.random().toString(36).slice(2, 8));
      const project = String(rec.project_id ?? rec.projectId ?? '') || null;
      issues.push({
        id: `task_${id}`,
        issueType: 'missing_schedule_dates',
        severity: 'critical',
        title: 'Task missing schedule dates',
        detail: `Task ${id} is missing start/finish dates.`,
        projectId: project,
        sourceTable: 'tasks',
        sourceColumn: 'start_date/finish_date',
        suggestedAction: 'Fix in WBS',
      });
    }

    const filteredByProject = projectId
      ? issues.filter((issue) => String(issue.projectId || '') === projectId)
      : issues;

    const filteredBySeverity = severityFilter
      ? filteredByProject.filter((issue) => issue.severity === severityFilter)
      : filteredByProject;

    const summary = {
      unmappedHours: issues.filter((issue) => issue.issueType === 'unmapped_hours').length,
      missingScheduleDates: issues.filter((issue) => issue.issueType === 'missing_schedule_dates').length,
      critical: issues.filter((issue) => issue.severity === 'critical').length,
      warning: issues.filter((issue) => issue.severity === 'warning').length,
      info: issues.filter((issue) => issue.severity === 'info').length,
      total: issues.length,
    };

    const trend = Array.from({ length: 8 }).map((_, index) => {
      const weekDate = new Date();
      weekDate.setDate(weekDate.getDate() - ((7 - index) * 7));
      const weekKey = `${weekDate.getUTCFullYear()}-W${String(Math.ceil((((weekDate.getTime() - Date.UTC(weekDate.getUTCFullYear(), 0, 1)) / 86400000) + 1) / 7)).padStart(2, '0')}`;
      const isLatest = index === 7;
      return {
        weekKey,
        unmappedHours: isLatest ? summary.unmappedHours : 0,
        ghostProgress: 0,
        stalledTasks: 0,
        pastDueTasks: isLatest ? summary.missingScheduleDates : 0,
        totalIssues: isLatest ? summary.total : 0,
      };
    });

    return NextResponse.json({
      success: true,
      issues: filteredBySeverity.slice(0, limit),
      summary,
      trend,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
