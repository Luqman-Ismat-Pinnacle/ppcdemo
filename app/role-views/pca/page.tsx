'use client';

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import QueueCardList, { type QueueCard } from '@/components/command-center/QueueCardList';
import OffenderList from '@/components/command-center/OffenderList';
import { useUser } from '@/lib/user-context';

type PcaSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  sections: {
    myQueue: Array<{ id: string; severity: string; title: string; actionHref: string; reason: string }>;
    projectCards: Array<{ projectId: string; mappingCoverage: number; unmappedHours: number; planFreshness: string; dataIssues: number }>;
    periodProgress: { mappedThisPeriod: number; issuesResolvedThisPeriod: number };
  };
};

export default function PcaRoleHomePage() {
  const { user } = useUser();
  const [payload, setPayload] = useState<PcaSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const email = user?.email || '';
      const qs = email ? `?email=${encodeURIComponent(email)}` : '';
      const response = await fetch(`/api/role-views/pca/summary${qs}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) setPayload(result as PcaSummary);
    };
    void run();
    return () => { cancelled = true; };
  }, [user?.email]);

  const queueCards: QueueCard[] = (payload?.sections.myQueue || []).map((row) => ({
    id: row.id,
    severity: row.severity as 'info' | 'warning' | 'critical',
    title: row.title,
    detail: row.reason,
    actions: [{ label: 'Open', href: row.actionHref }],
  }));

  return (
    <RoleWorkstationShell role="pca" title="PCA Command Center" subtitle="Single ordered data operations queue for assigned project integrity.">
      {payload?.warnings?.length ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{payload.warnings.join(' ')}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="My Queue" freshness={payload?.computedAt || null}>
          <QueueCardList cards={queueCards} empty="No urgent queue items." />
        </CommandCenterSection>

        <CommandCenterSection title="My Projects Status">
          <OffenderList
            rows={(payload?.sections.projectCards || []).slice(0, 15).map((row) => ({
              id: row.projectId,
              label: `${row.projectId} · issues ${row.dataIssues}`,
              value: `Map ${row.mappingCoverage}% · Unmapped ${row.unmappedHours}`,
              href: '/shared/mapping',
            }))}
            empty="No project status rows."
          />
        </CommandCenterSection>

        <CommandCenterSection title="This Period's Progress">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0.55rem' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Hours Mapped This Period</div>
              <div style={{ marginTop: 3, fontSize: '1.2rem', fontWeight: 800 }}>{payload?.sections.periodProgress.mappedThisPeriod || 0}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Issues Resolved This Period</div>
              <div style={{ marginTop: 3, fontSize: '1.2rem', fontWeight: 800 }}>{payload?.sections.periodProgress.issuesResolvedThisPeriod || 0}</div>
            </div>
          </div>
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
