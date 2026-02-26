'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function PcaWbsPage() {
  const { filteredData, data: fullData } = useData();

  const summary = useMemo(() => {
    const tasks = (((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []) as unknown[]).map(asRecord);
    const now = Date.now();
    const overdueOpen = tasks.filter((task) => {
      const progress = num(task.percentComplete ?? task.percent_complete);
      if (progress >= 100) return false;
      const dueRaw = task.finishDate ?? task.finish_date ?? task.endDate ?? task.end_date;
      if (!dueRaw) return false;
      const due = new Date(String(dueRaw));
      return Number.isFinite(due.getTime()) && due.getTime() < now;
    }).length;
    const missingDeps = tasks.filter((task) => {
      const pred = task.predecessorId ?? task.predecessor_id ?? task.predecessors;
      if (Array.isArray(pred)) return pred.length === 0;
      return !String(pred || '').trim();
    }).length;
    const progressNeedingUpdate = tasks.filter((task) => {
      const progress = num(task.percentComplete ?? task.percent_complete);
      const updatedRaw = task.updatedAt ?? task.updated_at ?? task.modifiedAt ?? task.modified_at;
      if (progress >= 100 || !updatedRaw) return false;
      const updated = new Date(String(updatedRaw));
      return Number.isFinite(updated.getTime()) && updated.getTime() < (Date.now() - (7 * 86400000));
    }).length;
    return { overdueOpen, missingDeps, progressNeedingUpdate };
  }, [filteredData?.tasks, fullData?.tasks]);

  return (
    <RoleWorkstationShell
      role="pca"
      title="WBS Workspace"
      subtitle="Assigned-project WBS controls for structure, mapping support, and progress updates."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Full WBS</Link>
          <Link href="/role-views/pca/mapping" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Back to Mapping</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Overdue Open Tasks</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: summary.overdueOpen > 0 ? '#EF4444' : 'var(--text-primary)' }}>{summary.overdueOpen}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tasks Missing Dependencies</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: summary.missingDeps > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{summary.missingDeps}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Progress Stale (&gt;7d)</div>
          <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: summary.progressNeedingUpdate > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{summary.progressNeedingUpdate}</div>
        </div>
      </div>
      <RoleScopedWbsWorkspace role="pca" />
    </RoleWorkstationShell>
  );
}
