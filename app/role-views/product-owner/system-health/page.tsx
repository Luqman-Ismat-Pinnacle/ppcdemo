'use client';

/**
 * @fileoverview Product Owner-only system health page.
 */

import React, { useEffect, useState } from 'react';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import SectionHeader from '@/components/ui/SectionHeader';

type AlertRow = {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  source: string;
  createdAt: string;
};

export default function ProductOwnerSystemHealthPage() {
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [driftRows, setDriftRows] = useState<Array<{
    projectId: string;
    projectName: string;
    storedCpi: number | null;
    computedCpi: number | null;
    delta: number | null;
    drifted: boolean;
  }>>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.canViewAll) return;
    let cancelled = false;
    const run = async () => {
      const [alertsResponse, driftResponse] = await Promise.all([
        fetch('/api/alerts?status=open&limit=200', {
          cache: 'no-store',
          headers: {
            'x-role-view': activeRole.key,
            'x-actor-email': user?.email || '',
          },
        }),
        fetch('/api/system/metric-drift', { cache: 'no-store' }),
      ]);
      const payload = await alertsResponse.json().catch(() => ({}));
      const driftPayload = await driftResponse.json().catch(() => ({}));
      if (cancelled) return;
      if (alertsResponse.ok && payload.success) setAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
      if (driftResponse.ok && driftPayload.success) {
        setDriftRows(Array.isArray(driftPayload.rows) ? driftPayload.rows : []);
        setComputedAt(String(driftPayload.computedAt || ''));
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [activeRole.key, user?.canViewAll, user?.email]);

  if (!user?.canViewAll) {
    return (
      <div className="page-panel" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        System Health is restricted to Product Owner access.
      </div>
    );
  }

  const critical = alerts.filter((alert) => alert.severity === 'critical').length;
  const warning = alerts.filter((alert) => alert.severity === 'warning').length;
  const drifted = driftRows.filter((row) => row.drifted);

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Product Owner</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.42rem' }}>System Health</h1>
        <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Central platform alert queue, severity posture, and source-level operational visibility.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Open Alerts', value: alerts.length },
          { label: 'Critical', value: critical, color: critical > 0 ? '#EF4444' : 'var(--text-primary)' },
          { label: 'Warnings', value: warning, color: warning > 0 ? '#F59E0B' : 'var(--text-primary)' },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.72rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.24rem', fontWeight: 800, color: card.color || 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <SectionHeader title="Open Alerts" timestamp={computedAt} />
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 170px', gap: '0.55rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span>Severity</span><span>Title</span><span>Source</span><span>Created</span>
        </div>
        {alerts.length === 0 ? (
          <div style={{ padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No open alerts.</div>
        ) : alerts.map((alert) => (
          <div key={alert.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 170px', gap: '0.55rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span style={{ color: alert.severity === 'critical' ? '#EF4444' : alert.severity === 'warning' ? '#F59E0B' : 'var(--text-secondary)' }}>{alert.severity}</span>
            <span>{alert.title}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{alert.source}</span>
            <span>{new Date(alert.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <SectionHeader title="Tier-1 Metric Drift (CPI)" timestamp={computedAt} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 100px', gap: '0.55rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Stored CPI</span><span>Computed CPI</span><span>Delta</span>
        </div>
        {driftRows.length === 0 ? (
          <div style={{ padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No drift samples available.</div>
        ) : driftRows.slice(0, 40).map((row) => (
          <div key={row.projectId} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 100px', gap: '0.55rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.projectName || row.projectId}</span>
            <span>{row.storedCpi === null ? '-' : row.storedCpi.toFixed(2)}</span>
            <span>{row.computedCpi === null ? '-' : row.computedCpi.toFixed(2)}</span>
            <span style={{ color: row.drifted ? '#EF4444' : 'var(--text-secondary)', fontWeight: 700 }}>{row.delta === null ? '-' : row.delta.toFixed(3)}</span>
          </div>
        ))}
        <div style={{ padding: '0.55rem 0.7rem', fontSize: '0.74rem', color: drifted.length > 0 ? '#EF4444' : 'var(--text-secondary)' }}>
          Drifted rows (&gt; 0.05 delta): {drifted.length}
        </div>
      </div>
    </div>
  );
}
