'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type VarianceRow = {
  id: string;
  project_id: string;
  project_name: string;
  accountable_owner: string;
  workstream: string;
  severity: 'critical' | 'warning' | 'info';
  intervention_priority: 'P1' | 'P2' | 'P3';
  variance_pct: number;
  variance_hours: number;
  actual_hours: number;
  baseline_hours: number;
  remaining_hours: number;
  spi: number;
  trend_hours_pct: number;
  trend_hours_mo: number;
  avg_progress: number;
  total_tasks: number;
  completed_tasks: number;
  critical_open: number;
  trend: 'deteriorating' | 'stable' | 'recovering';
  root_cause: string;
  recommended_action: string;
};

type Summary = {
  total: number;
  critical: number;
  warning: number;
  info: number;
  p1: number;
  avgVariancePct: number;
  totalVarianceHours: number;
};

type Payload = {
  success: boolean;
  rows: VarianceRow[];
  summary: Summary;
  severityDistribution: { critical: number; warning: number; info: number };
  error?: string;
};

const SEV_COLOR: Record<string, string> = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
const TREND_ICON: Record<string, { symbol: string; color: string }> = {
  deteriorating: { symbol: '▼', color: '#ef4444' },
  stable: { symbol: '●', color: '#f59e0b' },
  recovering: { symbol: '▲', color: '#10b981' },
};

