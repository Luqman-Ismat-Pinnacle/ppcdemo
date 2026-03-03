'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Phase = {
  id: string; name: string; project_id: string; project_name: string; customer_name: string; unit_name: string;
  actual_cost: number; remaining_cost: number; eac: number; contract_value: number;
  margin: number; burn_rate: number; cost_per_hour: number;
  baseline_hours: number; actual_hours: number; remaining_hours: number; total_hours: number;
  percent_complete: number;
};
type Payload = {
  success: boolean;
  kpis: { totalActual: number; totalEac: number; totalContract: number; totalMargin: number; burnRate: number; avgCostPerHour: number; contractGap: number };
  phases: Phase[];
};

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (<div className="glass kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={color ? { color } : {}}>{value}</div>{detail && <div className="kpi-detail">{detail}</div>}</div>);
}

function healthColor(v: number, isMargin = false) {
  if (isMargin) return v >= 15 ? '#10b981' : v >= 5 ? '#f59e0b' : '#ef4444';
  return v >= 80 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444';
}

const fmt = (n: number | null | undefined) => {
  const safe = Number.isFinite(n) ? Number(n) : 0;
  if (Math.abs(safe) >= 1e6) return `$${(safe / 1e6).toFixed(1)}M`;
  if (Math.abs(safe) >= 1e3) return `$${(safe / 1e3).toFixed(0)}K`;
  return `$${safe.toFixed(0)}`;
};

