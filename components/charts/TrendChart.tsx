'use client';

/**
 * @fileoverview Trend Chart Component.
 * 
 * Displays a simple line/area chart for time-series data.
 * Shows trend direction with optional gradient fill.
 * Used for KPI mini-charts and sparklines.
 * 
 * @module components/charts/TrendChart
 */

import React, { useMemo } from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface TrendChartProps {
  data: number[];
  dates: string[];
  title: string;
  color: string;
  height?: string | number;
}

export default function TrendChart({
  data,
  dates,
  title,
  color,
  height = '200px',
}: TrendChartProps) {
  const option: EChartsOption = useMemo(() => {
    // Helper to resolve CSS variables for ECharts color stops
    const resolveColor = (c: string) => {
      if (!c.includes('var(')) return c;
      if (c.includes('--pinnacle-teal')) return '#40E0D0';
      if (c.includes('--pinnacle-lime')) return '#CDDC39';
      if (c.includes('--pinnacle-pink')) return '#E91E63';
      if (c.includes('--pinnacle-orange')) return '#FF9800';
      return '#40E0D0'; // Fallback
    };

    const baseColor = resolveColor(color);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const p = params[0];
          if (!p || p.value == null) return '';
          const val = typeof p.value === 'number' ? p.value : 0;
          return `<div style="font-weight:bold;margin-bottom:4px">${p.name || ''}</div>
                  <div style="display:flex;justify-content:space-between;gap:20px">
                    <span>${p.seriesName || ''}:</span>
                    <span style="font-weight:bold;color:${p.color || 'inherit'}">${val.toFixed(2)}</span>
                  </div>
                  <div style="font-size:10px;margin-top:4px;color:${val >= 1 ? '#10B981' : '#EF4444'}">
                    ${val >= 1 ? 'Above Baseline (Good)' : 'Below Baseline (Watch)'}
                  </div>`;
        }
      },
      grid: { left: 40, right: 15, top: 10, bottom: 25 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: { color: '#888', fontSize: 9 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0.5,
        max: 1.5,
        axisLine: { show: false },
        axisLabel: { color: '#888', fontSize: 9 },
        splitLine: { lineStyle: { color: '#222', type: 'dashed' } },
      },
      series: [
        {
          name: title,
          type: 'line',
          data: data,
          smooth: true,
          lineStyle: { color: baseColor, width: 2 },
          itemStyle: { color: baseColor },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: baseColor + '44' },
                { offset: 1, color: baseColor + '00' }
              ]
            }
          },
          symbol: 'circle',
          symbolSize: 6,
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            data: [{ yAxis: 1, lineStyle: { color: '#ef4444', type: 'dashed' } }]
          }
        },
      ],
    };
  }, [data, dates, title, color]);

  return <ChartWrapper option={option} height={height} />;
}

