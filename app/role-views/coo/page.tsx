'use client';

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import DecisionQueueCard from '@/components/command-center/DecisionQueueCard';
import OffenderList from '@/components/command-center/OffenderList';

type CooSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  sections: {
    topThree: { portfolioHealth: number; periodEfficiency: number; decisionsRequired: number };
    decisionQueue: Array<{ id: string; severity: string; title: string; detail: string; age: string }>;
    periodPerformance: {
      completionRate: number;
      openCommitments: number;
      topMovers: Array<{ name: string; health: number }>;
    };
    bySeniorManager: Array<{ manager: string; projectCount: number; avgHealth: number | null; alertCount: number }>;
  };
};

export default function CooRoleViewPage() {
  const [payload, setPayload] = useState<CooSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const response = await fetch('/api/role-views/coo/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) setPayload(result as CooSummary);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <RoleWorkstationShell role="coo" title="COO Command Center" subtitle="Executive decision surface for portfolio health, commitments, and escalations.">
      {payload?.warnings?.length ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{payload.warnings.join(' ')}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="Portfolio in Three Numbers" freshness={payload?.computedAt || null}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0.55rem' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Portfolio Health</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.topThree.portfolioHealth || 0}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Period Efficiency</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.topThree.periodEfficiency || 0}%</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Decisions Required</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.topThree.decisionsRequired || 0}</div>
            </div>
          </div>
        </CommandCenterSection>

        <CommandCenterSection title="Decision Queue">
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {(payload?.sections.decisionQueue || []).map((row) => (
              <DecisionQueueCard
                key={row.id}
                title={row.title}
                detail={row.detail}
                severity={row.severity}
                age={row.age}
                actions={[
                  { label: 'View Project', href: '/project-controls/wbs-gantt-v2' },
                  { label: 'Escalate', href: '/role-views/senior-manager' },
                ]}
              />
            ))}
            {!payload?.sections.decisionQueue?.length ? <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>No decisions pending.</div> : null}
          </div>
        </CommandCenterSection>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <CommandCenterSection title="Period Performance">
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              <div style={{ fontSize: '0.74rem' }}>Task completion rate: {payload?.sections.periodPerformance.completionRate || 0}%</div>
              <div style={{ fontSize: '0.74rem' }}>Open commitments: {payload?.sections.periodPerformance.openCommitments || 0}</div>
              <OffenderList
                rows={(payload?.sections.periodPerformance.topMovers || []).map((row, index) => ({
                  id: `${row.name}-${index}`,
                  label: row.name,
                  value: `Health ${row.health}`,
                }))}
                empty="No project movers."
              />
            </div>
          </CommandCenterSection>

          <CommandCenterSection title="Portfolio by Senior Manager">
            <OffenderList
              rows={(payload?.sections.bySeniorManager || []).map((row, index) => ({
                id: `${row.manager}-${index}`,
                label: row.manager,
                value: `Alerts ${row.alertCount}`,
                href: '/role-views/senior-manager',
              }))}
              empty="No SM portfolio rows."
            />
          </CommandCenterSection>
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
