'use client';

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import ClientRiskCard from '@/components/command-center/ClientRiskCard';
import QueueCardList, { type QueueCard } from '@/components/command-center/QueueCardList';
import OffenderList from '@/components/command-center/OffenderList';

type SmSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  sections: {
    portfolioHealth: { healthScore: number; atRiskProjects: number; clientAttentionNeeded: number; reportCompliance: number };
    clients: Array<{ name: string; projects: number; health: number; issue: string; trend: string }>;
    projectLeads: Array<{ leadName: string; openTasks: number; reportStatus: string; trend: string }>;
    escalations: Array<{ id: string; severity: string; title: string; detail: string; age: string }>;
  };
};

export default function SeniorManagerRoleViewPage() {
  const [payload, setPayload] = useState<SmSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const response = await fetch('/api/role-views/senior-manager/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) setPayload(result as SmSummary);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const escalationCards: QueueCard[] = (payload?.sections.escalations || []).map((row) => ({
    id: row.id,
    severity: row.severity as 'info' | 'warning' | 'critical',
    title: row.title,
    detail: row.detail,
    ageLabel: row.age,
    actions: [{ label: 'Review', href: '/role-views/senior-manager/commitments' }],
  }));

  return (
    <RoleWorkstationShell role="senior_manager" title="Senior Manager Command Center" subtitle="Client-level portfolio oversight and PL follow-through management.">
      {payload?.warnings?.length ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{payload.warnings.join(' ')}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="My Portfolio Health" freshness={payload?.computedAt || null}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.55rem' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Portfolio Health</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.portfolioHealth.healthScore || 0}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>At-Risk Projects</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.portfolioHealth.atRiskProjects || 0}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Client Attention Needed</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.portfolioHealth.clientAttentionNeeded || 0}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Report Compliance</div>
              <div style={{ marginTop: 3, fontWeight: 800 }}>{payload?.sections.portfolioHealth.reportCompliance || 0}%</div>
            </div>
          </div>
        </CommandCenterSection>

        <CommandCenterSection title="My Clients">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.45rem' }}>
            {(payload?.sections.clients || []).map((client) => (
              <ClientRiskCard key={client.name} name={client.name} projects={client.projects} health={client.health} issue={client.issue} trend={client.trend} />
            ))}
          </div>
        </CommandCenterSection>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <CommandCenterSection title="My Project Leads">
            <OffenderList
              rows={(payload?.sections.projectLeads || []).map((row) => ({
                id: row.leadName,
                label: `${row.leadName} · ${row.reportStatus} · ${row.trend}`,
                value: `${row.openTasks} open tasks`,
              }))}
              empty="No PL rows."
            />
          </CommandCenterSection>

          <CommandCenterSection title="Escalations and Alerts">
            <QueueCardList cards={escalationCards} empty="No SM-level escalations." />
          </CommandCenterSection>
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
