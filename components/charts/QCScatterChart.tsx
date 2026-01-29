'use client';

/**
 * @fileoverview QC Scatter Chart Component.
 * 
 * Displays QC auditor performance as a scatter plot where:
 * - X-axis: Hours spent on QC
 * - Y-axis: Pass rate percentage
 * - Bubble size: Number of records reviewed
 * 
 * Useful for identifying high-performing auditors and
 * detecting outliers in QC productivity.
 * 
 * @module components/charts/QCScatterChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { QCByNameAndRole } from '@/types/data';

interface QCScatterChartProps {
  data: QCByNameAndRole[];
  labelField?: 'name' | 'role';
  height?: string | number;
  onPointClick?: (params: { name: string }) => void;
  activeFilters?: string[];
}

export default function QCScatterChart({
  data,
  labelField = 'name',
  height = '300px',
  onPointClick,
  activeFilters = [],
}: QCScatterChartProps) {
  const roles = [...new Set(data.map((d) => d.role || 'Other'))];
  const colors = ['#40E0D0', '#CDDC39', '#FF9800', '#E91E63', '#3B82F6', '#8B5CF6'];
  const isFiltered = activeFilters.length > 0;

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        if (!p || !p.data) return '';
        const d = p.data;
        return `<div style="font-weight:bold;margin-bottom:4px">${d[3] || ''}</div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>Records:</span>
                  <span style="font-weight:bold">${d[0] ?? 0}</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>Pass Rate:</span>
                  <span style="font-weight:bold">${d[1] ?? 0}%</span>
                </div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>QC Hours:</span>
                  <span style="font-weight:bold">${d[2] ?? 0} hrs</span>
                </div>`;
      }
    },
    legend: {
      type: 'scroll',
      top: 0,
      textStyle: { color: 'var(--text-secondary)', fontSize: 9 },
      itemWidth: 8,
      itemHeight: 8,
    },
    grid: { left: 50, right: 20, top: 50, bottom: 40 },
    xAxis: {
      type: 'value',
      name: 'Total Records',
      nameLocation: 'middle',
      nameGap: 25,
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 10 },
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 10 },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    yAxis: {
      type: 'value',
      name: 'Pass Rate',
      min: 0,
      max: 100,
      nameTextStyle: { color: 'var(--text-secondary)', fontSize: 10 },
      axisLine: { show: false },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 10,
        formatter: '{value}%',
      },
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
    },
    series: roles.map((role, i) => ({
      name: role,
      type: 'scatter',
      data: data
        .filter((d) => (d.role || 'Other') === role)
        .map((d) => {
          const name = d[labelField] || d.name;
          return {
            value: [d.records, d.passRate, d.hours || 10, name],
            itemStyle: {
              color:
                isFiltered &&
                !activeFilters.includes(name) &&
                !activeFilters.includes(role)
                  ? colors[i % colors.length] + '4D'
                  : colors[i % colors.length],
              borderColor:
                activeFilters.includes(name) || activeFilters.includes(role)
                  ? '#fff'
                  : 'transparent',
              borderWidth:
                activeFilters.includes(name) || activeFilters.includes(role) ? 2 : 0,
            },
          };
        }),
      symbolSize: (d: any) => Math.sqrt(d[2]) * 3,
      label: {
        show: true,
        position: 'top',
        formatter: (p: any) => p.data[3],
        fontSize: 8,
        color: 'var(--text-secondary)',
      },
    })),
  };

  return (
    <ChartWrapper
      option={option}
      height={height}
      visualTitle="Chart" isEmpty={data.length === 0} onChartReady={(chart) => {
        if (onPointClick) {
          chart.off('click');
          chart.on('click', (params: any) => {
            onPointClick({ name: params.data[3] || params.seriesName });
          });
        }
      }}
    />
  );
}