export default function CooVarianceReviewPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [severity, setSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [priority, setPriority] = useState<'all' | 'P1' | 'P2' | 'P3'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [includeMonitored, setIncludeMonitored] = useState(false);
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
    const params = new URLSearchParams();
    if (severity !== 'all') params.set('severity', severity);
    if (priority !== 'all') params.set('priority', priority);
    const url = params.toString() ? `/api/coo/variance-review?${params}` : '/api/coo/variance-review';
    setLoading(true);
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Payload) => {
        if (!d.success) throw new Error(d.error || 'Failed');
        setPayload(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [severity, priority]);

  useEffect(() => {
    fetch('/api/coo/comments?page=variance-review', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { success: boolean; comments?: Record<string, string>; error?: string }) => {
        if (!d.success) throw new Error(d.error || 'Failed to load comments');
        setComments(d.comments || {});
      })
      .catch(() => {
        // non-blocking
      });
  }, []);

  useEffect(() => {
    if (!selectedProjectId && payload?.rows?.length) {
      setSelectedProjectId(payload.rows[0].project_id);
    }
  }, [selectedProjectId, payload?.rows]);

  const saveComment = useCallback(async (projectId: string, text: string) => {
    const key = `variance:${projectId}`;
    setSavingCommentKey(key);
    try {
      await fetch('/api/coo/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 'variance-review', scope: 'variance', recordId: projectId, comment: text }),
      });
    } finally {
      setSavingCommentKey(null);
    }
  }, []);

  const displayedRows = useMemo(() => {
    const rows = payload?.rows || [];
    if (includeMonitored) return rows;
    return rows.filter((r) =>
      Math.abs(r.variance_pct) >= 5 ||
      Math.abs(r.trend_hours_pct) >= 10 ||
      r.critical_open > 0 ||
      r.spi < 0.95,
    );
  }, [payload?.rows, includeMonitored]);

  const sevDistOption: EChartsOption = useMemo(() => {
    const dist = displayedRows.reduce((acc, r) => {
      acc[r.severity] += 1;
      return acc;
    }, { critical: 0, warning: 0, info: 0 } as { critical: number; warning: number; info: number });
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '50%'],
        label: { color: '#94a3b8', fontSize: 10, formatter: '{b}: {c}' },
        data: [
          { name: 'Critical', value: dist.critical, itemStyle: { color: '#ef4444' } },
          { name: 'Warning', value: dist.warning, itemStyle: { color: '#f59e0b' } },
          { name: 'Info', value: dist.info, itemStyle: { color: '#3b82f6' } },
        ],
      }],
    };
  }, [displayedRows]);

  const varianceBarOption: EChartsOption = useMemo(() => {
    const rows = displayedRows.slice(0, 12);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 134, right: 64, top: 8, bottom: 24, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      yAxis: {
        type: 'category',
        data: rows.map((r) => r.project_name),
        axisLabel: { color: '#94a3b8', fontSize: 10, width: 120, overflow: 'truncate' },
        inverse: true,
      },
      series: [{
        type: 'bar',
        data: rows.map((r) => ({
          value: r.variance_pct,
          itemStyle: { color: r.variance_pct >= 35 ? '#ef4444' : r.variance_pct >= 20 ? '#f59e0b' : '#6366f1', borderRadius: [0, 3, 3, 0] },
        })),
        barMaxWidth: 18,
        label: {
          show: true,
          position: 'right',
          color: '#94a3b8',
          fontSize: 10,
          formatter: (p: { value?: unknown }) => `${Number(p?.value || 0).toFixed(1)}%`,
        },
      }],
    };
  }, [displayedRows]);

  const rootCauseOption: EChartsOption = useMemo(() => {
    const agg = new Map<string, number>();
    displayedRows.forEach((r) => agg.set(r.root_cause, (agg.get(r.root_cause) || 0) + Math.max(1, Math.abs(r.variance_hours))));
    const rows = Array.from(agg.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const labelRows = rows.map(([full, val]) => ({ full, short: full.length > 28 ? `${full.slice(0, 26)}…` : full, value: val }));
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const raw = Array.isArray(p) ? p[0] : p;
          const full = String((raw as { name?: string })?.name || 'Unknown');
          const v = Number((raw as { value?: unknown })?.value || 0);
          return `${full}<br/>Impact: ${v.toFixed(1)} hrs`;
        },
      },
      grid: { left: 132, right: 56, top: 10, bottom: 28, containLabel: true },
      xAxis: {
        type: 'value',
        name: 'Impact (hrs)',
        axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}h' },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } },
      },
      yAxis: {
        type: 'category',
        data: labelRows.map((r) => r.short),
        axisLabel: { color: '#94a3b8', fontSize: 10, width: 168, overflow: 'truncate' },
        inverse: true,
      },
      series: [{
        type: 'bar',
        data: labelRows.map((r) => ({ name: r.full, value: r.value })),
        itemStyle: { color: '#818cf8', borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 16,
        label: {
          show: true,
          position: 'right',
          color: '#94a3b8',
          fontSize: 10,
          formatter: (p: { value?: unknown }) => `${Number(p?.value || 0).toFixed(0)}h`,
        },
      }],
    };
  }, [displayedRows]);

  const driverMatrixOption: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      formatter: (p: unknown) => {
        const raw = Array.isArray(p) ? p[0] : p;
        const d = (raw as { data?: unknown })?.data as [number, number, number, string, string] | undefined;
        if (!d) return '';
        return `${d[3]}<br/>SPI: ${d[0].toFixed(2)}<br/>Trend %: ${d[1].toFixed(1)}<br/>Variance %: ${d[2].toFixed(1)}<br/>Driver: ${d[4]}`;
      },
    },
    grid: { left: 58, right: 66, top: 12, bottom: 26, containLabel: true },
    xAxis: { type: 'value', min: 0, max: 1.3, name: 'SPI', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
    yAxis: { type: 'value', name: 'Trend Hours %', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
    series: [{
      type: 'scatter',
      data: displayedRows.map((r) => [r.spi, r.trend_hours_pct, Math.max(8, Math.abs(r.variance_pct)), r.project_name, r.root_cause]),
      symbolSize: (v: unknown) => Number((v as number[])[2] || 8),
      itemStyle: { color: (p: { data?: unknown }) => (((p.data as number[] | undefined)?.[1] || 0) > 0 ? '#ef4444' : '#10b981'), opacity: 0.85 },
    }],
    markLine: { symbol: 'none', lineStyle: { color: 'rgba(148,163,184,0.35)', type: 'dashed' }, data: [{ xAxis: 0.95 }, { yAxis: 0 }] },
  }), [displayedRows]);

  const summary = payload?.summary;

  return (
    <div>
      <h1 className="page-title">Variance Review</h1>
      <p className="page-subtitle">Period-over-period variance diagnostics with accountability, trend classification, and intervention prioritization.</p>
      {error && <div style={{ color: 'var(--color-error)', fontSize: '0.78rem', marginBottom: 10 }}>{error}</div>}

      {/* Summary KPIs */}
      {!loading && summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
          <div className="glass kpi-card" title="Count of projects with schedule data included in variance review"><div className="kpi-label">Total Projects</div><div className="kpi-value">{summary.total}</div></div>
          <div className="glass kpi-card" title="Projects with variance ≥35% or ≥8 critical open tasks — requires immediate executive review"><div className="kpi-label">Critical</div><div className="kpi-value" style={{ color: '#ef4444' }}>{summary.critical}</div></div>
          <div className="glass kpi-card" title="Projects with variance ≥20% or ≥5 critical open tasks — directive alignment recommended"><div className="kpi-label">Warning</div><div className="kpi-value" style={{ color: '#f59e0b' }}>{summary.warning}</div></div>
          <div className="glass kpi-card" title="Projects flagged for P1 intervention — highest priority for escalation"><div className="kpi-label">P1 Interventions</div><div className="kpi-value" style={{ color: '#ef4444' }}>{summary.p1}</div></div>
          <div className="glass kpi-card" title="Mean (actual_hours − baseline_hours) / baseline_hours × 100 across projects"><div className="kpi-label">Avg Variance</div><div className="kpi-value" style={{ color: summary.avgVariancePct >= 35 ? '#ef4444' : summary.avgVariancePct >= 20 ? '#f59e0b' : '#10b981' }}>{summary.avgVariancePct.toFixed(1)}%</div></div>
          <div className="glass kpi-card" title="Sum of (actual_hours − baseline_hours) in hours across all projects"><div className="kpi-label">Total Variance (hrs)</div><div className="kpi-value">{Math.round(summary.totalVarianceHours).toLocaleString()}</div></div>
        </div>
      )}

      {/* Filters */}
      <div className="glass-raised" style={{ padding: '0.55rem 0.7rem', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} title="Filter by severity: Critical (≥35% variance or ≥8 critical open), Warning (≥20% or ≥5 critical), Info (below thresholds)" style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.25rem 0.4rem', fontSize: '0.72rem' }}>
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} title="Filter by intervention priority: P1 (highest), P2 (medium), P3 (monitor)" style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.25rem 0.4rem', fontSize: '0.72rem' }}>
          <option value="all">All Priorities</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
          <option value="P3">P3</option>
        </select>
        <button
          onClick={() => setIncludeMonitored((v) => !v)}
          title={includeMonitored ? 'Showing all projects. Click to show only those with variance ≥5%, trend ≥10%, critical open >0, or SPI <0.95' : 'Showing only projects causing variance. Click to include all monitored projects.'}
          style={{ background: includeMonitored ? 'rgba(99,102,241,0.2)' : 'transparent', color: includeMonitored ? '#c4b5fd' : 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.25rem 0.45rem', fontSize: '0.72rem', cursor: 'pointer', fontWeight: includeMonitored ? 700 : 400 }}
        >
          {includeMonitored ? 'Including monitored' : 'Causing variance only'}
        </button>
      </div>

      {loading ? <Skeleton height={500} /> : (
        <>
          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.6fr', gap: 14, marginBottom: 14 }}>
              <div className="glass" style={{ padding: '1rem' }} title="(actual_hours − baseline_hours) / baseline_hours × 100 per project. Positive = over baseline; negative = under.">
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>Variance by Project</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>Hours variance % vs baseline</div>
              <ChartWrapper
                option={varianceBarOption}
                height={Math.max(200, displayedRows.slice(0, 12).length * 28 + 40)}
                onClick={(p: { name?: string }) => {
                  const name = String(p?.name || '');
                  const hit = displayedRows.find((r) => r.project_name === name);
                  if (hit) setSelectedProjectId(hit.project_id);
                }}
              />
            </div>
            <div className="glass" style={{ padding: '1rem' }} title="Critical: ≥35% variance or ≥8 critical open. Warning: ≥20% or ≥5 critical. Info: below thresholds.">
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>Severity Distribution</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>Project count by severity tier</div>
              <ChartWrapper option={sevDistOption} height={220} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="glass" style={{ padding: '1rem' }} title="SPI (x) vs Trend Hours % (y). Bubble size = |variance %|. Green = negative trend; red = positive trend.">
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>Variance Driver Matrix</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>SPI vs trend hours % — click to drill</div>
              <ChartWrapper
                option={driverMatrixOption}
                height={260}
                onClick={(p: { [key: string]: unknown }) => {
                  const dataPoint = p?.data as [number, number, number, string] | undefined;
                  const name = String(dataPoint?.[3] || '');
                  const hit = displayedRows.find((r) => r.project_name === name);
                  if (hit) setSelectedProjectId(hit.project_id);
                }}
              />
            </div>
            <div className="glass" style={{ padding: '1rem' }} title="Root cause buckets weighted by |variance_hours|. Higher impact = larger bar.">
              <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>Root Cause Concentration</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>Impact (hrs) by assigned root cause</div>
              <ChartWrapper option={rootCauseOption} height={260} />
            </div>
          </div>

          {(() => {
            const selected = displayedRows.find((r) => r.project_id === selectedProjectId) || displayedRows[0];
            if (!selected) return null;
            return (
              <div className="glass-raised" style={{ padding: '1.05rem', marginBottom: 14, border: '1px solid rgba(129,140,248,0.35)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>Drill Down — {selected.project_name}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 10 }}>Selected project metrics and recommendations</div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="dm-table" style={{ width: '100%', minWidth: 820, fontSize: '0.73rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }} title="Assigned root cause bucket for variance">Primary Cause</th>
                        <th style={{ textAlign: 'left' }} title="Suggested next step based on severity">Recommended Action</th>
                        <th style={{ textAlign: 'left' }} title="P1 = highest, P2 = medium, P3 = monitor">Priority</th>
                        <th style={{ textAlign: 'left' }} title="Critical / Warning / Info based on variance % and critical open count">Severity</th>
                        <th style={{ textAlign: 'right' }} title="(actual − baseline) / baseline × 100 and hours delta">Variance</th>
                        <th style={{ textAlign: 'right' }} title="SPI = actual/baseline; Trend % = recent vs prior 3M hours change">SPI / Trend</th>
                        <th style={{ textAlign: 'left' }} title="Avg percent_complete and completed/total tasks">Execution Posture</th>
                        <th style={{ textAlign: 'left' }} title="Open critical-path tasks not yet complete">Critical Path Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{selected.root_cause}</td>
                        <td>{selected.recommended_action}</td>
                        <td style={{ fontWeight: 700, color: selected.intervention_priority === 'P1' ? '#ef4444' : selected.intervention_priority === 'P2' ? '#f59e0b' : '#60a5fa' }}>{selected.intervention_priority}</td>
                        <td style={{ fontWeight: 700, color: SEV_COLOR[selected.severity] }}>{selected.severity}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{selected.variance_pct.toFixed(1)}% ({Math.round(selected.variance_hours).toLocaleString()} hrs)</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{selected.spi.toFixed(2)} / {selected.trend_hours_pct.toFixed(1)}%</td>
                        <td>{selected.avg_progress.toFixed(0)}% complete · {selected.completed_tasks}/{selected.total_tasks} tasks</td>
                        <td style={{ color: selected.critical_open >= 5 ? '#ef4444' : 'var(--text-primary)', fontWeight: 700 }}>{selected.critical_open} open critical tasks</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Full Variance Table */}
          <div className="glass-raised" style={{ padding: '1.05rem', overflow: 'hidden', border: '1px solid rgba(99,102,241,0.3)' }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 4 }}>Variance Detail Register</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>All projects with schedule data — click row to expand</div>
            <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
              <table className="dm-table" style={{ width: '100%', minWidth: 1240, fontSize: '0.68rem', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
                <thead>
                  <tr>
                    <th style={{ width: 26 }} />
                    <th style={{ textAlign: 'left' }} title="Project name">Project</th>
                    <th style={{ textAlign: 'left' }} title="P1 / P2 / P3 intervention priority">Priority</th>
                    <th style={{ textAlign: 'left' }} title="Critical / Warning / Info severity tier">Severity</th>
                    <th style={{ textAlign: 'left' }} title="Accountable portfolio owner">Owner</th>
                    <th style={{ textAlign: 'right' }} title="(actual_hours − baseline_hours) / baseline_hours × 100">Variance %</th>
                    <th style={{ textAlign: 'right' }} title="actual_hours − baseline_hours in hours">Variance Hrs</th>
                    <th style={{ textAlign: 'left' }} title="deteriorating / stable / recovering based on variance level">Trend</th>
                    <th style={{ textAlign: 'right' }} title="Schedule Performance Index = actual_hours / baseline_hours">SPI</th>
                    <th style={{ textAlign: 'right' }} title="(recent_3m − prior_3m) / prior_3m × 100 — workload acceleration">Trend %</th>
                    <th style={{ textAlign: 'left' }} title="Assigned root cause bucket">Root Cause</th>
                    <th style={{ textAlign: 'left' }} title="Recommended next action">Recommendation</th>
                    <th style={{ textAlign: 'left' }} title="COO variance review note">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => {
                    const ti = TREND_ICON[row.trend];
                    return (
                      <React.Fragment key={row.id}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => { toggleExpand(row.id); setSelectedProjectId(row.project_id); }}>
                          <td style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{expanded.has(row.id) ? '▾' : '▸'}</td>
                          <td style={{ fontWeight: 600 }}>{row.project_name}</td>
                          <td style={{ fontWeight: 700, color: row.intervention_priority === 'P1' ? '#ef4444' : row.intervention_priority === 'P2' ? '#f59e0b' : '#60a5fa' }}>{row.intervention_priority}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[row.severity] }} />
                              <span style={{ textTransform: 'uppercase', fontWeight: 700, color: SEV_COLOR[row.severity], fontSize: '0.68rem' }}>{row.severity}</span>
                            </span>
                          </td>
                          <td>{row.accountable_owner}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: row.variance_pct >= 35 ? '#ef4444' : row.variance_pct >= 20 ? '#f59e0b' : '#10b981' }}>{row.variance_pct.toFixed(1)}%</td>
                          <td style={{ textAlign: 'right' }}>{Math.round(row.variance_hours).toLocaleString()}</td>
                          <td><span style={{ color: ti.color, fontWeight: 700 }}>{ti.symbol} {row.trend}</span></td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: row.spi >= 0.95 ? '#10b981' : row.spi >= 0.85 ? '#f59e0b' : '#ef4444' }}>{row.spi.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: Math.abs(row.trend_hours_pct) <= 10 ? '#10b981' : Math.abs(row.trend_hours_pct) <= 25 ? '#f59e0b' : '#ef4444' }}>{row.trend_hours_pct.toFixed(1)}%</td>
                          <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.root_cause}>{row.root_cause}</td>
                          <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', color: '#c4b5fd' }} title={row.recommended_action}>{row.recommended_action}</td>
                          <td style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                            <input
                              value={comments[`variance:${row.project_id}`] || ''}
                              onChange={(e) => setComments((prev) => ({ ...prev, [`variance:${row.project_id}`]: e.target.value }))}
                              onBlur={(e) => saveComment(row.project_id, e.target.value)}
                              placeholder="Add variance review note"
                              style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                            />
                            {savingCommentKey === `variance:${row.project_id}` && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div>}
                          </td>
                        </tr>
                        {expanded.has(row.id) && (
                          <tr>
                            <td colSpan={13} style={{ padding: '0.5rem 0.8rem 0.6rem 2rem', background: 'rgba(99,102,241,0.04)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontSize: '0.69rem' }}>
                                <div><span style={{ color: 'var(--text-muted)' }}>Workstream:</span> {row.workstream}</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Actual / Baseline:</span> {Math.round(row.actual_hours).toLocaleString()} / {Math.round(row.baseline_hours).toLocaleString()} hrs</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Remaining:</span> {Math.round(row.remaining_hours).toLocaleString()} hrs</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Trending Hours:</span> {row.trend_hours_mo.toFixed(1)} hrs/mo</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> {row.avg_progress.toFixed(0)}%</div>
                                <div><span style={{ color: 'var(--text-muted)' }}>Tasks:</span> {row.completed_tasks} / {row.total_tasks} completed</div>
                                <div title="Tasks on critical path not yet 100% complete"><span style={{ color: 'var(--text-muted)' }}>Critical Open:</span> <span style={{ color: row.critical_open >= 5 ? '#ef4444' : 'var(--text-primary)' }}>{row.critical_open}</span></div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {displayedRows.length === 0 && (
                    <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No variance records for selected filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
