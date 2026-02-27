import { NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';
import { asNumber, ageLabel } from '@/lib/role-summary-db';

export const dynamic = 'force-dynamic';

type Dict = Record<string, unknown>;

async function safeRows(pool: import('pg').Pool, sql: string, params: unknown[] = []): Promise<Dict[]> {
  try {
    const result = await pool.query(sql, params);
    return (result.rows || []) as Dict[];
  } catch {
    return [];
  }
}

function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function statusFromAge(label: string): 'ok' | 'warn' | 'bad' {
  if (label.includes('m ago') || label.includes('h ago')) return 'ok';
  if (label.includes('1d ago') || label.includes('2d ago')) return 'warn';
  return 'bad';
}

export async function GET() {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
  }

  const periodKey = currentPeriodKey();
  const [
    projectsRows,
    mappingRows,
    alertsRows,
    peopleRows,
    commitmentsRows,
    feedbackRows,
    pipelineRows,
    activityRows,
    qualityRows,
  ] = await Promise.all([
    safeRows(pool, "SELECT COUNT(*)::int AS count FROM projects WHERE COALESCE(status,'active') ILIKE 'active%'"),
    safeRows(pool, "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE task_id IS NOT NULL)::int AS mapped FROM hour_entries"),
    safeRows(pool, "SELECT COUNT(*)::int AS open_alerts FROM alert_events WHERE COALESCE(status,'open')='open'"),
    safeRows(pool, "SELECT COUNT(*)::int AS people FROM employees WHERE COALESCE(status,'active') ILIKE 'active%'"),
    safeRows(pool, "SELECT COUNT(*)::int AS submitted FROM commitments WHERE period_key = $1 AND status='submitted'", [periodKey]),
    safeRows(pool, "SELECT id, title, status, severity, created_by_name AS created_by, created_at, item_type FROM feedback_items ORDER BY created_at DESC LIMIT 80"),
    safeRows(
      pool,
      `SELECT source, MAX(created_at) AS last_run
       FROM workflow_audit_log
       WHERE event_type IN ('workday_sync','mpp_parser','alert_scan','mapping_refresh')
       GROUP BY source`,
    ),
    safeRows(
      pool,
      `SELECT COALESCE(role_key,'unknown') AS role_key, MAX(created_at) AS last_active, COUNT(*)::int AS queue_count
       FROM workflow_audit_log
       GROUP BY role_key
       ORDER BY queue_count DESC
       LIMIT 20`,
    ),
    safeRows(
      pool,
      `SELECT
         COUNT(*) FILTER (WHERE employee_id IS NOT NULL)::int AS assigned_tasks,
         COUNT(*)::int AS total_tasks,
         COUNT(*) FILTER (WHERE charge_code_v2 IS NOT NULL AND charge_code_v2 <> '')::int AS coded_hours,
         (SELECT COUNT(*)::int FROM hour_entries) AS total_hours
       FROM tasks`,
    ),
  ]);

  const activeProjects = asNumber(projectsRows[0]?.count);
  const totalHours = asNumber(mappingRows[0]?.total);
  const mappedHours = asNumber(mappingRows[0]?.mapped);
  const mappingCoverage = totalHours > 0 ? Math.round((mappedHours / totalHours) * 100) : 100;
  const openAlerts = asNumber(alertsRows[0]?.open_alerts);
  const peopleActiveToday = asNumber(peopleRows[0]?.people);
  const commitmentCompliance = activeProjects > 0 ? Math.round((asNumber(commitmentsRows[0]?.submitted) / activeProjects) * 100) : 100;

  const pipelineMap = new Map(
    pipelineRows.map((row) => [String(row.source || ''), String(row.last_run || '')]),
  );
  const workdayLabel = ageLabel(pipelineMap.get('api/workday') || pipelineMap.get('workday') || '');
  const parserLabel = ageLabel(pipelineMap.get('api/documents/process-mpp') || pipelineMap.get('mpp') || '');
  const alertLabel = ageLabel(pipelineMap.get('api/alerts/scan') || pipelineMap.get('alerts') || '');
  const mappingLabel = ageLabel(pipelineMap.get('api/data/mapping') || pipelineMap.get('mapping') || '');

  const pipelineStatus = [
    { key: 'workday', label: 'Workday Sync', ageLabel: workdayLabel, status: statusFromAge(workdayLabel), summary: `${mappedHours} mapped entries` },
    { key: 'mpp', label: 'MPP Parser', ageLabel: parserLabel, status: statusFromAge(parserLabel), summary: 'Plan parser status' },
    { key: 'alerts', label: 'Alert Engine', ageLabel: alertLabel, status: statusFromAge(alertLabel), summary: `${openAlerts} open alerts` },
    { key: 'mapping', label: 'Mapping Suggestions', ageLabel: mappingLabel, status: statusFromAge(mappingLabel), summary: `${mappingCoverage}% coverage` },
  ];

  const quality = qualityRows[0] || {};
  const totalTasks = asNumber(quality.total_tasks);
  const assignedTasks = asNumber(quality.assigned_tasks);
  const totalHoursAll = asNumber(quality.total_hours);
  const codedHours = asNumber(quality.coded_hours);
  const tasksAssignedPct = totalTasks > 0 ? Math.round((assignedTasks / totalTasks) * 100) : 0;
  const chargeCodePct = totalHoursAll > 0 ? Math.round((codedHours / totalHoursAll) * 100) : 0;

  const roleActivity = activityRows.map((row) => ({
    role: String(row.role_key || 'unknown'),
    users: 1,
    lastActive: ageLabel(String(row.last_active || '')),
    queueCount: asNumber(row.queue_count),
    topIssue: openAlerts > 0 ? 'Open alerts pending' : 'No active queue issues',
  }));

  const openFeatures = feedbackRows
    .filter((row) => String(row.item_type || '').toLowerCase() === 'feature')
    .filter((row) => {
      const status = String(row.status || '').toLowerCase();
      return status !== 'released' && status !== 'closed';
    })
    .map((row) => ({
      id: String(row.id || ''),
      title: String(row.title || 'Untitled'),
      severity: String(row.severity || 'low'),
      status: String(row.status || 'open'),
      createdBy: String(row.created_by || 'Unknown'),
      createdAt: String(row.created_at || ''),
    }));

  return NextResponse.json({
    success: true,
    scope: 'product-owner:command-center',
    computedAt: new Date().toISOString(),
    sections: {
      vitalSigns: {
        activeProjects,
        mappingCoverage,
        pipelineFreshness: pipelineStatus.every((item) => item.status === 'ok') ? 'Healthy' : pipelineStatus.some((item) => item.status === 'bad') ? 'Failed/Stale' : 'Degraded',
        openAlerts,
        commitmentCompliance,
        peopleActiveToday,
      },
      pipelineStatus,
      dataQuality: [
        { name: 'Mapping Coverage', value: mappingCoverage, target: 85 },
        { name: 'Projects with Active Plans', value: 0, target: 90, note: 'Requires reliable project_documents upload timestamps.' },
        { name: 'Tasks with Assignments', value: tasksAssignedPct, target: 75 },
        { name: 'Milestones Populated', value: 0, target: 60, note: 'Milestone population metric requires consistent milestone ownership keys.' },
        { name: 'Hour Entries with Charge Code', value: chargeCodePct, target: 95 },
      ],
      roleActivity,
      issues: {
        systemAlerts: openAlerts,
        userFeedback: feedbackRows.slice(0, 20).map((row) => ({
          id: String(row.id || ''),
          title: String(row.title || ''),
          status: String(row.status || 'open'),
          type: String(row.item_type || 'feedback'),
        })),
        openFeatures,
      },
    },
    warnings: [
      'Plan freshness and milestone population rely on incomplete source fields in current schema; showing explicit unavailable placeholders.',
    ],
    actions: {
      workdaySync: { href: '/api/workday', method: 'POST' as const },
      alertScan: { href: '/api/alerts/scan', method: 'POST' as const },
      dataManagement: { href: '/project-controls/data-management', method: 'GET' as const },
    },
  });
}
