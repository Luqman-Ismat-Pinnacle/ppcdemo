'use client';

/**
 * @fileoverview Gauge Chart Component.
 * 
 * Displays a radial gauge showing a single value as a percentage.
 * Commonly used for:
 * - Document approval rates
 * - Project completion percentage
 * - Performance metrics
 * 
 * @module components/charts/GaugeChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface GaugeChartProps {
  value: number;
  label: string;
  color?: string;
  height?: string | number;
}

export default function GaugeChart({
  value,
  label,
  color = '#3B82F6',
  height = '150px',
}: GaugeChartProps) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      formatter: () => `<div style="font-weight:bold;margin-bottom:2px">${label}</div><div>Progress: <span style="font-weight:bold;color:${color}">${value}%</span></div>`
    },
    series: [
      {
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 100,
        center: ['50%', '70%'],
        radius: '90%',
        progress: { show: true, width: 12, itemStyle: { color } },
        axisLine: { lineStyle: { width: 12, color: [[1, 'var(--bg-tertiary)']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        detail: {
          valueAnimation: true,
          formatter: (v: number) => (v === 0 ? '(Blank)' : v + '%'),
          fontSize: 16,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          color: value === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
          offsetCenter: [0, '10%'],
        },
        data: [{ value }],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 0,
        bottom: 0,
        style: { text: '0%', fontSize: 10, fill: 'var(--text-muted)' },
      },
      {
        type: 'text',
        right: 0,
        bottom: 0,
        style: { text: '100%', fontSize: 10, fill: 'var(--text-muted)' },
      },
    ],
  };

  return <ChartWrapper option={option} height={height} />;
}

