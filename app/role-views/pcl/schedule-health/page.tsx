'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function PclScheduleHealthPage() {
  const { filteredData, data: fullData } = useData();

  const metrics = useMemo(() => {
    const tasks = (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [];
    const asRow = (task: unknown) => task as Record<string, unknown>;
    const num = (value: unknown) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    const open = tasks.filter((task) => num(asRow(task).percentComplete ?? asRow(task).percent_complete) < 100);
    const overdue = open.filter((task) => {
      const raw = asRow(task).finishDate ?? asRow(task).finish_date ?? asRow(task).endDate ?? asRow(task).end_date;
      if (!raw) return false;
      const due = new Date(String(raw));
      return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
    });
    const noLinks = open.filter((task) => {
      const pred = asRow(task).predecessorId ?? asRow(task).predecessor_id ?? asRow(task).predecessors;
      if (Array.isArray(pred)) return pred.length === 0;
      return !String(pred || '').trim();
    });
    return { total: tasks.length, open: open.length, overdue: overdue.length, noLinks: noLinks.length };
  }, [filteredData?.tasks, fullData?.tasks]);

  return (
    <RoleWorkstationShell
      role="pcl"
      title="Schedule Health"
      subtitle="Portfolio schedule risk indicators for early intervention and escalation."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Total Tasks', value: metrics.total, color: 'var(--text-primary)' },
          { label: 'Open Tasks', value: metrics.open, color: 'var(--text-primary)' },
          { label: 'Overdue Open', value: metrics.overdue, color: metrics.overdue > 0 ? '#EF4444' : 'var(--text-primary)' },
          { label: 'Open w/o Links', value: metrics.noLinks, color: metrics.noLinks > 0 ? '#F59E0B' : 'var(--text-primary)' },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.55rem' }}>
        <Link href="/insights/overview" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          Open Portfolio Overview
        </Link>
        <Link href="/role-views/pcl/wbs" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          Open WBS Risk Queue
        </Link>
      </div>
    </RoleWorkstationShell>
  );
}