export default function CostControlPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/project-lead/cost-control', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const marginByPhase = useMemo<EChartsOption>(() => {
    if (!data?.phases?.length) return {};
    const sorted = [...data.phases].sort((a, b) => a.margin - b.margin).slice(0, 20);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 140, right: 40, top: 10, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((p) => p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{ type: 'bar', data: sorted.map((p) => ({ value: Math.round(p.margin * 10) / 10, itemStyle: { borderRadius: [0, 3, 3, 0], color: healthColor(p.margin, true) } })) }],
    };
  }, [data]);

  const burnVsMargin = useMemo<EChartsOption>(() => {
    if (!data?.phases?.length) return {};
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const d = (p as { data: [number, number, string] }).data;
          return `${d[2]}<br/>Burn: ${d[0].toFixed(1)}%<br/>Margin: ${d[1].toFixed(1)}%`;
        },
      },
      grid: { left: 45, right: 16, top: 16, bottom: 36 },
      xAxis: { type: 'value', name: 'Burn Rate %', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', name: 'Margin %', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{
        type: 'scatter',
        symbolSize: 11,
        data: data.phases.map((p) => [p.burn_rate, p.margin, `${p.project_name} — ${p.name}`]),
        itemStyle: { color: '#6366f1' },
        markLine: {
          symbol: 'none',
          lineStyle: { type: 'dashed', color: 'rgba(148,163,184,0.35)' },
          data: [{ xAxis: 90 }, { yAxis: 10 }],
        },
      }],
    };
  }, [data]);

  const completionVsCost = useMemo<EChartsOption>(() => {
    if (!data?.phases?.length) return {};
    const rows = [...data.phases].sort((a, b) => (a.percent_complete - a.burn_rate) - (b.percent_complete - b.burn_rate)).slice(0, 20);
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Progress', 'Burn Rate'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 140, right: 20, top: 30, bottom: 22 },
      yAxis: { type: 'category', data: rows.map((r) => r.name.length > 22 ? `${r.name.slice(0, 20)}…` : r.name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' } },
      series: [
        { name: 'Progress', type: 'bar', data: rows.map((r) => r.percent_complete), itemStyle: { color: '#10b981' } },
        { name: 'Burn Rate', type: 'bar', data: rows.map((r) => r.burn_rate), itemStyle: { color: '#f59e0b', borderRadius: [0, 3, 3, 0] } },
      ],
    };
  }, [data]);

  if (loading) return <div><h1 className="page-title">Cost Control</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} height={80} />)}</div><Skeleton height={300} /></div>;
  if (!data?.success) return <div><h1 className="page-title">Cost Control</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load cost data.</div></div>;

  const k = data.kpis;

  return (
    <div>
      <h1 className="page-title">Cost Control</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '0.95rem' }}>
        <KpiCard label="Total Actual" value={fmt(k.totalActual)} />
        <KpiCard label="EAC" value={fmt(k.totalEac)} detail={`Remaining: ${fmt(k.totalEac - k.totalActual)}`} />
        <KpiCard label="Contract Value" value={fmt(k.totalContract)} />
        <KpiCard label="Margin" value={`${k.totalMargin}%`} color={healthColor(k.totalMargin, true)} />
        <KpiCard label="Burn Rate" value={`${k.burnRate}%`} color={k.burnRate > 90 ? '#ef4444' : k.burnRate > 75 ? '#f59e0b' : '#10b981'} detail="Actual / Contract" />
        <KpiCard label="Avg $/hr" value={`$${k.avgCostPerHour.toFixed(2)}`} />
        <KpiCard label="Contract Gap" value={fmt(k.contractGap)} color={k.contractGap < 0 ? '#ef4444' : '#10b981'} detail="Contract - EAC" />
      </div>

      <div className="glass" style={{ padding: '0.7rem', marginBottom: '0.85rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Margin by Phase</h3>
        <ChartWrapper option={marginByPhase} height={Math.min(420, Math.max(220, (data.phases?.length || 5) * 22))} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Burn Rate vs Margin (Phase)</h3>
          <ChartWrapper option={burnVsMargin} height={240} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Completion vs Cost Burn (Phase)</h3>
          <ChartWrapper option={completionVsCost} height={240} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.7rem', marginBottom: '0.85rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Cost Pressure Watchlist (Phase)</h3>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '42vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Phase', 'Project', 'Burn vs Progress', 'Contract Gap', 'Flag'].map((h) => (
                  <th key={h} style={{ padding: '0.3rem 0.4rem', textAlign: ['Phase', 'Project', 'Flag'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data.phases].map((p) => {
                const burnVsProgress = p.burn_rate - p.percent_complete;
                const gap = p.contract_value - p.eac;
                const flag = burnVsProgress > 15 || gap < 0 ? 'High' : burnVsProgress > 5 || gap < p.contract_value * 0.05 ? 'Watch' : 'OK';
                return (
                  <tr key={`${p.id}-watch`} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                    <td style={{ padding: '0.3rem 0.4rem', color: '#e2e8f0' }}>{p.name}</td>
                    <td style={{ padding: '0.3rem 0.4rem', color: '#94a3b8' }}>{p.project_name}</td>
                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: burnVsProgress > 10 ? '#ef4444' : burnVsProgress > 3 ? '#f59e0b' : '#10b981' }}>
                      {burnVsProgress > 0 ? '+' : ''}{burnVsProgress.toFixed(1)}%
                    </td>
                    <td style={{ padding: '0.3rem 0.4rem', textAlign: 'right', color: gap < 0 ? '#ef4444' : '#10b981' }}>{gap < 0 ? '-' : '+'}{fmt(Math.abs(gap))}</td>
                    <td style={{ padding: '0.3rem 0.4rem', color: flag === 'High' ? '#ef4444' : flag === 'Watch' ? '#f59e0b' : '#10b981' }}>{flag}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass" style={{ padding: '0.7rem', marginBottom: '0.85rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Phase Cost Summary</h3>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '46vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Phase', 'Project', 'Unit', 'Customer', 'Actual', 'Remaining', 'EAC', 'Contract Alloc', 'Margin', 'Burn Rate', '$/hr'].map((h) => (
                  <th key={h} style={{ padding: '0.32rem 0.42rem', textAlign: ['Phase', 'Project', 'Unit', 'Customer'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.phases.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                  <td style={{ padding: '0.32rem 0.42rem', color: '#e2e8f0', fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: '0.32rem 0.42rem', color: '#94a3b8' }}>{p.project_name}</td>
                  <td style={{ padding: '0.32rem 0.42rem', color: '#94a3b8' }}>{p.unit_name || '—'}</td>
                  <td style={{ padding: '0.32rem 0.42rem', color: '#94a3b8' }}>{p.customer_name}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: '#e2e8f0' }}>{fmt(p.actual_cost)}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: '#94a3b8' }}>{fmt(p.remaining_cost)}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: '#e2e8f0' }}>{fmt(p.eac)}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: '#94a3b8' }}>{fmt(p.contract_value)}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: healthColor(p.margin, true), fontWeight: 600 }}>{p.margin.toFixed(1)}%</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: p.burn_rate > 100 ? '#ef4444' : p.burn_rate > 85 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{p.burn_rate.toFixed(1)}%</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: '#94a3b8' }}>${p.cost_per_hour.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
