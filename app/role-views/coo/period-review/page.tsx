'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function CooPeriodReviewPage() {
  const { filteredData, data: fullData } = useData();
  const summary = useMemo(() => {
    const notes = (filteredData?.moPeriodNotes?.length ? filteredData.moPeriodNotes : fullData?.moPeriodNotes) || [];
    const projects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    return { notes: notes.length, projects: projects.length };
  }, [filteredData?.moPeriodNotes, filteredData?.projects, fullData?.moPeriodNotes, fullData?.projects]);

  return (
    <RoleWorkstationShell
      role="coo"
      title="Period Review"
      subtitle="Executive rollup context for period notes and operational snapshots."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Projects in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.projects}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Period Notes</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.notes}</div>
        </div>
      </div>
      <Link href="/insights/mos-page" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Mo&apos;s Page</Link>
    </RoleWorkstationShell>
  );
}
