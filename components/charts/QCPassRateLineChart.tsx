'use client';

/**
 * @fileoverview QC Pass Rate Line Chart Component.
 * 
 * Displays QC pass rate over time as a line chart.
 * 
 * @module components/charts/QCPassRateLineChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface QCPassRateLineChartProps {
  data: Array<{ monthLabel: string; passRate: number }>;
  height?: string | number;
  onPointClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QCPassRateLineChart({
  data,
  height = '300px',
  onPointClick,
  activeFilters = [],
}: QCPassRateLineChartProps) {
  // Return empty chart if no data
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No data available
      </div>
    );
  }

  const labels = data.map((d) => d.monthLabel);
  const values = data.map((d) => d.passRate);

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const p = params[0];
        if (!p) return '';
        const val = p.value != null ? p.value : 0;
        return `<div style="font-weight:bold;margin-bottom:4px">${p.name || ''}</div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>Pass Rate:</span>
                  <span style="font-weight:bold">${val.toFixed(1)}%</span>
                </div>`;
      },
    },
    grid: { left: 60, right: 60, top: 20, bottom: 60, containLabel: true },
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
      name: 'Pass Rate (%)',
      nameLocation: 'middle',
      nameGap: 50,
      min: 0,
      max: 100,
      axisLine: { show: false },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 10, formatter: '{value}%' },
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    series: [
      {
        type: 'line',
        data: values,
        smooth: true,
        lineStyle: { color: '#40E0D0', width: 2 },
        itemStyle: { color: '#40E0D0' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(64, 224, 208, 0.3)' },
              { offset: 1, color: 'rgba(64, 224, 208, 0.05)' },
            ],
          },
        },
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => {
            const val = params.value != null ? params.value : 0;
            return val.toFixed(1) + '%';
          },
          color: '#fff',
          fontSize: 10,
        },
        emphasis: { focus: 'series' },
      },
    ],
  };

  return (
    <ChartWrapper
      option={option}
      height={height}
      visualTitle="Chart" isEmpty={data.length === 0} onChartReady={(chart) => {
        if (onPointClick) {
          chart.off('click');
          chart.on('click', (params: any) => {
            onPointClick({ name: labels[params.dataIndex], dataIndex: params.dataIndex });
          });
        }
      }}
    />
  );
}
