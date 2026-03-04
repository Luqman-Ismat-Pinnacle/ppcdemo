'use client';

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import QueueCardList, { type QueueCard } from '@/components/command-center/QueueCardList';
import OffenderList from '@/components/command-center/OffenderList';

type PlSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  sections: {
    projectGlance: { periodEfficiency: number; cpi: number; teamActiveToday: string };
    teamToday: Array<{ employeeId: string; employeeName: string; currentTask: string; hoursToday: number; status: string; lastActive: string }>;
    attentionQueue: Array<{ id: string; severity: string; title: string; actionHref: string }>;
    periodStory: {
      progressVsPlan: { plannedHours: number; actualHours: number };
      milestones: { completedOnTime: number; inProgress: number; atRisk: number };
    };
  };
};

export default function ProjectLeadRoleViewPage() {
  const [payload, setPayload] = useState<PlSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const response = await fetch('/api/role-views/project-lead/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) setPayload(result as PlSummary);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const attentionCards: QueueCard[] = (payload?.sections.attentionQueue || []).map((row) => ({
    id: row.id,
    severity: row.severity as 'info' | 'warning' | 'critical',
    title: row.title,
    actions: [{ label: 'Open', href: row.actionHref }],
  }));

  return (
    <RoleWorkstationShell role="project_lead" title="Project Lead Command Center" subtitle="Project and team operating picture with focused daily attention queue.">
      {payload?.warnings?.length ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{payload.warnings.join(' ')}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="My Project at a Glance" freshness={payload?.computedAt || null}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0.55rem' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Period Efficiency</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.projectGlance.periodEfficiency ?? 0}%</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>CPI</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{(payload?.sections.projectGlance.cpi ?? 0).toFixed(2)}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Team Active Today</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.projectGlance.teamActiveToday || '0/0'}</div>
            </div>
          </div>
        </CommandCenterSection>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
          <CommandCenterSection title="My Team Today">
            <OffenderList
              rows={(payload?.sections.teamToday || []).map((row) => ({
                id: row.employeeId,
                label: `${row.employeeName} · ${row.currentTask} · ${row.status}`,
                value: `${row.hoursToday.toFixed(1)}h`,
                href: '/role-views/rda/tasks',
              }))}
              empty="No team rows available."
            />
          </CommandCenterSection>

          <CommandCenterSection title="What Needs My Attention">
            <QueueCardList cards={attentionCards} empty="No urgent attention items." />
          </CommandCenterSection>
        </div>

        <CommandCenterSection title="This Period's Story">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '0.5rem' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem', fontSize: '0.72rem' }}>
              Progress vs Plan: {payload?.sections.periodStory.progressVsPlan.actualHours || 0}h actual / {payload?.sections.periodStory.progressVsPlan.plannedHours || 0}h planned
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem', fontSize: '0.72rem' }}>
              Milestones: {payload?.sections.periodStory.milestones.completedOnTime || 0} on-time · {payload?.sections.periodStory.milestones.inProgress || 0} in progress · {payload?.sections.periodStory.milestones.atRisk || 0} at risk
            </div>
          </div>
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
