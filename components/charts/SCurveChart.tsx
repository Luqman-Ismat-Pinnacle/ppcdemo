'use client';

/**
 * @fileoverview S-Curve Chart Component for PPC V3.
 * 
 * Displays cumulative progress over time, comparing planned vs actual values.
 * S-curves are commonly used in project management to visualize:
 * - Cost performance (cumulative spend vs budget)
 * - Schedule performance (work completed vs planned)
 * - Resource utilization over time
 * 
 * @module components/charts/SCurveChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

/**
 * Props for SCurveChart component.
 * @interface SCurveChartProps
 */
interface SCurveChartProps {
  dates: string[];
  planned: number[];
  actual: number[];
  forecast: number[];
  height?: string | number;
}

export default function SCurveChart({ 
  dates, 
  planned, 
  actual, 
  forecast = [], 
  height = '300px',
}: SCurveChartProps) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        let res = `<div style="font-weight:bold;margin-bottom:4px;">${params[0]?.name || ''}</div>`;
        params.forEach((p: any) => {
          const val = p?.value != null ? p.value.toLocaleString() : '-';
          res += `<div style="display:flex;justify-content:space-between;gap:20px;">
            <span>${p?.marker || ''} ${p?.seriesName || ''}</span>
            <span style="font-weight:bold">${val}</span>
          </div>`;
        });
        return res;
      }
    },
    legend: {
      data: ['Planned', 'Actual', 'Forecast'],
      textStyle: { color: 'var(--text-secondary)' },
      top: 10,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'var(--border-color)', opacity: 0.3 } },
    },
    series: [
      {
        name: 'Planned',
        type: 'line',
        smooth: true,
        data: planned,
        lineStyle: { color: '#40E0D0', width: 2 },
        itemStyle: { color: '#40E0D0' },
        areaStyle: { color: 'rgba(64, 224, 208, 0.1)' },
      },
      {
        name: 'Actual',
        type: 'line',
        smooth: true,
        data: actual,
        lineStyle: { color: '#CDDC39', width: 2 },
        itemStyle: { color: '#CDDC39' },
        areaStyle: { color: 'rgba(205, 220, 57, 0.1)' },
      },
      {
        name: 'Forecast',
        type: 'line',
        smooth: true,
        data: forecast,
        lineStyle: { color: '#FF8C00', width: 2, type: 'dashed' },
        itemStyle: { color: '#FF8C00' },
        areaStyle: { color: 'rgba(255, 140, 0, 0.08)' },
      },
    ],
  };

  return <ChartWrapper option={option} height={height} />;
}

