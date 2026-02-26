'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function ProjectLeadTeamPage() {
  const { filteredData, data: fullData } = useData();
  const summary = useMemo(() => {
    const employees = (filteredData?.employees?.length ? filteredData.employees : fullData?.employees) || [];
    const tasks = (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [];
    const assignedTasks = tasks.filter((task) => {
      const row = task as unknown as Record<string, unknown>;
      const resource = row.resourceName || row.assignedResource || row.resource_id || row.resourceId;
      return Boolean(String(resource || '').trim());
    }).length;
    return { employees: employees.length, tasks: tasks.length, assignedTasks };
  }, [filteredData?.employees, filteredData?.tasks, fullData?.employees, fullData?.tasks]);

  return (
    <RoleWorkstationShell role="project_lead" title="Team" subtitle="Team workload visibility and assignment readiness for owned project scope.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Team Members</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.employees}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tasks</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.tasks}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assigned Tasks</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.assignedTasks}</div>
        </div>
      </div>
      <Link href="/project-controls/resourcing" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Team Resourcing</Link>
    </RoleWorkstationShell>
  );
}
