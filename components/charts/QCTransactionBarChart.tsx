'use client';

/**
 * @fileoverview QC Transaction Bar Chart Component.
 * 
 * Displays QC transaction volume by gate/phase as bar chart.
 * Gates include: Initial, Mid, Final, Post-Validation.
 * Useful for understanding QC workload distribution.
 * 
 * @module components/charts/QCTransactionBarChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { QCTransactionByGate } from '@/types/data';

interface QCTransactionBarChartProps {
  data: QCTransactionByGate[];
  height?: string | number;
  showLabels?: boolean;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QCTransactionBarChart({
  data,
  height = '200px',
  showLabels = true,
  onBarClick,
  activeFilters = [],
}: QCTransactionBarChartProps) {
  const isFiltered = activeFilters.length > 0;
  const labels = data.map((d) => d.gate || d.project);

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
                  <span>QC Records:</span>
                  <span style="font-weight:bold">${val}</span>
                </div>`;
      }
    },
    grid: { left: 110, right: 55, top: 20, bottom: 35, containLabel: false },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 10,
        width: 100,
        overflow: 'truncate',
      },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d, i) => ({
          value: d.count,
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
          formatter: '{c}',
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
      visualTitle="QC Transactions"
      isEmpty={data.length === 0}
      onChartReady={(chart) => {
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
