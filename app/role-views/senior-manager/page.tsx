'use client';

/**
 * @fileoverview Senior Manager command center.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import { buildPortfolioAggregate, buildProjectBreakdown, type ProjectBreakdownItem } from '@/lib/calculations/selectors';
import ClientHealthGrid from '@/components/role-workstations/ClientHealthGrid';
import WorkstationLayout from '@/components/workstation/WorkstationLayout';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import SectionHeader from '@/components/ui/SectionHeader';
import BlockSkeleton from '@/components/ui/BlockSkeleton';
import type { MetricContract } from '@/lib/metrics/contracts';

type AlertRow = {
  id: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  relatedProjectId: string | null;
  createdAt: string;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function projectRiskScore(project: ProjectBreakdownItem): number {
  let score = 0;
  if (project.spi < 0.9) score += 2;
  if (project.cpi < 0.9) score += 2;
  if (project.variance > 20) score += 2;
  if (project.percentComplete < 60 && project.actualHours > project.baselineHours * 0.8) score += 1;
  return score;
}

export default function SeniorManagerRoleViewPage() {
  const { filteredData, data: fullData } = useData();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [metrics, setMetrics] = useState<MetricContract[]>([]);
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

  const riskProjects = useMemo(
    () => [...projectBreakdown]
      .map((project) => ({ project, riskScore: projectRiskScore(project) }))
      .filter((row) => row.riskScore > 0)
      .sort((a, b) => b.riskScore - a.riskScore || b.project.variance - a.project.variance)
      .slice(0, 12),
    [projectBreakdown]
  );

  useEffect(() => {
    let cancelled = false;
    const loadAlerts = async () => {
      try {
        const response = await fetch('/api/alerts?status=open&limit=50', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok || !result.success || cancelled) return;
        setAlerts(Array.isArray(result.alerts) ? result.alerts : []);
      } catch {
        if (!cancelled) setAlerts([]);
      }
    };
    void loadAlerts();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSummary = async () => {
      setLoadingSummary(true);
      try {
        const response = await fetch('/api/role-views/senior-manager/summary', { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!cancelled && response.ok && result.success) {
          setMetrics(Array.isArray(result.data?.metrics) ? result.data.metrics : []);
          setComputedAt(String(result.computedAt || ''));
        }
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    };
    void loadSummary();
    return () => { cancelled = true; };
  }, []);

  const criticalAlerts = alerts.filter((alert) => alert.severity === 'critical').length;
  const warningAlerts = alerts.filter((alert) => alert.severity === 'warning').length;
  const portfolioAtRiskPct = aggregate.projectCount > 0
    ? Math.round((riskProjects.length / aggregate.projectCount) * 100)
    : 0;

  const topMetricById = (metricId: string) => metrics.find((metric) => metric.metricId === metricId);

  return (
    <RoleWorkstationShell
      role="senior_manager"
      title="Senior Manager Command Center"
      subtitle="Portfolio health posture, escalation queue, and alert triage."
    >
      <WorkstationLayout
        focus={(
          <div style={{ minHeight: 0, display: 'grid', gap: '0.75rem' }}>
            <SectionHeader title="Tier-1 Portfolio Metrics" timestamp={computedAt} />
            {loadingSummary ? <BlockSkeleton rows={2} /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(var(--kpi-card-min-width), 1fr))', gap: 'var(--workspace-gap-sm)' }}>
                {[
                  { label: 'Portfolio Health', value: topMetricById('sm_portfolio_health_proxy')?.value ?? `${aggregate.healthScore}%` },
                  { label: 'SPI', value: aggregate.spi.toFixed(2) },
                  { label: 'CPI', value: aggregate.cpi.toFixed(2) },
                  { label: 'Hours Variance', value: `${aggregate.hrsVariance}%` },
                  { label: 'Projects At Risk', value: `${riskProjects.length} (${portfolioAtRiskPct}%)` },
                  { label: 'Critical Alerts', value: String(criticalAlerts), accent: '#EF4444' },
                  { label: 'Warning Alerts', value: String(warningAlerts), accent: '#F59E0B' },
                ].map((item) => (
                  <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>{item.label}</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '0.35rem', color: item.accent || 'var(--text-primary)' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--workspace-gap-sm)', minHeight: 0 }}>
              <div id="team" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.85rem', minHeight: 280 }}>
                <SectionHeader title="Escalation Queue" timestamp={computedAt} />
                {riskProjects.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No high-risk projects in current scope.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(4, minmax(70px, 1fr))', gap: '0.4rem 0.55rem', fontSize: '0.72rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>Project</div>
                    <div style={{ color: 'var(--text-muted)' }}>SPI</div>
                    <div style={{ color: 'var(--text-muted)' }}>CPI</div>
                    <div style={{ color: 'var(--text-muted)' }}>Variance</div>
                    <div style={{ color: 'var(--text-muted)' }}>Risk</div>
                    {riskProjects.map(({ project, riskScore }) => (
                      <React.Fragment key={project.id}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</div>
                        <div style={{ color: project.spi < 0.9 ? '#EF4444' : 'var(--text-secondary)' }}>{project.spi.toFixed(2)}</div>
                        <div style={{ color: project.cpi < 0.9 ? '#EF4444' : 'var(--text-secondary)' }}>{project.cpi.toFixed(2)}</div>
                        <div style={{ color: project.variance > 20 ? '#EF4444' : 'var(--text-secondary)' }}>{project.variance}%</div>
                        <div style={{ color: riskScore >= 5 ? '#EF4444' : '#F59E0B', fontWeight: 700 }}>{riskScore}</div>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>

              <div id="alerts" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.85rem', maxHeight: 360, overflowY: 'auto' }}>
                <SectionHeader title="Open Alerts" timestamp={computedAt} />
                {alerts.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No open alerts.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {alerts.slice(0, 16).map((alert) => (
                      <div key={alert.id} style={{ padding: '0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: alert.severity === 'critical' ? '#EF4444' : alert.severity === 'warning' ? '#F59E0B' : 'var(--text-secondary)' }}>
                          {alert.title}
                        </div>
                        <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 2 }}>{alert.message}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 3 }}>
                          {alert.relatedProjectId ? `Project ${alert.relatedProjectId} · ` : ''}{new Date(alert.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <ClientHealthGrid
              rows={[...projectBreakdown]
                .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
                .slice(0, 12)
                .map((project) => ({
                  id: project.id,
                  name: project.name,
                  spi: project.spi,
                  cpi: project.cpi,
                  variance: project.variance,
                  percentComplete: project.percentComplete,
                }))}
            />
            <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>How Risk Is Calculated</div>
              <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                Risk score = +2 (SPI &lt; 0.9) +2 (CPI &lt; 0.9) +2 (variance &gt; 20) +1 (progress &lt; 60% while actual hours exceed 80% of baseline).
              </div>
              <div style={{ marginTop: 3, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                At-risk projects: score &gt; 0. High-risk projects: score 5+.
              </div>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Total Planned Hours: {aggregate.baselineHours.toLocaleString()} · Actual Hours: {aggregate.totalHours.toLocaleString()} · Timesheet Hours: {toNumber(aggregate.timesheetHours).toLocaleString()}
            </div>
          </div>
        )}
      />
    </RoleWorkstationShell>
  );
}
