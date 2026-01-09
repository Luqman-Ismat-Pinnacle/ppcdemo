'use client';

/**
 * @fileoverview Hours Waterfall Chart Component.
 * 
 * Displays task hours as a stacked waterfall/bar chart showing:
 * - Actual hours worked
 * - Estimated remaining hours
 * - Efficiency metrics per task
 * 
 * Features interactive tooltips, filtering by efficiency status,
 * and sorting options.
 * 
 * @module components/charts/HoursWaterfallChart
 */

import React, { useState, useMemo } from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import { useData } from '@/lib/data-context';

interface HoursWaterfallChartProps {
  data?: {
    tasks?: string[];
    actualWorked?: number[];
    estimatedAdded?: number[];
  };
  height?: string | number;
}

type ViewType = 'By Task' | 'By Phase' | 'By Time';

/**
 * Check if data has valid content for rendering
 */
function hasValidData(data?: HoursWaterfallChartProps['data']): boolean {
  if (!data) return false;
  if (!data.tasks || !Array.isArray(data.tasks) || data.tasks.length === 0) return false;
  if (!data.actualWorked || !Array.isArray(data.actualWorked) || data.actualWorked.length === 0) return false;
  if (!data.estimatedAdded || !Array.isArray(data.estimatedAdded) || data.estimatedAdded.length === 0) return false;
  
  // Check if there's any actual data
  const hasActual = data.actualWorked.some(v => typeof v === 'number' && v > 0);
  const hasEstimated = data.estimatedAdded.some(v => typeof v === 'number' && v > 0);
  
  return hasActual || hasEstimated;
}

