'use client';

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import QueueCardList, { type QueueCard } from '@/components/command-center/QueueCardList';
import OffenderList from '@/components/command-center/OffenderList';

type RdaSummary = {
  success: boolean;
  computedAt: string;
  warnings?: string[];
  sections: {
    dayGlance: { tasksDueThisWeek: number; hoursThisWeek: number; sprintProgress: number; activeTasks: number };
    taskQueue: Array<{ id: string; title: string; percentComplete: number; dueDate: string; overdue: boolean }>;
    sprintMiniBoard: { notStarted: number; inProgress: number; done: number };
    weeklyHours: Array<{ day: string; hours: number }>;
    overdueCount: number;
  };
};

export default function RdaHomePage() {
  const [payload, setPayload] = useState<RdaSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const response = await fetch('/api/role-views/rda/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) setPayload(result as RdaSummary);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const queueCards: QueueCard[] = (payload?.sections.taskQueue || []).slice(0, 12).map((row) => ({
    id: row.id,
    severity: row.overdue ? 'critical' : 'info',
    title: row.title,
    detail: `Progress ${row.percentComplete}% · Due ${row.dueDate || 'TBD'}`,
    actions: [{ label: 'Update Progress', href: '/role-views/rda/tasks' }, { label: 'Flag Blocker', href: '/role-views/rda/tasks' }],
  }));

  return (
    <RoleWorkstationShell role="rda" title="RDA Command Center" subtitle="Personal daily planner for assigned task execution and hour logging awareness.">
      {payload?.warnings?.length ? <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{payload.warnings.join(' ')}</div> : null}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <CommandCenterSection title="My Day at a Glance" freshness={payload?.computedAt || null}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: '0.45rem' }}>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Tasks Due This Week</div>
              <div style={{ marginTop: 2, fontWeight: 800 }}>{payload?.sections.dayGlance.tasksDueThisWeek || 0}</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Hours This Week</div>
              <div style={{ marginTop: 2, fontWeight: 800 }}>{(payload?.sections.dayGlance.hoursThisWeek || 0).toFixed(1)}h / 40h</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Sprint Progress</div>
              <div style={{ marginTop: 2, fontWeight: 800 }}>{payload?.sections.dayGlance.sprintProgress || 0}%</div>
            </div>
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.5rem' }}>
              <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Active Tasks</div>
              <div style={{ marginTop: 2, fontWeight: 800 }}>{payload?.sections.dayGlance.activeTasks || 0}</div>
            </div>
          </div>
        </CommandCenterSection>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.75rem' }}>
          <CommandCenterSection title="My Tasks">
            <QueueCardList cards={queueCards} empty="No open tasks." />
          </CommandCenterSection>

          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <CommandCenterSection title="My Sprint Board">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '0.45rem' }}>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem', fontSize: '0.72rem' }}>Not Started: {payload?.sections.sprintMiniBoard.notStarted || 0}</div>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem', fontSize: '0.72rem' }}>In Progress: {payload?.sections.sprintMiniBoard.inProgress || 0}</div>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem', fontSize: '0.72rem' }}>Done: {payload?.sections.sprintMiniBoard.done || 0}</div>
              </div>
            </CommandCenterSection>
            <CommandCenterSection title="My Hours This Week">
              <OffenderList
                rows={(payload?.sections.weeklyHours || []).map((row, index) => ({
                  id: `${row.day}-${index}`,
                  label: row.day,
                  value: `${row.hours.toFixed(1)}h`,
                }))}
                empty="No hours logged this week."
              />
            </CommandCenterSection>
          </div>
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
