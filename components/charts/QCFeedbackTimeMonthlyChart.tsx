'use client';

/**
 * @fileoverview QC Feedback Time Monthly Bar Chart Component.
 * 
 * Displays QC feedback time (takt time) by month as vertical bar chart.
 * 
 * @module components/charts/QCFeedbackTimeMonthlyChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface QCFeedbackTimeMonthlyChartProps {
  data: Array<{ monthLabel: string; avgDays: number }>;
  title?: string;
  height?: string | number;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QCFeedbackTimeMonthlyChart({
  data,
  title = 'QC Feedback Time',
  height = '300px',
  onBarClick,
  activeFilters = [],
}: QCFeedbackTimeMonthlyChartProps) {
  // Return empty chart if no data
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No data available
      </div>
    );
  }

  const isFiltered = activeFilters.length > 0;
  const labels = data.map((d) => d.monthLabel);
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
                  <span>QC Takt time per transaction:</span>
                  <span style="font-weight:bold">${val.toFixed(2)}</span>
                </div>`;
      },
    },
    grid: { left: 60, right: 60, top: 20, bottom: 60, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      name: 'Month',
      nameLocation: 'middle',
      nameGap: 30,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 10,
        rotate: labels.length > 6 ? 45 : 0,
        interval: 0,
      },
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      name: 'QC Takt time per transaction',
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
            return val.toFixed(2);
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
      enableCompare
      visualId="qc-feedback-time-monthly"
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
