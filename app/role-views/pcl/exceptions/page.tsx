'use client';

/**
 * @fileoverview PCL exception queue.
 *
 * Canonical exception triage page with status updates and escalation events.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import type { ExceptionRow } from '@/types/role-workstation';

export default function PclExceptionsPage() {
  const [statusFilter, setStatusFilter] = useState<'open' | 'acknowledged' | 'resolved'>('open');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<ExceptionRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const { activeRole } = useRoleView();
  const { user } = useUser();

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const severityParam = severityFilter === 'all' ? '' : `&severity=${severityFilter}`;
      const response = await fetch(`/api/alerts?status=${encodeURIComponent(statusFilter)}${severityParam}&limit=300`, {
        cache: 'no-store',
        headers: {
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Failed to load alerts');
      setAlerts(Array.isArray(result.alerts) ? result.alerts : []);
    } catch (error) {
      setAlerts([]);
      setMessage(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [activeRole.key, severityFilter, statusFilter, user?.email]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const updateStatus = useCallback(async (ids: number[], status: 'acknowledged' | 'resolved' | 'open') => {
    const response = await fetch('/api/alerts', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
      body: JSON.stringify({
        ids,
        status,
        acknowledgedBy: user?.email || 'pcl-exception-view',
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      setMessage(result.error || 'Failed to update alert status');
      return;
    }
    await loadAlerts();
  }, [activeRole.key, loadAlerts, user?.email]);

  const escalate = useCallback(async (row: ExceptionRow) => {
    const create = await fetch('/api/alerts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
      body: JSON.stringify({
        eventType: 'exception.escalated',
        severity: row.severity === 'critical' ? 'critical' : 'warning',
        title: `Escalated: ${row.title}`,
        message: row.message,
        source: 'role-views/pcl/exceptions',
        entityType: 'alert_events',
        entityId: String(row.id),
        relatedProjectId: row.relatedProjectId,
        metadata: { escalatedFromAlertId: row.id, status: row.status },
      }),
    });
    const createPayload = await create.json().catch(() => ({}));
    if (!create.ok || !createPayload.success) {
      setMessage(createPayload.error || 'Failed to escalate alert');
      return;
    }
    await updateStatus([row.id], 'acknowledged');
    setMessage(`Escalated alert #${row.id}.`);
    await loadAlerts();
  }, [activeRole.key, loadAlerts, updateStatus, user?.email]);

  const summary = useMemo(() => ({
    critical: alerts.filter((row) => row.severity === 'critical').length,
    warning: alerts.filter((row) => row.severity === 'warning').length,
    info: alerts.filter((row) => row.severity === 'info').length,
    total: alerts.length,
  }), [alerts]);

  const selectedOpenIds = useMemo(
    () => alerts.filter((row) => row.status === 'open').map((row) => row.id),
    [alerts],
  );

  return (
    <RoleWorkstationShell
      role="pcl"
      requiredTier="tier3"
      title="Exceptions"
      subtitle="Operational exception triage lane for acknowledgements, escalations, and closure."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Critical', value: summary.critical, color: '#EF4444' },
          { label: 'Warning', value: summary.warning, color: '#F59E0B' },
          { label: 'Info', value: summary.info, color: 'var(--text-secondary)' },
          { label: 'Total in Filter', value: summary.total, color: 'var(--text-primary)' },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      <MetricProvenanceOverlay
        entries={[
          {
            metric: 'Open Exceptions',
            formulaId: 'PCL_ALERT_OPEN_V1',
            formula: "COUNT(alert_events where status='open')",
            sources: ['alert_events'],
            scope: 'active status/severity filter in role lens',
            window: 'current snapshot',
          },
          {
            metric: 'Escalation Events',
            formulaId: 'PCL_ALERT_ESCALATE_V1',
            formula: "POST /api/alerts eventType='exception.escalated'",
            sources: ['alert_events', 'workflow_audit_log'],
            scope: 'exceptions triggered from workstation',
            window: 'event-time',
          },
        ]}
      />

      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status</label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'open' | 'acknowledged' | 'resolved')} style={{ padding: '0.42rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Severity</label>
        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as 'all' | 'info' | 'warning' | 'critical')} style={{ padding: '0.42rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          <option value="all">All</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <button type="button" onClick={() => { void loadAlerts(); }} style={{ padding: '0.42rem 0.65rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Refresh</button>
        <button
          type="button"
          disabled={selectedOpenIds.length === 0}
          onClick={() => { void updateStatus(selectedOpenIds, 'acknowledged'); }}
          style={{ padding: '0.42rem 0.65rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', opacity: selectedOpenIds.length === 0 ? 0.6 : 1 }}
        >
          Acknowledge All Open ({selectedOpenIds.length})
        </button>
      </div>

      {message ? <div style={{ fontSize: '0.78rem', color: '#F59E0B' }}>{message}</div> : null}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 150px 1fr 150px 220px', gap: '0.5rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Severity</span>
          <span>Event</span>
          <span>Message</span>
          <span>Created</span>
          <span>Actions</span>
        </div>
        <div style={{ maxHeight: 520, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading exceptions...</div>
          ) : alerts.length === 0 ? (
            <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No exceptions in this status/filter.</div>
          ) : alerts.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '90px 150px 1fr 150px 220px', gap: '0.5rem', padding: '0.6rem 0.7rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: row.severity === 'critical' ? '#EF4444' : row.severity === 'warning' ? '#F59E0B' : 'var(--text-secondary)' }}>{row.severity}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{row.eventType}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.message}</div>
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(row.createdAt).toLocaleString()}</span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button type="button" onClick={() => { void updateStatus([row.id], 'acknowledged'); }} disabled={row.status !== 'open'} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: row.status === 'open' ? 'pointer' : 'not-allowed' }}>Ack</button>
                <button type="button" onClick={() => { void updateStatus([row.id], 'resolved'); }} disabled={row.status === 'resolved'} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: row.status === 'resolved' ? 'not-allowed' : 'pointer' }}>Resolve</button>
                <button type="button" onClick={() => { void escalate(row); }} disabled={row.status === 'resolved'} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(245,158,11,0.12)', color: 'var(--text-primary)', cursor: row.status === 'resolved' ? 'not-allowed' : 'pointer' }}>Escalate</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
