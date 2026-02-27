/**
 * @fileoverview Role-scoped AI context builders.
 *
 * Builders are intentionally concise and deterministic so that every role gets
 * metrics relevant to their operational scope, without leaking unrelated data.
 */

import { getPool } from '@/lib/postgres';

export type SupportedAiRole =
  | 'coo'
  | 'senior_manager'
  | 'project_lead'
  | 'pcl'
  | 'pca'
  | 'rda'
  | 'product_owner';

type CtxInput = {
  employeeId?: string | null;
};

type CtxBase = {
  activeProjects: number;
  openAlerts: number;
  criticalAlerts: number;
  overdueTasks: number;
  openCommitments: number;
  unmappedHours: number;
  mappingPending: number;
};

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeEmployeeId(input?: string | null): string | null {
  const trimmed = String(input || '').trim();
  return trimmed || null;
}

async function safeNumber(sql: string, params: unknown[] = []): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  try {
    const result = await pool.query(sql, params);
    return asNumber(result.rows?.[0]?.value);
  } catch {
    return 0;
  }
}

async function readBaseContext(): Promise<CtxBase> {
  const [
    activeProjects,
    openAlerts,
    criticalAlerts,
    overdueTasks,
    openCommitments,
    unmappedHours,
    mappingPending,
  ] = await Promise.all([
    safeNumber("SELECT COUNT(*)::int AS value FROM projects WHERE COALESCE(status, 'active') ILIKE 'active%'"),
    safeNumber("SELECT COUNT(*)::int AS value FROM alert_events WHERE COALESCE(status,'open') = 'open'"),
    safeNumber("SELECT COUNT(*)::int AS value FROM alert_events WHERE COALESCE(status,'open') = 'open' AND COALESCE(severity,'') = 'critical'"),
    safeNumber("SELECT COUNT(*)::int AS value FROM tasks WHERE COALESCE(percent_complete, 0) < 100 AND finish_date::date < CURRENT_DATE"),
    safeNumber("SELECT COUNT(*)::int AS value FROM commitments WHERE status IN ('submitted','escalated','open')"),
    safeNumber('SELECT COALESCE(SUM(CASE WHEN task_id IS NULL THEN total_hours ELSE 0 END), 0)::float AS value FROM hour_entries'),
    safeNumber("SELECT COUNT(*)::int AS value FROM mapping_suggestions WHERE status = 'pending'"),
  ]);

  return {
    activeProjects,
    openAlerts,
    criticalAlerts,
    overdueTasks,
    openCommitments,
    unmappedHours,
    mappingPending,
  };
}

async function readEmployeeScoped(employeeId: string): Promise<{ assignedOpenTasks: number; assignedOverdueTasks: number; assignedHoursWeek: number }> {
  const [assignedOpenTasks, assignedOverdueTasks, assignedHoursWeek] = await Promise.all([
    safeNumber(
      "SELECT COUNT(*)::int AS value FROM tasks WHERE employee_id::text = $1 AND COALESCE(percent_complete, 0) < 100",
      [employeeId],
    ),
    safeNumber(
      "SELECT COUNT(*)::int AS value FROM tasks WHERE employee_id::text = $1 AND COALESCE(percent_complete, 0) < 100 AND finish_date::date < CURRENT_DATE",
      [employeeId],
    ),
    safeNumber(
      "SELECT COALESCE(SUM(total_hours),0)::float AS value FROM hour_entries WHERE employee_id::text = $1 AND COALESCE(work_date::date, CURRENT_DATE) >= CURRENT_DATE - INTERVAL '7 days'",
      [employeeId],
    ),
  ]);

  return { assignedOpenTasks, assignedOverdueTasks, assignedHoursWeek };
}

function appendChecksum(role: string, lines: string[]): string[] {
  const debugEnabled =
    process.env.NODE_ENV !== 'production' &&
    String(process.env.AI_CONTEXT_DEBUG || '').toLowerCase() === 'true';
  if (!debugEnabled) return lines;

  const checksum = lines
    .join('|')
    .split('')
    .reduce((acc, ch) => (acc + ch.charCodeAt(0)) % 100000, 0);
  return [...lines, `debug_checksum=${role}:${checksum}`];
}

