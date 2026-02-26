'use client';

/**
 * @fileoverview COO command center.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/lib/data-context';
import { buildPortfolioAggregate, buildProjectBreakdown } from '@/lib/calculations/selectors';
import MetricProvenanceChip from '@/components/ui/MetricProvenanceChip';
import PeriodEfficiencyBanner from '@/components/role-workstations/PeriodEfficiencyBanner';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export default function CooRoleViewPage() {
  const { filteredData, data: fullData } = useData();
  const [openAlerts, setOpenAlerts] = useState(0);
  const [openCommitments, setOpenCommitments] = useState(0);

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
      try {
        const [alertsRes, commitmentsRes] = await Promise.all([
          fetch('/api/alerts?status=open&limit=200', { cache: 'no-store' }),
          fetch('/api/commitments?limit=300', { cache: 'no-store' }),
        ]);
        const alertsPayload = await alertsRes.json().catch(() => ({}));
        const commitmentsPayload = await commitmentsRes.json().catch(() => ({}));
        if (cancelled) return;
        if (alertsRes.ok && alertsPayload.success) {
          const alerts = Array.isArray(alertsPayload.alerts) ? alertsPayload.alerts : [];
          setOpenAlerts(alerts.length);
        }
        if (commitmentsRes.ok && commitmentsPayload.success) {
          const rows = Array.isArray(commitmentsPayload.rows) ? commitmentsPayload.rows : [];
          setOpenCommitments(rows.filter((row: { status?: string }) => {
            const status = String(row.status || '').toLowerCase();
            return status === 'submitted' || status === 'escalated';
          }).length);
        }
      } catch {
        if (!cancelled) {
          setOpenAlerts(0);
          setOpenCommitments(0);
        }
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <WorkstationLayout
      focus={(
        <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role View</div>
              <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.5rem' }}>COO Command Center</h1>
              <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Executive operating picture with live priorities and decision queue.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <Link href="/role-views/coo/period-review" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Period Review</Link>
              <Link href="/role-views/coo/commitments" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Commitments</Link>
              <Link href="/role-views/coo/wbs" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>WBS</Link>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
            {[
              { label: 'Portfolio Health', value: `${aggregate.healthScore}%`, provenance: aggregate.provenance.health },
              { label: 'SPI', value: aggregate.spi.toFixed(2), provenance: aggregate.provenance.spi },
              { label: 'CPI', value: aggregate.cpi.toFixed(2), provenance: aggregate.provenance.cpi },
              { label: 'Hours Variance', value: `${aggregate.hrsVariance}%`, provenance: aggregate.provenance.hoursVariance },
              { label: 'Projects At Risk', value: `${atRisk}/${aggregate.projectCount}` },
              { label: 'Task Completion', value: `${completedTasks}/${totalTasks}` },
              { label: 'Open Exceptions', value: String(openAlerts) },
              { label: 'Decision Queue', value: String(openCommitments) },
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

          <PeriodEfficiencyBanner
            health={aggregate.healthScore}
            spi={aggregate.spi}
            cpi={aggregate.cpi}
            variancePct={aggregate.hrsVariance}
          />

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.9rem', maxHeight: 290, overflowY: 'auto' }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.55rem' }}>Top Project Movers</div>
            {projectBreakdown.length === 0 ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No project data in active scope.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px', gap: '0.35rem 0.6rem', fontSize: '0.73rem' }}>
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
        </div>
      )}
    />
  );
}
