'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Forecast = {
  id: string;
  project_id: string;
  project_name: string;
  owner: string;
  submitted_by: string;
  forecast_hours: number;
  forecast_cost: number;
  baseline_hours: number;
  baseline_cost: number;
  forecast_end_date: string;
  period: string;
  notes: string;
  status: string;
  created_at: string;
  reviewed_by?: string;
  review_comment?: string;
  reviewed_at?: string;
};

type Project = {
  id: string;
  name: string;
  owner: string;
  actual_hours: number;
  baseline_hours: number;
  remaining_hours: number;
  total_hours: number;
  actual_cost: number;
  remaining_cost: number;
  contract_value: number;
  percent_complete: number;
  baseline_end: string;
};

type PhaseCatalog = {
  phase_id: string;
  phase_name: string;
  unit_name: string;
  baseline_hours: number;
  actual_hours: number;
  remaining_hours: number;
  actual_cost: number;
  remaining_cost: number;
  scheduled_cost: number;
};

type PhaseLine = {
  id?: string;
  phase_id: string;
  unit_name: string;
  phase_name: string;
  baseline_hours: number;
  actual_hours: number;
  current_remaining_hours: number;
  delta_hours: number;
  revised_remaining_hours: number;
  revised_eac_hours: number;
  current_eac_cost: number;
  delta_cost: number;
  revised_eac_cost: number;
  rationale: string;
  sort_order: number;
};

type FormPhaseLine = PhaseLine & { included: boolean };

type Payload = {
  success: boolean;
  forecasts: Forecast[];
  projects: Project[];
  monthlyTrendByProject: Record<string, { month: string; hours: number; cost: number; revenue: number }[]>;
  phaseCatalogByProject: Record<string, PhaseCatalog[]>;
  phaseLinesByForecast: Record<string, PhaseLine[]>;
};

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

const fmt = (n: number | null | undefined) => {
  const safe = Number.isFinite(n) ? Number(n) : 0;
  if (Math.abs(safe) >= 1e6) return `$${(safe / 1e6).toFixed(1)}M`;
  if (Math.abs(safe) >= 1e3) return `$${(safe / 1e3).toFixed(0)}K`;
  return `$${safe.toFixed(0)}`;
};

const healthColor = (v: number, isMargin = false) => {
  if (isMargin) return v >= 15 ? '#10b981' : v >= 5 ? '#f59e0b' : '#ef4444';
  return v >= 75 ? '#10b981' : v >= 55 ? '#f59e0b' : '#ef4444';
};

