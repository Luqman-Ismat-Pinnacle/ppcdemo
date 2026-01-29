'use client';

/**
 * @fileoverview Milestone Status Pie Chart Component.
 * 
 * Displays milestone status distribution as a donut chart.
 * Shows breakdown of milestones by status:
 * - Completed (green)
 * - In Progress (yellow)
 * - Not Started (gray)
 * - Missed (red)
 * 
 * @module components/charts/MilestoneStatusPie
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { MilestoneStatusItem } from '@/types/data';

interface MilestoneStatusPieProps {
  data: MilestoneStatusItem[];
  height?: string | number;
}

export default function MilestoneStatusPie({ data, height = '300px' }: MilestoneStatusPieProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        return `<div style="font-weight:bold;margin-bottom:4px">${params.name}</div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>Count:</span>
                  <span style="font-weight:bold">${params.value}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>Percent:</span>
                  <span style="font-weight:bold">${params.percent}%</span>
                </div>`;
      }
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { color: 'var(--text-secondary)', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '75%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: data.map((d) => ({
          value: d.value,
          name: d.name,
          itemStyle: { color: d.color },
        })),
      },
    ],
    // Center text removed per user request - total shown in tooltip only
    graphic: [],
  };

  return <ChartWrapper option={option} height={height} />;
}

