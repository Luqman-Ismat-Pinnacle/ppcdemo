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

    const [unmappedHours, missingSchedule] = await Promise.all([
      pool.query(
        `SELECT id, project_id
         FROM hour_entries
         WHERE (task_id IS NULL OR task_id = '')
         ORDER BY date DESC
         LIMIT $1`,
        [Math.floor(limit / 2)],
      ),
      pool.query(
        `SELECT id, project_id
         FROM tasks
         WHERE (start_date IS NULL OR finish_date IS NULL)
         ORDER BY updated_at DESC NULLS LAST
         LIMIT $1`,
        [Math.floor(limit / 2)],
      ),
    ]);

    const issues: DataQualityIssue[] = [];
    for (const row of unmappedHours.rows) {
      issues.push({
        id: `hour_${row.id}`,
        issueType: 'unmapped_hours',
        severity: 'warning',
        title: 'Unmapped hour entry',
        detail: `Hour entry ${row.id} is missing task mapping.`,
        projectId: row.project_id || null,
        sourceTable: 'hour_entries',
        sourceColumn: 'task_id',
        suggestedAction: 'Fix in mapping',
      });
    }
    for (const row of missingSchedule.rows) {
      issues.push({
        id: `task_${row.id}`,
        issueType: 'missing_schedule_dates',
        severity: 'critical',
        title: 'Task missing schedule dates',
        detail: `Task ${row.id} is missing start/finish dates.`,
        projectId: row.project_id || null,
        sourceTable: 'tasks',
        sourceColumn: 'start_date/finish_date',
        suggestedAction: 'Fix in WBS',
      });
    }

    return NextResponse.json({ success: true, issues: issues.slice(0, limit) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
