'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import { useUser } from '@/lib/user-context';
import { getGreetingTitle } from '@/lib/greeting';

type Kpis = {
  activeProjects: number;
  interventionItems: number;
  criticalExposure: number;
  scheduleVarianceHours: number;
  hoursVariancePct: number;
  portfolioSpi: number;
  portfolioTrendHoursPct: number;
  healthScore: number;
};

type InterventionRow = {
  id: string;
  project_id: string;
  project_name: string;
  severity: 'critical' | 'warning' | 'info';
  intervention_priority: 'P1' | 'P2' | 'P3';
  accountable_owner: string;
  workstream: string;
  variance_signal: string;
  recommended_action: string;
  variance_pct: number;
  variance_hours: number;
  actual_hours: number;
  baseline_hours: number;
  avg_progress: number;
  task_count: number;
  critical_open: number;
  spi: number;
  trend_hours_pct: number;
  trend_hours_mo: number;
};

type TrendPoint = { month: string; spi: number; trend_hours: number; trend_hours_pct: number; variance_pct: number };
type SpiTrendDot = { project_name: string; spi: number; trend_hours_pct: number; severity: string; variance_pct: number };
type EffRow = { category: string; hours: number; pct: number };
type HealthCascadeRow = {
  project_id: string;
  project_name: string;
  accountable_owner: string;
  customer_id: string;
  customer_name: string;
  site_id: string;
  site_name: string;
  workstream: string;
  spi: number;
  trend_hours_pct: number;
  variance_pct: number;
  variance_hours: number;
  avg_progress: number;
  actual_hours: number;
  baseline_hours: number;
  task_count: number;
  critical_open: number;
  baseline_health: number;
  schedule_health: number;
  trend_health: number;
  execution_health: number;
  overall_compliance: number;
  baseline_light: 'green' | 'yellow' | 'red';
  schedule_light: 'green' | 'yellow' | 'red';
  trend_light: 'green' | 'yellow' | 'red';
  execution_light: 'green' | 'yellow' | 'red';
  overall_light: 'green' | 'yellow' | 'red';
};

type SummaryPayload = {
  success: boolean;
  kpis: Kpis;
  interventionQueue: InterventionRow[];
  trend: TrendPoint[];
  milestoneDistribution: Record<string, number>;
  efficiencyBreakdown: EffRow[];
  spiTrendMatrix: SpiTrendDot[];
  healthCascade: HealthCascadeRow[];
  updatedAt: string;
  error?: string;
};

const SEV_COLOR: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
const MILESTONE_LABELS: Record<string, { label: string; color: string }> = {
  completed_on_time: { label: 'Completed On Time', color: '#10b981' },
  completed_late: { label: 'Completed Late', color: '#f59e0b' },
  in_progress_on_track: { label: 'In Progress (On Track)', color: '#6366f1' },
  in_progress_delayed: { label: 'In Progress (Delayed)', color: '#ef4444' },
  not_started: { label: 'Not Started', color: '#64748b' },
  not_started_overdue: { label: 'Not Started (Overdue)', color: '#dc2626' },
};
const LIGHT_BG: Record<'green' | 'yellow' | 'red', string> = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' };

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

function healthColor(score: number) {
  if (score >= 75) return '#10b981';
  if (score >= 55) return '#f59e0b';
  return '#ef4444';
}

