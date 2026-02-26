'use client';

/**
 * @fileoverview PCL command center workstation page.
 */

import React, { useEffect, useMemo, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';
import ComplianceMatrix, { type ComplianceMatrixRow } from '@/components/role-workstations/ComplianceMatrix';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import type { ExceptionRow } from '@/types/role-workstation';

export default function PclHomePage() {
  const [rows, setRows] = useState<ComplianceMatrixRow[]>([]);
  const [alerts, setAlerts] = useState<ExceptionRow[]>([]);
  const [queueMessage, setQueueMessage] = useState('');
  const { activeRole } = useRoleView();
  const { user } = useUser();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await fetch('/api/compliance/matrix?limit=20', {
        cache: 'no-store',
        headers: {
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && payload.success) {
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [activeRole.key, user?.email]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await fetch('/api/alerts?status=open&limit=20', {
        cache: 'no-store',
        headers: {
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && payload.success) {
        setAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [activeRole.key, user?.email]);

  const summary = useMemo(() => {
    const projects = rows.length;
    const openIssues = rows.reduce((sum, row) => sum + Number(row.openIssues || 0), 0);
    const overdue = rows.reduce((sum, row) => sum + Number(row.overdueTasks || 0), 0);
    const atRisk = rows.filter((row) => Number(row.healthScore || 0) < 60).length;
    return { projects, openIssues, overdue, atRisk };
  }, [rows]);

  const exceptionSummary = useMemo(() => ({
    total: alerts.length,
    critical: alerts.filter((alert) => alert.severity === 'critical').length,
    warning: alerts.filter((alert) => alert.severity === 'warning').length,
  }), [alerts]);

  const refreshAlerts = async () => {
    const res = await fetch('/api/alerts?status=open&limit=20', {
      cache: 'no-store',
      headers: {
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
    });
    const payload = await res.json().catch(() => ({}));
    if (res.ok && payload.success) {
      setAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
    }
  };

  const acknowledgeAlert = async (id: number) => {
    setQueueMessage('');
    const res = await fetch('/api/alerts', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
      body: JSON.stringify({
        ids: [id],
        status: 'acknowledged',
        acknowledgedBy: user?.email || 'pcl-command-center',
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload.success) {
      setQueueMessage(String(payload.error || 'Acknowledge failed'));
      return;
    }
    setQueueMessage(`Acknowledged alert #${id}.`);
    await refreshAlerts();
  };

  const escalateAlert = async (alert: ExceptionRow) => {
    setQueueMessage('');
    const create = await fetch('/api/alerts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
      body: JSON.stringify({
        eventType: 'exception.escalated',
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        title: `Escalated: ${alert.title}`,
        message: alert.message,
        source: 'role-views/pcl',
        entityType: 'alert_events',
        entityId: String(alert.id),
        relatedProjectId: alert.relatedProjectId,
      }),
    });
    const createPayload = await create.json().catch(() => ({}));
    if (!create.ok || !createPayload.success) {
      setQueueMessage(String(createPayload.error || 'Escalation failed'));
      return;
    }
    await acknowledgeAlert(alert.id);
    setQueueMessage(`Escalated alert #${alert.id}.`);
  };

  return (
    <RoleWorkstationShell
      role="pcl"
      requiredTier="tier1"
      title="PCL Command Center"
      subtitle="Compliance posture, schedule exceptions, and portfolio intervention queue."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Exceptions', href: '/role-views/pcl/exceptions', permission: 'triageExceptions' },
            { label: 'Plans + Mapping', href: '/role-views/pcl/plans-mapping', permission: 'editMapping' },
            { label: 'Resourcing', href: '/role-views/pcl/resourcing', permission: 'viewPortfolioCompliance' },
            { label: 'WBS Risk Queue', href: '/role-views/pcl/wbs', permission: 'editWbs' },
          ]}
        />
      )}
    >
      <WorkstationLayout
        focus={(
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
              {[
                { label: 'Projects', value: summary.projects },
                { label: 'Open Issues', value: summary.openIssues, danger: summary.openIssues > 0 },
                { label: 'Overdue Tasks', value: summary.overdue, danger: summary.overdue > 0 },
                { label: 'At-Risk Projects', value: summary.atRisk, danger: summary.atRisk > 0 },
              ].map((card) => (
                <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
                  <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: card.danger ? '#EF4444' : 'var(--text-primary)' }}>{card.value}</div>
                </div>
              ))}
            </div>
            <MetricProvenanceOverlay
              entries={[
                {
                  metric: 'Open Issues',
                  formulaId: 'PCL_OPEN_ISSUES_V1',
                  formula: 'Count(tasks where start/finish dates missing)',
                  sources: ['tasks'],
                  scope: 'portfolio projects in current role lens',
                  window: 'current snapshot',
                },
                {
                  metric: 'Overdue Tasks',
                  formulaId: 'PCL_OVERDUE_TASKS_V1',
                  formula: 'Count(tasks where %complete < 100 and finish_date < today)',
                  sources: ['tasks'],
                  scope: 'portfolio projects in current role lens',
                  window: 'current day',
                },
                {
                  metric: 'Health Score',
                  formulaId: 'PCL_HEALTH_PROXY_V1',
                  formula: '100 - (open_issues*10) - (overdue_tasks*2), floored at 0',
                  sources: ['tasks'],
                  scope: 'per project, command-center matrix',
                  window: 'current snapshot',
                },
              ]}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
              <ComplianceMatrix rows={rows} />
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
                <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Open Exceptions Queue
                </div>
                <div style={{ padding: '0.45rem 0.7rem', fontSize: '0.7rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                  Total: {exceptionSummary.total} · Critical: {exceptionSummary.critical} · Warning: {exceptionSummary.warning}
                </div>
                {queueMessage ? (
                  <div style={{ padding: '0.45rem 0.7rem', fontSize: '0.72rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                    {queueMessage}
                  </div>
                ) : null}
                {alerts.length === 0 ? (
                  <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No open exceptions.</div>
                ) : alerts.slice(0, 10).map((alert) => (
                  <div key={alert.id} style={{ padding: '0.52rem 0.7rem', borderBottom: '1px solid var(--border-color)', display: 'grid', gap: '0.35rem' }}>
                    <div style={{ fontSize: '0.74rem', color: alert.severity === 'critical' ? '#EF4444' : alert.severity === 'warning' ? '#F59E0B' : 'var(--text-primary)', fontWeight: 700 }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{alert.message}</div>
                    <div style={{ display: 'flex', gap: '0.32rem', flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => void acknowledgeAlert(alert.id)} style={{ padding: '0.22rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.68rem' }}>Acknowledge</button>
                      <button type="button" onClick={() => void escalateAlert(alert)} style={{ padding: '0.22rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(245,158,11,0.14)', color: 'var(--text-primary)', fontSize: '0.68rem' }}>Escalate</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      />
    </RoleWorkstationShell>
  );
}
