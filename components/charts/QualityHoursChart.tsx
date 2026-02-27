'use client';

/**
 * Quality Hours by Charge Code – horizontal bar chart.
 * Shows hours aggregated by charge code from hours entries.
 */

import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { QualityHours } from '@/types/data';
import ChartWrapper from './ChartWrapper';

const ROW_HEIGHT = 40;
const MIN_HEIGHT = 300;
const COLORS = ['#40E0D0', '#CDDC39', '#FF9800', '#E91E63', '#8B5CF6', '#10B981', '#F59E0B', '#6366F1'];

interface QualityHoursChartProps {
  data: QualityHours;
  /** When qualityHours.tasks is empty, use these task names (e.g. from taskHoursEfficiency) so chart shows same rows with zero QC hours */
  taskOrder?: string[];
  height?: string | number;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

export default function QualityHoursChart({
  data,
  taskOrder,
  height = 440,
  onBarClick,
  activeFilters = [],
}: QualityHoursChartProps) {
  const isFiltered = activeFilters.length > 0;
  // Use qualityHours.tasks when present; otherwise same order as Task Hours Efficiency so chart shows same rows (zeros if no QC)
  const chargeCodes = (data.tasks?.length ? data.tasks : (taskOrder?.length ? taskOrder : [])) || [];
  const { sortedCodes, sortedHours } = useMemo(() => {
    if (!chargeCodes.length) return { sortedCodes: [] as string[], sortedHours: [] as number[] };
    const baseHours = chargeCodes.map((_, i) => {
      const raw = data.data?.[i];
      if (Array.isArray(raw)) {
        return (raw as number[]).reduce((a, b) => a + b, 0);
      }
      const v = (raw as number | undefined) ?? 0;
      return typeof v === 'number' ? v : 0;
    });

    // Sort from greatest to least so the most QC-heavy items appear at the top.
    const pairs = chargeCodes.map((code, idx) => ({ code, hours: baseHours[idx] || 0 }));
    pairs.sort((a, b) => b.hours - a.hours);

    return {
      sortedCodes: pairs.map((p) => p.code),
      sortedHours: pairs.map((p) => p.hours),
    };
  }, [data.data, chargeCodes]);

  const heightNum = typeof height === 'number' ? height : parseInt(String(height), 10) || 440;
  const chartHeight = Math.max(MIN_HEIGHT, heightNum, sortedCodes.length * ROW_HEIGHT + 90);

  const option: EChartsOption = useMemo(() => {
    if (sortedCodes.length === 0) return {};

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!params?.length) return '';
          const idx = params[0]?.dataIndex;
          const name = sortedCodes[idx];
          const hrs = sortedHours[idx] ?? 0;
          const total = sortedHours.reduce((a, b) => a + b, 0);
          const pct = total > 0 ? ((hrs / total) * 100).toFixed(1) : '0';
          return `<div style="font-weight:bold;margin-bottom:4px">${name}</div>
            <div>Hours: <strong>${hrs.toLocaleString()}</strong></div>
            <div>Share: <strong>${pct}%</strong></div>`;
        },
      },
      legend: { show: false },
      grid: { left: 120, right: 60, top: 16, bottom: 24, containLabel: true },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: 'rgba(255,255,255,0.6)',
          fontSize: 10,
          formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)),
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      },
      yAxis: {
        type: 'category',
        data: sortedCodes,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        axisLabel: {
          color: 'rgba(255,255,255,0.9)',
          fontSize: 11,
          width: 100,
          overflow: 'truncate',
          ellipsis: '…',
          margin: 12,
          interval: 0,
        },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          name: 'Hours',
          type: 'bar',
          barWidth: 24,
          barGap: '100%',
          barCategoryGap: '40%',
          data: sortedHours.map((val, i) => ({
            value: val,
            itemStyle: {
              color:
                isFiltered && !activeFilters.includes(sortedCodes[i])
                  ? 'rgba(64, 224, 208, 0.25)'
                  : COLORS[i % COLORS.length],
              borderRadius: [4, 4, 4, 4],
            },
          })),
          emphasis: { itemStyle: { shadowBlur: 8 } },
        },
      ],
    };
  }, [sortedCodes, sortedHours, isFiltered, activeFilters]);

  const handleClick = useMemo(() => {
    if (!onBarClick) return undefined;
    return (params: { dataIndex?: number }) => {
      const idx = params?.dataIndex;
      if (idx != null && sortedCodes[idx]) onBarClick({ name: sortedCodes[idx], dataIndex: idx });
    };
  }, [onBarClick, sortedCodes]);

  if (sortedCodes.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: 160,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(26,26,26,0.5)',
          borderRadius: 8,
          border: '1px dashed rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>No Quality Hours Data</div>
      </div>
    );
  }

  return (
    <ChartWrapper
      option={option}
      height={chartHeight as number}
      onClick={handleClick}
      enableCompare
      enableExport
      enableFullscreen
      visualId="quality-hours"
      visualTitle="Quality Hours by Charge Code"
      isEmpty={false}
    />
  );
}
