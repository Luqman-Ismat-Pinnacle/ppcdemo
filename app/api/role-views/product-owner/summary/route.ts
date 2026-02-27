import { NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

type Dict = Record<string, unknown>;

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function currentPeriodKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function safeRows(pool: import('pg').Pool, sql: string, params: unknown[] = []): Promise<Dict[]> {
  try {
    const result = await pool.query(sql, params);
    return (result.rows || []) as Dict[];
  } catch {
    return [];
  }
}

function statusFromAge(hours: number, okHours: number, warnHours: number) {
  if (hours <= okHours) return 'ok';
  if (hours <= warnHours) return 'warn';
  return 'bad';
}

export async function GET() {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
  }

  const periodKey = currentPeriodKey();

  const [
    activeProjectsRows,
    activePeopleRows,
    mappingRows,
    plansCurrentRows,
    alertsRows,
    commitmentsRows,
    feedbackRows,
    roleRows,
    roleActivityRows,
    portfolioRows,
    pipelineRows,
    suggestionRows,
    qualityRows,
    anomaliesRows,
  ] = await Promise.all([
    safeRows(pool, "SELECT COUNT(*)::int AS count FROM projects WHERE COALESCE(status,'active') ILIKE 'active%'"),
    safeRows(pool, "SELECT COUNT(*)::int AS count FROM employees WHERE COALESCE(status,'active') ILIKE 'active%'"),
    safeRows(
      pool,
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE task_id IS NOT NULL)::int AS mapped
       FROM hour_entries`,
    ),
    safeRows(
      pool,
      `SELECT
         COUNT(DISTINCT p.id)::int AS total,
         COUNT(DISTINCT CASE WHEN d.uploaded_at >= NOW() - INTERVAL '14 days' THEN p.id END)::int AS current
       FROM projects p
       LEFT JOIN project_documents d ON d.project_id = p.id
       WHERE COALESCE(p.status,'active') ILIKE 'active%'`,
    ),
    safeRows(
      pool,
      `SELECT
         COUNT(*)::int AS open_alerts,
         COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical_alerts
       FROM alert_events
       WHERE COALESCE(status,'open') = 'open'`,
    ),
    safeRows(
      pool,
      `SELECT
         COUNT(*)::int AS submitted
       FROM commitments
       WHERE period_key = $1
         AND status = 'submitted'`,
      [periodKey],
    ),
    safeRows(
      pool,
      `SELECT
         id,
         item_type AS "itemType",
         title,
         severity,
         status,
         created_by_name AS "createdByName",
         created_at AS "createdAt"
       FROM feedback_items
       ORDER BY created_at DESC
       LIMIT 120`,
    ),
    safeRows(
      pool,
      `SELECT
         COALESCE(role, 'Unassigned') AS role,
         COUNT(*)::int AS users
       FROM employees
       WHERE COALESCE(status,'active') ILIKE 'active%'
       GROUP BY 1
       ORDER BY 2 DESC`,
    ),
    safeRows(
      pool,
      `SELECT
         COALESCE(role_key, 'unknown') AS role,
         MAX(created_at) AS "lastActive"
       FROM workflow_audit_log
       GROUP BY 1`,
    ),
    safeRows(
      pool,
      `SELECT
         p.id,
         p.name,
         COUNT(pr.id)::int AS projects,
         ROUND(AVG(COALESCE(ph.score, ph.health_score, 100))::numeric, 1) AS health
       FROM portfolios p
       LEFT JOIN projects pr ON pr.portfolio_id = p.id
       LEFT JOIN project_health ph ON ph.project_id = pr.id
       GROUP BY p.id, p.name
       ORDER BY p.name ASC
       LIMIT 50`,
    ),
    safeRows(
      pool,
      `SELECT
         source,
         MAX(created_at) AS "lastRun",
         COUNT(*)::int AS runs
       FROM workflow_audit_log
       WHERE event_type IN ('workday_sync','mpp_parser','alert_scan','mapping_refresh')
       GROUP BY source`,
    ),
    safeRows(
      pool,
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         ROUND(AVG(CASE WHEN status = 'pending' THEN confidence END)::numeric, 2) AS avg_conf
       FROM mapping_suggestions`,
    ),
    safeRows(
      pool,
      `SELECT
         COUNT(*)::int AS total_tasks,
         COUNT(*) FILTER (WHERE employee_id IS NOT NULL)::int AS assigned_tasks
       FROM tasks`,
    ),
    safeRows(
      pool,
      `SELECT
         t.id,
         t.name,
         t.project_id AS "projectId",
         'Task missing assignment'::text AS issue
       FROM tasks t
       WHERE t.employee_id IS NULL
       ORDER BY t.updated_at DESC NULLS LAST
       LIMIT 50`,
    ),
  ]);

  const activeProjects = asNumber(activeProjectsRows[0]?.count);
  const activePeople = asNumber(activePeopleRows[0]?.count);
  const totalHours = asNumber(mappingRows[0]?.total);
  const mappedHours = asNumber(mappingRows[0]?.mapped);
  const mappingCoverage = totalHours > 0 ? (mappedHours / totalHours) * 100 : 100;

  const plansTotal = asNumber(plansCurrentRows[0]?.total);
  const plansCurrent = asNumber(plansCurrentRows[0]?.current);
  const plansCurrentPct = plansTotal > 0 ? (plansCurrent / plansTotal) * 100 : 100;

  const openAlerts = asNumber(alertsRows[0]?.open_alerts);
  const criticalAlerts = asNumber(alertsRows[0]?.critical_alerts);

  const submittedCommitments = asNumber(commitmentsRows[0]?.submitted);
  const commitmentRate = activeProjects > 0 ? (submittedCommitments / activeProjects) * 100 : 100;

  const features = feedbackRows
    .filter((row) => String(row.itemType || '').toLowerCase() === 'feature')
    .map((row) => ({
      id: String(row.id || ''),
      title: String(row.title || 'Untitled'),
      severity: String(row.severity || 'low'),
      status: String(row.status || 'open'),
      createdByName: String(row.createdByName || 'Unknown'),
      createdAt: String(row.createdAt || ''),
    }));

  const openFeatures = features.filter((row) => {
    const status = row.status.toLowerCase();
    return status !== 'released' && status !== 'closed';
  });

  const rolesByActivity = roleRows.map((row) => {
    const roleName = String(row.role || 'Unassigned');
    const activity = roleActivityRows.find((activityRow) => String(activityRow.role || '') === roleName.toLowerCase().replace(/\s+/g, '_'));
    return {
      role: roleName,
      users: asNumber(row.users),
      lastActive: String(activity?.lastActive || ''),
      bellCount: openAlerts,
      topIssue: criticalAlerts > 0 ? 'Critical alerts pending' : 'No critical incidents',
    };
  });

  const tasksTotal = asNumber(qualityRows[0]?.total_tasks);
  const tasksAssigned = asNumber(qualityRows[0]?.assigned_tasks);
  const tasksAssignedPct = tasksTotal > 0 ? (tasksAssigned / tasksTotal) * 100 : 100;

  const dataQuality = [
    { metric: 'Mapping Coverage', current: Number(mappingCoverage.toFixed(1)), target: 85 },
    { metric: 'Projects with Active Plans', current: Number(plansCurrentPct.toFixed(1)), target: 90 },
    { metric: 'Tasks with Assignments', current: Number(tasksAssignedPct.toFixed(1)), target: 75 },
    { metric: 'Milestones Populated', current: 0, target: 60 },
    { metric: 'Hour Entries with Charge Code', current: 0, target: 95 },
  ];

  const now = Date.now();
  const pipeline = [
    {
      key: 'workday',
      label: 'Workday Sync',
      lastRunAt: '',
      ageHours: null as number | null,
      status: 'warn',
      detail: 'Run via quick action',
    },
    {
      key: 'mpp',
      label: 'MPP Parser',
      lastRunAt: '',
      ageHours: null as number | null,
      status: 'warn',
      detail: 'Tracks latest project plan parse',
    },
    {
      key: 'alerts',
      label: 'Alert Engine',
      lastRunAt: '',
      ageHours: null as number | null,
      status: 'warn',
      detail: `${openAlerts} open alerts`,
    },
    {
      key: 'mapping',
      label: 'Mapping Suggestions',
      lastRunAt: '',
      ageHours: null as number | null,
      status: 'warn',
      detail: `${asNumber(suggestionRows[0]?.pending)} pending · avg ${asNumber(suggestionRows[0]?.avg_conf).toFixed(2)}`,
    },
  ];

  for (const card of pipeline) {
    const row = pipelineRows.find((entry) => String(entry.source || '').includes(card.key));
    if (!row?.lastRun) continue;
    const timestamp = new Date(String(row.lastRun)).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const ageHours = Math.max(0, (now - timestamp) / 3600000);
    card.lastRunAt = String(row.lastRun);
    card.ageHours = ageHours;
    if (card.key === 'workday') card.status = statusFromAge(ageHours, 6, 24);
    if (card.key === 'mpp') card.status = statusFromAge(ageHours, 24, 72);
    if (card.key === 'alerts') card.status = statusFromAge(ageHours, 2, 8);
    if (card.key === 'mapping') card.status = statusFromAge(ageHours, 24, 48);
  }

  return NextResponse.json({
    success: true,
    periodKey,
    summary: {
      activeProjects,
      activePeople,
      mappingCoverage,
      plansCurrentPct,
      openAlerts,
      criticalAlerts,
      commitmentRate,
      openFeatures: openFeatures.length,
    },
    features: openFeatures.slice(0, 50),
    roles: rolesByActivity.slice(0, 12),
    pipeline,
    dataQuality,
    portfolioPulse: portfolioRows.map((row) => ({
      id: String(row.id || ''),
      name: String(row.name || 'Portfolio'),
      projects: asNumber(row.projects),
      health: asNumber(row.health),
      criticalAlerts,
    })),
    openIssues: {
      alerts: openAlerts,
      feedback: feedbackRows.slice(0, 50),
      anomalies: anomaliesRows,
    },
  });
}

