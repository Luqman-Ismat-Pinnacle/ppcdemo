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
  onSliceClick?: (params: { name: string; value: number }) => void;
  activeFilters?: string[];
  enableExport?: boolean;
  enableFullscreen?: boolean;
}

export default function MilestoneStatusPie({
  data,
  height = '300px',
  onSliceClick,
  activeFilters = [],
  enableExport = true,
  enableFullscreen = true,
}: MilestoneStatusPieProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const pieCenter = ['35%', '50%'];
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 600,
    animationEasing: 'cubicOut',
    graphic: [
      {
        type: 'text',
        left: pieCenter[0],
        top: pieCenter[1],
        style: {
          text: total > 0 ? String(total) : '—',
          fontSize: 28,
          fontWeight: 700,
          fill: 'var(--text-primary)',
          textAlign: 'center',
          textVerticalAlign: 'middle',
        },
        z: 100,
      },
      {
        type: 'text',
        left: pieCenter[0],
        top: '56%',
        style: {
          text: 'Total',
          fontSize: 11,
          fill: 'var(--text-muted)',
          textAlign: 'center',
          textVerticalAlign: 'middle',
        },
        z: 100,
      },
    ],
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: any) =>
        `<div style="font-weight:bold;margin-bottom:4px">${params.name}</div>
         <div style="display:flex;justify-content:space-between;gap:20px"><span>Count:</span><span style="font-weight:bold">${params.value}</span></div>
         <div style="display:flex;justify-content:space-between;gap:20px"><span>Percent:</span><span style="font-weight:bold">${params.percent}%</span></div>`,
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
        center: pieCenter,
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.3)' } },
        data: data.map((d) => {
          const isFiltered = activeFilters.length > 0 && !activeFilters.includes(d.name);
          return {
            value: d.value,
            name: d.name,
            itemStyle: {
              color: d.color,
              opacity: isFiltered ? 0.35 : 1,
              borderColor: activeFilters.includes(d.name) ? '#fff' : 'transparent',
              borderWidth: activeFilters.includes(d.name) ? 2 : 0,
            },
          };
        }),
      },
    ],
  };

  return (
    <ChartWrapper
      option={option}
      height={height}
      enableExport={enableExport}
      enableFullscreen={enableFullscreen}
      enableCompare={true}
      visualId="milestone-status"
      exportFilename="milestone-status"
      visualTitle="Milestone Status"
      isEmpty={total === 0}
      onClick={
        onSliceClick
          ? (params) => {
              const name = params.name ?? '';
              const value = typeof params.value === 'number' ? params.value : 0;
              onSliceClick({ name: String(name), value });
            }
          : undefined
      }
    />
  );
}