export default function PLForecastPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  const [projectId, setProjectId] = useState('');
  const [forecastHours, setForecastHours] = useState('');
  const [forecastCost, setForecastCost] = useState('');
  const [forecastEndDate, setForecastEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [phaseLines, setPhaseLines] = useState<FormPhaseLine[]>([]);
  const [usePhaseTotals, setUsePhaseTotals] = useState(true);
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'denied' | 'revision_requested'>('all');
  const [expandedForecastId, setExpandedForecastId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch('/api/project-lead/forecasts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedProject = useMemo(
    () => (data?.projects || []).find((p) => p.id === projectId) || null,
    [data, projectId],
  );

  const selectedTrend = useMemo(
    () => (projectId && data?.monthlyTrendByProject?.[projectId]) ? data.monthlyTrendByProject[projectId] : [],
    [data, projectId],
  );

  useEffect(() => {
    if (!projectId || !data?.phaseCatalogByProject) return;
    const rows = (data.phaseCatalogByProject[projectId] || []).map((ph, idx) => {
      const currentEacCost = ph.actual_cost + ph.remaining_cost;
      return {
        phase_id: ph.phase_id,
        unit_name: ph.unit_name,
        phase_name: ph.phase_name,
        baseline_hours: ph.baseline_hours,
        actual_hours: ph.actual_hours,
        current_remaining_hours: ph.remaining_hours,
        delta_hours: 0,
        revised_remaining_hours: ph.remaining_hours,
        revised_eac_hours: ph.actual_hours + ph.remaining_hours,
        current_eac_cost: currentEacCost,
        delta_cost: 0,
        revised_eac_cost: currentEacCost,
        rationale: '',
        sort_order: idx,
        included: true,
      } as FormPhaseLine;
    });
    setPhaseLines(rows);
  }, [projectId, data]);

  const phaseTotals = useMemo(() => {
    const included = phaseLines.filter((r) => r.included);
    const h = included.reduce((s, r) => s + Number(r.revised_eac_hours || 0), 0);
    const c = included.reduce((s, r) => s + Number(r.revised_eac_cost || 0), 0);
    return { hours: h, cost: c, count: included.length };
  }, [phaseLines]);

  useEffect(() => {
    if (!usePhaseTotals) return;
    setForecastHours(String(Math.round(phaseTotals.hours * 10) / 10));
    setForecastCost(String(Math.round(phaseTotals.cost)));
  }, [phaseTotals, usePhaseTotals]);

  const updatePhase = (idx: number, patch: Partial<FormPhaseLine>) => {
    setPhaseLines((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, ...patch };
      const revisedRemaining = Number(next.current_remaining_hours) + Number(next.delta_hours || 0);
      next.revised_remaining_hours = Math.max(0, revisedRemaining);
      next.revised_eac_hours = Number(next.actual_hours) + next.revised_remaining_hours;

      const currEacHours = Math.max(Number(next.actual_hours) + Number(next.current_remaining_hours), 1);
      const avgRateLocal = Number(next.current_eac_cost) / currEacHours;
      next.delta_cost = Math.round(Number(next.delta_hours || 0) * avgRateLocal);
      next.revised_eac_cost = Math.round(Number(next.current_eac_cost) + next.delta_cost);
      return next;
    }));
  };

  const currentEacHours = selectedProject ? selectedProject.actual_hours + selectedProject.remaining_hours : 0;
  const currentEacCost = selectedProject ? selectedProject.actual_cost + selectedProject.remaining_cost : 0;
  const avgRate = currentEacHours > 0 ? currentEacCost / currentEacHours : 0;

  const recentAvgHours = useMemo(() => {
    if (!selectedTrend.length) return 0;
    const tail = selectedTrend.slice(-3);
    return tail.reduce((s, r) => s + r.hours, 0) / tail.length;
  }, [selectedTrend]);

  const runRateEacHours = selectedProject ? selectedProject.actual_hours + Math.max(selectedProject.remaining_hours, recentAvgHours) : 0;
  const runRateEacCost = runRateEacHours * avgRate;
  const suggestedLow = Math.round((currentEacHours * 0.97) * 10) / 10;
  const suggestedHigh = Math.round((currentEacHours * 1.08) * 10) / 10;

  const selectedForecastHours = Number(forecastHours || 0);
  const selectedForecastCost = Number(forecastCost || 0);
  const hoursDelta = selectedForecastHours - currentEacHours;
  const costDelta = selectedForecastCost - currentEacCost;
  const baselineHours = selectedProject?.baseline_hours || 0;
  const baselineVariancePct = baselineHours > 0 ? ((selectedForecastHours - baselineHours) / baselineHours) * 100 : 0;
  const contractHeadroom = selectedProject ? selectedProject.contract_value - selectedForecastCost : 0;
  const forecastRunRate = selectedForecastHours > 0 ? selectedForecastCost / selectedForecastHours : 0;
  const forecastMargin = selectedProject && selectedProject.contract_value > 0
    ? ((selectedProject.contract_value - selectedForecastCost) / selectedProject.contract_value) * 100
    : 0;

  const quickFill = (mode: 'current' | 'runrate' | 'midpoint') => {
    if (!selectedProject) return;
    if (mode === 'current') {
      setForecastHours(String(Math.round(currentEacHours * 10) / 10));
      setForecastCost(String(Math.round(currentEacCost)));
    } else if (mode === 'runrate') {
      setForecastHours(String(Math.round(runRateEacHours * 10) / 10));
      setForecastCost(String(Math.round(runRateEacCost)));
    } else {
      const midHours = (suggestedLow + suggestedHigh) / 2;
      const midCost = midHours * avgRate;
      setForecastHours(String(Math.round(midHours * 10) / 10));
      setForecastCost(String(Math.round(midCost)));
    }
    setUsePhaseTotals(false);
  };

  const submit = async () => {
    if (!projectId) return;
    setSaving(true);
    const linesPayload = phaseLines
      .filter((r) => r.included)
      .map((r, idx) => ({ ...r, sort_order: idx }));

    await fetch('/api/project-lead/forecasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit',
        projectId,
        forecastHours: Number(forecastHours || 0),
        forecastCost: Number(forecastCost || 0),
        baselineHours: selectedProject?.baseline_hours || 0,
        baselineCost: (selectedProject?.actual_cost || 0) + (selectedProject?.remaining_cost || 0),
        forecastEndDate: forecastEndDate || null,
        period: new Date().toISOString().slice(0, 7),
        notes,
        submittedBy: 'PL',
        phaseLines: linesPayload,
      }),
    });

    setSaving(false);
    setProjectId('');
    setForecastHours('');
    setForecastCost('');
    setForecastEndDate('');
    setNotes('');
    setPhaseLines([]);
    setExpandedForecastId(null);
    loadData();
  };

  const filtered = useMemo(
    () => (data?.forecasts || []).filter((f) => (filter === 'all' ? true : f.status === filter)),
    [data, filter],
  );

  const kpis = useMemo(() => {
    const rows = data?.forecasts || [];
    if (!rows.length) {
      return { submissions: 0, approvalRate: 0, avgHoursVariancePct: 0, avgForecastMargin: 0, avgRate: 0 };
    }
    const approvals = rows.filter((f) => f.status === 'approved').length;
    const avgVariancePct = rows.reduce((s, f) => {
      if (!f.baseline_hours) return s;
      return s + (((f.forecast_hours - f.baseline_hours) / f.baseline_hours) * 100);
    }, 0) / rows.length;
    const margins = rows.map((f) => {
      const p = (data?.projects || []).find((pr) => pr.id === f.project_id);
      if (!p || p.contract_value <= 0) return 0;
      return ((p.contract_value - f.forecast_cost) / p.contract_value) * 100;
    });
    const avgMargin = margins.reduce((s, m) => s + m, 0) / margins.length;
    const avgRateVal = rows.reduce((s, f) => s + (f.forecast_hours > 0 ? f.forecast_cost / f.forecast_hours : 0), 0) / rows.length;
    return {
      submissions: rows.length,
      approvalRate: Math.round((approvals / rows.length) * 1000) / 10,
      avgHoursVariancePct: Math.round(avgVariancePct * 10) / 10,
      avgForecastMargin: Math.round(avgMargin * 10) / 10,
      avgRate: Math.round(avgRateVal * 100) / 100,
    };
  }, [data]);

  const statusMix = useMemo<EChartsOption>(() => {
    const list = data?.forecasts || [];
    if (!list.length) return {};
    const c: Record<string, number> = {};
    list.forEach((f) => { c[f.status] = (c[f.status] || 0) + 1; });
    const order = ['pending', 'revision_requested', 'approved', 'denied'];
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 90, right: 20, top: 18, bottom: 20 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'category', data: order.filter((k) => c[k] != null).map((k) => k.replace('_', ' ')), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{
        type: 'bar',
        data: order.filter((k) => c[k] != null).map((k) => ({
          value: c[k],
          itemStyle: { color: k === 'approved' ? '#10b981' : k === 'denied' ? '#ef4444' : k === 'revision_requested' ? '#f59e0b' : '#64748b', borderRadius: [0, 4, 4, 0] },
        })),
      }],
    };
  }, [data]);

  const approvalTrend = useMemo<EChartsOption>(() => {
    const rows = data?.forecasts || [];
    if (!rows.length) return {};
    const byMonth: Record<string, { approved: number; pending: number; denied: number }> = {};
    rows.forEach((f) => {
      const m = (f.created_at || '').slice(0, 7);
      if (!m) return;
      if (!byMonth[m]) byMonth[m] = { approved: 0, pending: 0, denied: 0 };
      if (f.status === 'approved') byMonth[m].approved += 1;
      else if (f.status === 'denied') byMonth[m].denied += 1;
      else byMonth[m].pending += 1;
    });
    const months = Object.keys(byMonth).sort();
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Approved', 'Pending/Revision', 'Denied'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 45, right: 20, top: 32, bottom: 30 },
      xAxis: { type: 'category', data: months, axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [
        { name: 'Approved', type: 'line', smooth: true, data: months.map((m) => byMonth[m].approved) },
        { name: 'Pending/Revision', type: 'line', smooth: true, data: months.map((m) => byMonth[m].pending) },
        { name: 'Denied', type: 'line', smooth: true, data: months.map((m) => byMonth[m].denied) },
      ],
    };
  }, [data]);

  const pressureMatrix = useMemo<EChartsOption>(() => {
    const rows = data?.forecasts || [];
    if (!rows.length) return {};
    const latestByProject = new Map<string, Forecast>();
    rows.forEach((f) => {
      const prev = latestByProject.get(f.project_id);
      if (!prev || new Date(f.created_at).getTime() > new Date(prev.created_at).getTime()) latestByProject.set(f.project_id, f);
    });
    const points = Array.from(latestByProject.values()).map((f) => {
      const p = (data?.projects || []).find((pr) => pr.id === f.project_id);
      const variancePct = f.baseline_hours > 0 ? ((f.forecast_hours - f.baseline_hours) / f.baseline_hours) * 100 : 0;
      const marginPct = p && p.contract_value > 0 ? ((p.contract_value - f.forecast_cost) / p.contract_value) * 100 : 0;
      return [variancePct, marginPct, f.project_name, f.status];
    });
    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const d = (params as { data: [number, number, string, string] }).data;
          return `${d[2]}<br/>Hours Variance: ${d[0].toFixed(1)}%<br/>Margin: ${d[1].toFixed(1)}%<br/>Status: ${d[3]}`;
        },
      },
      grid: { left: 50, right: 16, top: 16, bottom: 40 },
      xAxis: { type: 'value', name: 'Hours Variance %', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', name: 'Forecast Margin %', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{ type: 'scatter', symbolSize: 12, data: points, itemStyle: { color: '#6366f1' } }],
    };
  }, [data]);

  const selectedTrendChart = useMemo<EChartsOption>(() => {
    if (!selectedTrend.length) return {};
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Hours', 'Cost', 'Revenue'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 50, right: 50, top: 34, bottom: 30 },
      xAxis: { type: 'category', data: selectedTrend.map((r) => r.month), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [{ type: 'value', name: 'Hours' }, { type: 'value', name: '$' }],
      series: [
        { type: 'bar', name: 'Hours', data: selectedTrend.map((r) => r.hours) },
        { type: 'line', name: 'Cost', yAxisIndex: 1, data: selectedTrend.map((r) => r.cost), smooth: true },
        { type: 'line', name: 'Revenue', yAxisIndex: 1, data: selectedTrend.map((r) => r.revenue), smooth: true },
      ],
    };
  }, [selectedTrend]);

  if (loading) return <div><h1 className="page-title">Forecast</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={80} />)}</div><Skeleton height={360} /></div>;
  if (!data?.success) return <div><h1 className="page-title">Forecast</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load forecast data.</div></div>;

  return (
    <div>
      <h1 className="page-title">Forecast</h1>
      <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.85rem' }}>
        Submit forecasts here. Senior Manager reviews on <Link href="/senior-manager/forecast-review" style={{ color: '#6366f1', textDecoration: 'underline' }}>Forecast Review</Link>. Status and feedback sync in both directions.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <KpiCard label="Submissions" value={kpis.submissions} />
        <KpiCard label="Approval Rate" value={`${kpis.approvalRate}%`} color={healthColor(kpis.approvalRate)} />
        <KpiCard label="Avg Hours Variance %" value={`${kpis.avgHoursVariancePct > 0 ? '+' : ''}${kpis.avgHoursVariancePct.toFixed(1)}%`} color={kpis.avgHoursVariancePct > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Avg Forecast Margin" value={`${kpis.avgForecastMargin}%`} color={healthColor(kpis.avgForecastMargin, true)} />
        <KpiCard label="Avg Forecast $/hr" value={`$${kpis.avgRate.toFixed(2)}`} />
      </div>

      <div className="glass" style={{ padding: '0.7rem', marginBottom: '0.85rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Create Forecast</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(160px,1fr))', gap: '0.42rem', marginBottom: '0.45rem' }}>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.4rem' }}><option value="">Select project</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <input value={forecastEndDate} onChange={(e) => setForecastEndDate(e.target.value)} type="date" style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.4rem' }} />
            <input value={forecastHours} onChange={(e) => setForecastHours(e.target.value)} type="number" placeholder="Forecast hours" style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.4rem' }} />
            <input value={forecastCost} onChange={(e) => setForecastCost(e.target.value)} type="number" placeholder="Forecast cost" style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.4rem' }} />
          </div>

          {selectedProject && (
            <div className="glass" style={{ padding: '0.5rem', marginBottom: '0.45rem', border: '1px solid rgba(148,163,184,0.14)' }}>
              <div style={{ fontSize: '0.72rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.25rem' }}>Project Guidance</div>
              <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginBottom: '0.25rem' }}>Current EAC Hrs {currentEacHours.toLocaleString()} · Current EAC Cost {fmt(currentEacCost)} · Run-rate EAC Hrs {Math.round(runRateEacHours).toLocaleString()}</div>
              <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Suggested Hours Range: {suggestedLow.toLocaleString()} - {suggestedHigh.toLocaleString()} · Forecast Margin: <span style={{ color: healthColor(forecastMargin, true), fontWeight: 700 }}>{forecastMargin.toFixed(1)}%</span></div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <button onClick={() => quickFill('current')} style={{ fontSize: '0.62rem', borderRadius: 5, border: '1px solid rgba(99,102,241,.35)', background: 'rgba(99,102,241,.2)', color: '#c7d2fe', padding: '0.22rem 0.45rem', cursor: 'pointer' }}>Use Current EAC</button>
                <button onClick={() => quickFill('runrate')} style={{ fontSize: '0.62rem', borderRadius: 5, border: '1px solid rgba(16,185,129,.35)', background: 'rgba(16,185,129,.2)', color: '#a7f3d0', padding: '0.22rem 0.45rem', cursor: 'pointer' }}>Use Run-rate EAC</button>
                <button onClick={() => quickFill('midpoint')} style={{ fontSize: '0.62rem', borderRadius: 5, border: '1px solid rgba(245,158,11,.35)', background: 'rgba(245,158,11,.2)', color: '#fde68a', padding: '0.22rem 0.45rem', cursor: 'pointer' }}>Use Midpoint</button>
              </div>
              <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Delta vs Current EAC: <span style={{ color: hoursDelta > 0 ? '#ef4444' : '#10b981' }}>{hoursDelta > 0 ? '+' : ''}{hoursDelta.toFixed(1)} hrs</span> ·<span style={{ color: costDelta > 0 ? '#ef4444' : '#10b981', marginLeft: 4 }}>{costDelta > 0 ? '+' : ''}{fmt(costDelta)}</span></div>
              <div style={{ marginTop: '0.45rem' }}>
                <ChartWrapper option={selectedTrendChart} height={128} />
              </div>
            </div>
          )}

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.4rem' }}><input type="checkbox" checked={usePhaseTotals} onChange={(e) => setUsePhaseTotals(e.target.checked)} /> Use phase plan totals ({phaseTotals.count} lines)</label>

          {phaseLines.length > 0 && <div style={{ marginBottom: '0.45rem', maxHeight: 290, overflow: 'auto', border: '1px solid rgba(148,163,184,.12)', borderRadius: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.64rem' }}><thead><tr style={{ borderBottom: '1px solid rgba(148,163,184,.14)' }}><th style={{ textAlign: 'left', padding: '0.3rem' }}>In</th><th style={{ textAlign: 'left', padding: '0.3rem' }}>Phase</th><th style={{ textAlign: 'right', padding: '0.3rem' }}>Curr Rem</th><th style={{ textAlign: 'right', padding: '0.3rem' }}>Δ Hrs</th><th style={{ textAlign: 'right', padding: '0.3rem' }}>Revised EAC Hrs</th><th style={{ textAlign: 'right', padding: '0.3rem' }}>Δ Cost</th><th style={{ textAlign: 'right', padding: '0.3rem' }}>Revised EAC Cost</th><th style={{ textAlign: 'left', padding: '0.3rem' }}>Rationale</th></tr></thead><tbody>{phaseLines.map((r, idx) => <tr key={`${r.phase_id}-${idx}`} style={{ borderBottom: '1px solid rgba(148,163,184,.06)', opacity: r.included ? 1 : 0.55 }}><td style={{ padding: '0.3rem' }}><input type="checkbox" checked={r.included} onChange={(e) => updatePhase(idx, { included: e.target.checked })} /></td><td style={{ padding: '0.3rem', color: '#e2e8f0', minWidth: 120 }}>{r.phase_name}</td><td style={{ padding: '0.3rem', textAlign: 'right', color: '#94a3b8' }}>{r.current_remaining_hours.toFixed(1)}</td><td style={{ padding: '0.3rem', textAlign: 'right' }}><input type="number" value={r.delta_hours} onChange={(e) => updatePhase(idx, { delta_hours: Number(e.target.value || 0) })} style={{ width: 64, background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 4, padding: '0.16rem' }} /></td><td style={{ padding: '0.3rem', textAlign: 'right', color: '#cbd5e1' }}>{r.revised_eac_hours.toFixed(1)}</td><td style={{ padding: '0.3rem', textAlign: 'right', color: r.delta_cost > 0 ? '#ef4444' : '#10b981' }}>{fmt(r.delta_cost)}</td><td style={{ padding: '0.3rem', textAlign: 'right', color: '#cbd5e1' }}>{fmt(r.revised_eac_cost)}</td><td style={{ padding: '0.3rem', minWidth: 160 }}><input type="text" value={r.rationale} onChange={(e) => updatePhase(idx, { rationale: e.target.value })} placeholder="reason for change" style={{ width: '100%', background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 4, padding: '0.16rem' }} /></td></tr>)}</tbody></table></div>}

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Rationale and key changes..." rows={3} style={{ width: '100%', background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.4rem', marginBottom: '0.5rem' }} />
          <button onClick={submit} disabled={!projectId || saving} style={{ background: 'rgba(59,130,246,.25)', border: '1px solid rgba(59,130,246,.5)', color: '#bfdbfe', borderRadius: 6, padding: '0.35rem 0.7rem', cursor: 'pointer' }}>{saving ? 'Submitting...' : 'Submit Forecast'}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: '#e2e8f0' }}>Submission Status Mix</h3>
          <ChartWrapper option={statusMix} height={170} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: '#e2e8f0' }}>Approval Trend by Month</h3>
          <ChartWrapper option={approvalTrend} height={170} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.35rem', color: '#e2e8f0' }}>Forecast Pressure Matrix</h3>
          <ChartWrapper option={pressureMatrix} height={170} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.55rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.55rem' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Baseline Variance</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: baselineVariancePct > 5 ? '#ef4444' : baselineVariancePct > 0 ? '#f59e0b' : '#10b981' }}>
            {baselineVariancePct > 0 ? '+' : ''}{baselineVariancePct.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.62rem', color: '#64748b' }}>Forecast vs baseline hours</div>
        </div>
        <div className="glass" style={{ padding: '0.55rem' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Contract Headroom</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: contractHeadroom >= 0 ? '#10b981' : '#ef4444' }}>
            {contractHeadroom >= 0 ? '+' : ''}{fmt(contractHeadroom)}
          </div>
          <div style={{ fontSize: '0.62rem', color: '#64748b' }}>Contract - forecast cost</div>
        </div>
        <div className="glass" style={{ padding: '0.55rem' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Forecast Run Rate</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#cbd5e1' }}>
            ${forecastRunRate.toFixed(2)}/hr
          </div>
          <div style={{ fontSize: '0.62rem', color: '#64748b' }}>Forecast cost per forecast hour</div>
        </div>
        <div className="glass" style={{ padding: '0.55rem' }}>
          <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>Phase Included</div>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: phaseTotals.count > 0 ? '#10b981' : '#94a3b8' }}>
            {phaseTotals.count} / {phaseLines.length}
          </div>
          <div style={{ fontSize: '0.62rem', color: '#64748b' }}>Lines participating in totals</div>
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Forecast Register</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.3rem 0.45rem', fontSize: '0.68rem' }}><option value="all">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="denied">Denied</option><option value="revision_requested">Revision Requested</option></select>
            <Link href="/senior-manager/forecast-review" style={{ fontSize: '0.68rem', padding: '0.25rem 0.5rem', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#c7d2fe', borderRadius: 6, textDecoration: 'none' }}>View SM Forecast Review →</Link>
          </div>
        </div>

        {filtered.length === 0 ? <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No forecasts {filter !== 'all' ? <>with status &ldquo;{filter}&rdquo;</> : 'yet'}. Click &ldquo;Submit Forecast&rdquo; to create one.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead><tr style={{ borderBottom: '1px solid rgba(148,163,184,.14)' }}>{['Project', 'Lead', 'Forecast Hours', 'Forecast Cost', 'Forecast Margin', 'Status', 'Period', 'Created'].map((h) => <th key={h} style={{ textAlign: ['Project', 'Lead'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600, padding: '0.4rem 0.5rem' }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map((f) => {
                  const p = data.projects.find((x) => x.id === f.project_id);
                  const margin = p && p.contract_value > 0 ? ((p.contract_value - f.forecast_cost) / p.contract_value) * 100 : 0;
                  const expanded = expandedForecastId === f.id;
                  const lines = data.phaseLinesByForecast?.[f.id] || [];
                  return <React.Fragment key={f.id}><tr style={{ borderBottom: '1px solid rgba(148,163,184,.08)', cursor: 'pointer' }} onClick={() => setExpandedForecastId((prev) => (prev === f.id ? null : f.id))}><td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0' }}>{f.project_name}</td><td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{f.owner}</td><td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#cbd5e1' }}>{f.forecast_hours.toLocaleString()}</td><td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#cbd5e1' }}>{fmt(f.forecast_cost)}</td><td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: healthColor(margin, true), fontWeight: 600 }}>{margin.toFixed(1)}%</td><td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: f.status === 'approved' ? '#10b981' : f.status === 'denied' ? '#ef4444' : f.status === 'revision_requested' ? '#f59e0b' : '#94a3b8' }}>{f.status}</td><td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{f.period || '—'}</td><td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#64748b' }}>{f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}</td></tr>{expanded && <tr><td colSpan={8} style={{ padding: '0.55rem 0.7rem', background: 'rgba(30,41,59,0.45)' }}>{f.status === 'revision_requested' && f.review_comment && <div style={{ marginBottom: '0.5rem', padding: '0.4rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, color: '#fde68a', fontSize: '0.72rem' }}><strong>SM feedback:</strong> {f.review_comment}</div>}<div style={{ color: '#94a3b8', fontSize: '0.66rem', marginBottom: '0.35rem' }}>{f.notes || 'No note provided.'}</div>{lines.length > 0 ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.66rem' }}><thead><tr style={{ borderBottom: '1px solid rgba(148,163,184,.12)' }}>{['Phase', 'Unit', 'Baseline Hrs', 'Actual Hrs', 'Curr Rem', 'Δ Hrs', 'Revised EAC Hrs', 'Δ Cost', 'Revised EAC Cost', 'Rationale'].map((h) => <th key={h} style={{ textAlign: ['Phase', 'Unit', 'Rationale'].includes(h) ? 'left' : 'right', color: '#94a3b8', padding: '0.28rem 0.35rem' }}>{h}</th>)}</tr></thead><tbody>{lines.map((l, idx) => <tr key={`${f.id}-${idx}`} style={{ borderBottom: '1px solid rgba(148,163,184,.06)' }}><td style={{ padding: '0.28rem 0.35rem', color: '#e2e8f0' }}>{l.phase_name}</td><td style={{ padding: '0.28rem 0.35rem', color: '#94a3b8' }}>{l.unit_name || '—'}</td><td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: '#94a3b8' }}>{l.baseline_hours.toFixed(1)}</td><td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: '#94a3b8' }}>{l.actual_hours.toFixed(1)}</td><td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: '#94a3b8' }}>{l.current_remaining_hours.toFixed(1)}</td><td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: l.delta_hours > 0 ? '#ef4444' : '#10b981' }}>{l.delta_hours.toFixed(1)}</td><td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: '#cbd5e1' }}>{l.revised_eac_hours.toFixed(1)}</td><td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: l.delta_cost > 0 ? '#ef4444' : '#10b981' }}>{fmt(l.delta_cost)}</td><td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: '#cbd5e1' }}>{fmt(l.revised_eac_cost)}</td><td style={{ padding: '0.28rem 0.35rem', color: '#94a3b8' }}>{l.rationale || '—'}</td></tr>)}</tbody></table></div> : <div style={{ fontSize: '0.66rem', color: '#64748b' }}>No phase breakdown submitted for this forecast.</div>}</td></tr>}</React.Fragment>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
