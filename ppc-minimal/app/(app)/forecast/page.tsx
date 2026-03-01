'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type PortfolioKpis = {
  totalActual: number; totalRemaining: number; totalEac: number;
  totalActualHrs: number; totalBaselineHrs: number; totalContractValue: number;
  totalRevenue: number; cpi: number; spi: number; profitMargin: number;
};
type ProjectForecast = {
  id: string; name: string; actualHours: number; totalHours: number; remainingHours: number;
  actualCost: number; remainingCost: number; contractValue: number; eac: number;
  cpi: number; spi: number; percentComplete: number; profitMargin: number;
};
type MonthlyRow = { month: string; hours: string; cost: string; revenue?: string };

const ROWS_PER_PAGE = 50;
const CHART_MIN_H = 360;
const DATAZOOM_THRESHOLD = 12;

function fmt(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 1 }); }
function cpiColor(v: number) { return v >= 1 ? 'var(--color-success)' : v >= 0.9 ? 'var(--color-warning)' : 'var(--color-error)'; }
function marginColor(v: number) { return v >= 60 ? 'var(--color-success)' : v >= 30 ? 'var(--color-warning)' : 'var(--color-error)'; }
function truncLabel(s: string, max = 18) { return s.length > max ? s.slice(0, max - 1) + '…' : s; }

function dataZoomSlider(dataLength: number): EChartsOption['dataZoom'] {
  if (dataLength <= DATAZOOM_THRESHOLD) return undefined;
  return [
    { type: 'slider', show: true, bottom: 4, height: 22, startValue: 0, endValue: DATAZOOM_THRESHOLD - 1 },
    { type: 'inside' },
  ];
}

