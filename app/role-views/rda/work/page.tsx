'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function RdaWorkPage() {
  const { filteredData, data: fullData } = useData();
  const summary = useMemo(() => {
    const tasks = (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [];
    const open = tasks.filter((task) => {
      const row = task as unknown as Record<string, unknown>;
      const pct = Number(row.percentComplete ?? row.percent_complete ?? 0);
      return Number.isFinite(pct) ? pct < 100 : true;
    }).length;
    return { total: tasks.length, open };
  }, [filteredData?.tasks, fullData?.tasks]);

  return (
    <RoleWorkstationShell role="rda" title="Work Lane" subtitle="Task-level execution lane for daily progress operations.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tasks in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.total}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Open Tasks</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.open}</div>
        </div>
      </div>
      <Link href="/insights/tasks" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Task Board</Link>
    </RoleWorkstationShell>
  );
}
