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
}

export default function BudgetVarianceChart({ data, height = '300px' }: BudgetVarianceChartProps) {
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
    tooltip: {
      trigger: 'axis',
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
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
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
        data: values.map((val, idx) => ({
          value: val,
          itemStyle: {
            color:
              data[idx].type === 'start' || data[idx].type === 'end'
                ? '#40E0D0'
                : val > 0
                  ? '#CDDC39'
                  : '#E91E63',
          },
        })),
        // Numbers removed from bars - now shown in tooltip only
        label: {
          show: false,
        },
      },
    ],
  };

  return <ChartWrapper option={option} height={height} />;
}

