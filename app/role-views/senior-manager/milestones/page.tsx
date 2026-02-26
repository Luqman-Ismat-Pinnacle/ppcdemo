'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';
import MilestoneScoreboardTable from '@/components/role-workstations/MilestoneScoreboardTable';

export default function SeniorManagerMilestonesPage() {
  const { filteredData, data: fullData } = useData();

  const summary = useMemo(() => {
    const milestones = (filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || [];
    const now = Date.now();
    const overdue = milestones.filter((item) => {
      const row = item as unknown as Record<string, unknown>;
      const dueRaw = row.dueDate || row.due_date || row.targetDate || row.target_date;
      const status = String(row.status || '').toLowerCase();
      if (!dueRaw || status.includes('complete')) return false;
      const due = new Date(String(dueRaw));
      return Number.isFinite(due.getTime()) && due.getTime() < now;
    }).length;
    return { total: milestones.length, overdue };
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
      role="senior_manager"
      title="Milestones"
      subtitle="Portfolio milestone health and due-date risk visibility."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Milestones in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.total}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Overdue Milestones</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: summary.overdue > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.overdue}</div>
        </div>
      </div>
      <MilestoneScoreboardTable rows={rows} />
      <Link href="/insights/milestones" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Milestones View</Link>
    </RoleWorkstationShell>
  );
}
