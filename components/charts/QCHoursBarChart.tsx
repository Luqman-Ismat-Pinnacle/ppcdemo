'use client';

/**
 * @fileoverview QC Hours Bar Chart Component.
 * 
 * Displays hours data as horizontal bar chart.
 * Used for "Hours Since Last QC Check" and "Hours to QC Ratio" charts.
 * 
 * @module components/charts/QCHoursBarChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface QCHoursBarChartProps {
  data: Array<{ name: string; value: number }>;
  xAxisLabel: string;
  yAxisLabel: string;
  height?: string | number;
  showLabels?: boolean;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QCHoursBarChart({
  data,
  xAxisLabel,
  yAxisLabel,
  height = '300px',
  showLabels = true,
  onBarClick,
  activeFilters = [],
}: QCHoursBarChartProps) {
  // Return empty chart if no data
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No data available
      </div>
    );
  }

  const isFiltered = activeFilters.length > 0;
  const labels = data.map((d) => d.name);
  const values = data.map((d) => d.value);

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const p = params[0];
        if (!p) return '';
        const val = p.value != null ? p.value : 0;
        return `<div style="font-weight:bold;margin-bottom:4px">${p.name || ''}</div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>${xAxisLabel}:</span>
                  <span style="font-weight:bold">${val.toFixed(2)}</span>
                </div>`;
      },
    },
    grid: { left: 120, right: 80, top: 20, bottom: 35, containLabel: false },
    xAxis: {
      type: 'value',
      name: xAxisLabel,
      nameLocation: 'middle',
      nameGap: 30,
      axisLine: { show: false },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: labels,
      name: yAxisLabel,
      nameLocation: 'middle',
      nameGap: 60,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 10,
        width: 110,
        overflow: 'truncate',
      },
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 11 },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: values.map((val, i) => ({
          value: val,
          itemStyle: {
            color:
              isFiltered && !activeFilters.includes(labels[i])
                ? 'rgba(64, 224, 208, 0.3)'
                : '#40E0D0',
            borderColor: activeFilters.includes(labels[i]) ? '#fff' : 'transparent',
            borderWidth: activeFilters.includes(labels[i]) ? 2 : 0,
          },
        })),
        barWidth: 20,
        barGap: '25%',
        label: {
          show: showLabels,
          position: 'right',
          formatter: (params: any) => {
            const val = params.value != null ? params.value : 0;
            return val.toFixed(1);
          },
          color: '#fff',
          fontSize: 10,
        },
        emphasis: { itemStyle: { opacity: 0.85 } },
      },
    ],
  };

  return (
    <ChartWrapper
      option={option}
      height={height}
      visualTitle="Chart" isEmpty={data.length === 0} onChartReady={(chart) => {
        if (onBarClick) {
          chart.off('click');
          chart.on('click', (params: any) => {
            onBarClick({ name: labels[params.dataIndex], dataIndex: params.dataIndex });
          });
        }
      }}
    />
  );
}
