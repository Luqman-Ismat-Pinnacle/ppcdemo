'use client';

/**
 * @fileoverview Project Lead schedule workstation page.
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

export default function ProjectLeadSchedulePage() {
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

    const phaseRollup = new Map<string, { total: number; open: number; overdue: number; critical: number; plannedHours: number; actualHours: number }>();
    for (const task of sourceTasks) {
      const phase = String(task.phase || task.phaseName || task.subproject || 'Unphased');
      const rec = phaseRollup.get(phase) || { total: 0, open: 0, overdue: 0, critical: 0, plannedHours: 0, actualHours: 0 };
      rec.total += 1;
      rec.plannedHours += num(task.baselineHours ?? task.baseline_hours ?? task.plannedHours ?? task.planned_hours);
      rec.actualHours += num(task.actualHours ?? task.actual_hours);
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

    const phaseRows = [...phaseRollup.entries()].map(([phase, row]) => ({
      phase,
      ...row,
      efficiencyPct: row.plannedHours > 0 ? Math.round((row.actualHours / row.plannedHours) * 100) : null,
    }))
      .sort((a, b) => b.overdue - a.overdue || b.critical - a.critical || b.open - a.open);

    const criticalPath = openTasks
      .filter((task) => num(task.totalFloat ?? task.total_float) <= 0 || String(task.isCriticalPath || task.is_critical_path || '').toLowerCase() === 'true')
      .slice(0, 25);

    return {
      totalTasks: sourceTasks.length,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      criticalTasks: criticalTasks.length,
      phaseRows,
      criticalPath,
    };
  }, [sourceTasks]);

  return (
    <RoleWorkstationShell
      role="project_lead"
      requiredTier="tier2"
      title="Schedule Workspace"
      subtitle="Phase-level schedule health, critical-path risks, and direct WBS actions."
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

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phase-Level Schedule Health</div>
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

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Critical Path Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 100px 120px 120px 120px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Task</span><span>Progress</span><span>Float</span><span>Due</span><span>Action</span>
        </div>
        {metrics.criticalPath.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No critical-path tasks in scope.</div>
        ) : metrics.criticalPath.map((task, idx) => (
          <div key={`${String(task.id || task.taskId || idx)}`} style={{ display: 'grid', gridTemplateColumns: '1.6fr 100px 120px 120px 120px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{String(task.name || task.taskName || task.id || 'Task')}</span>
            <span>{num(task.percentComplete ?? task.percent_complete).toFixed(0)}%</span>
            <span style={{ color: num(task.totalFloat ?? task.total_float) <= 0 ? '#EF4444' : 'var(--text-primary)' }}>{num(task.totalFloat ?? task.total_float).toFixed(1)}</span>
            <span>{String(task.finishDate || task.finish_date || task.endDate || task.end_date || '-')}</span>
            <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.69rem', color: 'var(--text-secondary)' }}>Open WBS</Link>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Task Efficiency by Phase</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 120px 120px 1fr 90px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Phase</span><span>Planned Hrs</span><span>Actual Hrs</span><span>Efficiency</span><span>%</span>
        </div>
        {metrics.phaseRows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No phase-hour data in scope.</div>
        ) : metrics.phaseRows.map((row) => {
          const pct = row.efficiencyPct == null ? 0 : Math.max(0, Math.min(200, row.efficiencyPct));
          const width = `${Math.min(100, pct)}%`;
          const bar = pct > 110 ? '#EF4444' : pct > 100 ? '#F59E0B' : '#10B981';
          return (
            <div key={`${row.phase}_eff`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 120px 120px 1fr 90px', padding: '0.45rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', alignItems: 'center', gap: '0.45rem' }}>
              <span>{row.phase}</span>
              <span>{row.plannedHours.toFixed(1)}</span>
              <span>{row.actualHours.toFixed(1)}</span>
              <span style={{ display: 'inline-flex', height: 8, borderRadius: 999, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <span style={{ width, background: bar }} />
              </span>
              <span style={{ color: bar, fontWeight: 700 }}>{row.efficiencyPct == null ? '-' : `${row.efficiencyPct}%`}</span>
            </div>
          );
        })}
      </div>

      <RoleScopedWbsWorkspace role="project_lead" />
    </RoleWorkstationShell>
  );
}
