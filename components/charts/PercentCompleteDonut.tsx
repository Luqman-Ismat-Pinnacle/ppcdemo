'use client';

/**
 * @fileoverview Percent Complete Donut Chart Component.
 * 
 * Displays a single percentage value as a donut chart with
 * center label. Commonly used for:
 * - Overall project completion
 * - Phase progress indicators
 * - Task completion status
 * 
 * @module components/charts/PercentCompleteDonut
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface PercentCompleteDonutProps {
  percent: number;
  label?: string;
  height?: string | number;
}

export default function PercentCompleteDonut({
  percent,
  label = '',
  height = '150px',
}: PercentCompleteDonutProps) {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const remaining = 100 - clampedPercent;
  const color =
    clampedPercent >= 75
      ? '#10B981'
      : clampedPercent >= 50
        ? '#F59E0B'
        : '#EF4444';

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      formatter: () => `<div style="font-weight:bold;margin-bottom:2px">${label}</div><div>Progress: <span style="font-weight:bold;color:${color}">${clampedPercent.toFixed(1)}%</span></div>`
    },
    series: [
      {
        type: 'pie',
        radius: ['65%', '85%'],
        center: ['50%', '50%'],
        startAngle: 90,
        label: { show: false },
        data: [
          { value: clampedPercent, itemStyle: { color } },
          { value: remaining, itemStyle: { color: 'var(--bg-tertiary)' } },
        ],
      },
    ],
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '42%',
        style: {
          text: `${clampedPercent.toFixed(0)}%`,
          fontSize: 18,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          fill: 'var(--text-primary)',
        },
        z: 100,
      },
      {
        type: 'text',
        left: 'center',
        top: '58%',
        style: {
          text: label,
          fontSize: 9,
          fill: 'var(--text-muted)',
        },
        z: 100,
      },
    ],
  };

  return <ChartWrapper option={option} height={height} />;
}

