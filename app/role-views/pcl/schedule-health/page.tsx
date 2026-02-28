'use client';

import React, { useMemo } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import CommandCenterSection from '@/components/command-center/CommandCenterSection';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

export default function PclScheduleHealthPage() {
  const { filteredData, data } = useData();
  const source = filteredData || data;

  const tasks = useMemo(() => {
    const raw = (source?.tasks?.length ? source.tasks : data?.tasks) || [];
    return raw.map((t) => {
      const r = asRecord(t);
      return {
        project: String(r.projectId || r.project_id || r.projectName || r.project_name || '-'),
        name: String(r.taskName || r.name || r.description || 'Task'),
        startDate: asDate(r.startDate || r.start_date || r.beginDate || r.begin_date),
        finishDate: asDate(r.finishDate || r.finish_date || r.endDate || r.end_date),
        percentComplete: asNumber(r.percentComplete || r.percent_complete),
        baselineHours: asNumber(r.baselineHours || r.baseline_hours || r.budgetHours || r.budget_hours),
        isCritical: Boolean(r.isCritical || r.is_critical),
        totalFloat: asNumber(r.totalFloat || r.total_float),
      };
    });
  }, [source?.tasks, data?.tasks]);

  const now = useMemo(() => new Date(), []);

  const spi = useMemo(() => {
    let earnedValue = 0;
    let plannedValue = 0;
    for (const t of tasks) {
      if (!t.startDate || !t.finishDate || t.baselineHours <= 0) continue;
      const totalDuration = t.finishDate.getTime() - t.startDate.getTime();
      if (totalDuration <= 0) continue;
      const daysSinceStart = Math.max(0, now.getTime() - t.startDate.getTime());
      const fraction = Math.min(1, daysSinceStart / totalDuration);
      earnedValue += t.baselineHours * (t.percentComplete / 100);
      plannedValue += t.baselineHours * fraction;
    }
    return plannedValue > 0 ? earnedValue / plannedValue : 1;
  }, [tasks, now]);

  const criticalCount = useMemo(() => tasks.filter((t) => t.isCritical).length, [tasks]);

  const overdueTasks = useMemo(() => {
    return tasks
      .filter((t) => t.percentComplete < 100 && t.finishDate && t.finishDate.getTime() < now.getTime())
      .map((t) => ({
        ...t,
        daysOverdue: Math.floor((now.getTime() - t.finishDate!.getTime()) / 86_400_000),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 20);
  }, [tasks, now]);

  const avgFloat = useMemo(() => {
    if (tasks.length === 0) return 0;
    const sum = tasks.reduce((a, t) => a + t.totalFloat, 0);
    return sum / tasks.length;
  }, [tasks]);

  const criticalPathTasks = useMemo(() => {
    return tasks.filter((t) => t.isCritical).slice(0, 20);
  }, [tasks]);

  const spiColor = spi >= 0.95 ? '#10B981' : spi >= 0.8 ? '#F59E0B' : '#EF4444';
  const floatColor = avgFloat >= 10 ? '#10B981' : avgFloat >= 5 ? '#F59E0B' : '#EF4444';

  return (
    <RoleWorkstationShell
      role="pcl"
      requiredTier="tier1"
      title="Schedule Health"
      subtitle="Portfolio-wide schedule performance and critical path oversight."
    >
      <div style={{ display: 'grid', gap: '0.85rem' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SPI</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: spiColor }}>{spi.toFixed(2)}</div>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Critical Tasks</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: criticalCount > 0 ? '#EF4444' : 'var(--text-primary)' }}>{criticalCount}</div>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Overdue Tasks</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: overdueTasks.length > 0 ? '#EF4444' : 'var(--text-primary)' }}>{overdueTasks.length}</div>
          </div>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Avg Float (days)</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: floatColor }}>{avgFloat.toFixed(1)}</div>
          </div>
        </div>

        {/* Overdue Tasks Table */}
        <CommandCenterSection title="Overdue Tasks" status={`${overdueTasks.length} tasks`}>
          <div style={{ overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 100px 90px 100px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <span>Project</span><span>Task Name</span><span>Finish Date</span><span>% Complete</span><span>Days Overdue</span>
            </div>
            {overdueTasks.length === 0 ? (
              <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No overdue tasks detected.</div>
            ) : overdueTasks.map((t, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 100px 90px 100px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
                <span>{t.project}</span>
                <span>{t.name}</span>
                <span>{t.finishDate?.toLocaleDateString() ?? '-'}</span>
                <span>{t.percentComplete.toFixed(0)}%</span>
                <span style={{ color: '#EF4444', fontWeight: 600 }}>{t.daysOverdue}</span>
              </div>
            ))}
          </div>
        </CommandCenterSection>

        {/* Critical Path Tasks Table */}
        <CommandCenterSection title="Critical Path Tasks" status={`${criticalPathTasks.length} tasks`}>
          <div style={{ overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 100px 100px 90px 80px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <span>Project</span><span>Task Name</span><span>Start</span><span>Finish</span><span>% Complete</span><span>Float</span>
            </div>
            {criticalPathTasks.length === 0 ? (
              <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No critical path tasks in scope.</div>
            ) : criticalPathTasks.map((t, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 100px 100px 90px 80px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
                <span>{t.project}</span>
                <span>{t.name}</span>
                <span>{t.startDate?.toLocaleDateString() ?? '-'}</span>
                <span>{t.finishDate?.toLocaleDateString() ?? '-'}</span>
                <span>{t.percentComplete.toFixed(0)}%</span>
                <span>{t.totalFloat.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </CommandCenterSection>
      </div>
    </RoleWorkstationShell>
  );
}
