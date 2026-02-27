'use client';

/**
 * @fileoverview COO command center.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useData } from '@/lib/data-context';
import { buildPortfolioAggregate, buildProjectBreakdown } from '@/lib/calculations/selectors';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';
import PeriodEfficiencyBanner from '@/components/role-workstations/PeriodEfficiencyBanner';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import SectionHeader from '@/components/ui/SectionHeader';
import BlockSkeleton from '@/components/ui/BlockSkeleton';
import type { MetricContract } from '@/lib/metrics/contracts';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export default function CooRoleViewPage() {
  const { filteredData, data: fullData } = useData();
  const router = useRouter();
  const params = useSearchParams();
  const section = params.get('section') || 'overview';
  const [topMetrics, setTopMetrics] = useState<MetricContract[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  const data = useMemo(() => ({
    tasks: (filteredData?.tasks?.length ? filteredData.tasks : fullData?.tasks) || [],
    projects: (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [],
    hours: (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [],
    sites: (filteredData?.sites?.length ? filteredData.sites : fullData?.sites) || [],
  }), [filteredData, fullData]);

  const projectBreakdown = useMemo(
    () => buildProjectBreakdown(data.tasks, data.projects, data.hours, data.sites, 'project'),
    [data.tasks, data.projects, data.hours, data.sites]
  );

  const aggregate = useMemo(
    () => buildPortfolioAggregate(projectBreakdown, 'project'),
    [projectBreakdown]
  );

  const tasks = ((data.tasks || []) as unknown[]).map(asRecord);
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((task) => Number(task.percentComplete || 0) >= 100).length;
  const atRisk = projectBreakdown.filter((project) => project.spi < 0.9 || project.cpi < 0.9 || project.variance > 20).length;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoadingSummary(true);
      try {
        const response = await fetch('/api/role-views/coo/summary', { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && result.success) {
          setTopMetrics(Array.isArray(result.data?.metrics) ? result.data.metrics : []);
          setComputedAt(String(result.computedAt || ''));
        }
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const metricById = (metricId: string) => topMetrics.find((metric) => metric.metricId === metricId)?.value;

  return (
    <RoleWorkstationShell
      role="coo"
      title="COO Command Center"
      subtitle="Executive operating picture with live priorities and decision queue."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => router.push('/role-views/coo?section=overview')} style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}>Overview</button>
          <button type="button" onClick={() => router.push('/role-views/coo?section=decisions')} style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', background: 'transparent', border: 'none' }}>Decision Queue</button>
          <Link href="/role-views/coo/commitments" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Commitments</Link>
          <Link href="/project-controls/wbs-gantt-v2?lens=coo" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>WBS</Link>
        </div>
      )}
    >
      <WorkstationLayout
        focus={(
          <div className="page-panel" style={{ minHeight: 0 }}>
            <SectionHeader title="Tier-1 Executive Metrics" timestamp={computedAt} />
            {loadingSummary ? <BlockSkeleton rows={2} /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(var(--kpi-card-min-width), 1fr))', gap: 'var(--workspace-gap-sm)' }}>
                {[
                  { label: 'Portfolio Health', value: `${aggregate.healthScore}%`, provenance: aggregate.provenance.health },
                  { label: 'SPI', value: aggregate.spi.toFixed(2), provenance: aggregate.provenance.spi },
                  { label: 'CPI', value: aggregate.cpi.toFixed(2), provenance: aggregate.provenance.cpi },
                  { label: 'Hours Variance', value: `${aggregate.hrsVariance}%`, provenance: aggregate.provenance.hoursVariance },
                  { label: 'Projects At Risk', value: `${atRisk}/${aggregate.projectCount}` },
                  { label: 'Task Completion', value: `${completedTasks}/${totalTasks}` },
                  { label: 'Open Exceptions', value: String(metricById('coo_open_exceptions') ?? 0) },
                  { label: 'Decision Queue', value: String(metricById('coo_decision_queue') ?? 0) },
                ].map((item) => (
                  <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      {item.label}
                      {'provenance' in item && item.provenance ? <MetricProvenanceChip provenance={item.provenance} /> : null}
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.35rem', color: 'var(--text-primary)' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            <PeriodEfficiencyBanner
              health={aggregate.healthScore}
              spi={aggregate.spi}
              cpi={aggregate.cpi}
              variancePct={aggregate.hrsVariance}
            />

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem', maxHeight: 290, overflowY: 'auto' }}>
              <SectionHeader title="Top Project Movers" timestamp={computedAt} />
              {projectBreakdown.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No project data in active scope.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(3, minmax(70px, 1fr))', gap: '0.35rem 0.6rem', fontSize: '0.73rem' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Project</div>
                  <div style={{ color: 'var(--text-muted)' }}>SPI</div>
                  <div style={{ color: 'var(--text-muted)' }}>CPI</div>
                  <div style={{ color: 'var(--text-muted)' }}>Variance</div>
                  {[...projectBreakdown].sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 12).map((project) => (
                    <React.Fragment key={project.id}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
                      <div style={{ color: project.spi < 0.9 ? '#EF4444' : 'var(--text-secondary)' }}>{project.spi.toFixed(2)}</div>
                      <div style={{ color: project.cpi < 0.9 ? '#EF4444' : 'var(--text-secondary)' }}>{project.cpi.toFixed(2)}</div>
                      <div style={{ color: Math.abs(project.variance) > 20 ? '#EF4444' : 'var(--text-secondary)' }}>{project.variance}%</div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: section === 'decisions' ? 'block' : 'none', border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Open the detailed queue in <Link href="/role-views/coo/commitments" style={{ color: 'var(--text-primary)' }}>Commitments</Link>.
            </div>
          </div>
        )}
      />
    </RoleWorkstationShell>
  );
}