export async function buildCOOContext(): Promise<string> {
  const base = await readBaseContext();
  const lines = [
    `role=COO`,
    `active_projects=${base.activeProjects}`,
    `open_alerts=${base.openAlerts}`,
    `critical_alerts=${base.criticalAlerts}`,
    `overdue_tasks=${base.overdueTasks}`,
    `open_commitments=${base.openCommitments}`,
    `mapping_pending=${base.mappingPending}`,
  ];
  return appendChecksum('coo', lines).join(' | ');
}

export async function buildSMContext(): Promise<string> {
  const base = await readBaseContext();
  const lines = [
    `role=Senior Manager`,
    `portfolio_projects=${base.activeProjects}`,
    `open_alerts=${base.openAlerts}`,
    `critical_alerts=${base.criticalAlerts}`,
    `open_commitments=${base.openCommitments}`,
    `overdue_tasks=${base.overdueTasks}`,
  ];
  return appendChecksum('senior_manager', lines).join(' | ');
}

export async function buildPLContext(input?: CtxInput): Promise<string> {
  const base = await readBaseContext();
  const employeeId = normalizeEmployeeId(input?.employeeId);
  const employeeScoped = employeeId
    ? await readEmployeeScoped(employeeId)
    : { assignedOpenTasks: 0, assignedOverdueTasks: 0, assignedHoursWeek: 0 };

  const lines = [
    `role=Project Lead`,
    `employee_scope=${employeeId || 'none'}`,
    `assigned_open_tasks=${employeeScoped.assignedOpenTasks}`,
    `assigned_overdue_tasks=${employeeScoped.assignedOverdueTasks}`,
    `hours_last_7d=${employeeScoped.assignedHoursWeek.toFixed(1)}`,
    `open_commitments=${base.openCommitments}`,
    `open_alerts=${base.openAlerts}`,
  ];
  return appendChecksum('project_lead', lines).join(' | ');
}

export async function buildPCLContext(): Promise<string> {
  const base = await readBaseContext();
  const lines = [
    `role=PCL`,
    `open_exceptions=${base.openAlerts}`,
    `critical_exceptions=${base.criticalAlerts}`,
    `overdue_tasks=${base.overdueTasks}`,
    `mapping_pending=${base.mappingPending}`,
    `unmapped_hours=${base.unmappedHours.toFixed(1)}`,
  ];
  return appendChecksum('pcl', lines).join(' | ');
}

export async function buildPCAContext(): Promise<string> {
  const base = await readBaseContext();
  const lines = [
    `role=PCA`,
    `mapping_pending=${base.mappingPending}`,
    `unmapped_hours=${base.unmappedHours.toFixed(1)}`,
    `open_alerts=${base.openAlerts}`,
    `critical_alerts=${base.criticalAlerts}`,
  ];
  return appendChecksum('pca', lines).join(' | ');
}

export async function buildRDAContext(input?: CtxInput): Promise<string> {
  const employeeId = normalizeEmployeeId(input?.employeeId);
  const employeeScoped = employeeId
    ? await readEmployeeScoped(employeeId)
    : { assignedOpenTasks: 0, assignedOverdueTasks: 0, assignedHoursWeek: 0 };
  const lines = [
    `role=RDA`,
    `employee_scope=${employeeId || 'none'}`,
    `assigned_open_tasks=${employeeScoped.assignedOpenTasks}`,
    `assigned_overdue_tasks=${employeeScoped.assignedOverdueTasks}`,
    `hours_last_7d=${employeeScoped.assignedHoursWeek.toFixed(1)}`,
  ];
  return appendChecksum('rda', lines).join(' | ');
}

export async function buildPOContext(): Promise<string> {
  const base = await readBaseContext();
  const lines = [
    `role=Product Owner`,
    `active_projects=${base.activeProjects}`,
    `open_alerts=${base.openAlerts}`,
    `critical_alerts=${base.criticalAlerts}`,
    `open_commitments=${base.openCommitments}`,
    `mapping_pending=${base.mappingPending}`,
    `unmapped_hours=${base.unmappedHours.toFixed(1)}`,
  ];
  return appendChecksum('product_owner', lines).join(' | ');
}

export async function buildRoleContext(role: string, input?: CtxInput): Promise<string> {
  switch (role) {
    case 'coo':
      return buildCOOContext();
    case 'senior_manager':
      return buildSMContext();
    case 'project_lead':
      return buildPLContext(input);
    case 'pcl':
      return buildPCLContext();
    case 'pca':
      return buildPCAContext();
    case 'rda':
      return buildRDAContext(input);
    case 'product_owner':
      return buildPOContext();
    default:
      return buildCOOContext();
  }
}
