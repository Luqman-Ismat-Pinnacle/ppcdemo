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
const CHART_MIN_H = 320;
const DATAZOOM_THRESHOLD = 12;

function fmt(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 1 }); }
function cpiColor(v: number) { return v >= 1 ? 'var(--color-success)' : v >= 0.9 ? 'var(--color-warning)' : 'var(--color-error)'; }
function marginColor(v: number) { return v >= 60 ? 'var(--color-success)' : v >= 30 ? 'var(--color-warning)' : 'var(--color-error)'; }
function truncLabel(s: string, max = 18) { return s.length > max ? s.slice(0, max - 1) + '...' : s; }

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
  const [trendMethod, setTrendMethod] = useState<'linear' | 'moving_avg' | 'last_period'>('linear');

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
  const profitMarginH = Math.max(260, profitMarginSorted.length * 20 + 48);

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
        ellipsis: '...',
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
          itemStyle: { color: f.profitMargin >= 60 ? '#10b981' : '#ef4444' },
        })),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#60a5fa', width: 2, type: 'solid' },
          label: { show: false },
          data: [{ xAxis: 60 }],
          z: 20,
        },
        z: 10,
      },
    ],
  }), [profitMarginSorted]);

  const burnTrendOption: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    grid: { left: 50, right: 50, top: 36, bottom: monthly.length > DATAZOOM_THRESHOLD ? 92 : 72 },
    tooltip: { trigger: 'axis' },
    legend: { show: true, bottom: 8, left: 'center' },
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

  const hoursForecastOption: EChartsOption = useMemo(() => {
    const ordered = [...monthly].sort((a, b) => String(a.month).localeCompare(String(b.month)));
    const labels = ordered.map((m) => String(m.month));
    const actual = ordered.map((m) => Number(m.hours || 0));
    if (!labels.length) return { series: [] };

    const horizon = 6;
    const nextLabels: string[] = [];
    const lastMonth = labels[labels.length - 1];
    const [yy, mm] = lastMonth.split('-').map((v) => Number(v));
    const d = new Date(yy, (mm || 1) - 1, 1);
    for (let i = 0; i < horizon; i += 1) {
      d.setMonth(d.getMonth() + 1);
      nextLabels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const pred: number[] = [];
    if (trendMethod === 'last_period') {
      const v = actual[actual.length - 1] || 0;
      for (let i = 0; i < horizon; i += 1) pred.push(v);
    } else if (trendMethod === 'moving_avg') {
      const base = actual.slice(-3);
      const avg = base.length ? base.reduce((s, v) => s + v, 0) / base.length : 0;
      for (let i = 0; i < horizon; i += 1) pred.push(avg);
    } else {
      const n = actual.length;
      const xMean = (n - 1) / 2;
      const yMean = n ? actual.reduce((s, v) => s + v, 0) / n : 0;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i += 1) {
        num += (i - xMean) * (actual[i] - yMean);
        den += (i - xMean) * (i - xMean);
      }
      const slope = den ? num / den : 0;
      const intercept = yMean - slope * xMean;
      for (let i = 0; i < horizon; i += 1) {
        const x = n + i;
        pred.push(Math.max(0, intercept + slope * x));
      }
    }

    return {
      backgroundColor: 'transparent',
      grid: { left: 50, right: 20, top: 30, bottom: 70 },
      tooltip: { trigger: 'axis' },
      legend: { show: true, bottom: 8, left: 'center' },
      xAxis: { type: 'category', data: [...labels, ...nextLabels] },
      yAxis: { type: 'value', name: 'Hours' },
      series: [
        {
          name: 'Actual Hours',
          type: 'line',
          smooth: true,
          data: [...actual, ...Array(horizon).fill(null)],
          symbol: 'circle',
          symbolSize: 5,
        },
        {
          name: `Forecast (${trendMethod === 'linear' ? 'Linear' : trendMethod === 'moving_avg' ? '3-mo Avg' : 'Last Period'})`,
          type: 'line',
          smooth: true,
          lineStyle: { type: 'dashed' },
          data: [...Array(actual.length - 1).fill(null), actual[actual.length - 1], ...pred],
          symbol: 'diamond',
          symbolSize: 5,
        },
      ],
    };
  }, [monthly, trendMethod]);

  const cpiSpiOption: EChartsOption = useMemo(() => {
    const points = forecasts.filter((f) => Number(f.cpi) > 0 || Number(f.spi) > 0);
    const maxSpi = Math.max(1.2, ...points.map((f) => Number(f.spi || 0)));
    const maxCpi = Math.max(1.2, ...points.map((f) => Number(f.cpi || 0)));
    return {
      backgroundColor: 'transparent',
      grid: { left: 55, right: 20, top: 16, bottom: 46 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const d = p?.data?.value || p?.data || [];
          return `<b>${d[2] || 'Project'}</b><br/>SPI: ${Number(d[0] || 0).toFixed(2)}<br/>CPI: ${Number(d[1] || 0).toFixed(2)}<br/>Margin: ${Number(d[3] || 0).toFixed(1)}%`;
        },
      },
      xAxis: {
        type: 'value',
        name: 'SPI',
        min: 0,
        max: Math.ceil(maxSpi * 10) / 10,
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      },
      yAxis: {
        type: 'value',
        name: 'CPI',
        min: 0,
        max: Math.ceil(maxCpi * 10) / 10,
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      },
      series: [
        {
          name: 'Project Risk Position',
          type: 'scatter',
          symbol: 'circle',
          data: points.map((f) => {
            const spi = Math.round(Number(f.spi || 0) * 100) / 100;
            const cpi = Math.round(Number(f.cpi || 0) * 100) / 100;
            const margin = Number(f.profitMargin || 0);
            const color = spi >= 1 && cpi >= 1 ? '#10b981' : spi >= 1 || cpi >= 1 ? '#f59e0b' : '#ef4444';
            return {
              value: [spi, cpi, f.name, margin],
              symbolSize: Math.min(26, Math.max(8, 10 + Math.abs(margin) * 0.15)),
              itemStyle: { color, opacity: 0.85, borderColor: 'rgba(255,255,255,0.25)', borderWidth: 1 },
            };
          }),
          markLine: {
            symbol: 'none',
            label: { show: false },
            lineStyle: { color: 'rgba(255,255,255,0.35)', type: 'dashed' },
            data: [{ xAxis: 1 }, { yAxis: 1 }],
          },
        },
      ],
    };
  }, [forecasts]);

  const eacBreakdownOption: EChartsOption = useMemo(() => {
    const ranked = [...forecasts]
      .map((f) => ({ ...f, variance: Number(f.contractValue || 0) - Number(f.eac || 0) }))
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
      .slice(0, 20);
    const breakEvenLine = (kpis?.totalContractValue || 0) - (kpis?.totalActual || 0);
    const allVals = ranked.map((f) => Number(f.variance || 0));
    allVals.push(0, breakEvenLine);
    const rawMin = allVals.length ? Math.min(...allVals) : 0;
    const rawMax = allVals.length ? Math.max(...allVals) : 0;
    const span = Math.max(1, rawMax - rawMin);
    const pad = span * 0.12;
    const xMin = rawMin - pad;
    const xMax = rawMax + pad;
    return {
      backgroundColor: 'transparent',
      grid: { left: 170, right: 56, top: 18, bottom: 42, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const row = ranked[params?.[0]?.dataIndex || 0];
          if (!row) return '';
          const variance = row.variance;
          return `<b>${row.name}</b><br/>Contract: $${Math.round(row.contractValue).toLocaleString()}<br/>EAC: $${Math.round(row.eac).toLocaleString()}<br/>Variance: <span style="color:${variance >= 0 ? '#10b981' : '#ef4444'}">${variance >= 0 ? '+' : ''}$${Math.round(variance).toLocaleString()}</span>`;
        },
      },
      xAxis: {
        type: 'value',
        name: 'Contract - EAC ($)',
        min: xMin,
        max: xMax,
        axisLabel: { formatter: (v: number) => `$${(v / 1000).toFixed(0)}k` },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      },
      yAxis: {
        type: 'category',
        data: ranked.map((f) => truncLabel(f.name, 26)),
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      series: [
        {
          name: 'Variance',
          type: 'bar',
          data: ranked.map((f) => ({
            value: Math.round(f.variance),
            itemStyle: { color: f.variance >= 0 ? '#10b981' : '#ef4444', borderRadius: [0, 4, 4, 0] },
          })),
          markLine: {
            symbol: 'none',
            lineStyle: { color: '#94a3b8', type: 'dashed' },
            label: {
              color: '#cbd5e1',
              fontSize: 10,
              formatter: (p: any) => (p?.data?.name === 'zero' ? 'Zero Variance' : 'Portfolio Break-even'),
            },
            data: [
              { name: 'zero', xAxis: 0, lineStyle: { color: '#f8fafc', type: 'solid', width: 1.6 } },
              { name: 'breakeven', xAxis: Math.round(breakEvenLine), lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.6 } },
            ],
          },
        },
      ],
    };
  }, [forecasts, kpis?.totalActual, kpis?.totalContractValue]);

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
            <div className="kpi-label">CPI / SPI</div>
            <div className="kpi-value" style={{ color: cpiColor((kpis.cpi + kpis.spi) / 2) }}>
              {kpis.cpi.toFixed(2)} / {kpis.spi.toFixed(2)}
            </div>
            <div className="kpi-detail">Cost and schedule performance indices</div>
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
          <div className="glass-raised" style={{ padding: '0.65rem', width: '100%', overflow: 'hidden' }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>Hours Forecast by Trend Method</div>
              <select
                value={trendMethod}
                onChange={(e) => setTrendMethod(e.target.value as 'linear' | 'moving_avg' | 'last_period')}
                style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.28rem 0.45rem', fontSize: '0.68rem' }}
              >
                <option value="linear">Linear Trend</option>
                <option value="moving_avg">3-Month Moving Average</option>
                <option value="last_period">Last Period Carry-Forward</option>
              </select>
            </div>
            {monthly.length > 0
              ? <ChartWrapper option={hoursForecastOption} height={CHART_MIN_H} />
              : <NoData label="No monthly data" height={CHART_MIN_H} />}
          </div>

          <div className="glass-raised" style={{ padding: '0.65rem', width: '100%' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>CPI / SPI Matrix</div>
            {forecasts.length > 0
              ? <ChartWrapper option={cpiSpiOption} height={CHART_MIN_H} />
              : <NoData label="No project data" height={CHART_MIN_H} />}
          </div>

          <div className="glass-raised" style={{ padding: '0.65rem', width: '100%' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem' }}>EAC Variance to Contract (Contract - EAC)</div>
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
