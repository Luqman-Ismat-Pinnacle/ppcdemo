'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Project = {
  id: string; name: string; owner: string; customer_name: string;
  actual_cost: number; remaining_cost: number; contract_value: number; eac: number;
  margin: number; actual_hours: number; total_hours: number; baseline_hours: number;
  percent_complete: number; cost_per_hour: number; burn_rate: number;
};
type Payload = {
  success: boolean;
  kpis: { totalContract: number; totalEac: number; totalActual: number; totalRemaining: number; portfolioMargin: number; burnRate: number; projectsAtRisk: number; projectsHealthy: number };
  projects: Project[];
  monthly: { month: string; cost: number; hours: number; revenue: number }[];
  quarterly: { quarter: string; cost: number; hours: number }[];
  byCustomer: { customer_name: string; contract: number; eac: number; margin_pct: number; projects: number }[];
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

const fmt = (n: number) => {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

function marginColor(v: number) {
  if (v >= 15) return '#10b981';
  if (v >= 5) return '#f59e0b';
  return '#ef4444';
}

export default function FinancialHealthPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<'margin' | 'eac' | 'burn_rate'>('margin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    fetch('/api/senior-manager/financial-health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSort = useCallback((key: 'margin' | 'eac' | 'burn_rate') => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'margin' ? 'asc' : 'desc'); }
  }, [sortKey]);

  const sortedProjects = useMemo(() => {
    if (!data?.projects) return [];
    return [...data.projects].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [data, sortKey, sortDir]);

  const revenueCostChart = useMemo<EChartsOption>(() => {
    if (!data?.monthly.length) return {};
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Revenue', 'Cost'], top: 0, textStyle: { color: '#94a3b8', fontSize: 11 } },
      grid: { left: 60, right: 40, top: 35, bottom: 30 },
      xAxis: { type: 'category', data: data.monthly.map((m) => m.month), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [
        { name: 'Revenue', type: 'line', data: data.monthly.map((m) => m.revenue), smooth: true, areaStyle: { color: 'rgba(16,185,129,0.12)' }, lineStyle: { color: '#10b981' }, itemStyle: { color: '#10b981' } },
        { name: 'Cost', type: 'line', data: data.monthly.map((m) => m.cost), smooth: true, areaStyle: { color: 'rgba(239,68,68,0.08)' }, lineStyle: { color: '#ef4444' }, itemStyle: { color: '#ef4444' } },
      ],
    } as EChartsOption;
  }, [data]);

  const customerExposureChart = useMemo<EChartsOption>(() => {
    if (!data?.byCustomer.length) return {};
    const sorted = [...data.byCustomer].sort((a, b) => b.contract - a.contract).slice(0, 10);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (p: unknown) => {
          const params = Array.isArray(p) ? p : [p];
          if (!params.length) return '';
          const idx = (params[0] as { dataIndex?: number }).dataIndex ?? 0;
          const c = sorted[idx];
          if (!c) return '';
          const gap = c.contract - c.eac;
          return `<b>${c.customer_name}</b><br/>Contract: ${fmt(c.contract)}<br/>EAC: ${fmt(c.eac)}<br/>Gap: ${fmt(gap)} (${gap >= 0 ? 'under budget' : 'over budget'})<br/>Margin: ${c.margin_pct.toFixed(1)}%`;
        },
      },
      legend: { data: ['Contract', 'EAC'], top: 0, textStyle: { color: '#94a3b8', fontSize: 11 } },
      grid: { left: 130, right: 50, top: 35, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((c) => c.customer_name.length > 20 ? c.customer_name.slice(0, 18) + '…' : c.customer_name), axisLabel: { color: '#94a3b8', fontSize: 10 }, inverse: true },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [
        { name: 'Contract', type: 'bar', barGap: '15%', barMaxWidth: 22, data: sorted.map((c) => c.contract), itemStyle: { borderRadius: [0, 3, 3, 0], color: 'rgba(99,102,241,0.7)' } },
        { name: 'EAC', type: 'bar', barMaxWidth: 22, data: sorted.map((c) => c.eac), itemStyle: { borderRadius: [0, 3, 3, 0], color: sorted.map((c) => c.eac > c.contract ? 'rgba(239,68,68,0.75)' : 'rgba(16,185,129,0.65)') } },
      ],
    } as EChartsOption;
  }, [data]);

  const quarterlyChart = useMemo<EChartsOption>(() => {
    if (!data?.quarterly.length) return {};
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['Spend', 'Hours'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 60, right: 55, top: 35, bottom: 30 },
      xAxis: { type: 'category', data: data.quarterly.map((q) => q.quarter), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        { type: 'value', name: 'Spend ($)', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
        { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Spend', type: 'bar', data: data.quarterly.map((q) => q.cost), itemStyle: { borderRadius: [3, 3, 0, 0], color: 'rgba(99,102,241,0.55)' } },
        { name: 'Hours', type: 'line', yAxisIndex: 1, data: data.quarterly.map((q) => q.hours), smooth: true, lineStyle: { color: '#10b981' }, itemStyle: { color: '#10b981' } },
      ],
    } as EChartsOption;
  }, [data]);

  const saveComment = useCallback(async (projectId: string) => {
    if (!commentText.trim()) return;
    await fetch('/api/senior-manager/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'financial-health', scope: 'project', recordId: projectId, metricKey: 'sm_financial_note', comment: commentText }),
    });
    setCommentText('');
  }, [commentText]);

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Financial Health</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
        <Skeleton height={300} />
      </div>
    );
  }

  if (!data?.success) {
    return <div><h1 className="page-title">Financial Health</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load financial data.</div></div>;
  }

  const k = data.kpis;

  return (
    <div>
      <h1 className="page-title">Financial Health</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <KpiCard label="Total Contract Value" value={fmt(k.totalContract)} />
        <KpiCard label="Estimate at Completion" value={fmt(k.totalEac)} detail={`Remaining: ${fmt(k.totalRemaining)}`} />
        <KpiCard label="Actual Spend" value={fmt(k.totalActual)} detail={`Burn Rate: ${k.burnRate}%`} />
        <KpiCard label="Portfolio Margin" value={`${k.portfolioMargin}%`} color={marginColor(k.portfolioMargin)} />
        <KpiCard label="Projects at Risk" value={k.projectsAtRisk} color={k.projectsAtRisk > 0 ? '#ef4444' : '#10b981'} detail={`of ${sortedProjects.length}`} />
        <KpiCard label="Healthy Projects" value={k.projectsHealthy} color="#10b981" detail="Margin ≥ 15%" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Revenue vs Cost Trajectory</h3>
          <ChartWrapper option={revenueCostChart} height={240} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Customer Exposure (Contract vs EAC)</h3>
          <ChartWrapper option={customerExposureChart} height={240} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Quarterly Spend Trend</h3>
        <ChartWrapper option={quarterlyChart} height={200} />
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Project Financial Register</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Project</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Contract</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('eac')}>EAC {sortKey === 'eac' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('margin')}>Margin {sortKey === 'margin' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('burn_rate')}>Burn Rate {sortKey === 'burn_rate' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>
                <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8', fontWeight: 600 }}>Progress</th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((p) => (
                <React.Fragment key={p.id}>
                  <tr
                    onClick={() => { setExpandedProject((prev) => (prev === p.id ? null : p.id)); setCommentText(''); }}
                    style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.06)', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                  >
                    <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0', fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{p.customer_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{fmt(p.contract_value)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.eac > p.contract_value ? '#ef4444' : '#94a3b8' }}>{fmt(p.eac)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: marginColor(p.margin), fontWeight: 600 }}>{p.margin.toFixed(1)}%</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.burn_rate > 90 ? '#ef4444' : '#94a3b8' }}>{p.burn_rate.toFixed(1)}%</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{p.percent_complete.toFixed(0)}%</td>
                  </tr>
                  {expandedProject === p.id && (
                    <tr>
                      <td colSpan={7} style={{ padding: '0.6rem 0.75rem', background: 'rgba(30,41,59,0.5)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', fontSize: '0.68rem', marginBottom: '0.5rem' }}>
                          <div><span style={{ color: '#64748b' }}>Owner</span><br /><span style={{ color: '#e2e8f0' }}>{p.owner}</span></div>
                          <div><span style={{ color: '#64748b' }}>Actual Cost</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.actual_cost)}</span></div>
                          <div><span style={{ color: '#64748b' }}>Remaining</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.remaining_cost)}</span></div>
                          <div><span style={{ color: '#64748b' }}>Cost per Hour</span><br /><span style={{ color: '#e2e8f0' }}>${p.cost_per_hour.toFixed(2)}</span></div>
                          <div><span style={{ color: '#64748b' }}>Hours (Act/Base)</span><br /><span style={{ color: '#e2e8f0' }}>{p.actual_hours.toLocaleString()} / {p.baseline_hours.toLocaleString()}</span></div>
                          <div><span style={{ color: '#64748b' }}>Gap (Contract - EAC)</span><br /><span style={{ color: p.contract_value - p.eac < 0 ? '#ef4444' : '#10b981' }}>{fmt(p.contract_value - p.eac)}</span></div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a note..." style={{ flex: 1, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }} onKeyDown={(e) => { if (e.key === 'Enter') saveComment(p.id); }} />
                          <button onClick={() => saveComment(p.id)} style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', color: '#c7d2fe', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.68rem', cursor: 'pointer' }}>Save</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
