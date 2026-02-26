'use client';

/**
 * @fileoverview PCL Exception View (Phase 7.3).
 *
 * Highlights alert exceptions and supports status transitions for triage flow.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import MetricProvenanceOverlay from '@/components/role-workstations/MetricProvenanceOverlay';

type AlertRow = {
  id: number;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  status: 'open' | 'acknowledged' | 'resolved';
  source: string;
  relatedProjectId: string | null;
  createdAt: string;
};

export default function PclExceptionsPage() {
  const [statusFilter, setStatusFilter] = useState<'open' | 'acknowledged' | 'resolved'>('open');
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const { activeRole } = useRoleView();
  const { user } = useUser();

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/alerts?status=${encodeURIComponent(statusFilter)}&limit=200`, {
        cache: 'no-store',
        headers: {
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load alerts');
      }
      setAlerts(Array.isArray(result.alerts) ? result.alerts : []);
    } catch (error) {
      setAlerts([]);
      setMessage(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [activeRole.key, statusFilter, user?.email]);

  useEffect(() => {
    void loadAlerts();
  }, [loadAlerts]);

  const updateStatus = useCallback(async (id: number, status: 'acknowledged' | 'resolved' | 'open') => {
    const response = await fetch('/api/alerts', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      },
      body: JSON.stringify({ id, status, acknowledgedBy: 'pcl-exception-view' }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      setMessage(result.error || 'Failed to update alert status');
      return;
    }
    await loadAlerts();
  }, [activeRole.key, loadAlerts, user?.email]);

  const escalate = useCallback(async (row: AlertRow) => {
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
        source: 'role-views/pcl-exceptions',
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
    await updateStatus(row.id, 'acknowledged');
    setMessage(`Escalated alert #${row.id}.`);
    await loadAlerts();
  }, [activeRole.key, loadAlerts, updateStatus, user?.email]);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Role View</div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.5rem' }}>PCL Exception View</h1>
        </div>
        <Link href="/role-views/pcl" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Back to PCL workstation</Link>
      </div>

      <div style={{ display: 'flex', gap: '0.55rem', alignItems: 'center' }}>
        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Status</label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'open' | 'acknowledged' | 'resolved')} style={{ padding: '0.42rem 0.56rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
        <button type="button" onClick={() => void loadAlerts()} style={{ padding: '0.42rem 0.65rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>Refresh</button>
      </div>

      {message ? <div style={{ fontSize: '0.78rem', color: '#F59E0B' }}>{message}</div> : null}

      <MetricProvenanceOverlay
        entries={[
          {
            metric: 'Open Exceptions',
            formulaId: 'PCL_ALERT_OPEN_V1',
            formula: "COUNT(alert_events where status='open')",
            sources: ['alert_events'],
            scope: 'active status filter in role lens',
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

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 140px 1fr 150px 220px', gap: '0.5rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Severity</span>
          <span>Event</span>
          <span>Message</span>
          <span>Created</span>
          <span>Actions</span>
        </div>
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading exceptions...</div>
          ) : alerts.length === 0 ? (
            <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No exceptions in this status.</div>
          ) : alerts.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '90px 140px 1fr 150px 220px', gap: '0.5rem', padding: '0.6rem 0.7rem', borderBottom: '1px solid var(--border-color)', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: row.severity === 'critical' ? '#EF4444' : row.severity === 'warning' ? '#F59E0B' : 'var(--text-secondary)' }}>{row.severity}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{row.eventType}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.title}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.message}</div>
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(row.createdAt).toLocaleString()}</span>
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                <button type="button" onClick={() => void updateStatus(row.id, 'acknowledged')} disabled={row.status !== 'open'} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: row.status === 'open' ? 'pointer' : 'not-allowed' }}>Ack</button>
                <button type="button" onClick={() => void updateStatus(row.id, 'resolved')} disabled={row.status === 'resolved'} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: row.status === 'resolved' ? 'not-allowed' : 'pointer' }}>Resolve</button>
                <button type="button" onClick={() => void escalate(row)} disabled={row.status === 'resolved'} style={{ padding: '0.24rem 0.42rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'rgba(245,158,11,0.12)', color: 'var(--text-primary)', cursor: row.status === 'resolved' ? 'not-allowed' : 'pointer' }}>Escalate</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
