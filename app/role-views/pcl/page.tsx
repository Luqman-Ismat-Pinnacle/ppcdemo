'use client';

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import QueueCardList, { type QueueCard } from '@/components/command-center/QueueCardList';
import OffenderList from '@/components/command-center/OffenderList';

type PclSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  sections: {
    exceptionQueue: Array<{ id: string; severity: string; title: string; detail: string; projectId: string; ageLabel: string }>;
    mappingHealth: Array<{ projectId: string; coverage: number; unmapped: number; responsiblePca: string }>;
    planFreshness: Array<{ projectId: string; projectName: string; daysSinceUpload: string; responsiblePca: string }>;
    cpiDistribution: { buckets: { high: number; medium: number; low: number }; rows: Array<{ projectId: string; cpi: number }> };
  };
};

export default function PclHomePage() {
  const [payload, setPayload] = useState<PclSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const response = await fetch('/api/role-views/pcl/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) {
        setPayload(result as PclSummary);
      }
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const queueCards: QueueCard[] = (payload?.sections.exceptionQueue || []).map((row) => ({
    id: row.id,
    severity: row.severity as 'info' | 'warning' | 'critical',
    title: row.title,
    detail: row.detail,
    ageLabel: row.ageLabel,
    actions: [
      { label: 'Acknowledge', href: '/role-views/pcl/exceptions' },
      { label: 'Escalate to SM', href: '/role-views/senior-manager' },
      { label: 'Go to Project', href: '/project-controls/wbs-gantt-v2' },
    ],
  }));

  return (
    <RoleWorkstationShell role="pcl" title="PCL Command Center" subtitle="Portfolio triage and exception-first oversight surface.">
      {payload?.warnings?.length ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{payload.warnings.join(' ')}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="Exception Queue" freshness={payload?.computedAt || null} status={loading ? 'Loading' : null}>
          <QueueCardList cards={queueCards} empty="No open exception cards." />
        </CommandCenterSection>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <CommandCenterSection title="Mapping Health Snapshot">
            <OffenderList
              rows={(payload?.sections.mappingHealth || []).slice(0, 12).map((row) => ({
                id: row.projectId,
                label: `${row.projectId} · PCA ${row.responsiblePca}`,
                value: `${row.coverage}% (${row.unmapped} unmapped)`,
                href: '/project-controls/mapping',
              }))}
              empty="No mapping coverage data."
            />
          </CommandCenterSection>

          <CommandCenterSection title="Plan Freshness">
            <OffenderList
              rows={(payload?.sections.planFreshness || []).slice(0, 12).map((row) => ({
                id: row.projectId,
                label: `${row.projectName} · ${row.responsiblePca}`,
                value: row.daysSinceUpload,
                href: '/project-controls/project-plans',
              }))}
              empty="No plan freshness data."
            />
          </CommandCenterSection>
        </div>

        <CommandCenterSection title="Portfolio CPI Distribution">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0.5rem' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>CPI &gt; 0.90</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.cpiDistribution.buckets.high || 0}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>CPI 0.80-0.90</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.cpiDistribution.buckets.medium || 0}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>CPI &lt; 0.80</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.cpiDistribution.buckets.low || 0}</div>
            </div>
          </div>
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
