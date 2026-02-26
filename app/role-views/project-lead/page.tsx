'use client';

/**
 * @fileoverview Project Lead role view.
 *
 * Presents project-execution KPIs and risk queues for project leads using the
 * shared calculation layer with always-visible provenance chips.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-context';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';
import {
  calcCpi,
  calcHoursVariancePct,
  calcHealthScore,
  calcIeacCpi,
  calcSpi,
  calcTcpiToBac,
} from '@/lib/calculations/kpis';

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function toTaskName(task: Record<string, unknown>): string {
  return String(task.name || task.taskName || task.id || 'Unnamed Task');
}

function isCompleted(task: Record<string, unknown>): boolean {
  return toNumber(task.percentComplete ?? task.percent_complete) >= 100;
}

export default function ProjectLeadRoleViewPage() {
  const { filteredData, data: fullData } = useData();

  const data = useMemo(() => {
    const tasks = (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [];
    const projects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    return { tasks, projects };
  }, [filteredData, fullData]);

  const metrics = useMemo(() => {
    const tasks = (data.tasks as unknown[]).map(asRecord);
    const projects = (data.projects as unknown[]).map(asRecord);

    const baselineHours = tasks.reduce((sum, task) => sum + toNumber(task.baselineHours ?? task.baseline_hours), 0);
    const actualHours = tasks.reduce((sum, task) => sum + toNumber(task.actualHours ?? task.actual_hours), 0);
    const earnedValue = tasks.reduce((sum, task) => {
      const baseline = toNumber(task.baselineHours ?? task.baseline_hours);
      const pct = toNumber(task.percentComplete ?? task.percent_complete) / 100;
      return sum + (baseline * Math.max(0, Math.min(1, pct)));
    }, 0);
    const plannedValue = tasks.reduce((sum, task) => sum + toNumber(task.plannedValue ?? task.planned_value ?? task.baselineHours ?? task.baseline_hours), 0);
    const budgetAtCompletion = projects.reduce((sum, project) => sum + toNumber(project.budget ?? project.totalBudget ?? project.bac), 0) || baselineHours;

    const cpi = calcCpi(earnedValue, actualHours, 'project-lead', 'active-filters');
    const spi = calcSpi(earnedValue, plannedValue, 'project-lead', 'active-filters');
    const hoursVariance = calcHoursVariancePct(actualHours, baselineHours, 'project-lead', 'active-filters');
    const ieac = calcIeacCpi(budgetAtCompletion, cpi.value, 'project-lead', 'active-filters');
    const tcpi = calcTcpiToBac(budgetAtCompletion, earnedValue, actualHours, 'project-lead', 'active-filters');
    const health = calcHealthScore(spi.value, cpi.value, 'project-lead', 'active-filters');

    const completedTasks = tasks.filter(isCompleted).length;
    const overdueTasks = tasks.filter((task) => {
      const raw = task.finishDate || task.finish_date || task.endDate || task.end_date;
      if (!raw || isCompleted(task)) return false;
      const finish = new Date(String(raw));
      return Number.isFinite(finish.getTime()) && finish.getTime() < Date.now();
    });

    return {
      baselineHours,
      actualHours,
      completedTasks,
      totalTasks: tasks.length,
      overdueTasks,
      cpi,
      spi,
      hoursVariance,
      ieac,
      tcpi,
      health,
    };
  }, [data.tasks, data.projects]);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role View</div>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.5rem' }}>Project Lead</h1>
          <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Delivery execution metrics and issue queue using shared formulas.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/role-views/project-lead/schedule" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Schedule</Link>
          <Link href="/role-views/project-lead/forecast" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Forecast</Link>
          <Link href="/role-views/project-lead/documents" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Documents</Link>
          <Link href="/role-views/project-lead/report" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Report</Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
        {[
          { label: 'Health Score', value: `${metrics.health.value}%`, provenance: metrics.health.provenance },
          { label: 'SPI', value: metrics.spi.value.toFixed(2), provenance: metrics.spi.provenance },
          { label: 'CPI', value: metrics.cpi.value.toFixed(2), provenance: metrics.cpi.provenance },
          { label: 'Hours Variance', value: `${metrics.hoursVariance.value}%`, provenance: metrics.hoursVariance.provenance },
          { label: 'IEAC', value: metrics.ieac.value.toLocaleString(undefined, { maximumFractionDigits: 2 }), provenance: metrics.ieac.provenance },
          { label: 'TCPI', value: metrics.tcpi.value.toFixed(2), provenance: metrics.tcpi.provenance },
        ].map((item) => (
          <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              {item.label}
              <MetricProvenanceChip provenance={item.provenance} />
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.35rem', color: 'var(--text-primary)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '0.9rem' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Execution Snapshot</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', fontSize: '0.82rem' }}>
            <div style={{ padding: '0.55rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Tasks Completed</div>
              <div style={{ fontWeight: 700 }}>{metrics.completedTasks} / {metrics.totalTasks}</div>
            </div>
            <div style={{ padding: '0.55rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Overdue Open Tasks</div>
              <div style={{ fontWeight: 700, color: metrics.overdueTasks.length > 0 ? '#EF4444' : 'var(--text-primary)' }}>{metrics.overdueTasks.length}</div>
            </div>
            <div style={{ padding: '0.55rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Baseline Hours</div>
              <div style={{ fontWeight: 700 }}>{metrics.baselineHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
            </div>
            <div style={{ padding: '0.55rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Actual Hours</div>
              <div style={{ fontWeight: 700 }}>{metrics.actualHours.toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem', maxHeight: 330, overflowY: 'auto' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Overdue Task Queue</div>
          {metrics.overdueTasks.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No overdue open tasks in the active scope.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {metrics.overdueTasks.slice(0, 20).map((task, index) => (
                <div key={`${String(task.id || task.taskId || index)}`} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>{toTaskName(task)}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Due {String(task.finishDate || task.finish_date || task.endDate || task.end_date)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
