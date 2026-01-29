'use client';

/**
 * @fileoverview Plan vs Forecast vs Actual Chart Component.
 * 
 * Displays three-way comparison of project progress:
 * - Planned (baseline cumulative values)
 * - Forecasted (current prediction)
 * - Actual (completed work)
 * 
 * Includes a status date marker line showing current reporting date.
 * 
 * @module components/charts/PlanForecastActualChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { PlanVsForecastVsActual } from '@/types/data';

interface PlanForecastActualChartProps {
  data: PlanVsForecastVsActual;
  height?: string | number;
}

export default function PlanForecastActualChart({
  data,
  height = '300px',
}: PlanForecastActualChartProps) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        let res = `<div style="font-weight:bold;margin-bottom:4px">${params[0]?.name || ''}</div>`;
        params.forEach((p: any) => {
          if (!p || p.seriesName?.includes('Line')) return;
          const val = p.value != null ? (typeof p.value === 'number' ? p.value.toLocaleString() : p.value) : '-';
          res += `<div style="display:flex;justify-content:space-between;gap:20px">
            <span>${p.marker || ''} ${p.seriesName || ''}</span>
            <span style="font-weight:bold">${val}</span>
          </div>`;
        });
        return res;
      }
    },
    legend: {
      top: 0,
      textStyle: { color: 'var(--text-secondary)', fontSize: 10 },
      itemWidth: 15,
      itemHeight: 3,
    },
    grid: { left: 50, right: 80, top: 50, bottom: 40 },
    xAxis: {
      type: 'category',
      data: data.dates,
      name: 'Date',
      nameLocation: 'middle',
      nameGap: 25,
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 10 },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 9 },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value',
        name: 'Cumulative Actual',
        nameTextStyle: { color: '#3B82F6', fontSize: 9 },
        axisLine: { lineStyle: { color: '#3B82F6' } },
        axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'Cumulative Forecasted',
        nameTextStyle: { color: '#FF9800', fontSize: 9 },
        axisLine: { lineStyle: { color: '#FF9800' } },
        axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Status Date Full Line',
        type: 'line',
        data: data.dates.map((_, i) => (i === data.statusDate ? null : null)),
        markLine: {
          data: [{ xAxis: data.statusDate }],
          lineStyle: { color: 'var(--text-muted)', type: 'dashed' },
          label: { show: false },
        },
      },
      {
        name: 'Cumulative Actual',
        type: 'line',
        step: 'end',
        data: data.cumulativeActual,
        lineStyle: { color: '#3B82F6', width: 2 },
        itemStyle: { color: '#3B82F6' },
        symbol: 'circle',
        symbolSize: 6,
      },
      {
        name: 'Cumulative Forecasted',
        type: 'line',
        step: 'end',
        yAxisIndex: 1,
        data: data.cumulativeForecasted,
        lineStyle: { color: '#FF9800', width: 2 },
        itemStyle: { color: '#FF9800' },
        symbol: 'circle',
        symbolSize: 6,
      },
      {
        name: 'Cumulative Planned',
        type: 'line',
        step: 'end',
        data: data.cumulativePlanned,
        lineStyle: { color: '#8B5CF6', width: 2 },
        itemStyle: { color: '#8B5CF6' },
        symbol: 'circle',
        symbolSize: 6,
      },
    ],
  };

  return <ChartWrapper option={option} height={height} />;
}

