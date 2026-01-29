'use client';

/**
 * @fileoverview Quality Hours Chart Component.
 * 
 * Displays hours breakdown by quality category as stacked bar chart.
 * Categories include: Productive, Rework, Idle.
 * Shows QC percentage and poor quality percentage per task.
 * 
 * @module components/charts/QualityHoursChart
 */

import React, { useMemo } from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { QualityHours } from '@/types/data';

interface QualityHoursChartProps {
  data: QualityHours;
  height?: string | number;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QualityHoursChart({
  data,
  height = '300px',
  onBarClick,
  activeFilters = [],
}: QualityHoursChartProps) {
  const colors = ['#40E0D0', '#FF9800', '#E91E63', '#CDDC39', '#9E9D24'];
  const isFiltered = activeFilters.length > 0;

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        let res = `<div style="font-weight:bold;margin-bottom:4px;">${params[0]?.name || ''}</div>`;
        params.forEach((p: any) => {
          if (!p || p.value == null) return;
          const val = typeof p.value === 'number' ? p.value : parseFloat(p.value) || 0;
          if (val > 0) {
            res += `<div style="display:flex;justify-content:space-between;gap:20px;">
              <span>${p.marker || ''} ${p.seriesName || ''}</span>
              <span style="font-weight:bold">${val}%</span>
            </div>`;
          }
        });
        return res;
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: 'var(--text-secondary)', fontSize: 10 },
      itemWidth: 12,
      itemHeight: 12,
    },
    grid: { left: 120, right: 70, top: 15, bottom: 50 },
    xAxis: {
      type: 'value',
      max: 100,
      axisLine: { show: false },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 10,
        formatter: '{value}%',
      },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: data.tasks,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 11,
        width: 100,
        overflow: 'truncate',
      },
      axisTick: { show: false },
    },
    series: data.categories.map((cat, i) => ({
      name: cat,
      type: 'bar',
      stack: 'total',
      data: data.data.map((row, rowIdx) => {
        const total = row.reduce((a, b) => a + b, 0);
        const val = total > 0 ? (row[i] / total * 100).toFixed(1) : 0;
        const taskName = data.tasks[rowIdx];
        return {
          value: val,
          itemStyle: {
            color:
              isFiltered && !activeFilters.includes(taskName)
                ? colors[i] + '4D'
                : colors[i],
            opacity: isFiltered && !activeFilters.includes(taskName) ? 0.4 : 1,
          },
        };
      }),
      barWidth: 20,
      barGap: '25%',
      emphasis: { itemStyle: { opacity: 0.85 } },
    })),
  }), [data, isFiltered, activeFilters]);

  return (
    <ChartWrapper
      option={option}
      height={height}
      visualTitle="Quality Hours Breakdown"
      isEmpty={data.tasks.length === 0}
      onChartReady={(chart) => {
        if (onBarClick) {
          chart.off('click');
          chart.on('click', (params: any) => {
            const taskName = data.tasks[params.dataIndex];
            onBarClick({ name: taskName, dataIndex: params.dataIndex });
          });
        }
      }}
    />
  );
}

