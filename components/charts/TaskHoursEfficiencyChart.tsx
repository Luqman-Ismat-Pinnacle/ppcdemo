'use client';

/**
 * Task Hours Efficiency Chart – horizontal stacked bar showing Completed vs Remaining.
 * Displays task-level baseline (actual + remaining) with efficiency %.
 */

import React, { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { TaskHoursEfficiency } from '@/types/data';
import ChartWrapper from './ChartWrapper';

interface TaskHoursEfficiencyChartProps {
  data: TaskHoursEfficiency;
  height?: string | number;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

const ROW_HEIGHT = 40;
const MIN_HEIGHT = 320;

export default function TaskHoursEfficiencyChart({
  data,
  onBarClick,
  activeFilters = [],
}: TaskHoursEfficiencyChartProps) {
  const isFiltered = activeFilters.length > 0;

  const { tasks, actualWorked, remainingHours, progressPercent, chartHeight } = useMemo(() => {
    const rawTasks = data?.tasks || [];
    const rawActual = data?.actualWorked || [];
    const rawEstimated = data?.estimatedAdded || [];

    const valid: { task: string; actual: number; remaining: number; progress: number }[] = [];
    rawTasks.forEach((task, i) => {
      const actual = rawActual[i] ?? 0;
      const remaining = rawEstimated[i] ?? 0;
      const baseline = actual + remaining;
      if (!task || baseline <= 0) return;
      const progress = baseline > 0 ? Math.round((actual / baseline) * 100) : 0;
      valid.push({ task, actual, remaining, progress });
    });

    const tasks = valid.map((v) => v.task);
    const actualWorked = valid.map((v) => v.actual);
    const remainingHours = valid.map((v) => v.remaining);
    const progressPercent = valid.map((v) => v.progress);
    const chartHeight = Math.max(MIN_HEIGHT, tasks.length * ROW_HEIGHT + 90);

    return { tasks, actualWorked, remainingHours, progressPercent, chartHeight };
  }, [data]);

  const option: EChartsOption = useMemo(() => {
    if (tasks.length === 0) return {};

    const completedColor = (idx: number) => {
      const p = progressPercent[idx] ?? 0;
      if (p >= 100) return '#10B981';
      if (p >= 75) return '#40E0D0';
      if (p >= 50) return '#F59E0B';
      return '#EF4444';
    };

    return {
      backgroundColor: 'transparent',
      animation: true,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          if (!params?.length) return '';
          const idx = params[0]?.dataIndex;
          if (idx == null) return '';
          const name = tasks[idx];
          const actual = actualWorked[idx] ?? 0;
          const remaining = remainingHours[idx] ?? 0;
          const total = actual + remaining;
          const pct = progressPercent[idx] ?? 0;
          return `<div style="font-weight:bold;margin-bottom:6px;color:#40E0D0">${name}</div>
            <div>Progress: <strong>${pct}%</strong></div>
            <div>Completed: <strong>${actual.toLocaleString()} hrs</strong></div>
            <div>Remaining: <strong>${remaining.toLocaleString()} hrs</strong></div>
            <div>Total: <strong>${total.toLocaleString()} hrs</strong></div>`;
        },
      },
      legend: {
        data: ['Completed', 'Remaining'],
        bottom: 8,
        textStyle: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
        itemWidth: 14,
        itemHeight: 14,
        itemGap: 20,
      },
      grid: {
        left: 260,
        right: 50,
        top: 16,
        bottom: 44,
        containLabel: false,
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: {
          color: 'rgba(255,255,255,0.6)',
          fontSize: 10,
          formatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)),
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: tasks,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
        axisLabel: {
          color: 'rgba(255,255,255,0.9)',
          fontSize: 12,
          width: 240,
          overflow: 'truncate',
          ellipsis: '…',
          margin: 14,
          interval: 0,
        },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          name: 'Completed',
          type: 'bar',
          stack: 'total',
          barWidth: 26,
          barGap: '100%',
          barCategoryGap: '45%',
          data: actualWorked.map((v, i) => ({
            value: v,
            itemStyle: {
              color:
                isFiltered && !activeFilters.includes(tasks[i])
                  ? 'rgba(64, 224, 208, 0.2)'
                  : completedColor(i),
              borderRadius: [6, 0, 0, 6],
            },
          })),
          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(64, 224, 208, 0.35)' } },
        },
        {
          name: 'Remaining',
          type: 'bar',
          stack: 'total',
          barWidth: 26,
          barGap: '100%',
          barCategoryGap: '45%',
          data: remainingHours.map((v, i) => ({
            value: v,
            itemStyle: {
              color: isFiltered && !activeFilters.includes(tasks[i]) ? 'rgba(100,100,100,0.15)' : 'rgba(100,100,100,0.35)',
              borderRadius: [0, 6, 6, 0],
            },
          })),
          emphasis: { itemStyle: { color: 'rgba(100,100,100,0.5)' } },
        },
      ],
    };
  }, [tasks, actualWorked, remainingHours, progressPercent, isFiltered, activeFilters]);

  const handleClick = useMemo(() => {
    if (!onBarClick) return undefined;
    return (params: { dataIndex?: number }) => {
      const idx = params?.dataIndex;
      if (idx != null && tasks[idx]) onBarClick({ name: tasks[idx], dataIndex: idx });
    };
  }, [onBarClick, tasks]);

  if (tasks.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          minHeight: 200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(26,26,26,0.5)',
          borderRadius: 8,
          border: '1px dashed rgba(255,255,255,0.1)',
        }}
      >
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 8 }}>
          No Task Efficiency Data
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
          Task hours data will appear here when available
        </div>
      </div>
    );
  }

  return (
    <ChartWrapper
      option={option}
      height={chartHeight}
      onClick={handleClick}
      enableCompare
      enableExport
      enableFullscreen
      visualId="task-hours-efficiency"
      visualTitle="Task Hours Efficiency"
      exportFilename="task-hours-efficiency"
      isEmpty={false}
    />
  );
}