export default function CooCommandCenterPage() {
  const { user } = useUser();
  const [payload, setPayload] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [cascadeExpanded, setCascadeExpanded] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingCommentKey, setSavingCommentKey] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    fetch('/api/coo/summary', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: SummaryPayload) => {
        if (!d.success) throw new Error(d.error || 'Failed to load COO summary');
        setPayload(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/coo/comments?page=command-center', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { success: boolean; comments?: Record<string, string>; error?: string }) => {
        if (!d.success) throw new Error(d.error || 'Failed to load comments');
        setComments(d.comments || {});
      })
      .catch(() => {
        // non-blocking
      });
  }, []);

  const saveComment = useCallback(async (scope: string, recordId: string, text: string) => {
    const key = `${scope}:${recordId}`;
    setSavingCommentKey(key);
    try {
      await fetch('/api/coo/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 'command-center', scope, recordId, comment: text }),
      });
    } finally {
      setSavingCommentKey(null);
    }
  }, []);

  const toggleCascadeNode = useCallback((key: string) => {
    setCascadeExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const cascadeByOwner = useMemo(() => {
    const src = payload?.healthCascade || [];
    const colorOf = (score: number) => (score >= 75 ? 'green' : score >= 55 ? 'yellow' : 'red') as 'green' | 'yellow' | 'red';
    const aggregate = (rows: HealthCascadeRow[]) => {
      const n = Math.max(rows.length, 1);
      const avg = (pick: (r: HealthCascadeRow) => number) => Math.round(rows.reduce((s, r) => s + pick(r), 0) / n);
      const baseline = avg((r) => r.baseline_health);
      const schedule = avg((r) => r.schedule_health);
      const trend = avg((r) => r.trend_health);
      const execution = avg((r) => r.execution_health);
      const overall = avg((r) => r.overall_compliance);
      const scoreboard = Math.round(baseline * 0.35 + trend * 0.25 + execution * 0.25 + schedule * 0.15);
      return {
        baseline_health: baseline,
        schedule_health: schedule,
        trend_health: trend,
        execution_health: execution,
        overall_compliance: overall,
        scoreboard_health: scoreboard,
        critical_open: rows.reduce((s, r) => s + r.critical_open, 0),
        baseline_light: colorOf(baseline),
        schedule_light: colorOf(schedule),
        trend_light: colorOf(trend),
        execution_light: colorOf(execution),
        overall_light: colorOf(overall),
        scoreboard_light: colorOf(scoreboard),
      };
    };

    const ownerMap = new Map<string, Map<string, Map<string, HealthCascadeRow[]>>>();
    src.forEach((row) => {
      const owner = row.accountable_owner || 'Unassigned';
      const customer = row.customer_name || row.customer_id || 'Unassigned Customer';
      const site = row.site_name || row.site_id || 'Unassigned Site';
      if (!ownerMap.has(owner)) ownerMap.set(owner, new Map());
      const customerMap = ownerMap.get(owner)!;
      if (!customerMap.has(customer)) customerMap.set(customer, new Map());
      const siteMap = customerMap.get(customer)!;
      if (!siteMap.has(site)) siteMap.set(site, []);
      siteMap.get(site)!.push(row);
    });

    return Array.from(ownerMap.entries()).map(([owner, customerMap]) => {
      const customers = Array.from(customerMap.entries()).map(([customer, siteMap]) => {
        const sites = Array.from(siteMap.entries()).map(([site, projects]) => {
          const projectsSorted = [...projects].sort((a, b) => b.overall_compliance - a.overall_compliance);
          return { site, projects: projectsSorted, ...aggregate(projectsSorted) };
        }).sort((a, b) => b.overall_compliance - a.overall_compliance);
        const allProjects = sites.flatMap((s) => s.projects);
        return { customer, sites, ...aggregate(allProjects) };
      }).sort((a, b) => b.overall_compliance - a.overall_compliance);
      const allProjects = customers.flatMap((c) => c.sites.flatMap((s) => s.projects));
      return { owner, customers, ...aggregate(allProjects) };
    }).sort((a, b) => b.overall_compliance - a.overall_compliance);
  }, [payload?.healthCascade]);

  const trendOption: EChartsOption = useMemo(() => {
    const pts = payload?.trend || [];
    const spiValues = pts.map((p) => p.spi).filter((v) => Number.isFinite(v));
    const minSpi = spiValues.length ? Math.min(...spiValues) : 0.9;
    const maxSpi = spiValues.length ? Math.max(...spiValues) : 1.05;
    const spiMin = Math.max(0, Math.min(0.95, Number((minSpi - 0.08).toFixed(2))));
    const spiMax = Math.max(1.02, Number((maxSpi + 0.08).toFixed(2)));
    return {
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#94a3b8', fontSize: 10 }, bottom: 0 },
      grid: { left: 48, right: 48, top: 20, bottom: 42 },
      xAxis: { type: 'category', data: pts.map((p) => p.month), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        {
          type: 'value',
          name: 'SPI',
          min: spiMin,
          max: spiMax,
          axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}' },
          splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
        },
        {
          type: 'value',
          name: 'Hours / Var%',
          axisLabel: { color: '#94a3b8', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'SPI',
          type: 'line',
          smooth: true,
          data: pts.map((p) => p.spi),
          lineStyle: { color: '#6366f1', width: 3 },
          itemStyle: { color: '#818cf8' },
          areaStyle: { color: 'rgba(99,102,241,0.12)' },
          markLine: { symbol: 'none', data: [{ yAxis: 1 }], lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.25)' }, label: { show: false } },
        },
        { name: 'Trending Hours', type: 'bar', yAxisIndex: 1, data: pts.map((p) => p.trend_hours), itemStyle: { color: 'rgba(16,185,129,0.55)', borderRadius: [3, 3, 0, 0] } },
        { name: 'Variance %', type: 'bar', yAxisIndex: 1, data: pts.map((p) => p.variance_pct), itemStyle: { color: 'rgba(245,158,11,0.6)', borderRadius: [3, 3, 0, 0] } },
      ],
    };
  }, [payload?.trend]);

  const spiCpiOption = useMemo((): EChartsOption => {
    const dots = payload?.spiTrendMatrix || [];
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const params = p as { data?: unknown[] };
          const d = Array.isArray(params?.data) ? params.data : [];
          return `<b>${d[2] ?? ''}</b><br/>SPI: ${Number(d[0])?.toFixed(2)}<br/>Trending Hours Δ: ${Number(d[1])?.toFixed(1)}%<br/>Variance: ${Number(d[4])?.toFixed(1)}%`;
        },
      },
      grid: { left: 48, right: 16, top: 16, bottom: 38 },
      xAxis: { type: 'value', name: 'SPI', nameLocation: 'middle', nameGap: 34, min: 0, axisLabel: { color: '#94a3b8', fontSize: 10, margin: 12 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      yAxis: { type: 'value', name: 'Trending Hours %', nameLocation: 'middle', nameGap: 46, axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%', margin: 12 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      series: [{
        type: 'scatter',
        symbolSize: 14,
        data: dots.map((d) => [d.spi, d.trend_hours_pct, d.project_name, d.severity, d.variance_pct]),
        itemStyle: { color: (p: unknown) => { const d = (p as { data?: unknown[] })?.data; return SEV_COLOR[String(d?.[3] ?? '')] || '#60a5fa'; } },
      }],
    } as EChartsOption;
  }, [payload?.spiTrendMatrix]);

  const milestoneOption = useMemo((): EChartsOption => {
    const md = payload?.milestoneDistribution || {};
    const keys = Object.keys(MILESTONE_LABELS);
    const values = keys.map((k) => md[k] || 0);
    const total = values.reduce((a, b) => a + b, 0);
    return {
      tooltip: { trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}: ${p.value} (${total > 0 ? ((p.value / total) * 100).toFixed(0) : 0}%)` },
      series: [{
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '50%'],
        label: { color: '#94a3b8', fontSize: 10 },
        data: keys.map((k, i) => ({ name: MILESTONE_LABELS[k].label, value: values[i], itemStyle: { color: MILESTONE_LABELS[k].color } })),
      }],
    } as EChartsOption;
  }, [payload?.milestoneDistribution]);

  if (loading) {
    return (
      <div>
        <h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1>
        <p className="page-subtitle">Executive operating view — variance exposure, performance indices, and intervention accountability.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={78} />)}
        </div>
        <Skeleton height={260} />
      </div>
    );
  }

  if (error) return <div><h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1><div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{error}</div></div>;
  if (!payload) return null;

  const { kpis, interventionQueue, efficiencyBreakdown, updatedAt } = payload;

  return (
    <div>
      <h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1>
      <p className="page-subtitle">Executive operating view — variance exposure, performance indices, and intervention accountability.</p>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="Portfolio Health" value={kpis.healthScore} color={healthColor(kpis.healthScore)} detail="Composite (SPI·Trend·Prog·Var)" />
        <KpiCard label="Intervention Queue" value={kpis.interventionItems} color={kpis.interventionItems > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Critical Exposure" value={kpis.criticalExposure} color={kpis.criticalExposure > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Portfolio SPI" value={kpis.portfolioSpi.toFixed(2)} color={kpis.portfolioSpi >= 0.95 ? '#10b981' : kpis.portfolioSpi >= 0.85 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Hours Trend %" value={`${kpis.portfolioTrendHoursPct.toFixed(1)}%`} color={Math.abs(kpis.portfolioTrendHoursPct) <= 10 ? '#10b981' : Math.abs(kpis.portfolioTrendHoursPct) <= 25 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Schedule Variance" value={`${kpis.scheduleVarianceHours.toLocaleString()} hrs`} color={kpis.hoursVariancePct > 20 ? '#ef4444' : kpis.hoursVariancePct > 10 ? '#f59e0b' : '#10b981'} detail={`${kpis.hoursVariancePct.toFixed(1)}%`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 14, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14, order: 2 }}>
          {/* Row: Intervention Queue + SPI/Trend Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: 14 }}>
            <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>Intervention Queue</div>
              <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                <table className="dm-table" style={{ width: '100%', minWidth: 860, fontSize: '0.72rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 26 }} />
                      <th style={{ textAlign: 'left' }}>Project</th>
                      <th style={{ textAlign: 'left' }}>Priority</th>
                      <th style={{ textAlign: 'left' }}>Severity</th>
                      <th style={{ textAlign: 'left' }}>Portfolio Owner</th>
                      <th style={{ textAlign: 'left' }}>Variance Trigger</th>
                      <th style={{ textAlign: 'right' }}>Critical Open</th>
                      <th style={{ textAlign: 'left' }}>Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interventionQueue.map((row) => (
                      <React.Fragment key={row.id}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpand(row.id)}>
                          <td style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{expanded.has(row.id) ? '▾' : '▸'}</td>
                          <td style={{ fontWeight: 600 }}>{row.project_name}</td>
                          <td style={{ fontWeight: 700, color: row.intervention_priority === 'P1' ? '#ef4444' : row.intervention_priority === 'P2' ? '#f59e0b' : '#60a5fa' }}>{row.intervention_priority}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[row.severity] }} />
                              <span style={{ textTransform: 'uppercase', fontWeight: 700, color: SEV_COLOR[row.severity], fontSize: '0.68rem' }}>{row.severity}</span>
                            </span>
                          </td>
                          <td>{row.accountable_owner}</td>
                          <td>{row.variance_signal}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: row.critical_open >= 5 ? '#ef4444' : 'var(--text-primary)' }}>{row.critical_open}</td>
                          <td style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              value={comments[`intervention:${row.project_id}`] || ''}
                              onChange={(e) => setComments((prev) => ({ ...prev, [`intervention:${row.project_id}`]: e.target.value }))}
                              onBlur={(e) => saveComment('intervention', row.project_id, e.target.value)}
                              placeholder="Add executive note"
                              style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                            />
                            {savingCommentKey === `intervention:${row.project_id}` && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div>}
                          </td>
                        </tr>
                        {expanded.has(row.id) && (
                          <tr>
                            <td colSpan={8} style={{ padding: '0.5rem 0.8rem 0.6rem 2rem', background: 'rgba(99,102,241,0.04)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, fontSize: '0.69rem' }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>Workstream:</span> {row.workstream}</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Executive Action:</span> {row.recommended_action}</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>SPI:</span> <span style={{ fontWeight: 700, color: row.spi >= 0.95 ? '#10b981' : row.spi >= 0.85 ? '#f59e0b' : '#ef4444' }}>{row.spi.toFixed(2)}</span></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Trending Hours Δ:</span> <span style={{ fontWeight: 700, color: Math.abs(row.trend_hours_pct) <= 10 ? '#10b981' : Math.abs(row.trend_hours_pct) <= 25 ? '#f59e0b' : '#ef4444' }}>{row.trend_hours_pct.toFixed(1)}%</span></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Variance:</span> <span style={{ fontWeight: 700, color: row.variance_pct >= 20 ? '#ef4444' : row.variance_pct >= 10 ? '#f59e0b' : '#10b981' }}>{row.variance_pct.toFixed(1)}% ({Math.round(row.variance_hours).toLocaleString()} hrs)</span></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> {row.avg_progress.toFixed(0)}%</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Actual / Baseline:</span> {Math.round(row.actual_hours).toLocaleString()} / {Math.round(row.baseline_hours).toLocaleString()} hrs</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Critical Open:</span> <span style={{ color: row.critical_open >= 5 ? '#ef4444' : 'var(--text-primary)' }}>{row.critical_open}</span></div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Task Count:</span> {row.task_count}</div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {interventionQueue.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '0.8rem' }}>No intervention items</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>SPI / Trending Hours Matrix</div>
              <ChartWrapper option={spiCpiOption} height={340} />
            </div>
          </div>

          {/* Row: Performance Trend + Milestone Distribution + Efficiency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.6fr', gap: 14 }}>
            <div className="glass" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Performance Index Trend</div>
              <ChartWrapper option={trendOption} height={250} />
              <div style={{ marginTop: 6, fontSize: '0.67rem', color: 'var(--text-muted)' }}>Refreshed {new Date(updatedAt).toLocaleString()}</div>
            </div>

            <div className="glass" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Milestone Execution Status</div>
              <ChartWrapper option={milestoneOption} height={250} />
            </div>

            <div className="glass" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Period Efficiency</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                {efficiencyBreakdown.map((e) => {
                  const barColor = e.category === 'Execute' ? '#6366f1' : e.category.includes('Quality') ? '#f59e0b' : '#64748b';
                  return (
                    <div key={e.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 3 }}>
                        <span>{e.category}</span>
                        <span style={{ fontWeight: 700 }}>{e.pct}% <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({e.hours.toLocaleString()} hrs)</span></span>
                      </div>
                      <div style={{ width: '100%', height: 8, borderRadius: 4, background: 'rgba(148,163,184,0.12)' }}>
                        <div style={{ width: `${Math.min(e.pct, 100)}%`, height: '100%', borderRadius: 4, background: barColor, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
                {efficiencyBreakdown.length === 0 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No charge data available</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14, order: 1 }}>
          {/* RYG Cascade */}
          <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Execution Compliance Cascade (Owner → Project)</div>
            <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
              <table className="dm-table" style={{ width: '100%', minWidth: 1280, fontSize: '0.71rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 26 }} />
                    <th style={{ textAlign: 'left' }}>Owner / Customer / Site / Project</th>
                    <th style={{ textAlign: 'right' }}>Baseline Health</th>
                    <th style={{ textAlign: 'right' }}>Schedule Health</th>
                    <th style={{ textAlign: 'right' }}>Trend Health</th>
                    <th style={{ textAlign: 'right' }}>Execution Health</th>
                    <th style={{ textAlign: 'right' }}>Overall Compliance</th>
                    <th style={{ textAlign: 'right' }}>Scoreboard Health</th>
                    <th style={{ textAlign: 'right' }}>Critical Open</th>
                    <th style={{ textAlign: 'left' }}>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {cascadeByOwner.map((ownerRow) => {
                    const ownerKey = `owner:${ownerRow.owner}`;
                    const open = cascadeExpanded.has(ownerKey);
                    return (
                      <React.Fragment key={ownerKey}>
                        <tr style={{ cursor: 'pointer', background: 'rgba(148,163,184,0.08)' }} onClick={() => toggleCascadeNode(ownerKey)}>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{open ? '▾' : '▸'}</td>
                          <td style={{ fontWeight: 800 }}>{ownerRow.owner}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[ownerRow.baseline_light] }}>{ownerRow.baseline_health}%</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[ownerRow.schedule_light] }}>{ownerRow.schedule_health}%</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[ownerRow.trend_light] }}>{ownerRow.trend_health}%</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[ownerRow.execution_light] }}>{ownerRow.execution_health}%</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: LIGHT_BG[ownerRow.overall_light] }}>{ownerRow.overall_compliance}%</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: LIGHT_BG[ownerRow.scoreboard_light] }}>{ownerRow.scoreboard_health}%</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: ownerRow.critical_open >= 6 ? '#ef4444' : 'var(--text-primary)' }}>{ownerRow.critical_open}</td>
                          <td style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              value={comments[`cascade-owner:${ownerRow.owner}`] || ''}
                              onChange={(e) => setComments((prev) => ({ ...prev, [`cascade-owner:${ownerRow.owner}`]: e.target.value }))}
                              onBlur={(e) => saveComment('cascade-owner', ownerRow.owner, e.target.value)}
                              placeholder="Owner-level note"
                              style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                            />
                            {savingCommentKey === `cascade-owner:${ownerRow.owner}` && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div>}
                          </td>
                        </tr>
                        {open && ownerRow.customers.map((c) => {
                          const customerKey = `${ownerKey}|customer:${c.customer}`;
                          const customerOpen = cascadeExpanded.has(customerKey);
                          return (
                            <React.Fragment key={customerKey}>
                              <tr style={{ cursor: 'pointer', background: 'rgba(148,163,184,0.05)' }} onClick={() => toggleCascadeNode(customerKey)}>
                                <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{customerOpen ? '▾' : '▸'}</td>
                                <td style={{ paddingLeft: 16, fontWeight: 700 }}>Customer: {c.customer}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[c.baseline_light] }}>{c.baseline_health}%</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[c.schedule_light] }}>{c.schedule_health}%</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[c.trend_light] }}>{c.trend_health}%</td>
                                <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[c.execution_light] }}>{c.execution_health}%</td>
                                <td style={{ textAlign: 'right', fontWeight: 800, color: LIGHT_BG[c.overall_light] }}>{c.overall_compliance}%</td>
                                <td style={{ textAlign: 'right', fontWeight: 800, color: LIGHT_BG[c.scoreboard_light] }}>{c.scoreboard_health}%</td>
                                <td style={{ textAlign: 'right', color: c.critical_open >= 6 ? '#ef4444' : 'var(--text-primary)' }}>{c.critical_open}</td>
                                <td style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                                  <input
                                    value={comments[`cascade-customer:${c.customer}`] || ''}
                                    onChange={(e) => setComments((prev) => ({ ...prev, [`cascade-customer:${c.customer}`]: e.target.value }))}
                                    onBlur={(e) => saveComment('cascade-customer', c.customer, e.target.value)}
                                    placeholder="Customer-level note"
                                    style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                                  />
                                  {savingCommentKey === `cascade-customer:${c.customer}` && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div>}
                                </td>
                              </tr>
                              {customerOpen && c.sites.map((s) => {
                                const siteKey = `${customerKey}|site:${s.site}`;
                                const siteOpen = cascadeExpanded.has(siteKey);
                                return (
                                  <React.Fragment key={siteKey}>
                                    <tr style={{ cursor: 'pointer' }} onClick={() => toggleCascadeNode(siteKey)}>
                                      <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{siteOpen ? '▾' : '▸'}</td>
                                      <td style={{ paddingLeft: 32, fontWeight: 600 }}>Site: {s.site}</td>
                                      <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[s.baseline_light] }}>{s.baseline_health}%</td>
                                      <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[s.schedule_light] }}>{s.schedule_health}%</td>
                                      <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[s.trend_light] }}>{s.trend_health}%</td>
                                      <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[s.execution_light] }}>{s.execution_health}%</td>
                                      <td style={{ textAlign: 'right', fontWeight: 800, color: LIGHT_BG[s.overall_light] }}>{s.overall_compliance}%</td>
                                      <td style={{ textAlign: 'right', fontWeight: 800, color: LIGHT_BG[s.scoreboard_light] }}>{s.scoreboard_health}%</td>
                                      <td style={{ textAlign: 'right', color: s.critical_open >= 6 ? '#ef4444' : 'var(--text-primary)' }}>{s.critical_open}</td>
                                      <td style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                                        <input
                                          value={comments[`cascade-site:${s.site}`] || ''}
                                          onChange={(e) => setComments((prev) => ({ ...prev, [`cascade-site:${s.site}`]: e.target.value }))}
                                          onBlur={(e) => saveComment('cascade-site', s.site, e.target.value)}
                                          placeholder="Site-level note"
                                          style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                                        />
                                        {savingCommentKey === `cascade-site:${s.site}` && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div>}
                                      </td>
                                    </tr>
                                    {siteOpen && s.projects.map((p) => {
                                      const projectKey = `${siteKey}|project:${p.project_id}`;
                                      const projectOpen = cascadeExpanded.has(projectKey);
                                      const projectScoreboard = Math.round(p.baseline_health * 0.35 + p.trend_health * 0.25 + p.execution_health * 0.25 + p.schedule_health * 0.15);
                                      return (
                                        <React.Fragment key={`project:${p.project_id}`}>
                                          <tr style={{ cursor: 'pointer' }} onClick={() => toggleCascadeNode(projectKey)}>
                                            <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{projectOpen ? '▾' : '▸'}</td>
                                            <td style={{ paddingLeft: 48, fontWeight: 600 }}>{p.project_name}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[p.baseline_light] }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: LIGHT_BG[p.baseline_light] }} />{p.baseline_health}%</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[p.schedule_light] }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: LIGHT_BG[p.schedule_light] }} />{p.schedule_health}%</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[p.trend_light] }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: LIGHT_BG[p.trend_light] }} />{p.trend_health}%</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: LIGHT_BG[p.execution_light] }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: LIGHT_BG[p.execution_light] }} />{p.execution_health}%</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 800, color: LIGHT_BG[p.overall_light] }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: LIGHT_BG[p.overall_light] }} />{p.overall_compliance}%</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 800, color: LIGHT_BG[projectScoreboard >= 75 ? 'green' : projectScoreboard >= 55 ? 'yellow' : 'red'] }}>{projectScoreboard}%</td>
                                            <td style={{ textAlign: 'right', color: p.critical_open >= 6 ? '#ef4444' : 'var(--text-primary)' }}>{p.critical_open}</td>
                                            <td style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                                              <input
                                                value={comments[`cascade-project:${p.project_id}`] || ''}
                                                onChange={(e) => setComments((prev) => ({ ...prev, [`cascade-project:${p.project_id}`]: e.target.value }))}
                                                onBlur={(e) => saveComment('cascade-project', p.project_id, e.target.value)}
                                                placeholder="Project-level note"
                                                style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                                              />
                                              {savingCommentKey === `cascade-project:${p.project_id}` && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div>}
                                            </td>
                                          </tr>
                                          {projectOpen && (
                                            <tr>
                                              <td colSpan={10} style={{ padding: '0.45rem 0.8rem 0.55rem 4rem', background: 'rgba(99,102,241,0.04)', fontSize: '0.69rem' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                                                  <div><span style={{ color: 'var(--text-muted)' }}>Workstream:</span> {p.workstream}</div>
                                                  <div><span style={{ color: 'var(--text-muted)' }}>SPI:</span> <span style={{ fontWeight: 700, color: p.spi >= 0.95 ? '#10b981' : p.spi >= 0.85 ? '#f59e0b' : '#ef4444' }}>{p.spi.toFixed(2)}</span></div>
                                                  <div><span style={{ color: 'var(--text-muted)' }}>Trending Hours Δ:</span> <span style={{ fontWeight: 700, color: Math.abs(p.trend_hours_pct) <= 10 ? '#10b981' : Math.abs(p.trend_hours_pct) <= 25 ? '#f59e0b' : '#ef4444' }}>{p.trend_hours_pct.toFixed(1)}%</span></div>
                                                  <div><span style={{ color: 'var(--text-muted)' }}>Variance:</span> <span style={{ fontWeight: 700, color: p.variance_pct >= 20 ? '#ef4444' : p.variance_pct >= 10 ? '#f59e0b' : '#10b981' }}>{p.variance_pct.toFixed(1)}% ({Math.round(p.variance_hours).toLocaleString()} hrs)</span></div>
                                                  <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> {p.avg_progress.toFixed(0)}%</div>
                                                  <div><span style={{ color: 'var(--text-muted)' }}>Actual / Baseline:</span> {Math.round(p.actual_hours).toLocaleString()} / {Math.round(p.baseline_hours).toLocaleString()} hrs</div>
                                                  <div><span style={{ color: 'var(--text-muted)' }}>Critical Open:</span> <span style={{ color: p.critical_open >= 6 ? '#ef4444' : 'var(--text-primary)' }}>{p.critical_open}</span></div>
                                                  <div><span style={{ color: 'var(--text-muted)' }}>Task Count:</span> {p.task_count}</div>
                                                </div>
                                              </td>
                                            </tr>
                                          )}
                                        </React.Fragment>
                                      );
                                    })}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                  {cascadeByOwner.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '0.8rem' }}>No active scheduled projects available</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
