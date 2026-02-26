'use client';

/**
 * @fileoverview Project Lead schedule workstation page.
 *
 * Provides schedule triage metrics and direct actions into the shared WBS engine.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ProjectLeadSchedulePage() {
  const { filteredData, data: fullData } = useData();

  const metrics = useMemo(() => {
    const tasks = (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [];
    const openTasks = tasks.filter((task) => num((task as unknown as Record<string, unknown>).percentComplete ?? (task as unknown as Record<string, unknown>).percent_complete) < 100);
    const overdueTasks = openTasks.filter((task) => {
      const row = task as unknown as Record<string, unknown>;
      const raw = row.finishDate ?? row.finish_date ?? row.endDate ?? row.end_date;
      if (!raw) return false;
      const due = new Date(String(raw));
      return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
    });
    const criticalTasks = openTasks.filter((task) => {
      const row = task as unknown as Record<string, unknown>;
      const float = num(row.totalFloat ?? row.total_float);
      return float <= 0;
    });

    return {
      totalTasks: tasks.length,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      criticalTasks: criticalTasks.length,
    };
  }, [filteredData?.tasks, fullData?.tasks]);

  return (
    <RoleWorkstationShell
      role="project_lead"
      title="Schedule Workspace"
      subtitle="Role-scoped schedule triage and direct actions in the WBS/Gantt engine."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open WBS/Gantt</Link>
          <Link href="/insights/tasks" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Task Queue</Link>
          <Link href="/role-views/project-lead/week-ahead" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Week Ahead</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Total Tasks', value: metrics.totalTasks, color: 'var(--text-primary)' },
          { label: 'Open Tasks', value: metrics.openTasks, color: 'var(--text-primary)' },
          { label: 'Critical Open', value: metrics.criticalTasks, color: metrics.criticalTasks > 0 ? '#F59E0B' : 'var(--text-primary)' },
          { label: 'Overdue Open', value: metrics.overdueTasks, color: metrics.overdueTasks > 0 ? '#EF4444' : 'var(--text-primary)' },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.3rem', fontWeight: 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Use this route as the Project Lead schedule control point. The active role lens is already applied to data and downstream API actions.
      </div>
    </RoleWorkstationShell>
  );
}
