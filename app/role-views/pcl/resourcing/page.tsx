'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function PclResourcingPage() {
  const { filteredData, data: fullData } = useData();
  const summary = useMemo(() => {
    const employees = (filteredData?.employees?.length ? filteredData.employees : fullData?.employees) || [];
    const projects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    return { employees: employees.length, projects: projects.length };
  }, [filteredData?.employees, filteredData?.projects, fullData?.employees, fullData?.projects]);

  return (
    <RoleWorkstationShell role="pcl" title="Resourcing" subtitle="Portfolio staffing coordination and capacity balancing.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Resources in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.employees}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Projects in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.projects}</div>
        </div>
      </div>
      <Link href="/project-controls/resourcing" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Resourcing Workspace</Link>
    </RoleWorkstationShell>
  );
}
