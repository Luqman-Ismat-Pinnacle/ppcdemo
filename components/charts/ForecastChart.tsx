'use client';

/**
 * @fileoverview Forecast Chart Component.
 * 
 * Displays project forecasting data comparing:
 * - Baseline (original plan)
 * - Actual (completed work)
 * - Forecast (projected completion)
 * 
 * Supports both hours and budget visualization modes.
 * 
 * @module components/charts/ForecastChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { Forecast } from '@/types/data';

interface ForecastChartProps {
  data: Forecast;
  height?: string | number;
  isBudget?: boolean;
}

export default function ForecastChart({
  data,
  height = '300px',
  isBudget = false,
}: ForecastChartProps) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        let res = `<div style="font-weight:bold;margin-bottom:4px">${params[0]?.name || ''}</div>`;
        params.forEach((p: any) => {
          const val = p?.value == null ? '-' : (isBudget ? `$${p.value}K` : p.value.toLocaleString());
          res += `<div style="display:flex;justify-content:space-between;gap:20px">
            <span>${p?.marker || ''} ${p?.seriesName || ''}</span>
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
    grid: { left: 55, right: 15, top: 40, bottom: 25 },
    xAxis: {
      type: 'category',
      data: data.months,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 9 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 9,
        formatter: (v: number) => (isBudget ? '$' + v + 'K' : v.toLocaleString()),
      },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    series: [
      {
        name: 'Baseline',
        type: 'line',
        data: data.baseline,
        lineStyle: { color: 'var(--text-muted)', type: 'dashed' },
        itemStyle: { color: 'var(--text-muted)' },
        symbol: 'none',
      },
      {
        name: 'Actual',
        type: 'line',
        data: data.actual,
        lineStyle: { color: '#10B981', width: 2 },
        itemStyle: { color: '#10B981' },
        symbol: 'circle',
        symbolSize: 5,
      },
      {
        name: 'Forecast',
        type: 'line',
        data: data.forecast,
        lineStyle: { color: '#F59E0B', type: 'dashed', width: 2 },
        itemStyle: { color: '#F59E0B' },
        symbol: 'circle',
        symbolSize: 4,
      },
    ],
  };

  return <ChartWrapper option={option} height={height} />;
}

