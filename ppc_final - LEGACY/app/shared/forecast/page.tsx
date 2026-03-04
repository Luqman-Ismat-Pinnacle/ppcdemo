'use client';

/**
 * @fileoverview Forecasting page (lean, neutral, ECharts-only visuals).
 */

import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from '@/components/charts/ChartWrapper';
import { useData } from '@/lib/data-context';
import { calcCpi, calcIeacCpi, calcSpi, calcTcpiToBac } from '@/lib/calculations/kpis';

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function smallCard(label: string, value: string | number) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

export default function ForecastPage() {
  const { filteredData, data, isLoading } = useData();
  const source = filteredData || data;

  const projects = (source.projects || []) as unknown as Array<Record<string, unknown>>;
  const tasks = (source.tasks || []) as unknown as Array<Record<string, unknown>>;
  const hours = (source.hours || []) as unknown as Array<Record<string, unknown>>;
  const contracts = (source.customerContracts || data.customerContracts || []) as unknown as Array<Record<string, unknown>>;

  const derived = useMemo(() => {
    const baselineHours = tasks.reduce((sum, row) => sum + asNumber(row.baselineHours ?? row.baseline_hours), 0);
    const actualHours = hours.reduce((sum, row) => sum + asNumber(row.hours), 0);
    const percentComplete = tasks.length
      ? tasks.reduce((sum, row) => sum + asNumber(row.percentComplete ?? row.percent_complete), 0) / tasks.length
      : 0;
    const earnedValue = baselineHours * Math.max(0, Math.min(1, percentComplete / 100));
    const plannedValue = baselineHours * 0.5;
    const contractTotal = contracts.reduce((sum, row) => {
      const amountA = asNumber(row.amountUsd ?? row.amount_usd);
      const amountB = asNumber(row.lineAmount ?? row.line_amount);
      return sum + (amountA || amountB);
    }, 0);
    const bac = contractTotal > 0
      ? contractTotal
      : (projects.reduce((sum, row) => sum + asNumber(row.budget ?? row.bac ?? row.totalBudget), 0) || baselineHours);
    const cpi = calcCpi(earnedValue, actualHours, 'forecast', 'current');
    const spi = calcSpi(earnedValue, plannedValue, 'forecast', 'current');
    const ieac = calcIeacCpi(bac, cpi.value, 'forecast', 'current');
    const tcpi = calcTcpiToBac(bac, earnedValue, actualHours, 'forecast', 'current');
    return { baselineHours, actualHours, percentComplete, earnedValue, plannedValue, contractTotal, bac, cpi, spi, ieac, tcpi };
  }, [contracts, hours, projects, tasks]);

  const burnTrendOption: EChartsOption = useMemo(() => {
    const monthly = new Map<string, number>();
    for (const row of hours) {
      const date = asDate(row.date || row.workDate || row.work_date);
      if (!date) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthly.set(key, (monthly.get(key) || 0) + asNumber(row.hours));
    }
    const labels = [...monthly.keys()].sort();
    const values = labels.map((key) => asNumber(monthly.get(key)));
    return {
      backgroundColor: 'transparent',
      grid: { left: 40, right: 20, top: 20, bottom: 40 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: labels, axisLabel: { color: 'var(--text-muted)' } },
      yAxis: { type: 'value', axisLabel: { color: 'var(--text-muted)' }, splitLine: { lineStyle: { color: 'var(--border-color)' } } },
      series: [{ type: 'line', data: values, smooth: true, symbol: 'circle', lineStyle: { width: 2 } }],
    };
  }, [hours]);

  const projectSplitOption: EChartsOption = useMemo(() => {
    const byProject = new Map<string, number>();
    for (const row of hours) {
      const projectId = String(row.projectId || row.project_id || 'Unknown');
      byProject.set(projectId, (byProject.get(projectId) || 0) + asNumber(row.hours));
    }
    const entries = [...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    return {
      backgroundColor: 'transparent',
      grid: { left: 120, right: 20, top: 16, bottom: 24 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'value', axisLabel: { color: 'var(--text-muted)' }, splitLine: { lineStyle: { color: 'var(--border-color)' } } },
      yAxis: { type: 'category', data: entries.map(([name]) => name), axisLabel: { color: 'var(--text-muted)' } },
      series: [{ type: 'bar', data: entries.map(([, value]) => value), barMaxWidth: 20 }],
    };
  }, [hours]);

  const forecastScenarioOption: EChartsOption = useMemo(() => {
    const baseline = derived.bac;
    const forecastLikely = derived.ieac.value;
    const optimistic = forecastLikely * 0.92;
    const conservative = forecastLikely * 1.1;
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: { type: 'category', data: ['Baseline', 'Optimistic', 'Likely', 'Conservative'], axisLabel: { color: 'var(--text-muted)' } },
      yAxis: { type: 'value', axisLabel: { color: 'var(--text-muted)' }, splitLine: { lineStyle: { color: 'var(--border-color)' } } },
      series: [{ type: 'bar', data: [baseline, optimistic, forecastLikely, conservative] }],
    };
  }, [derived.bac, derived.ieac.value]);

  if (isLoading) {
    return <div className="page-panel">Loading forecast data...</div>;
  }

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.85rem' }}>
      <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Forecasting</h1>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Neutral forecast view with shared KPI formulas and operational hour trends.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
        {smallCard('Baseline', derived.baselineHours.toFixed(1))}
        {smallCard('Actual Hours', derived.actualHours.toFixed(1))}
        {smallCard('Percent Complete', `${derived.percentComplete.toFixed(1)}%`)}
        {smallCard('SPI', derived.spi.value.toFixed(2))}
        {smallCard('CPI', derived.cpi.value.toFixed(2))}
        {smallCard('IEAC', derived.ieac.value.toFixed(2))}
        {smallCard('TCPI', derived.tcpi.value.toFixed(2))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '0.75rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Monthly Burn Trend</div>
          <ChartWrapper option={burnTrendOption} height="280px" />
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Forecast Scenarios</div>
          <ChartWrapper option={forecastScenarioOption} height="280px" />
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>Hours by Project</div>
        <ChartWrapper option={projectSplitOption} height="320px" />
      </div>
    </div>
  );
}
