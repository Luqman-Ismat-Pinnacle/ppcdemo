'use client';

/**
 * @fileoverview RDA tasks page.
 *
 * Canonical RDA task lane with rolled-in queue/schedule controls from legacy
 * `rda/work` and `rda/schedule` routes.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function RdaTasksPage() {
  const { filteredData, data: fullData } = useData();

  const rows = useMemo(() => {
    const tasks = (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [];
    return tasks.map((task, index) => {
      const row = asRecord(task);
      const progress = Number(row.percentComplete || row.percent_complete || 0);
      const dueDate = String(row.finishDate || row.finish_date || row.endDate || row.end_date || '');
      const due = dueDate ? new Date(dueDate) : null;
      return {
        id: String(row.id || row.taskId || `${index}`),
        name: String(row.taskName || row.name || row.description || 'Task'),
        projectId: String(row.projectId || row.project_id || '-'),
        progress: Number.isFinite(progress) ? progress : 0,
        dueDate,
        overdue: Boolean(due && Number.isFinite(due.getTime()) && due.getTime() < Date.now() && progress < 100),
      };
    }).filter((row) => row.progress < 100).sort((a, b) => Number(b.overdue) - Number(a.overdue)).slice(0, 140);
  }, [filteredData?.tasks, fullData?.tasks]);

  const summary = useMemo(() => ({
    open: rows.length,
    overdue: rows.filter((row) => row.overdue).length,
  }), [rows]);

  return (
    <RoleWorkstationShell
      role="rda"
      title="RDA Command Center"
      subtitle="Personal task queue and schedule lane controls for day-to-day execution updates."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-controls/wbs-gantt-v2" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open WBS Gantt</Link>
          <Link href="/project-management/sprint" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Sprint Planning</Link>
          <Link href="/role-views/rda/hours" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Hours</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Open Tasks</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800 }}>{summary.open}</div>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Overdue Tasks</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: summary.overdue > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.overdue}</div>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 120px 110px 130px 140px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span>Task</span><span>Project</span><span>Progress</span><span>Due</span><span>Action</span>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No open tasks.</div>
          ) : rows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 120px 110px 130px 140px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
              <span>{row.name}</span>
              <span>{row.projectId}</span>
              <span>{row.progress.toFixed(0)}%</span>
              <span style={{ color: row.overdue ? '#EF4444' : 'var(--text-secondary)' }}>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '-'}</span>
              <Link href="/project-controls/wbs-gantt-v2" style={{ color: 'var(--text-secondary)', fontSize: '0.69rem' }}>{row.overdue ? 'Update Now' : 'Update'}</Link>
            </div>
          ))}
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
