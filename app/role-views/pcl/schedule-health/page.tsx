'use client';

/**
 * @fileoverview PCL schedule health lane.
 *
 * Uses compliance matrix API and scoped task aggregates for intervention triage.
 */

import React, { useEffect, useMemo, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

type ComplianceRow = {
  projectId: string;
  projectName: string;
  openIssues: number;
  overdueTasks: number;
  healthScore: number;
};

export default function PclScheduleHealthPage() {
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const { activeRole } = useRoleView();
  const { user } = useUser();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const res = await fetch('/api/compliance/matrix?limit=200', {
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
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => { cancelled = true; };
  }, [activeRole.key, user?.email]);

  const metrics = useMemo(() => {
    const total = rows.length;
    const openIssues = rows.reduce((sum, row) => sum + Number(row.openIssues || 0), 0);
    const overdue = rows.reduce((sum, row) => sum + Number(row.overdueTasks || 0), 0);
    const atRisk = rows.filter((row) => Number(row.healthScore || 0) < 60).length;
    return { total, openIssues, overdue, atRisk };
  }, [rows]);

  return (
    <RoleWorkstationShell
      role="pcl"
      title="Schedule Health"
      subtitle="Portfolio schedule risk indicators for early intervention and escalation."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Projects', value: metrics.total },
          { label: 'Open Issues', value: metrics.openIssues, danger: metrics.openIssues > 0 },
          { label: 'Overdue Tasks', value: metrics.overdue, danger: metrics.overdue > 0 },
          { label: 'At-Risk Projects', value: metrics.atRisk, danger: metrics.atRisk > 0 },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: card.danger ? '#EF4444' : 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 140px 140px 140px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Open Issues</span><span>Overdue Tasks</span><span>Health</span>
        </div>
        {loading ? (
          <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading schedule health...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '0.8rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No projects in current role scope.</div>
        ) : rows.map((row) => (
          <div key={row.projectId} style={{ display: 'grid', gridTemplateColumns: '1.4fr 140px 140px 140px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.projectName}</span>
            <span>{row.openIssues}</span>
            <span>{row.overdueTasks}</span>
            <span style={{ color: row.healthScore < 60 ? '#EF4444' : row.healthScore < 80 ? '#F59E0B' : '#10B981' }}>{row.healthScore}</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
