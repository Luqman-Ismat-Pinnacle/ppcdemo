'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';
import MilestoneScoreboardTable from '@/components/role-workstations/MilestoneScoreboardTable';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

type MilestoneFilter = 'all' | 'overdue' | 'upcoming';

export default function SeniorManagerMilestonesPage() {
  const { filteredData, data: fullData } = useData();
  const [filter, setFilter] = useState<MilestoneFilter>('all');

  const allRows = useMemo(() => {
    const milestones = (((filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || []) as unknown[]).map(asRecord);
    const now = Date.now();
    return milestones.map((row, idx) => {
      const dueRaw = row.dueDate || row.due_date || row.targetDate || row.target_date;
      const due = dueRaw ? new Date(String(dueRaw)) : null;
      const status = String(row.status || '');
      const complete = status.toLowerCase().includes('complete');
      const overdue = Boolean(due && Number.isFinite(due.getTime()) && due.getTime() < now && !complete);
      const upcoming = Boolean(due && Number.isFinite(due.getTime()) && due.getTime() >= now && due.getTime() < now + (14 * 86400000) && !complete);
      return {
        id: String(row.id || idx),
        name: String(row.name || row.milestoneName || row.title || 'Milestone'),
        dueDate: dueRaw ? String(dueRaw) : '-',
        status,
        project: String(row.project || row.projectName || row.projectId || ''),
        overdue,
        upcoming,
      };
    });
  }, [filteredData?.milestones, fullData?.milestones]);

  const rows = useMemo(() => {
    if (filter === 'overdue') return allRows.filter((row) => row.overdue);
    if (filter === 'upcoming') return allRows.filter((row) => row.upcoming);
    return allRows;
  }, [allRows, filter]);

  const summary = useMemo(() => ({
    total: allRows.length,
    overdue: allRows.filter((row) => row.overdue).length,
    upcoming: allRows.filter((row) => row.upcoming).length,
  }), [allRows]);

  return (
    <RoleWorkstationShell
      role="senior_manager"
      requiredTier="tier2"
      title="Milestones"
      subtitle="Portfolio milestone health and due-date risk visibility."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Milestones in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.total}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Overdue Milestones</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: summary.overdue > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.overdue}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Upcoming (14d)</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.upcoming}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'overdue', label: 'Overdue' },
          { key: 'upcoming', label: 'Upcoming' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key as MilestoneFilter)}
            style={{
              padding: '0.3rem 0.6rem',
              borderRadius: 999,
              border: `1px solid ${filter === option.key ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
              background: filter === option.key ? 'rgba(16,185,129,0.12)' : 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              fontSize: '0.7rem',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <MilestoneScoreboardTable rows={rows} />
      <Link href="/insights/milestones" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Milestones View</Link>
    </RoleWorkstationShell>
  );
}
