'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';
import MilestoneScoreboardTable from '@/components/role-workstations/MilestoneScoreboardTable';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

type FilterKey = 'all' | 'overdue' | 'upcoming' | 'at_risk';

export default function CooMilestonesPage() {
  const { filteredData, data: fullData } = useData();
  const [filter, setFilter] = useState<FilterKey>('all');

  const allRows = useMemo(() => {
    const milestones = (((filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || []) as unknown[]).map(asRecord);
    const now = Date.now();
    return milestones.map((row, idx) => {
      const dueRaw = row.dueDate || row.due_date || row.targetDate || row.target_date;
      const due = dueRaw ? new Date(String(dueRaw)) : null;
      const status = String(row.status || '');
      const lower = status.toLowerCase();
      const complete = lower.includes('complete');
      const atRisk = lower.includes('risk') || lower.includes('delay') || lower.includes('late');
      const overdue = Boolean(due && Number.isFinite(due.getTime()) && due.getTime() < now && !complete);
      const upcoming = Boolean(due && Number.isFinite(due.getTime()) && due.getTime() >= now && due.getTime() < now + (21 * 86400000) && !complete);
      return {
        id: String(row.id || idx),
        name: String(row.name || row.milestoneName || row.title || 'Milestone'),
        dueDate: dueRaw ? String(dueRaw) : '-',
        status: status || 'Unknown',
        project: String(row.project || row.projectName || row.projectId || ''),
        overdue,
        upcoming,
        atRisk,
      };
    });
  }, [filteredData?.milestones, fullData?.milestones]);

  const rows = useMemo(() => {
    if (filter === 'overdue') return allRows.filter((row) => row.overdue);
    if (filter === 'upcoming') return allRows.filter((row) => row.upcoming);
    if (filter === 'at_risk') return allRows.filter((row) => row.atRisk || row.overdue);
    return allRows;
  }, [allRows, filter]);

  const summary = useMemo(() => ({
    total: allRows.length,
    overdue: allRows.filter((row) => row.overdue).length,
    upcoming: allRows.filter((row) => row.upcoming).length,
    atRisk: allRows.filter((row) => row.atRisk || row.overdue).length,
  }), [allRows]);

  return (
    <RoleWorkstationShell
      role="coo"
      requiredTier="tier2"
      title="Milestone Review"
      subtitle="Executive milestone checkpoints and readiness visibility."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Milestones in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.total}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Overdue</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: summary.overdue > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.overdue}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Upcoming (21d)</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.upcoming}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>At Risk</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: summary.atRisk > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.atRisk}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'overdue', label: 'Overdue' },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'at_risk', label: 'At Risk' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key as FilterKey)}
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
