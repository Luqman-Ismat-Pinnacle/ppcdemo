'use client';

/**
 * @fileoverview Resource Leveling Chart Component.
 * 
 * Displays monthly resource leveling with quarterly summary table.
 * Shows Total Project Hours vs Projected FTE Utilization.
 * 
 * @module components/charts/ResourceLevelingChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { ResourceLevelingData } from '@/types/data';

interface ResourceLevelingChartProps {
  data: ResourceLevelingData;
  height?: string | number;
}

export default function ResourceLevelingChart({
  data,
  height = '400px',
}: ResourceLevelingChartProps) {
  // Return empty chart if no data
  if (!data || (!data.monthly || data.monthly.length === 0)) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No data available
      </div>
    );
  }

  const monthlyLabels = data.monthly.map(m => m.monthLabel);
  const totalProjectHours = data.monthly.map(m => m.totalProjectHours);
  const projectedFTE = data.monthly.map(m => m.projectedFTEUtilization);

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const name = params[0]?.name || '';
        let result = `<div style="font-weight:bold;margin-bottom:4px">${name}</div>`;
        params.forEach((p: any) => {
          const val = p.value != null ? p.value.toFixed(2) : '0';
          result += `<div style="display:flex;justify-content:space-between;gap:20px">
            <span>${p.marker || ''} ${p.seriesName || ''}:</span>
            <span style="font-weight:bold">${val}</span>
          </div>`;
        });
        return result;
      },
    },
    legend: {
      data: ['Total Project Hours', 'Projected FTE Utilization'],
      top: 0,
      textStyle: { color: 'var(--text-secondary)', fontSize: 11 },
    },
    grid: { left: 60, right: 60, top: 40, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: monthlyLabels,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 10,
        rotate: monthlyLabels.length > 12 ? 45 : 0,
        interval: 0,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Hours',
      nameLocation: 'middle',
      nameGap: 50,
      axisLine: { show: false },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    series: [
      {
        name: 'Total Project Hours',
        type: 'bar',
        data: totalProjectHours,
        itemStyle: { color: '#3B82F6' },
        barWidth: '60%',
        emphasis: { itemStyle: { opacity: 0.85 } },
      },
      {
        name: 'Projected FTE Utilization',
        type: 'bar',
        data: projectedFTE,
        itemStyle: { color: '#FF9800' },
        barWidth: '60%',
        emphasis: { itemStyle: { opacity: 0.85 } },
      },
    ],
  };

  return <ChartWrapper option={option} height={height} />;
}
