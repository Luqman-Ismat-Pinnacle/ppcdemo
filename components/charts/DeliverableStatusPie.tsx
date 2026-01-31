'use client';

/**
 * @fileoverview Deliverable Status Pie Chart Component.
 * 
 * Displays deliverable status distribution as a pie/donut chart.
 * Shows the breakdown of deliverables by status (Approved, In Progress, etc.)
 * with color-coded segments and percentage labels.
 * 
 * @module components/charts/DeliverableStatusPie
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { DeliverableStatus } from '@/types/data';

interface DeliverableStatusPieProps {
  data: DeliverableStatus[];
  title: string;
  height?: string | number;
}

export default function DeliverableStatusPie({
  data,
  title,
  height = '200px',
}: DeliverableStatusPieProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    title: title ? {
      text: title,
      left: 'center',
      bottom: 0,
      textStyle: { color: 'var(--text-secondary)', fontSize: 10 },
    } : {
      text: total > 0 ? String(total) : '—',
      left: 'center',
      top: '38%',
      textStyle: { fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' },
      subtext: 'Total',
      subtextStyle: { fontSize: 10, color: 'var(--text-muted)' },
    },
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
      right: 0,
      top: 'center',
      textStyle: { color: 'var(--text-secondary)', fontSize: 8 },
      itemWidth: 8,
      itemHeight: 8,
      formatter: (name: string) => (name.length > 10 ? name.substring(0, 10) + '...' : name),
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['50%', '50%'],
        label: {
          show: true,
          position: 'outside',
          formatter: (p: any) => `${p.name}: ${p.value}`,
          fontSize: 11,
          color: 'var(--text-secondary)',
        },
        data: data.map((d) => ({
          value: d.value,
          name: d.name,
          percent: d.percent,
          itemStyle: { color: d.color },
        })),
      },
    ],
  };

  return <ChartWrapper option={option} height={height} />;
}

