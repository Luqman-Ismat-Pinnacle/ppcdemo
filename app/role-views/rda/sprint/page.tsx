'use client';

/**
 * @fileoverview RDA sprint lane wrapper.
 *
 * Provides assignee-scoped sprint actions while linking to the canonical sprint engine.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export default function RdaSprintPage() {
  const { filteredData, data: fullData } = useData();
  const tasks = useMemo(
    () => ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []).map(asRecord),
    [filteredData?.tasks, fullData?.tasks],
  );

  const sprintQueue = tasks
    .filter((task) => Number(task.percentComplete ?? task.percent_complete ?? 0) < 100)
    .slice(0, 20);

  return (
    <RoleWorkstationShell role="rda" title="Sprint Lane" subtitle="Daily sprint queue scoped to assigned execution items.">
      <WorkstationLayout
        focus={(
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Assignee-scoped sprint queue. Use canonical sprint engine for full board operations.
              </div>
              <Link href="/project-management/sprint" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Open Full Sprint Engine
              </Link>
            </div>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px 120px', gap: '0.5rem', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>Task</span>
                <span>Progress</span>
                <span>Due</span>
              </div>
              {sprintQueue.length === 0 ? (
                <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No sprint items in current scope.</div>
              ) : sprintQueue.map((task, idx) => (
                <div key={String(task.id || task.taskId || idx)} style={{ display: 'grid', gridTemplateColumns: '1.3fr 90px 120px', gap: '0.5rem', padding: '0.52rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(task.name || task.taskName || 'Task')}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{Number(task.percentComplete ?? task.percent_complete ?? 0).toFixed(0)}%</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{String(task.finishDate || task.finish_date || '-')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      />
    </RoleWorkstationShell>
  );
}
