'use client';

/**
 * @fileoverview Project Lead week-ahead execution board.
 *
 * Operational planning surface for near-term task commitments using
 * role-scoped task data from the shared data context.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import WeekAheadBoard from '@/components/role-workstations/WeekAheadBoard';
import { useData } from '@/lib/data-context';

export default function ProjectLeadWeekAheadPage() {
  const { filteredData, data: fullData } = useData();

  const board = useMemo(() => {
    const source = (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [];
    const now = new Date();
    const endThisWeek = new Date(now);
    endThisWeek.setDate(now.getDate() + 7);
    const endNextWeek = new Date(now);
    endNextWeek.setDate(now.getDate() + 14);

    const toDate = (raw: unknown): Date | null => {
      const d = raw ? new Date(String(raw)) : null;
      return d && Number.isFinite(d.getTime()) ? d : null;
    };
    const toPct = (raw: unknown): number => {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    };

    const items = source.map((task) => {
      const row = task as unknown as Record<string, unknown>;
      const due = toDate(row.finishDate ?? row.finish_date ?? row.endDate ?? row.end_date);
      const pct = toPct(row.percentComplete ?? row.percent_complete);
      return {
        id: String(row.id || row.taskId || Math.random()),
        title: String(row.name || row.taskName || row.id || 'Unnamed Task'),
        due,
        pct,
      };
    }).filter((item) => item.due && item.pct < 100) as Array<{ id: string; title: string; due: Date; pct: number }>;

    const mk = (item: { id: string; title: string; due: Date; pct: number }) => ({
      id: item.id,
      title: item.title,
      dueLabel: `Due ${item.due.toLocaleDateString()}`,
      detail: `${Math.round(item.pct)}% complete`,
    });

    return {
      overdue: items.filter((item) => item.due < now).sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, 12).map(mk),
      thisWeek: items.filter((item) => item.due >= now && item.due <= endThisWeek).sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, 12).map(mk),
      nextWeek: items.filter((item) => item.due > endThisWeek && item.due <= endNextWeek).sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, 12).map(mk),
    };
  }, [filteredData?.tasks, fullData?.tasks]);

  return (
    <RoleWorkstationShell
      role="project_lead"
      title="Week Ahead"
      subtitle="Short-horizon delivery board for upcoming and overdue commitments."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem' }}>
          <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open WBS/Gantt</Link>
          <Link href="/role-views/project-lead/report" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Commitments</Link>
        </div>
      )}
    >
      <WeekAheadBoard overdue={board.overdue} thisWeek={board.thisWeek} nextWeek={board.nextWeek} />
    </RoleWorkstationShell>
  );
}
