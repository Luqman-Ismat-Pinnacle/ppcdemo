'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RDATaskCard from '@/components/role-workstations/RDATaskCard';
import { useData } from '@/lib/data-context';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';

export default function RdaHomePage() {
  const { filteredData, data: fullData } = useData();
  const tasks = ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []) as unknown[];
  const cards = tasks
    .map((task) => task as Record<string, unknown>)
    .filter((task) => Number(task.percentComplete ?? task.percent_complete ?? 0) < 100)
    .slice(0, 6);

  return (
    <RoleWorkstationShell role="rda" title="RDA Workstation" subtitle="Task-level execution lane with hours, work queue, and schedule progress updates.">
      <WorkstationLayout
        focus={(
          <>
            <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
              Use Hours, Work, Schedule, and Sprint for scoped execution updates.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.55rem' }}>
              {cards.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No open tasks in current role scope.</div>
              ) : cards.map((task, idx) => (
                <RDATaskCard
                  key={String(task.id || task.taskId || idx)}
                  title={String(task.name || task.taskName || task.id || 'Unnamed Task')}
                  due={String(task.finishDate || task.finish_date || task.endDate || task.end_date || '-')}
                  progress={Number(task.percentComplete ?? task.percent_complete ?? 0)}
                />
              ))}
            </div>
          </>
        )}
      />
    </RoleWorkstationShell>
  );
}
