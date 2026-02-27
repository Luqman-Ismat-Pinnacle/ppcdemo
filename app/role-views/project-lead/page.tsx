'use client';

/**
 * @fileoverview Project Lead workstation home.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import PeriodEfficiencyBanner from '@/components/role-workstations/PeriodEfficiencyBanner';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';
import SectionHeader from '@/components/ui/SectionHeader';
import BlockSkeleton from '@/components/ui/BlockSkeleton';
import type { MetricContract } from '@/lib/metrics/contracts';
import {
  calcCpi,
  calcHoursVariancePct,
  calcHealthScore,
  calcIeacCpi,
  calcSpi,
  calcTcpiToBac,
} from '@/lib/calculations/kpis';
import { useData } from '@/lib/data-context';

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function isCompleted(task: Record<string, unknown>): boolean {
  return toNumber(task.percentComplete ?? task.percent_complete) >= 100;
}

export default function ProjectLeadRoleViewPage() {
  const { filteredData, data: fullData } = useData();
  const router = useRouter();
  const params = useSearchParams();
  const section = params.get('section') || 'overview';
  const [summaryMetrics, setSummaryMetrics] = React.useState<MetricContract[]>([]);
  const [computedAt, setComputedAt] = React.useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadingSummary(true);
      const response = await fetch('/api/role-views/project-lead/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) {
        setSummaryMetrics(Array.isArray(result.data?.metrics) ? result.data.metrics : []);
        setComputedAt(String(result.computedAt || ''));
      }
      if (!cancelled) setLoadingSummary(false);
    };
    void run();
    return () => { cancelled = true; };
  }, []);
  const metricById = (metricId: string) => summaryMetrics.find((metric) => metric.metricId === metricId)?.value;

  const dataset = useMemo(() => ({
    tasks: ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []).map(asRecord),
    projects: ((filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || []).map(asRecord),
    milestones: ((filteredData?.milestones?.length ? filteredData.milestones : fullData?.milestones) || []).map(asRecord),
  }), [filteredData?.milestones, filteredData?.projects, filteredData?.tasks, fullData?.milestones, fullData?.projects, fullData?.tasks]);

  const metrics = useMemo(() => {
    const baselineHours = dataset.tasks.reduce((sum, task) => sum + toNumber(task.baselineHours ?? task.baseline_hours), 0);
    const actualHours = dataset.tasks.reduce((sum, task) => sum + toNumber(task.actualHours ?? task.actual_hours), 0);
    const earnedValue = dataset.tasks.reduce((sum, task) => {
      const baseline = toNumber(task.baselineHours ?? task.baseline_hours);
      const pct = toNumber(task.percentComplete ?? task.percent_complete) / 100;
      return sum + (baseline * Math.max(0, Math.min(1, pct)));
    }, 0);
    const plannedValue = dataset.tasks.reduce((sum, task) => sum + toNumber(task.plannedValue ?? task.planned_value ?? task.baselineHours ?? task.baseline_hours), 0);
    const budgetAtCompletion = dataset.projects.reduce((sum, project) => sum + toNumber(project.budget ?? project.totalBudget ?? project.bac), 0) || baselineHours;

    const cpi = calcCpi(earnedValue, actualHours, 'project-lead', 'active-filters');
    const spi = calcSpi(earnedValue, plannedValue, 'project-lead', 'active-filters');
    const hoursVariance = calcHoursVariancePct(actualHours, baselineHours, 'project-lead', 'active-filters');
    const ieac = calcIeacCpi(budgetAtCompletion, cpi.value, 'project-lead', 'active-filters');
    const tcpi = calcTcpiToBac(budgetAtCompletion, earnedValue, actualHours, 'project-lead', 'active-filters');
    const health = calcHealthScore(spi.value, cpi.value, 'project-lead', 'active-filters');

    const completedTasks = dataset.tasks.filter(isCompleted).length;
    const overdueTasks = dataset.tasks.filter((task) => {
      const raw = task.finishDate || task.finish_date || task.endDate || task.end_date;
      if (!raw || isCompleted(task)) return false;
      const finish = new Date(String(raw));
      return Number.isFinite(finish.getTime()) && finish.getTime() < Date.now();
    });

    const milestoneRows = dataset.milestones.map((milestone) => {
      const dueRaw = milestone.dueDate || milestone.due_date || milestone.targetDate || milestone.target_date;
      const due = dueRaw ? new Date(String(dueRaw)) : null;
      return {
        id: String(milestone.id || milestone.milestoneId || ''),
        name: String(milestone.name || milestone.milestoneName || 'Milestone'),
        due,
        status: String(milestone.status || '').toLowerCase(),
      };
    }).filter((row) => row.id);
    const nextMilestone = milestoneRows
      .filter((row) => row.due && !row.status.includes('complete'))
      .sort((a, b) => (a.due!.getTime() - b.due!.getTime()))[0] || null;
    const atRiskMilestones = milestoneRows.filter((row) => row.due && row.due.getTime() < Date.now() && !row.status.includes('complete')).length;

    return {
      baselineHours,
      actualHours,
      completedTasks,
      totalTasks: dataset.tasks.length,
      overdueTasks,
      cpi,
      spi,
      hoursVariance,
      ieac,
      tcpi,
      health,
      nextMilestone,
      atRiskMilestones,
    };
  }, [dataset.milestones, dataset.projects, dataset.tasks]);

  return (
    <RoleWorkstationShell
      role="project_lead"
      title="Project Lead"
      subtitle="Delivery execution metrics, period efficiency, and near-term intervention queue."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/role-views/project-lead/project-health" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Project Health</Link>
          <Link href="/project-management/forecast" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Forecast</Link>
          <button type="button" onClick={() => router.push('/role-views/project-lead?section=documents')} style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}>Documents</button>
          <button type="button" onClick={() => router.push('/role-views/project-lead?section=report')} style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}>Report</button>
        </div>
      )}
    >
      <WorkstationLayout
        focus={(
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <SectionHeader title="Tier-1 Delivery Metrics" timestamp={computedAt} />
            {loadingSummary ? <BlockSkeleton rows={1} /> : null}
            <PeriodEfficiencyBanner
              health={metrics.health.value}
              spi={metrics.spi.value}
              cpi={metrics.cpi.value}
              variancePct={metrics.hoursVariance.value}
            />
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
              <div id="team" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Execution Snapshot</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem', fontSize: '0.82rem' }}>
                  <div style={{ padding: '0.55rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Tasks Completed</div>
                    <div style={{ fontWeight: 700 }}>{metrics.completedTasks} / {metrics.totalTasks}</div>
                  </div>
                  <div style={{ padding: '0.55rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Overdue Open Tasks</div>
                    <div style={{ fontWeight: 700, color: metrics.overdueTasks.length > 0 ? '#EF4444' : 'var(--text-primary)' }}>{metricById('pl_overdue_tasks') ?? metrics.overdueTasks.length}</div>
                  </div>
                  <div style={{ padding: '0.55rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Next Milestone</div>
                    <div style={{ fontWeight: 700 }}>{metrics.nextMilestone ? metrics.nextMilestone.name : 'None'}</div>
                  </div>
                  <div style={{ padding: '0.55rem', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>At-Risk Milestones</div>
                    <div style={{ fontWeight: 700, color: metrics.atRiskMilestones > 0 ? '#EF4444' : 'var(--text-primary)' }}>{metrics.atRiskMilestones}</div>
                  </div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem', maxHeight: 360, overflowY: 'auto' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.6rem' }}>Overdue Task Queue</div>
                {metrics.overdueTasks.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No overdue open tasks in the active scope.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {metrics.overdueTasks.slice(0, 20).map((task, index) => (
                      <div key={`${String(task.id || task.taskId || index)}`} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>{String(task.name || task.taskName || task.id || 'Task')}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          Due {String(task.finishDate || task.finish_date || task.endDate || task.end_date)}
                        </div>
                        <div style={{ marginTop: 4, display: 'flex', gap: '0.45rem' }}>
                          <Link href="/project-controls/wbs-gantt-v2" style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Update Progress</Link>
                          <Link href="/project-controls/resourcing" style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Reassign</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div id="week-ahead" style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Week-ahead execution has been rolled into this command center and task queue; use WBS Gantt for direct scheduling actions.
            </div>
            <div id="documents" style={{ display: section === 'documents' ? 'block' : 'none', border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Document workflow now routes through canonical pages. Open <Link href="/project-management/documentation" style={{ color: 'var(--text-primary)' }}>Documentation</Link> for upload/status operations.
            </div>
            <div id="report" style={{ display: section === 'report' ? 'block' : 'none', border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Commitment/report submission has been consolidated into shared workflow surfaces and remains visible to SM/COO via commitments APIs.
            </div>
          </div>
        )}
      />
    </RoleWorkstationShell>
  );
}
