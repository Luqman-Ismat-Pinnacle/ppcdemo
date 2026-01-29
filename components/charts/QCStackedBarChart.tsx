'use client';

/**
 * @fileoverview QC Stacked Bar Chart Component.
 * 
 * Displays QC transaction status by project as stacked bars:
 * - Pass (green)
 * - Fail (red)
 * - Unprocessed (gray)
 * 
 * Supports interactive clicking for filtering and
 * highlighting of selected projects.
 * 
 * @module components/charts/QCStackedBarChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { QCTransactionByProject } from '@/types/data';

interface QCStackedBarChartProps {
  data: QCTransactionByProject[];
  height?: string | number;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QCStackedBarChart({
  data,
  height = '300px',
  onBarClick,
  activeFilters = [],
}: QCStackedBarChartProps) {
  const labels = data.map((d) => d.projectId);
  const isFiltered = activeFilters.length > 0;

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        let res = `<div style="font-weight:bold;margin-bottom:4px;">${params[0]?.name || ''}</div>`;
        let total = 0;
        params.forEach((p: any) => {
          if (!p || p.value == null) return;
          const val = typeof p.value === 'number' ? p.value : 0;
          total += val;
          res += `<div style="display:flex;justify-content:space-between;gap:20px;">
            <span>${p.marker || ''} ${p.seriesName || ''}</span>
            <span style="font-weight:bold">${val}</span>
          </div>`;
        });
        res += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;font-weight:bold;">
          <span>Total</span>
          <span>${total}</span>
        </div>`;
        return res;
      }
    },
    legend: {
      top: 0,
      textStyle: { color: 'var(--text-secondary)', fontSize: 9 },
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 8,
    },
    grid: { left: 90, right: 15, top: 30, bottom: 20, containLabel: false },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 9 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 9,
        width: 85,
        overflow: 'truncate',
      },
      axisTick: { show: false },
    },
    series: [
      {
        name: 'Unprocessed',
        type: 'bar',
        stack: 'total',
        data: data.map((d, i) => ({
          value: d.unprocessed,
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
          show: true,
          position: 'inside',
          fontSize: 8,
          color: '#000',
          formatter: (p: any) => (p.value > 0 ? p.value : ''),
        },
      },
      {
        name: 'QC Pass',
        type: 'bar',
        stack: 'total',
        data: data.map((d, i) => ({
          value: d.pass,
          itemStyle: {
            color:
              isFiltered && !activeFilters.includes(labels[i])
                ? 'rgba(16, 185, 129, 0.3)'
                : '#10B981',
            borderColor: activeFilters.includes(labels[i]) ? '#fff' : 'transparent',
            borderWidth: activeFilters.includes(labels[i]) ? 2 : 0,
          },
        })),
        barWidth: 20,
        barGap: '25%',
        label: {
          show: true,
          position: 'inside',
          fontSize: 8,
          color: '#fff',
          formatter: (p: any) => (p.value > 0 ? p.value : ''),
        },
      },
      {
        name: 'QC Fail',
        type: 'bar',
        stack: 'total',
        data: data.map((d, i) => ({
          value: d.fail,
          itemStyle: {
            color:
              isFiltered && !activeFilters.includes(labels[i])
                ? 'rgba(205, 220, 57, 0.3)'
                : '#CDDC39',
            borderColor: activeFilters.includes(labels[i]) ? '#fff' : 'transparent',
            borderWidth: activeFilters.includes(labels[i]) ? 2 : 0,
          },
        })),
        barWidth: 20,
        barGap: '25%',
        label: {
          show: true,
          position: 'inside',
          fontSize: 8,
          color: '#000',
          formatter: (p: any) => (p.value > 0 ? p.value : ''),
        },
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