export default function ForecastPage() {
  const [kpis, setKpis] = useState<PortfolioKpis | null>(null);
  const [forecasts, setForecasts] = useState<ProjectForecast[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [error, setError] = useState('');
  const [visibleRows, setVisibleRows] = useState(ROWS_PER_PAGE);

  useEffect(() => {
    fetch('/api/pca/forecast').then(r => r.json()).then(d => {
      if (!d.success) { setError(d.error); return; }
      setKpis(d.portfolioKpis);
      setForecasts(d.projectForecasts || []);
      setMonthly(d.monthlyTrend || []);
    }).catch(e => setError(e.message));
  }, []);

  const loading = !kpis && !error;

  const sorted = useMemo(
    () => [...forecasts].sort((a, b) => b.profitMargin - a.profitMargin),
    [forecasts],
  );

  const profitMarginSorted = useMemo(
    () => [...forecasts].sort((a, b) => a.profitMargin - b.profitMargin),
    [forecasts],
  );
  const profitMarginH = Math.max(CHART_MIN_H, profitMarginSorted.length * 28 + 80);

  const profitMarginOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 160, right: 40, top: 20, bottom: 30 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const items = params as { name: string; value: number }[];
        const p = items[0];
        return `<b>${p.name}</b><br/>Margin: ${p.value.toFixed(1)}%`;
      },
    },
    yAxis: {
      type: 'category',
      data: profitMarginSorted.map(f => f.name),
      axisLabel: {
        fontSize: 10,
        width: 145,
        overflow: 'truncate',
        ellipsis: '…',
      },
      inverse: true,
    },
    xAxis: {
      type: 'value',
      name: 'Margin %',
      axisLabel: { formatter: '{value}%' },
    },
    dataZoom: profitMarginSorted.length > 20
      ? [{ type: 'slider', yAxisIndex: 0, right: 4, width: 16, startValue: 0, endValue: 19 }, { type: 'inside', yAxisIndex: 0 }]
      : undefined,
    series: [
      {
        name: 'Profit Margin',
        type: 'bar',
        data: profitMarginSorted.map(f => ({
          value: Math.round(f.profitMargin * 10) / 10,
          itemStyle: { color: f.profitMargin >= 60 ? '#10b981' : f.profitMargin >= 30 ? '#f59e0b' : '#ef4444' },
        })),
        markLine: {
          silent: true,
          data: [{ xAxis: 60, lineStyle: { color: '#10b981', type: 'dashed' }, label: { formatter: 'Target 60%', fontSize: 10 } }],
        },
      },
    ],
  }), [profitMarginSorted]);

  const burnTrendOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 50, top: 30, bottom: monthly.length > DATAZOOM_THRESHOLD ? 70 : 40 },
    tooltip: { trigger: 'axis' },
    legend: { show: true, top: 0, right: 0 },
    xAxis: { type: 'category', data: monthly.map(m => m.month) },
    yAxis: [
      { type: 'value', name: 'Hours', position: 'left' },
      { type: 'value', name: 'Cost ($)', position: 'right' },
    ],
    dataZoom: dataZoomSlider(monthly.length),
    series: [
      { name: 'Hours', type: 'bar', data: monthly.map(m => Number(m.hours)), yAxisIndex: 0 },
      { name: 'Cost', type: 'line', data: monthly.map(m => Number(m.cost)), yAxisIndex: 1, smooth: true },
    ],
  }), [monthly]);

  const cpiSpiOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 60, right: 20, top: 30, bottom: forecasts.length > DATAZOOM_THRESHOLD ? 90 : 70 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { name: string; value: number; seriesName: string }[];
        const full = forecasts.find(f => truncLabel(f.name) === items[0]?.name)?.name || items[0]?.name;
        return `<b>${full}</b><br/>` + items.map(p => `${p.seriesName}: ${p.value}`).join('<br/>');
      },
    },
    legend: { show: true, top: 0, right: 0 },
    xAxis: { type: 'category', data: forecasts.map(f => truncLabel(f.name)), axisLabel: { rotate: 45, fontSize: 9, interval: 0 } },
    yAxis: { type: 'value', min: 0 },
    dataZoom: dataZoomSlider(forecasts.length),
    series: [
      { name: 'CPI', type: 'bar', data: forecasts.map(f => Math.round(f.cpi * 100) / 100) },
      { name: 'SPI', type: 'bar', data: forecasts.map(f => Math.round(f.spi * 100) / 100) },
    ],
  }), [forecasts]);

  const eacBreakdownOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 60, right: 20, top: 30, bottom: forecasts.length > DATAZOOM_THRESHOLD ? 90 : 70 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { name: string; value: number; seriesName: string; color: string }[];
        const full = forecasts.find(f => truncLabel(f.name) === items[0]?.name)?.name || items[0]?.name;
        return `<b>${full}</b><br/>` + items.map(p =>
          `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:4px"></span>${p.seriesName}: $${p.value.toLocaleString()}`
        ).join('<br/>');
      },
    },
    legend: { show: true, top: 0, right: 0 },
    xAxis: { type: 'category', data: forecasts.map(f => truncLabel(f.name)), axisLabel: { rotate: 45, fontSize: 9, interval: 0 } },
    yAxis: { type: 'value', name: '$', axisLabel: { formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` } },
    dataZoom: dataZoomSlider(forecasts.length),
    series: [
      { name: 'Actual Cost', type: 'bar', stack: 'eac', data: forecasts.map(f => Math.round(f.actualCost)) },
      { name: 'Remaining', type: 'bar', stack: 'eac', data: forecasts.map(f => Math.round(f.remainingCost)) },
      { name: 'Contract', type: 'line', data: forecasts.map(f => Math.round(f.contractValue)), symbol: 'diamond', symbolSize: 8 },
    ],
  }), [forecasts]);

  const hasMore = visibleRows < sorted.length;

  return (
    <div>
      <h1 className="page-title">Forecasting</h1>
      <p className="page-subtitle">Cost, schedule, and profit margin analysis across all projects.</p>

      {error && <div style={{ color: 'var(--color-error)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{error}</div>}

      {loading ? (
        <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
      ) : kpis && (
        <div className="kpi-grid" style={{ marginBottom: '1rem' }}>
          <div className="glass kpi-card">
            <div className="kpi-label">Profit Margin</div>
            <div className="kpi-value" style={{ color: marginColor(kpis.profitMargin) }}>{kpis.profitMargin.toFixed(1)}%</div>
            <div className="kpi-detail">(Contract − EAC) / Contract</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">Contract Value</div>
            <div className="kpi-value">${fmt(kpis.totalContractValue)}</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">EAC</div>
            <div className="kpi-value">${fmt(kpis.totalEac)}</div>
            <div className="kpi-detail">Actual + Remaining</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">Actual Cost</div>
            <div className="kpi-value">${fmt(kpis.totalActual)}</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">Remaining Cost</div>
            <div className="kpi-value">${fmt(kpis.totalRemaining)}</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">Revenue</div>
            <div className="kpi-value">${fmt(kpis.totalRevenue)}</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">CPI</div>
            <div className="kpi-value" style={{ color: cpiColor(kpis.cpi) }}>{kpis.cpi.toFixed(2)}</div>
            <div className="kpi-detail">Contract / Actual Cost</div>
          </div>
          <div className="glass kpi-card">
            <div className="kpi-label">SPI</div>
            <div className="kpi-value" style={{ color: cpiColor(kpis.spi) }}>{kpis.spi.toFixed(2)}</div>
            <div className="kpi-detail">Actual Hrs / Baseline Hrs</div>
          </div>
        </div>
      )}

      {!loading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}>
          <div className="glass-raised" style={{ padding: '0.65rem', maxHeight: 520, overflow: 'auto' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>Profit Margin by Project</div>
            {forecasts.length > 0
              ? <ChartWrapper option={profitMarginOption} height={profitMarginH} />
              : <NoData label="No project data" height={CHART_MIN_H} />}
          </div>

          <div className="glass-raised" style={{ padding: '0.65rem', width: '100%' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>Monthly Burn Trend</div>
            {monthly.length > 0
              ? <ChartWrapper option={burnTrendOption} height={CHART_MIN_H} />
              : <NoData label="No monthly data" height={CHART_MIN_H} />}
          </div>

          <div className="glass-raised" style={{ padding: '0.65rem', width: '100%' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>CPI / SPI by Project</div>
            {forecasts.length > 0
              ? <ChartWrapper option={cpiSpiOption} height={CHART_MIN_H} />
              : <NoData label="No project data" height={CHART_MIN_H} />}
          </div>

          <div className="glass-raised" style={{ padding: '0.65rem', width: '100%' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>EAC Breakdown (Actual + Remaining vs Contract)</div>
            {forecasts.length > 0
              ? <ChartWrapper option={eacBreakdownOption} height={CHART_MIN_H} />
              : <NoData label="No project data" height={CHART_MIN_H} />}
          </div>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <div className="glass-solid" style={{ marginBottom: '1rem' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="dm-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Project</th><th>Margin</th><th>Complete</th><th>Actual Hrs</th><th>Total Hrs</th>
                  <th>Remaining Hrs</th><th>Actual Cost</th><th>Remaining Cost</th><th>EAC</th>
                  <th>Contract</th><th>CPI</th><th>SPI</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, visibleRows).map(f => (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{f.name}</td>
                    <td style={{ color: marginColor(f.profitMargin), fontWeight: 600 }}>{f.profitMargin.toFixed(1)}%</td>
                    <td>{f.percentComplete.toFixed(0)}%</td>
                    <td>{fmt(f.actualHours)}</td>
                    <td>{fmt(f.totalHours)}</td>
                    <td>{fmt(f.remainingHours)}</td>
                    <td>${fmt(f.actualCost)}</td>
                    <td>${fmt(f.remainingCost)}</td>
                    <td>${fmt(f.eac)}</td>
                    <td>${fmt(f.contractValue)}</td>
                    <td style={{ color: cpiColor(f.cpi), fontWeight: 600 }}>{f.cpi.toFixed(2)}</td>
                    <td style={{ color: cpiColor(f.spi), fontWeight: 600 }}>{f.spi.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div style={{ padding: '0.5rem 0.65rem', borderTop: '1px solid var(--glass-border)', textAlign: 'center' }}>
              <button
                className="btn"
                onClick={() => setVisibleRows(v => v + ROWS_PER_PAGE)}
                style={{ fontSize: '0.75rem' }}
              >
                Show more ({sorted.length - visibleRows} remaining)
              </button>
            </div>
          )}
          <div style={{ padding: '0.35rem 0.65rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
            Showing {Math.min(visibleRows, sorted.length)} of {sorted.length} projects
          </div>
        </div>
      )}
    </div>
  );
}

function NoData({ label, height }: { label: string; height: number }) {
  return (
    <div style={{
      minHeight: height,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted)',
      fontSize: '0.78rem',
    }}>
      {label}
    </div>
  );
}
