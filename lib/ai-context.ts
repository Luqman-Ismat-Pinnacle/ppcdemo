/**
 * @fileoverview Role-scoped AI context builders.
 *
 * Each builder returns concise runtime context for prompt grounding.
 */

import { getPool } from '@/lib/postgres';

export type SupportedAiRole = 'coo' | 'senior_manager' | 'project_lead' | 'pcl' | 'pca' | 'rda' | 'product_owner';

type CtxInput = {
  employeeId?: string | null;
};

async function readCounts() {
  const pool = getPool();
  if (!pool) {
    return {
      projects: 0,
      openAlerts: 0,
      overdueTasks: 0,
      openCommitments: 0,
      unmappedHours: 0,
    };
  }

  const [projects, alerts, overdueTasks, commitments, unmappedHours] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM projects').catch(() => ({ rows: [{ count: 0 }] })),
    pool.query("SELECT COUNT(*)::int AS count FROM alert_events WHERE status = 'open'").catch(() => ({ rows: [{ count: 0 }] })),
    pool.query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE COALESCE(percent_complete, 0) < 100 AND finish_date::date < CURRENT_DATE",
    ).catch(() => ({ rows: [{ count: 0 }] })),
    pool.query("SELECT COUNT(*)::int AS count FROM commitments WHERE status IN ('submitted','escalated')").catch(() => ({ rows: [{ count: 0 }] })),
    pool.query('SELECT COALESCE(SUM(CASE WHEN task_id IS NULL THEN total_hours ELSE 0 END),0)::float AS total FROM hour_entries').catch(() => ({ rows: [{ total: 0 }] })),
  ]);

  return {
    projects: Number(projects.rows?.[0]?.count || 0),
    openAlerts: Number(alerts.rows?.[0]?.count || 0),
    overdueTasks: Number(overdueTasks.rows?.[0]?.count || 0),
    openCommitments: Number(commitments.rows?.[0]?.count || 0),
    unmappedHours: Number(unmappedHours.rows?.[0]?.total || 0),
  };
}

export async function buildCOOContext(): Promise<string> {
  const c = await readCounts();
  return `COO scope: ${c.projects} projects, ${c.openAlerts} open alerts, ${c.overdueTasks} overdue tasks, ${c.openCommitments} unresolved commitments.`;
}

export async function buildSMContext(): Promise<string> {
  const c = await readCounts();
  return `Senior Manager scope: ${c.projects} projects in portfolio, ${c.openAlerts} open alerts, ${c.openCommitments} commitments awaiting decision.`;
}

export async function buildPLContext(input?: CtxInput): Promise<string> {
  const c = await readCounts();
  const owner = input?.employeeId ? `employee ${input.employeeId}` : 'active project lead';
  return `Project Lead scope (${owner}): ${c.overdueTasks} overdue tasks and ${c.openCommitments} commitment decisions pending.`;
}

export async function buildPCLContext(): Promise<string> {
  const c = await readCounts();
  return `PCL scope: ${c.openAlerts} open exceptions, ${c.overdueTasks} overdue tasks, ${c.unmappedHours.toFixed(1)} unmapped hours.`;
}

export async function buildPCAContext(): Promise<string> {
  const c = await readCounts();
  return `PCA scope: ${c.unmappedHours.toFixed(1)} unmapped hours and ${c.openAlerts} active data-quality/exception alerts.`;
}

export async function buildRDAContext(input?: CtxInput): Promise<string> {
  const actor = input?.employeeId ? `for ${input.employeeId}` : 'for active assignee';
  const c = await readCounts();
  return `RDA scope ${actor}: ${c.overdueTasks} overdue items and ${c.openAlerts} open blockers in queue.`;
}

export async function buildPOContext(): Promise<string> {
  const c = await readCounts();
  return `Product Owner scope: ${c.projects} projects, ${c.openAlerts} open alerts, ${c.openCommitments} unresolved commitments, ${c.unmappedHours.toFixed(1)} unmapped hours.`;
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
