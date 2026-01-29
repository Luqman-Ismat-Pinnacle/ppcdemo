'use client';

/**
 * @fileoverview QC Outcomes Stacked Bar Chart Component.
 * 
 * Displays QC pass and fail outcomes by month as stacked bars.
 * 
 * @module components/charts/QCOutcomesStackedChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';

interface QCOutcomesStackedChartProps {
  data: Array<{ monthLabel: string; pass: number; fail: number }>;
  height?: string | number;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QCOutcomesStackedChart({
  data,
  height = '300px',
  onBarClick,
  activeFilters = [],
}: QCOutcomesStackedChartProps) {
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
  const passValues = data.map((d) => d.pass);
  const failValues = data.map((d) => d.fail);

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const passParam = params.find((p: any) => p.seriesName === 'QC Pass');
        const failParam = params.find((p: any) => p.seriesName === 'QC Fail');
        const name = passParam?.name || failParam?.name || '';
        const pass = passParam?.value || 0;
        const fail = failParam?.value || 0;
        return `<div style="font-weight:bold;margin-bottom:4px">${name}</div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span style="color:#40E0D0">QC Pass:</span>
                  <span style="font-weight:bold">${pass}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span style="color:#10B981">QC Fail:</span>
                  <span style="font-weight:bold">${fail}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:20px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.1)">
                  <span>Total:</span>
                  <span style="font-weight:bold">${pass + fail}</span>
                </div>`;
      },
    },
    legend: {
      data: ['QC Pass', 'QC Fail'],
      top: 0,
      textStyle: { color: 'var(--text-secondary)', fontSize: 11 },
    },
    grid: { left: 60, right: 60, top: 40, bottom: 60, containLabel: true },
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
      name: 'QC Pass and QC Fail',
      nameLocation: 'middle',
      nameGap: 50,
      axisLine: { show: false },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 11 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    series: [
      {
        name: 'QC Pass',
        type: 'bar',
        stack: 'total',
        data: passValues.map((val, i) => ({
          value: val,
          itemStyle: {
            color: isFiltered && !activeFilters.includes(labels[i])
              ? 'rgba(64, 224, 208, 0.3)'
              : '#40E0D0',
            borderColor: activeFilters.includes(labels[i]) ? '#fff' : 'transparent',
            borderWidth: activeFilters.includes(labels[i]) ? 2 : 0,
          },
        })),
        barWidth: '60%',
        emphasis: { itemStyle: { opacity: 0.85 } },
      },
      {
        name: 'QC Fail',
        type: 'bar',
        stack: 'total',
        data: failValues.map((val, i) => ({
          value: val,
          itemStyle: {
            color: isFiltered && !activeFilters.includes(labels[i])
              ? 'rgba(16, 185, 129, 0.3)'
              : '#10B981',
            borderColor: activeFilters.includes(labels[i]) ? '#fff' : 'transparent',
            borderWidth: activeFilters.includes(labels[i]) ? 2 : 0,
          },
        })),
        barWidth: '60%',
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
