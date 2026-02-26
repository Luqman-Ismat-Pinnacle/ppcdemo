'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';
import MilestoneScoreboardTable from '@/components/role-workstations/MilestoneScoreboardTable';

export default function CooMilestonesPage() {
  const { filteredData, data: fullData } = useData();
  const total = useMemo(() => {
    const milestones = (filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || [];
    return milestones.length;
  }, [filteredData?.milestones, fullData?.milestones]);
  const rows = useMemo(() => {
    const milestones = (filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || [];
    return milestones.slice(0, 20).map((item, idx) => {
      const row = item as unknown as Record<string, unknown>;
      return {
        id: String(row.id || idx),
        name: String(row.name || row.milestoneName || row.title || 'Milestone'),
        dueDate: String(row.dueDate || row.due_date || row.targetDate || row.target_date || ''),
        status: String(row.status || ''),
        project: String(row.project || row.projectName || row.projectId || ''),
      };
    });
  }, [filteredData?.milestones, fullData?.milestones]);

  return (
    <RoleWorkstationShell
      role="coo"
      title="Milestone Review"
      subtitle="Executive milestone checkpoints and readiness visibility."
    >
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem' }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Milestones in Scope</div>
        <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{total}</div>
      </div>
      <MilestoneScoreboardTable rows={rows} />
      <Link href="/insights/milestones" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Milestones View</Link>
    </RoleWorkstationShell>
  );
}
