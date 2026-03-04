'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Kpis = {
  totalActual: number; totalRemaining: number; totalEac: number;
  totalActualHrs: number; totalBaselineHrs: number; totalContractValue: number;
  totalRevenue: number; burnRate: number; trendHoursPct: number; spi: number;
  profitMargin: number; avgMonthlyCost: number; avgMonthlyHrs: number;
};
type Scenario = { eac: number; months: number; margin: number };
type ProjRow = {
  id: string; name: string; owner: string; actualHours: number; totalHours: number;
  baselineHours: number; remainingHours: number; actualCost: number; remainingCost: number;
  contractValue: number; eac: number; trendHoursPct: number; trendHoursMo: number; spi: number; percentComplete: number;
  profitMargin: number; eacVariance: number; customerName?: string;
};
type MonthRow = { month: string; hours: number; cost: number; revenue: number };
type QuarterRow = { quarter: string; hours: number; cost: number; revenue: number };
type CustRow = { customer_id: string; customer_name?: string; hours: number; cost: number; contract: number; projects: number };

type Payload = {
  success: boolean; portfolioKpis: Kpis;
  scenarios: { best: Scenario; expected: Scenario; worst: Scenario };
  projectForecasts: ProjRow[]; monthlyTrend: MonthRow[]; quarterlyTrend: QuarterRow[];
  byCustomer: CustRow[]; error?: string;
};

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return <div className="glass kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={color ? { color } : {}}>{value}</div>{detail && <div className="kpi-detail">{detail}</div>}</div>;
}
function fmt$(n: number) { return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`; }

export default function CooForecastPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<'monthly' | 'quarterly'>('monthly');

  const toggle = useCallback((id: string) => {
    setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  useEffect(() => {
    fetch('/api/coo/forecast', { cache: 'no-store' })
      .then((r) => r.json()).then((d: Payload) => { if (!d.success) throw new Error(d.error || 'Failed'); setData(d); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedProgramId && data?.projectForecasts?.length) {
      setSelectedProgramId(data.projectForecasts[0].id);
    }
  }, [selectedProgramId, data?.projectForecasts]);

  const burnOption: EChartsOption = useMemo(() => {
    const pts = trendView === 'monthly' ? (data?.monthlyTrend || []) : (data?.quarterlyTrend || []);
    const labels = pts.map((p) => 'month' in p ? (p as MonthRow).month : (p as QuarterRow).quarter);
    return {
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#94a3b8', fontSize: 10 }, bottom: 0 },
      grid: { left: 56, right: 72, top: 16, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
        { type: 'value', name: 'Cost ($)', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Hours', type: 'bar', data: pts.map((p) => p.hours), itemStyle: { color: '#6366f1', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 18 },
        { name: 'Cost', type: 'line', yAxisIndex: 1, smooth: true, data: pts.map((p) => p.cost), lineStyle: { color: '#ef4444', width: 2 }, itemStyle: { color: '#f87171' } },
        { name: 'Revenue', type: 'line', yAxisIndex: 1, smooth: true, data: pts.map((p) => p.revenue), lineStyle: { color: '#10b981', width: 2 }, itemStyle: { color: '#34d399' } },
      ],
    };
  }, [data?.monthlyTrend, data?.quarterlyTrend, trendView]);

  const eacBarOption: EChartsOption = useMemo(() => {
    const projs = (data?.projectForecasts || []).filter((p) => p.contractValue > 0).sort((a, b) => a.eacVariance - b.eacVariance).slice(0, 15);
    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: { name: string; value: number }[]) => {
          const p = Array.isArray(params) ? params[0] : params;
          const row = projs.find((r) => r.name === p.name);
          if (!row) return `${p.name}<br/>EAC Variance: ${fmt$(p.value)}`;
          return [
            `${row.name}`,
            `Owner: ${row.owner}`,
            `Contract: ${fmt$(row.contractValue)}`,
            `EAC: ${fmt$(row.eac)}`,
            `Gap: ${row.eacVariance >= 0 ? '+' : ''}${fmt$(row.eacVariance)}`,
            `Margin: ${row.profitMargin.toFixed(1)}%`,
          ].join('<br/>');
        },
      },
      grid: { left: 160, right: 74, top: 8, bottom: 24, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } },
        axisLine: { lineStyle: { color: 'rgba(148,163,184,0.2)' } } },
      yAxis: {
        type: 'category',
        data: projs.map((p) => p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name),
        axisLabel: { color: '#94a3b8', fontSize: 10, width: 140, overflow: 'truncate' },
        inverse: true,
      },
      series: [{
        type: 'bar', barMaxWidth: 16,
        data: projs.map((p) => ({ value: Math.round(p.eacVariance), itemStyle: { color: p.eacVariance >= 0 ? '#10b981' : '#ef4444', borderRadius: p.eacVariance >= 0 ? [0, 3, 3, 0] : [3, 0, 0, 3] } })),
        label: { show: true, position: 'right', color: '#94a3b8', fontSize: 9, formatter: (p: { value: number }) => fmt$(p.value) },
      }],
      markLine: { symbol: 'none', data: [{ xAxis: 0 }], lineStyle: { color: 'rgba(255,255,255,0.25)', type: 'solid' }, label: { show: false } },
    } as EChartsOption;
  }, [data?.projectForecasts]);

  const driverMatrixOption: EChartsOption = useMemo(() => {
    const projs = data?.projectForecasts || [];
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: { data?: [number, number, number, string, string, number] }) => {
          const d = p.data;
          if (!d) return '';
          return `${d[3]}<br/>SPI: ${d[0].toFixed(2)}<br/>Trending Hours: ${d[1].toFixed(1)}%<br/>EAC variance: ${fmt$(d[5])}<br/>Driver: ${d[4]}`;
        },
      },
      grid: { left: 58, right: 66, top: 18, bottom: 30, containLabel: true },
      xAxis: { type: 'value', min: 0, max: 1.3, name: 'SPI', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      yAxis: { type: 'value', name: 'Trending Hours %', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      series: [{
        type: 'scatter',
        data: projs.map((p) => {
          const driver = p.spi < 0.9 ? 'Schedule pressure' : Math.abs(p.trendHoursPct) > 20 ? 'Throughput volatility' : p.profitMargin < 0 ? 'Margin pressure' : 'Balanced';
          return [p.spi, p.trendHoursPct, Math.max(10, Math.abs(p.eacVariance) / 100000), p.name, driver, p.eacVariance];
        }),
        symbolSize: (v: number[]) => Number(v[2]),
        itemStyle: {
          color: (p: { data?: number[] }) => (p.data && p.data[5] >= 0 ? '#10b981' : '#ef4444'),
          opacity: 0.85,
        },
      }],
      markLine: {
        symbol: 'none',
        lineStyle: { color: 'rgba(148,163,184,0.35)', type: 'dashed' },
        data: [{ xAxis: 0.95 }, { yAxis: 0 }],
      },
    } as EChartsOption;
  }, [data?.projectForecasts]);

  const exposureOption: EChartsOption = useMemo(() => {
    const rows = (data?.byCustomer || []).slice(0, 10);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { textStyle: { color: '#94a3b8', fontSize: 10 }, bottom: 0 },
      grid: { left: 140, right: 66, top: 12, bottom: 34, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      yAxis: {
        type: 'category',
        data: rows.map((r) => String(r.customer_name || r.customer_id).slice(0, 18)),
        axisLabel: { color: '#94a3b8', fontSize: 10, width: 130, overflow: 'truncate' },
        inverse: true,
      },
      series: [
        { name: 'Contract', type: 'bar', data: rows.map((r) => r.contract), itemStyle: { color: '#6366f1' }, barMaxWidth: 14 },
        { name: 'Cost to Date', type: 'bar', data: rows.map((r) => r.cost), itemStyle: { color: '#f59e0b' }, barMaxWidth: 14 },
      ],
    } as EChartsOption;
  }, [data?.byCustomer]);

  if (loading) return <div><h1 className="page-title">Portfolio Forecast</h1><p className="page-subtitle">Portfolio-level financial outlook with scenario projections and contract exposure.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={78} />)}</div><Skeleton height={300} /></div>;
  if (error) return <div><h1 className="page-title">Portfolio Forecast</h1><div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{error}</div></div>;
  if (!data) return null;

  const k = data.portfolioKpis;
  const sc = data.scenarios;

  return (
    <div>
      <h1 className="page-title">Portfolio Forecast</h1>
      <p className="page-subtitle">Executive forecast view with click-driven drill downs into schedule pressure, throughput volatility, and contract exposure.</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="Portfolio EAC" value={fmt$(k.totalEac)} detail={`Actual ${fmt$(k.totalActual)} + Rem ${fmt$(k.totalRemaining)}`} />
        <KpiCard label="Contract Value" value={fmt$(k.totalContractValue)} />
        <KpiCard label="Profit Margin" value={`${k.profitMargin.toFixed(1)}%`} color={k.profitMargin >= 10 ? '#10b981' : k.profitMargin >= 0 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Trending Hours %" value={`${k.trendHoursPct.toFixed(1)}%`} color={Math.abs(k.trendHoursPct) <= 10 ? '#10b981' : Math.abs(k.trendHoursPct) <= 25 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Portfolio SPI" value={k.spi.toFixed(2)} color={k.spi >= 0.95 ? '#10b981' : k.spi >= 0.85 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Avg Monthly Burn" value={fmt$(k.avgMonthlyCost)} detail={`${k.avgMonthlyHrs.toLocaleString()} hrs/mo`} />
        <KpiCard label="Revenue Recognized" value={fmt$(k.totalRevenue)} />
        <KpiCard label="Hours" value={`${Math.round(k.totalActualHrs).toLocaleString()}`} detail={`of ${Math.round(k.totalBaselineHrs).toLocaleString()} baseline`} />
      </div>

      {/* Scenario Projections */}
      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>Scenario Projections</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {([['Best Case', sc.best, '#10b981'], ['Expected', sc.expected, '#6366f1'], ['Worst Case', sc.worst, '#ef4444']] as [string, Scenario, string][]).map(([label, s, color]) => (
            <div key={label} className="glass-raised" style={{ padding: '0.75rem', borderLeft: `3px solid ${color}` }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, color, marginBottom: 6 }}>{label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.72rem' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Projected EAC:</span> <span style={{ fontWeight: 700 }}>{fmt$(s.eac)}</span></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Remaining Duration:</span> <span style={{ fontWeight: 700 }}>{s.months} months</span></div>
                <div><span style={{ color: 'var(--text-muted)' }}>Projected Margin:</span> <span style={{ fontWeight: 700, color: s.margin >= 0 ? '#10b981' : '#ef4444' }}>{s.margin.toFixed(1)}%</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Revenue vs Cost Trajectory</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['monthly', 'quarterly'] as const).map((v) => (
              <button key={v} onClick={() => setTrendView(v)} style={{ background: trendView === v ? 'rgba(99,102,241,0.22)' : 'transparent', color: trendView === v ? '#c4b5fd' : 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.18rem 0.45rem', fontSize: '0.66rem', cursor: 'pointer', fontWeight: trendView === v ? 700 : 400, textTransform: 'capitalize' }}>{v}</button>
            ))}
          </div>
        </div>
        <ChartWrapper option={burnOption} height={320} />
      </div>

      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Portfolio Contract Gap (Contract - EAC)</div>
        <ChartWrapper
          option={eacBarOption}
          height={320}
          onClick={(p: { name?: string }) => {
            const name = String(p?.name || '');
            const hit = data.projectForecasts.find((r) => r.name === name);
            if (hit) setSelectedProgramId(hit.id);
          }}
        />
        <div style={{ marginTop: 10, overflowX: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: 10 }}>
          <table className="dm-table" style={{ width: '100%', minWidth: 980, fontSize: '0.71rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Project</th>
                <th style={{ textAlign: 'left' }}>Customer</th>
                <th style={{ textAlign: 'right' }}>Contract</th>
                <th style={{ textAlign: 'right' }}>EAC</th>
                <th style={{ textAlign: 'right' }}>Gap (Contract-EAC)</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
                <th style={{ textAlign: 'left' }}>Risk Signal</th>
              </tr>
            </thead>
            <tbody>
              {data.projectForecasts
                .filter((r) => r.contractValue > 0)
                .sort((a, b) => a.eacVariance - b.eacVariance)
                .slice(0, 20)
                .map((r) => (
                  <tr key={`gap-${r.id}`} style={{ cursor: 'pointer' }} onClick={() => setSelectedProgramId(r.id)}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.customerName || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt$(r.contractValue)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt$(r.eac)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.eacVariance >= 0 ? '#10b981' : '#ef4444' }}>
                      {r.eacVariance >= 0 ? '+' : ''}{fmt$(r.eacVariance)}
                    </td>
                    <td style={{ textAlign: 'right', color: r.profitMargin >= 10 ? '#10b981' : r.profitMargin >= 0 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                      {r.profitMargin.toFixed(1)}%
                    </td>
                    <td>{r.spi < 0.9 ? 'Schedule pressure' : Math.abs(r.trendHoursPct) > 20 ? 'Throughput volatility' : 'Cost pressure'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Causal driver visuals */}
      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Outcome Driver Matrix</div>
        <ChartWrapper
          option={driverMatrixOption}
          height={320}
          onClick={(p: Record<string, unknown>) => {
            const d = p?.data as unknown[] | undefined;
            const name = String(d?.[3] ?? '');
            const hit = data.projectForecasts.find((r) => r.name === name);
            if (hit) setSelectedProgramId(hit.id);
          }}
        />
      </div>

      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Customer Exposure (Contract vs Cost)</div>
        <ChartWrapper option={exposureOption} height={340} />
        <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Exposure Ratio = Cost to Date / Contract. Higher ratio indicates tighter remaining delivery headroom.
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Customer Exposure (Detailed)</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', minWidth: 900, fontSize: '0.71rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Customer</th>
                <th style={{ textAlign: 'right' }}>Projects</th>
                <th style={{ textAlign: 'right' }}>Contract</th>
                <th style={{ textAlign: 'right' }}>Cost to Date</th>
                <th style={{ textAlign: 'right' }}>Exposure Ratio</th>
                <th style={{ textAlign: 'right' }}>Hours to Date</th>
              </tr>
            </thead>
            <tbody>
              {data.byCustomer.slice(0, 15).map((c) => {
                const ratio = c.contract > 0 ? c.cost / c.contract : 0;
                return (
                  <tr key={`cust-${c.customer_id}`}>
                    <td style={{ fontWeight: 600 }}>{c.customer_name || c.customer_id}</td>
                    <td style={{ textAlign: 'right' }}>{c.projects}</td>
                    <td style={{ textAlign: 'right' }}>{fmt$(c.contract)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt$(c.cost)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: ratio >= 0.9 ? '#ef4444' : ratio >= 0.75 ? '#f59e0b' : '#10b981' }}>{(ratio * 100).toFixed(1)}%</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(c.hours).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* selected-project drill down panel */}
      {(() => {
        const selected = data.projectForecasts.find((p) => p.id === selectedProgramId) || data.projectForecasts[0];
        if (!selected) return null;
        const primaryDriver =
          selected.spi < 0.9 ? 'Schedule pressure (SPI below 0.90)'
            : Math.abs(selected.trendHoursPct) > 20 ? 'Throughput volatility (Trending Hours > 20%)'
            : selected.profitMargin < 0 ? 'Margin pressure (negative margin)'
            : 'Balanced delivery profile';
        return (
          <div className="glass" style={{ padding: '1rem', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Drill Down — {selected.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, fontSize: '0.72rem' }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Primary Driver:</span> <span style={{ fontWeight: 700 }}>{primaryDriver}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Schedule Signal:</span> <span style={{ fontWeight: 700, color: selected.spi >= 0.95 ? '#10b981' : selected.spi >= 0.85 ? '#f59e0b' : '#ef4444' }}>{selected.spi.toFixed(2)} SPI</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Throughput Signal:</span> <span style={{ fontWeight: 700, color: Math.abs(selected.trendHoursPct) <= 10 ? '#10b981' : Math.abs(selected.trendHoursPct) <= 25 ? '#f59e0b' : '#ef4444' }}>{selected.trendHoursPct.toFixed(1)}%</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Financial Signal:</span> <span style={{ fontWeight: 700, color: selected.eacVariance >= 0 ? '#10b981' : '#ef4444' }}>{selected.eacVariance >= 0 ? '+' : ''}{fmt$(selected.eacVariance)}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Action Focus:</span> <span style={{ fontWeight: 700 }}>{selected.remainingHours > selected.baselineHours * 0.35 ? 'Remaining-hours burn control' : 'Closeout pacing + risk retirement'}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Revenue Realization:</span> <span style={{ fontWeight: 700 }}>{selected.contractValue > 0 ? `${((selected.eac / selected.contractValue) * 100).toFixed(1)}% cost-to-contract` : 'N/A'}</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Hours at Completion:</span> <span style={{ fontWeight: 700 }}>{Math.round(selected.actualHours + selected.remainingHours).toLocaleString()} hrs</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Throughput Pace:</span> <span style={{ fontWeight: 700 }}>{selected.trendHoursMo.toFixed(1)} hrs/mo</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Completion Signal:</span> <span style={{ fontWeight: 700 }}>{selected.percentComplete.toFixed(0)}%</span></div>
            </div>
          </div>
        );
      })()}

      {/* Project Detail Table */}
      <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Project Forecast Register</div>
        <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', minWidth: 1100, fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ width: 26 }} />
                <th style={{ textAlign: 'left' }}>Project</th>
                <th style={{ textAlign: 'left' }}>Owner</th>
                <th style={{ textAlign: 'right' }}>Contract</th>
                <th style={{ textAlign: 'right' }}>EAC</th>
                <th style={{ textAlign: 'right' }}>Variance</th>
                <th style={{ textAlign: 'right' }}>Margin</th>
                <th style={{ textAlign: 'right' }}>Trend %</th>
                <th style={{ textAlign: 'right' }}>SPI</th>
                <th style={{ textAlign: 'right' }}>Progress</th>
                <th style={{ textAlign: 'left' }}>Primary Driver</th>
              </tr>
            </thead>
            <tbody>
              {data.projectForecasts.map((p) => (
                <React.Fragment key={p.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => { toggle(p.id); setSelectedProgramId(p.id); }}>
                    <td style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{expanded.has(p.id) ? '▾' : '▸'}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.owner}</td>
                    <td style={{ textAlign: 'right' }}>{p.contractValue > 0 ? fmt$(p.contractValue) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt$(p.eac)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.eacVariance >= 0 ? '#10b981' : '#ef4444' }}>{p.eacVariance >= 0 ? '+' : ''}{fmt$(p.eacVariance)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.profitMargin >= 10 ? '#10b981' : p.profitMargin >= 0 ? '#f59e0b' : '#ef4444' }}>{p.contractValue > 0 ? `${p.profitMargin.toFixed(1)}%` : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: Math.abs(p.trendHoursPct) <= 10 ? '#10b981' : Math.abs(p.trendHoursPct) <= 25 ? '#f59e0b' : '#ef4444' }}>{p.trendHoursPct.toFixed(1)}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: p.spi >= 0.95 ? '#10b981' : p.spi >= 0.85 ? '#f59e0b' : '#ef4444' }}>{p.spi.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{p.percentComplete.toFixed(0)}%</td>
                    <td>{p.spi < 0.9 ? 'Schedule pressure' : Math.abs(p.trendHoursPct) > 20 ? 'Throughput volatility' : p.profitMargin < 0 ? 'Margin pressure' : 'Balanced'}</td>
                  </tr>
                  {expanded.has(p.id) && (
                    <tr>
                      <td colSpan={11} style={{ padding: '0.45rem 0.8rem 0.55rem 2rem', background: 'rgba(99,102,241,0.04)', fontSize: '0.69rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                          <div><span style={{ color: 'var(--text-muted)' }}>Actual Cost:</span> {fmt$(p.actualCost)}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Remaining Cost:</span> {fmt$(p.remainingCost)}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Actual Hours:</span> {Math.round(p.actualHours).toLocaleString()}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Trending Hours:</span> {p.trendHoursMo.toFixed(1)} hrs/mo</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Baseline Hours:</span> {Math.round(p.baselineHours).toLocaleString()}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Remaining Hours:</span> {Math.round(p.remainingHours).toLocaleString()}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Total Hours:</span> {Math.round(p.totalHours).toLocaleString()}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {data.projectForecasts.length === 0 && <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No forecast data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
