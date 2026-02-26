/**
 * @fileoverview Shared role-aware UI data adapter for header badges/tool counts.
 *
 * Centralizes lightweight count fetching so header and workstation shells use
 * one data path and avoid duplicated request logic.
 */

import type { RoleViewKey } from '@/types/role-workstation';

export type BadgeValue = number | '!' | null;

export interface RoleUiCounts {
  badges: Record<string, BadgeValue>;
  tools: Record<string, number>;
}

function parseRows(payload: unknown, key: string): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const rows = record[key];
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
}

function resolveTasks(payload: unknown): Record<string, unknown>[] {
  return parseRows(payload, 'rows');
}

function resolveAlerts(payload: unknown): Record<string, unknown>[] {
  return parseRows(payload, 'alerts');
}

function resolveCommitments(payload: unknown): Record<string, unknown>[] {
  return parseRows(payload, 'rows');
}

export async function fetchRoleUiCounts(
  role: RoleViewKey,
  actorEmail: string | undefined,
  signal?: AbortSignal,
): Promise<RoleUiCounts> {
  const headers = {
    'x-role-view': role,
    'x-actor-email': actorEmail || '',
  };

  const [alertsRes, commitmentsRes, mappingRes, tasksRes] = await Promise.all([
    fetch('/api/alerts?status=open&limit=500', { cache: 'no-store', headers, signal }),
    fetch('/api/commitments?limit=500', { cache: 'no-store', headers, signal }),
    fetch('/api/data/mapping?action=getCoverage&limit=500', { cache: 'no-store', headers, signal }),
    fetch('/api/data?table=tasks&limit=1000', { cache: 'no-store', headers, signal }),
  ]);

  const alertsPayload = await alertsRes.json().catch(() => ({}));
  const commitmentsPayload = await commitmentsRes.json().catch(() => ({}));
  const mappingPayload = await mappingRes.json().catch(() => ({}));
  const tasksPayload = await tasksRes.json().catch(() => ({}));

  const alerts = resolveAlerts(alertsPayload);
  const commitments = resolveCommitments(commitmentsPayload);
  const tasks = resolveTasks(tasksPayload);

  const unresolvedCommitments = commitments.filter((row) => {
    const status = String(row.status || '').toLowerCase();
    return status === 'submitted' || status === 'escalated';
  }).length;

  const now = Date.now();
  const overdueTasks = tasks.filter((task) => {
    const pct = Number(task.percent_complete ?? task.percentComplete ?? 0);
    const finish = String(task.finish_date || task.finishDate || '');
    return pct < 100 && finish && Number.isFinite(Date.parse(finish)) && Date.parse(finish) < now;
  }).length;

  const mappingSummary = (
    typeof mappingPayload === 'object' &&
    mappingPayload !== null &&
    'summary' in mappingPayload &&
    typeof (mappingPayload as { summary?: unknown }).summary === 'object' &&
    (mappingPayload as { summary?: unknown }).summary !== null
  )
    ? ((mappingPayload as { summary: { unmappedHours?: unknown } }).summary)
    : null;
  const mappingBacklog = Number(mappingSummary?.unmappedHours ?? 0);
  const openAlerts = alerts.length;
  const weekAheadDue = tasks.filter((task) => {
    const finish = String(task.finish_date || task.finishDate || '');
    if (!finish || !Number.isFinite(Date.parse(finish))) return false;
    const finishMs = Date.parse(finish);
    return finishMs >= now && finishMs <= now + 7 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    badges: {
      pcl_exceptions: openAlerts > 0 ? openAlerts : null,
      pca_mapping: mappingBacklog > 0 ? mappingBacklog : null,
      pl_report: overdueTasks > 0 ? '!' : null,
      pl_due: weekAheadDue > 0 ? weekAheadDue : null,
      coo_commitments: unresolvedCommitments > 0 ? unresolvedCommitments : null,
      sm_commitments: unresolvedCommitments > 0 ? unresolvedCommitments : null,
      rda_overdue: overdueTasks > 0 ? overdueTasks : null,
    },
    tools: {
      alerts: openAlerts,
      commitments: unresolvedCommitments,
      overdueTasks,
      mappingBacklog,
      weekAheadDue,
    },
  };
}
