'use client';

/**
 * @fileoverview QC Feedback Time Bar Chart Component.
 * 
 * Displays QC feedback time (days to close) as vertical bar chart.
 * 
 * @module components/charts/QCFeedbackTimeBarChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface QCFeedbackTimeBarChartProps {
  data: Array<{ name: string; avgDays: number }>;
  height?: string | number;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QCFeedbackTimeBarChart({
  data,
  height = '300px',
  onBarClick,
  activeFilters = [],
}: QCFeedbackTimeBarChartProps) {
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
  const values = data.map((d) => d.avgDays);

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
                  <span>Days to Close:</span>
                  <span style="font-weight:bold">${val.toFixed(1)}</span>
                </div>`;
      },
    },
    grid: { left: 60, right: 60, top: 20, bottom: 80, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 10,
        rotate: labels.length > 6 ? 45 : 0,
        interval: 0,
      },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'Days to Close QC Request',
      nameLocation: 'middle',
      nameGap: 50,
      axisLine: { show: false },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
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
        barWidth: '60%',
        label: {
          show: true,
          position: 'top',
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
