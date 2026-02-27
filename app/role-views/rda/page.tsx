'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RDATaskCard from '@/components/role-workstations/RDATaskCard';
import { useData } from '@/lib/data-context';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';
import SectionHeader from '@/components/ui/SectionHeader';
import type { MetricContract } from '@/lib/metrics/contracts';

export default function RdaHomePage() {
  const { filteredData, data: fullData } = useData();
  const [summaryMetrics, setSummaryMetrics] = React.useState<MetricContract[]>([]);
  const [computedAt, setComputedAt] = React.useState<string | null>(null);
  const tasks = ((filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || []) as unknown[];
  const cards = tasks
    .map((task) => task as Record<string, unknown>)
    .filter((task) => Number(task.percentComplete ?? task.percent_complete ?? 0) < 100)
    .slice(0, 6);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch('/api/role-views/rda/summary', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!cancelled && response.ok && result.success) {
        setSummaryMetrics(Array.isArray(result.data?.metrics) ? result.data.metrics : []);
        setComputedAt(String(result.computedAt || ''));
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const metricById = (metricId: string) => summaryMetrics.find((metric) => metric.metricId === metricId)?.value;

  return (
    <RoleWorkstationShell role="rda" title="RDA Workstation" subtitle="Task-level execution lane with hours, work queue, and schedule progress updates.">
      <WorkstationLayout
        focus={(
          <>
            <SectionHeader title="Tier-1 Personal Queue" timestamp={computedAt} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(var(--kpi-card-min-width), 1fr))', gap: '0.55rem' }}>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Overdue Tasks</div>
                <div style={{ marginTop: 3, fontSize: '1.15rem', fontWeight: 800 }}>{metricById('rda_overdue_tasks') ?? 0}</div>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Open Tasks</div>
                <div style={{ marginTop: 3, fontSize: '1.15rem', fontWeight: 800 }}>{metricById('rda_open_tasks') ?? cards.length}</div>
              </div>
            </div>
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
