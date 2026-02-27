'use client';

/**
 * @fileoverview Project Lead project health page.
 *
 * Canonical PL operational destination with rolled-in schedule/critical-path
 * blocks from legacy PL schedule route.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';
import { useData } from '@/lib/data-context';

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function ProjectLeadProjectHealthPage() {
  const { filteredData, data: fullData } = useData();

  const sourceTasks = useMemo(
    () => ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []).map(asRecord),
    [filteredData?.tasks, fullData?.tasks],
  );

  const metrics = useMemo(() => {
    const openTasks = sourceTasks.filter((task) => num(task.percentComplete ?? task.percent_complete) < 100);
    const overdueTasks = openTasks.filter((task) => {
      const raw = task.finishDate ?? task.finish_date ?? task.endDate ?? task.end_date;
      if (!raw) return false;
      const due = new Date(String(raw));
      return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
    });
    const criticalTasks = openTasks.filter((task) => num(task.totalFloat ?? task.total_float) <= 0);

    const phaseRollup = new Map<string, { total: number; open: number; overdue: number; critical: number }>();
    for (const task of sourceTasks) {
      const phase = String(task.phase || task.phaseName || task.subproject || 'Unphased');
      const rec = phaseRollup.get(phase) || { total: 0, open: 0, overdue: 0, critical: 0 };
      rec.total += 1;
      const open = num(task.percentComplete ?? task.percent_complete) < 100;
      if (open) rec.open += 1;
      const finishRaw = task.finishDate ?? task.finish_date ?? task.endDate ?? task.end_date;
      if (open && finishRaw) {
        const due = new Date(String(finishRaw));
        if (Number.isFinite(due.getTime()) && due.getTime() < Date.now()) rec.overdue += 1;
      }
      if (open && num(task.totalFloat ?? task.total_float) <= 0) rec.critical += 1;
      phaseRollup.set(phase, rec);
    }

    const phaseRows = [...phaseRollup.entries()]
      .map(([phase, row]) => ({ phase, ...row }))
      .sort((a, b) => b.overdue - a.overdue || b.critical - a.critical || b.open - a.open);

    return {
      totalTasks: sourceTasks.length,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      criticalTasks: criticalTasks.length,
      phaseRows,
    };
  }, [sourceTasks]);

  return (
    <RoleWorkstationShell
      role="project_lead"
      requiredTier="tier2"
      title="Project Lead Command Center"
      subtitle="Project-level health, phase schedule integrity, and critical-path intervention controls."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-controls/wbs-gantt-v2" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open WBS/Gantt</Link>
          <Link href="/project-management/forecast" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Forecasting</Link>
          <Link href="/insights/tasks" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Production Floor Tasks</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gap: '0.75rem' }}>
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

        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
          <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phase Schedule Health (Rolled In)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 100px 100px 100px 100px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            <span>Phase</span><span>Total</span><span>Open</span><span>Overdue</span><span>Critical</span>
          </div>
          {metrics.phaseRows.length === 0 ? (
            <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No phase data in scope.</div>
          ) : metrics.phaseRows.map((row) => (
            <div key={row.phase} style={{ display: 'grid', gridTemplateColumns: '1.6fr 100px 100px 100px 100px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
              <span>{row.phase}</span><span>{row.total}</span><span>{row.open}</span>
              <span style={{ color: row.overdue > 0 ? '#EF4444' : 'var(--text-primary)' }}>{row.overdue}</span>
              <span style={{ color: row.critical > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{row.critical}</span>
            </div>
          ))}
        </div>

        <RoleScopedWbsWorkspace role="project_lead" />
      </div>
    </RoleWorkstationShell>
  );
}
