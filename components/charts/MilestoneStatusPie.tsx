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
  const option: EChartsOption = {
    backgroundColor: 'transparent',
    title: {
      text: total > 0 ? String(total) : '—',
      left: 'center',
      top: '38%',
      textStyle: { fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' },
      subtext: 'Total',
      subtextStyle: { fontSize: 11, color: 'var(--text-muted)' },
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
    // Center text removed per user request - total shown in tooltip only
    graphic: [],
  };

  return (
    <ChartWrapper
      option={option}
      height={height}
      enableExport={enableExport}
      enableFullscreen={enableFullscreen}
      exportFilename="milestone-status"
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

