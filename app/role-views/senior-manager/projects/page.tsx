'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function SeniorManagerProjectsPage() {
  const { filteredData, data: fullData } = useData();

  const summary = useMemo(() => {
    const projects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    const healthRows = (filteredData?.projectHealth?.length ? filteredData.projectHealth : fullData?.projectHealth) || [];
    const atRisk = healthRows.filter((row) => {
      const rec = row as Record<string, unknown>;
      const status = String(rec.status || rec.health_status || '').toLowerCase();
      return status.includes('risk') || status.includes('red');
    }).length;
    return { totalProjects: projects.length, atRisk, trackedHealth: healthRows.length };
  }, [filteredData?.projectHealth, filteredData?.projects, fullData?.projectHealth, fullData?.projects]);

  return (
    <RoleWorkstationShell
      role="senior_manager"
      title="Projects"
      subtitle="Portfolio project rollup with risk and health coverage."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Projects in Scope', value: summary.totalProjects },
          { label: 'Tracked Health Rows', value: summary.trackedHealth },
          { label: 'At-Risk Projects', value: summary.atRisk, danger: summary.atRisk > 0 },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: card.danger ? '#EF4444' : 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>
      <Link href="/insights/mos-page" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Mo&apos;s Page Portfolio View</Link>
    </RoleWorkstationShell>
  );
}
