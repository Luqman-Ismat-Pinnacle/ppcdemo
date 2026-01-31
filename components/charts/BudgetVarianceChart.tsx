'use client';

/**
 * @fileoverview Budget Variance Waterfall Chart Component.
 * 
 * Displays budget variance as a waterfall chart showing:
 * - Starting budget baseline
 * - Increases (scope changes, additions)
 * - Decreases (efficiencies, cuts)
 * - Ending current budget
 * 
 * @module components/charts/BudgetVarianceChart
 */

import React from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { BudgetVarianceItem } from '@/types/data';

interface BudgetVarianceChartProps {
  data: BudgetVarianceItem[];
  height?: string | number;
  onBarClick?: (params: { name: string; value: number; dataIndex: number }) => void;
  activeFilters?: string[];
  enableExport?: boolean;
  enableFullscreen?: boolean;
}

export default function BudgetVarianceChart({
  data,
  height = '300px',
  onBarClick,
  activeFilters = [],
  enableExport = true,
  enableFullscreen = true,
}: BudgetVarianceChartProps) {
  const categories = data.map((item) => item.name);
  const values = data.map((item) => item.value);

  // Calculate cumulative values for waterfall
  const cumulativeValues: number[] = [];
  let current = 0;
  data.forEach((item) => {
    if (item.type === 'start') {
      current = item.value;
      cumulativeValues.push(current);
    } else if (item.type === 'end') {
      cumulativeValues.push(item.value);
    } else {
      current += item.value;
      cumulativeValues.push(current);
    }
  });

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const param = params[0];
        const value = param?.value;
        const name = param?.name || '';
        const dataIdx = param?.dataIndex;
        const cumulativeVal = cumulativeValues[dataIdx];
        
        if (value == null) return `<div style="font-weight:bold">${name}</div>`;
        
        const itemData = data[dataIdx];
        const isTotal = itemData?.type === 'start' || itemData?.type === 'end';
        
        return `<div style="font-weight:bold;margin-bottom:6px">${name}</div>
                <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px">
                  <span>${isTotal ? 'Value:' : 'Change:'}</span>
                  <span style="font-weight:bold;color:${param?.color || 'inherit'}">${value > 0 && !isTotal ? '+' : ''}${value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                </div>
                ${!isTotal ? `<div style="display:flex;justify-content:space-between;gap:16px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.1)">
                  <span>Running Total:</span>
                  <span style="font-weight:bold">${cumulativeVal?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</span>
                </div>` : ''}`;
      },
    },
    grid: { left: 50, right: 30, top: 15, bottom: 55, containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 11, rotate: 45 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: 'var(--border-color)' } },
      axisLabel: {
        color: 'var(--text-secondary)',
        fontSize: 11,
        formatter: (value: number) => `$${(value / 1000).toFixed(0)}k`,
      },
      splitLine: { lineStyle: { color: 'var(--border-color)', opacity: 0.3 } },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 48,
        barMinHeight: 4,
        roundCap: true,
        emphasis: {
          focus: 'self',
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)', borderColor: '#fff', borderWidth: 1 },
        },
        data: values.map((val, idx) => {
          const name = categories[idx];
          const isFiltered = activeFilters.length > 0 && !activeFilters.includes(name);
          const baseColor =
            data[idx].type === 'start' || data[idx].type === 'end'
              ? '#40E0D0'
              : val > 0
                ? '#CDDC39'
                : '#E91E63';
          return {
            value: val,
            itemStyle: {
              color: baseColor,
              opacity: isFiltered ? 0.35 : 1,
              borderColor: activeFilters.includes(name) ? '#fff' : 'transparent',
              borderWidth: activeFilters.includes(name) ? 2 : 0,
            },
          };
        }),
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => {
            const val = params.value;
            if (val == null) return '';
            const item = data[params.dataIndex];
            if (item?.type === 'start' || item?.type === 'end') {
              return `$${(val / 1000).toFixed(0)}k`;
            }
            return (val > 0 ? '+' : '') + `$${(val / 1000).toFixed(0)}k`;
          },
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
        },
      },
    ],
  };

  return (
    <ChartWrapper
      option={option}
      height={height}
      enableExport={enableExport}
      enableFullscreen={enableFullscreen}
      enableCompare={true}
      visualId="budget-variance"
      exportFilename="budget-variance"
      onClick={
        onBarClick
          ? (params) => {
              const idx = params.dataIndex ?? 0;
              const name = params.name ?? categories[idx];
              const val = params.value ?? values[idx];
              onBarClick({ name: String(name), value: Number(val), dataIndex: idx });
            }
          : undefined
      }
    />
  );
}

