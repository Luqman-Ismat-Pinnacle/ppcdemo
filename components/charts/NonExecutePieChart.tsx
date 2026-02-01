'use client';

/**
 * @fileoverview Non-Execute Pie Chart Component.
 * 
 * Displays non-execute (overhead) hours as a pie chart.
 * Categories include Admin, Training, Meetings, and Other.
 * Used on the Hours page to analyze non-productive time.
 * 
 * @module components/charts/NonExecutePieChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface NonExecutePieChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  height?: string | number;
  showLabels?: boolean;
  visualId?: string;
}

export default function NonExecutePieChart({
  data,
  height = '200px',
  showLabels = true,
  visualId = 'non-execute-pie',
}: NonExecutePieChartProps) {
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `<div style="font-weight:bold;margin-bottom:4px">${params.name}</div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>Hours:</span>
                  <span style="font-weight:bold">${params.value}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>Share:</span>
                  <span style="font-weight:bold">${params.percent}%</span>
                </div>`;
      }
    },
    legend: {
      orient: 'horizontal',
      bottom: 8,
      left: 'center',
      textStyle: { color: 'var(--text-secondary)', fontSize: 9 },
      itemWidth: 8,
      itemHeight: 8,
    },
    series: [
      {
        type: 'pie',
        radius: ['0%', '70%'],
        center: ['50%', '50%'],
        label: {
          show: showLabels,
          position: 'inside',
          formatter: '{c}',
          fontSize: 10,
          color: '#fff',
          fontWeight: 600,
        },
        data: data.map((d) => ({
          value: d.value,
          name: d.name,
          itemStyle: { color: d.color },
        })),
      },
    ],
  };

  return <ChartWrapper option={option} height={height} enableCompare enableExport enableFullscreen visualId={visualId} visualTitle="Non-Execute Hours" />;
}