export default function HoursWaterfallChart({ data, height = '300px' }: HoursWaterfallChartProps) {
  const { filteredData } = useData();
  const [viewType, setViewType] = useState<ViewType>('By Task');
  
  // Parse height for container
  const containerHeight = typeof height === 'number' ? `${height}px` : height;
  // Calculate chart height (subtract control bar height)
  const chartHeightNum = typeof height === 'number' ? height - 60 : parseInt(height) - 60;
  const chartHeight = `${Math.max(chartHeightNum, 200)}px`;
  
  // Check for valid data
  const isValidData = useMemo(() => hasValidData(data), [data]);
  
  // Show empty state if no valid data
  if (!isValidData) {
    return (
      <div style={{ 
        width: '100%',
        height: containerHeight,
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(26, 26, 26, 0.5)',
        borderRadius: '8px',
        border: '1px dashed rgba(255,255,255,0.1)',
        minHeight: '300px'
      }}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
          <rect x="4" y="14" width="4" height="6" rx="1"></rect>
          <rect x="10" y="8" width="4" height="12" rx="1"></rect>
          <rect x="16" y="4" width="4" height="16" rx="1"></rect>
        </svg>
        <div style={{ marginTop: '16px', color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: 500 }}>
          No Hours Data Available
        </div>
        <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          Upload data via Data Management
        </div>
      </div>
    );
  }
  
  // Safe data access with defaults
  const safeTasks = data?.tasks || [];
  const safeActualWorked = data?.actualWorked || [];
  const safeEstimatedAdded = data?.estimatedAdded || [];
  // Process data based on view type
  const processedData = useMemo(() => {
    if (viewType === 'By Task') {
      return {
        labels: ['Initial Estimate', ...safeTasks, 'Total Actual'],
        actualWorked: safeActualWorked,
        estimatedAdded: safeEstimatedAdded,
      };
    } else if (viewType === 'By Phase') {
      // Group tasks by phase
      const phaseMap = new Map<string, { actual: number; estimated: number; tasks: string[] }>();
      
      filteredData.tasks.forEach((task, idx) => {
        if (idx < safeTasks.length) {
          const phase = filteredData.phases.find(p => p.phaseId === task.phaseId);
          const phaseName = phase?.name || 'Unknown Phase';
          
          if (!phaseMap.has(phaseName)) {
            phaseMap.set(phaseName, { actual: 0, estimated: 0, tasks: [] });
          }
          
          const phaseData = phaseMap.get(phaseName)!;
          phaseData.actual += safeActualWorked[idx] || 0;
          phaseData.estimated += safeEstimatedAdded[idx] || 0;
          phaseData.tasks.push(safeTasks[idx]);
        }
      });
      
      const phaseNames = Array.from(phaseMap.keys());
      const phaseActual = phaseNames.map(name => phaseMap.get(name)!.actual);
      const phaseEstimated = phaseNames.map(name => phaseMap.get(name)!.estimated);
      
      return {
        labels: ['Initial Estimate', ...phaseNames, 'Total Actual'],
        actualWorked: phaseActual,
        estimatedAdded: phaseEstimated,
      };
    } else {
      // By Time - group by time periods (weeks/months from hours entries)
      // Get unique dates from hours entries and group by week
      const dateGroups = new Map<string, string[]>();
      filteredData.hours.forEach(entry => {
        const date = new Date(entry.date);
        const weekKey = `${date.getFullYear()}-W${Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 0).getDate()) / 7)}`;
        
        if (!dateGroups.has(weekKey)) {
          dateGroups.set(weekKey, []);
        }
        dateGroups.get(weekKey)!.push(entry.date);
      });
      
      // For simplicity, use task data distributed over time periods
      const timePeriods = Array.from(dateGroups.keys()).sort();
      const hoursPerPeriod = safeActualWorked.reduce((a, b) => a + b, 0) / Math.max(timePeriods.length, 1);
      const estimatedPerPeriod = safeEstimatedAdded.reduce((a, b) => a + b, 0) / Math.max(timePeriods.length, 1);
      
      return {
        labels: ['Initial Estimate', ...timePeriods, 'Total Actual'],
        actualWorked: timePeriods.map(() => hoursPerPeriod),
        estimatedAdded: timePeriods.map(() => estimatedPerPeriod),
      };
    }
  }, [viewType, safeTasks, safeActualWorked, safeEstimatedAdded, filteredData]);

  const { labels, actualWorked, estimatedAdded } = processedData;
  
  // Calculate variance
  const variances = actualWorked.map((_, i) => actualWorked[i] - estimatedAdded[i]);
  const totalPlanned = estimatedAdded.reduce((a, b) => a + b, 0);
  const totalActual = actualWorked.reduce((a, b) => a + b, 0);

  const xAxisData = labels;
  
  const help = [];
  const positive = [];
  const negative = [];
  
  let currentBase = totalPlanned;
  
  help.push(0);
  positive.push(totalPlanned);
  negative.push('-');

  variances.forEach((v) => {
    if (v >= 0) {
      positive.push(v);
      negative.push('-');
      help.push(currentBase);
      currentBase += v;
    } else {
      positive.push('-');
      negative.push(Math.abs(v));
      currentBase += v;
      help.push(currentBase);
    }
  });

  help.push(0);
  positive.push(totalActual);
  negative.push('-');

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    title: {
      text: 'Hours Variance Waterfall',
      textStyle: { color: 'var(--text-secondary)', fontSize: 12 },
      left: 'center',
      top: 0
    },
    graphic: [
      {
        type: 'group',
        right: 10,
        top: 10,
        children: [
          {
            type: 'rect',
            shape: { width: 0, height: 0 },
            style: { fill: 'transparent' }
          }
        ]
      }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function (params: any) {
        if (!params || params.length < 2) return '';
        let tar;
        if (params[1]?.value !== '-' && params[1]?.value != null) {
          tar = params[1];
        } else if (params[2]?.value !== '-' && params[2]?.value != null) {
          tar = params[2];
        }
        if (!tar || tar.value === '-' || tar.value == null) return '';
        return `<div style="font-weight:bold;margin-bottom:4px">${tar.name || ''}</div>
                <div style="display:flex;justify-content:space-between;gap:20px">
                  <span>${tar.seriesName === 'Placeholder' ? 'Base' : (tar.seriesName || '')}:</span>
                  <span style="font-weight:bold">${typeof tar.value === 'number' ? tar.value.toLocaleString() : tar.value} hrs</span>
                </div>`;
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: xAxisData,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        color: 'var(--text-secondary)'
      },
      axisLine: { lineStyle: { color: 'var(--border-color)' } }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      axisLabel: { color: 'var(--text-secondary)', fontSize: 10 }
    },
    series: [
      {
        name: 'Placeholder',
        type: 'bar',
        stack: 'Total',
        itemStyle: {
          borderColor: 'transparent',
          color: 'transparent'
        },
        emphasis: {
          itemStyle: {
            borderColor: 'transparent',
            color: 'transparent'
          }
        },
        data: help as any
      },
      {
        name: 'Increase',
        type: 'bar',
        stack: 'Total',
        itemStyle: { color: '#ef4444' },
        data: positive.map((v, i) => i === 0 || i === positive.length - 1 ? { value: v, itemStyle: { color: '#40E0D0' } } : v) as any
      },
      {
        name: 'Decrease',
        type: 'bar',
        stack: 'Total',
        itemStyle: { color: '#10b981' },
        data: negative as any
      }
    ]
  };

  // Calculate totals for stats display
  const totalVariance = totalActual - totalPlanned;
  const variancePercent = totalPlanned > 0 ? ((totalVariance / totalPlanned) * 100).toFixed(1) : '0';
  
  return (
    <div style={{ width: '100%', height: containerHeight }}>
      {/* Control Bar - matches ResourceHeatmap pattern */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '8px 12px',
        background: 'var(--bg-tertiary)',
        borderRadius: '8px',
        marginBottom: '8px',
        border: '1px solid rgba(64, 224, 208, 0.1)'
      }}>
        {/* Summary Stats */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Planned</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#40E0D0' }}>{totalPlanned.toLocaleString()} hrs</div>
          </div>
          <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actual</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#CDDC39' }}>{totalActual.toLocaleString()} hrs</div>
          </div>
          <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Variance</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: totalVariance > 0 ? '#ef4444' : '#10b981' }}>
              {totalVariance > 0 ? '+' : ''}{totalVariance.toLocaleString()} hrs ({variancePercent}%)
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '4px' }}>
          {(['By Task', 'By Phase', 'By Time'] as ViewType[]).map((view) => (
            <button
              key={view}
              onClick={() => setViewType(view)}
              style={{
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 600,
                background: viewType === view ? 'var(--pinnacle-teal)' : 'transparent',
                color: viewType === view ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <ChartWrapper option={option} height={chartHeight} />
    </div>
  );
}

