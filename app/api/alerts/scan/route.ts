/**
 * Alert Scan API
 *
 * Runs server-side alert scanners and emits deduped alert_events.
 */

import { NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';
import { emitAlertEventIfAbsent, ensurePhase6Tables } from '@/lib/phase6-data';

export const dynamic = 'force-dynamic';

type ScanSummary = {
  scope: string;
  evaluated: number;
  created: number;
};

async function runAlertScan() {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
  }
  await ensurePhase6Tables(pool);

  const summaries: ScanSummary[] = [];

  // 1) Resource overload scan.
  const overloadRows = await pool.query(
    `SELECT
       t.employee_id AS employee_id,
       COALESCE(e.name, t.employee_id) AS employee_name,
       SUM(COALESCE(t.baseline_hours, 0)) AS allocated_hours
     FROM tasks t
     LEFT JOIN employees e ON e.id = t.employee_id OR e.employee_id = t.employee_id
     WHERE t.employee_id IS NOT NULL AND t.employee_id <> ''
     GROUP BY t.employee_id, employee_name
     HAVING SUM(COALESCE(t.baseline_hours, 0)) > 2080`,
  );
  let createdOverload = 0;
  for (const row of overloadRows.rows as Array<{ employee_id: string; employee_name: string; allocated_hours: number }>) {
    const allocated = Number(row.allocated_hours || 0);
    const created = await emitAlertEventIfAbsent(pool, {
      eventType: 'resource.overload',
      severity: 'warning',
      title: 'Employee Overallocated',
      message: `${row.employee_name} has ${Math.round(allocated)} allocated baseline hours.`,
      source: 'api/alerts/scan',
      entityType: 'employee',
      entityId: row.employee_id,
      dedupeKey: `resource-overload-${row.employee_id}`,
      metadata: { allocatedHours: allocated, threshold: 2080 },
    }, 24);
    if (created) createdOverload += 1;
  }
  summaries.push({ scope: 'resource_overload', evaluated: overloadRows.rowCount || 0, created: createdOverload });

  // 2) Unmapped hours scan by project.
  const unmappedHoursRows = await pool.query(
    `SELECT
       COALESCE(he.project_id, 'unknown') AS project_id,
       COALESCE(p.name, he.project_id, 'Unknown Project') AS project_name,
       COUNT(*)::int AS unmapped_hours_count
     FROM hour_entries he
     LEFT JOIN projects p ON p.id = he.project_id OR p.project_id = he.project_id
     WHERE he.task_id IS NULL
     GROUP BY project_id, project_name
     HAVING COUNT(*) >= 20`,
  );
  let createdUnmapped = 0;
  for (const row of unmappedHoursRows.rows as Array<{ project_id: string; project_name: string; unmapped_hours_count: number }>) {
    const created = await emitAlertEventIfAbsent(pool, {
      eventType: 'mapping.unmapped_hours',
      severity: 'warning',
      title: 'High Unmapped Hours',
      message: `${row.project_name} has ${row.unmapped_hours_count} hour entries without task mapping.`,
      source: 'api/alerts/scan',
      entityType: 'project',
      entityId: row.project_id,
      relatedProjectId: row.project_id,
      dedupeKey: `mapping-unmapped-hours-${row.project_id}`,
      metadata: { unmappedHoursCount: row.unmapped_hours_count, threshold: 20 },
    }, 24);
    if (created) createdUnmapped += 1;
  }
  summaries.push({ scope: 'mapping_unmapped_hours', evaluated: unmappedHoursRows.rowCount || 0, created: createdUnmapped });

  // 3) Stale pending mapping suggestions.
  const staleSuggestionsRows = await pool.query(
    `SELECT
       project_id,
       COUNT(*)::int AS stale_count
     FROM mapping_suggestions
     WHERE status = 'pending'
       AND created_at < NOW() - INTERVAL '3 days'
     GROUP BY project_id
     HAVING COUNT(*) > 0`,
  );
  let createdStale = 0;
  for (const row of staleSuggestionsRows.rows as Array<{ project_id: string; stale_count: number }>) {
    const created = await emitAlertEventIfAbsent(pool, {
      eventType: 'mapping.suggestions_stale',
      severity: 'info',
      title: 'Pending Suggestions Aging',
      message: `Project ${row.project_id} has ${row.stale_count} pending mapping suggestions older than 3 days.`,
      source: 'api/alerts/scan',
      entityType: 'project',
      entityId: row.project_id,
      relatedProjectId: row.project_id,
      dedupeKey: `mapping-suggestions-stale-${row.project_id}`,
      metadata: { staleCount: row.stale_count, ageDays: 3 },
    }, 24);
    if (created) createdStale += 1;
  }
  summaries.push({ scope: 'mapping_stale_suggestions', evaluated: staleSuggestionsRows.rowCount || 0, created: createdStale });

  const totalCreated = summaries.reduce((sum, s) => sum + s.created, 0);
  return NextResponse.json({ success: true, created: totalCreated, summaries });
}

function isAuthorizedSchedulerRequest(req: Request): boolean {
  const expectedToken = process.env.ALERT_SCAN_TOKEN;
  if (!expectedToken) return false;

  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearerToken && bearerToken === expectedToken) return true;

  const reqUrl = new URL(req.url);
  const queryToken = reqUrl.searchParams.get('token');
  return queryToken === expectedToken;
}

export async function GET(req: Request) {
  if (!isAuthorizedSchedulerRequest(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return await runAlertScan();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API alerts scan GET]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    return await runAlertScan();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API alerts scan]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
