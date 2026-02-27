/**
 * @fileoverview Shared DB helpers for role command-center summary endpoints.
 */

import { getPool } from '@/lib/postgres';

export type Dict = Record<string, unknown>;

export function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function safeRows(sql: string, params: unknown[] = []): Promise<Dict[]> {
  const pool = getPool();
  if (!pool) return [];
  try {
    const result = await pool.query(sql, params);
    return (result.rows || []) as Dict[];
  } catch {
    return [];
  }
}

export async function basePortfolioSummary() {
  const [projects, alerts, tasks, commitments, mapping] = await Promise.all([
    safeRows("SELECT COUNT(*)::int AS count FROM projects WHERE COALESCE(status,'active') ILIKE 'active%'"),
    safeRows("SELECT COUNT(*)::int AS open_alerts, COUNT(*) FILTER (WHERE severity='critical')::int AS critical_alerts FROM alert_events WHERE COALESCE(status,'open')='open'"),
    safeRows("SELECT COUNT(*)::int AS total_tasks, COUNT(*) FILTER (WHERE COALESCE(percent_complete,0) < 100 AND finish_date::date < CURRENT_DATE)::int AS overdue_tasks FROM tasks"),
    safeRows("SELECT COUNT(*)::int AS open_commitments FROM commitments WHERE status IN ('submitted','escalated','open')"),
    safeRows("SELECT COUNT(*)::int AS total_hours, COUNT(*) FILTER (WHERE task_id IS NOT NULL)::int AS mapped_hours FROM hour_entries"),
  ]);

  const activeProjects = asNumber(projects[0]?.count);
  const openAlerts = asNumber(alerts[0]?.open_alerts);
  const criticalAlerts = asNumber(alerts[0]?.critical_alerts);
  const totalTasks = asNumber(tasks[0]?.total_tasks);
  const overdueTasks = asNumber(tasks[0]?.overdue_tasks);
  const openCommitments = asNumber(commitments[0]?.open_commitments);
  const totalHours = asNumber(mapping[0]?.total_hours);
  const mappedHours = asNumber(mapping[0]?.mapped_hours);
  const mappingCoverage = totalHours > 0 ? (mappedHours / totalHours) * 100 : 100;

  return {
    activeProjects,
    openAlerts,
    criticalAlerts,
    totalTasks,
    overdueTasks,
    openCommitments,
    mappingCoverage,
    computedAt: new Date().toISOString(),
  };
}
