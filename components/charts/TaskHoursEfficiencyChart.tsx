'use client';

/**
 * @fileoverview Task Hours Efficiency Chart Component.
 * 
 * Displays task-level efficiency as horizontal bar chart:
 * - Actual hours worked (solid bar)
 * - Estimated remaining (stacked on top)
 * - Color-coded by efficiency
 * - Vertical scroll for many tasks
 * - Generous spacing between rows
 * 
 * @module components/charts/TaskHoursEfficiencyChart
 */

import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { TaskHoursEfficiency } from '@/types/data';

interface TaskHoursEfficiencyChartProps {
  data: TaskHoursEfficiency;
  height?: string | number;
  onBarClick?: (params: { name: string; dataIndex: number }) => void;
  activeFilters?: string[];
}

// Row height for each task bar (including padding)
const ROW_HEIGHT = 50;
const MIN_CHART_HEIGHT = 300;

export default function TaskHoursEfficiencyChart({
  data,
  height = '100%',
  onBarClick,
  activeFilters = [],
}: TaskHoursEfficiencyChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [mounted, setMounted] = useState(false);
  const isFiltered = activeFilters.length > 0;
  
  // Validate and prepare data
  const validData = useMemo(() => {
    const tasks = data?.tasks || [];
    const actualWorked = data?.actualWorked || [];
    const estimatedAdded = data?.estimatedAdded || [];
    const efficiency = data?.efficiency || [];
    
    // Filter to only include tasks with valid data
    const validIndices: number[] = [];
    tasks.forEach((task, idx) => {
      if (task && (actualWorked[idx] > 0 || estimatedAdded[idx] > 0)) {
        validIndices.push(idx);
      }
    });
    
    return {
      tasks: validIndices.map(idx => tasks[idx]),
      actualWorked: validIndices.map(idx => actualWorked[idx] || 0),
      estimatedAdded: validIndices.map(idx => estimatedAdded[idx] || 0),
      efficiency: validIndices.map(idx => efficiency[idx] || 0),
    };
  }, [data]);
  
  const taskCount = validData.tasks?.length || 0;
  
  // Calculate chart height based on number of tasks
  const calculatedHeight = useMemo(() => {
    if (taskCount === 0) return MIN_CHART_HEIGHT;
    return Math.max(MIN_CHART_HEIGHT, taskCount * ROW_HEIGHT + 100); // +100 for legend/padding
  }, [taskCount]);
  
  // Build ECharts option
  const option: EChartsOption = useMemo(() => {
    if (taskCount === 0) return {};
    
    return {
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 500,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(20, 20, 20, 0.96)',
        borderColor: 'rgba(64, 224, 208, 0.3)',
        borderWidth: 1,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const idx = params[0]?.dataIndex;
          if (idx == null || !validData.tasks[idx]) return '';
          
          const rawEff = validData.efficiency[idx] || 0;
          const actual = validData.actualWorked[idx] || 0;
          const estimated = validData.estimatedAdded[idx] || 0;
          const total = actual + estimated;
          
          let html = `<div style="padding:4px 0;">
            <div style="font-weight:bold;margin-bottom:8px;font-size:13px;color:#40E0D0;border-bottom:1px solid rgba(64,224,208,0.3);padding-bottom:6px;">${validData.tasks[idx]}</div>
            <div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:4px;">
              <span style="color:rgba(255,255,255,0.7);">Efficiency:</span>
              <span style="font-weight:bold;color:${rawEff >= 100 ? '#10B981' : rawEff >= 80 ? '#F59E0B' : '#EF4444'}">${rawEff}%</span>
            </div>`;
          
          params.forEach((p: any) => {
            if (!p || p.value == null) return;
            const val = typeof p.value === 'number' ? p.value.toLocaleString() : p.value;
            html += `<div style="display:flex;justify-content:space-between;gap:20px;margin:4px 0;">
              <span style="display:flex;align-items:center;gap:6px;">${p.marker || ''} ${p.seriesName || ''}</span>
              <span style="font-weight:bold;">${val} hrs</span>
            </div>`;
          });
          
          html += `<div style="display:flex;justify-content:space-between;gap:20px;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);">
            <span style="color:rgba(255,255,255,0.7);">Total Budget:</span>
            <span style="font-weight:bold;">${total.toLocaleString()} hrs</span>
          </div></div>`;
          
          return html;
        },
        extraCssText: 'box-shadow: 0 6px 24px rgba(0,0,0,0.5); border-radius: 10px; padding: 12px 14px;'
      },
      legend: {
        bottom: 10,
        textStyle: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
        itemWidth: 14,
        itemHeight: 14,
        itemGap: 24,
      },
      grid: { 
        left: 220,
        right: 90,
        top: 20, 
        bottom: 50,
        containLabel: false
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { 
          color: 'rgba(255,255,255,0.6)', 
          fontSize: 10,
          formatter: (value: number) => value >= 1000 ? `${(value/1000).toFixed(1)}k` : value.toString()
        },
        splitLine: { 
          lineStyle: { 
            color: 'rgba(255,255,255,0.06)', 
            type: 'dashed' 
          } 
        },
      },
      yAxis: {
        type: 'category',
        data: validData.tasks,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
        axisLabel: {
          color: 'rgba(255,255,255,0.85)',
          fontSize: 11,
          fontWeight: 500,
          width: 200,
          overflow: 'truncate',
          margin: 16,
        },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          name: 'Actual Worked',
          type: 'bar',
          stack: 'total',
          data: validData.actualWorked.map((v, i) => ({
            value: v,
            itemStyle: {
              color: isFiltered && !activeFilters.includes(validData.tasks[i])
                ? 'rgba(64, 224, 208, 0.25)'
                : '#40E0D0',
              borderColor: activeFilters.includes(validData.tasks[i]) ? '#fff' : 'transparent',
              borderWidth: activeFilters.includes(validData.tasks[i]) ? 2 : 0,
              borderRadius: [0, 0, 0, 0],
            },
          })),
          barWidth: 24,
          barGap: '100%',
          barCategoryGap: '60%',
          label: { show: false },
          emphasis: { 
            itemStyle: { 
              color: '#5EEEE0',
              shadowBlur: 10,
              shadowColor: 'rgba(64, 224, 208, 0.4)'
            } 
          },
        },
        {
          name: 'Remaining Budget',
          type: 'bar',
          stack: 'total',
          data: validData.estimatedAdded.map((v, i) => ({
            value: v,
            itemStyle: {
              color: isFiltered && !activeFilters.includes(validData.tasks[i])
                ? 'rgba(16, 185, 129, 0.25)'
                : '#10B981',
              borderColor: activeFilters.includes(validData.tasks[i]) ? '#fff' : 'transparent',
              borderWidth: activeFilters.includes(validData.tasks[i]) ? 2 : 0,
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barWidth: 24,
          barGap: '100%',
          barCategoryGap: '60%',
          label: {
            show: true,
            position: 'right',
            distance: 12,
            formatter: (params: any) => {
              const rawEff = validData.efficiency[params.dataIndex] || 0;
              const color = rawEff >= 100 ? '#10B981' : rawEff >= 80 ? '#F59E0B' : '#EF4444';
              return `{eff|${rawEff}%}`;
            },
            rich: {
              eff: {
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                padding: [3, 8],
                backgroundColor: 'rgba(0,0,0,0.4)',
                borderRadius: 4,
              }
            }
          },
          emphasis: { 
            itemStyle: { 
              color: '#34D399',
              shadowBlur: 10,
              shadowColor: 'rgba(16, 185, 129, 0.4)'
            } 
          },
        },
      ],
    };
  }, [validData, isFiltered, activeFilters, taskCount]);

  // Initialize mounted state
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Initialize and manage chart
  useEffect(() => {
    if (!mounted || !chartRef.current || taskCount === 0) return;

    // Initialize chart
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, undefined, {
        renderer: 'canvas',
      });
    }

    // Set options
    chartInstance.current.setOption(option, { notMerge: true });

    // Add click handler
    if (onBarClick) {
      chartInstance.current.off('click');
      chartInstance.current.on('click', (params: any) => {
        const taskName = validData.tasks[params.dataIndex];
        if (taskName) {
          onBarClick({ name: taskName, dataIndex: params.dataIndex });
        }
      });
    }

    return () => {
      chartInstance.current?.off('click');
    };
  }, [mounted, option, onBarClick, validData.tasks, taskCount]);

  // Handle resize
  useEffect(() => {
    if (!mounted || !chartRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      chartInstance.current?.resize();
    });

    resizeObserver.observe(chartRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [mounted]);

  // Cleanup
  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  // Empty state
  if (taskCount === 0) {
    return (
      <div style={{ 
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(26, 26, 26, 0.5)',
        borderRadius: '8px',
        border: '1px dashed rgba(255,255,255,0.1)',
        minHeight: '200px'
      }}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="18" rx="1"></rect>
          <rect x="14" y="8" width="7" height="13" rx="1"></rect>
        </svg>
        <div style={{ marginTop: '16px', color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: 500 }}>
          No Task Efficiency Data
        </div>
        <div style={{ marginTop: '8px', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
          Task hours data will appear here when available
        </div>
      </div>
    );
  }

  // Determine if we need scrolling
  const containerHeight = typeof height === 'number' ? height : parseInt(height) || 400;
  const needsScroll = calculatedHeight > containerHeight;

  return (
    <div style={{ 
      width: '100%', 
      height: typeof height === 'number' ? `${height}px` : height,
      overflow: needsScroll ? 'auto' : 'hidden',
      position: 'relative'
    }}>
      <div 
        ref={chartRef} 
        style={{ 
          width: '100%', 
          height: `${calculatedHeight}px`,
          minHeight: `${MIN_CHART_HEIGHT}px`
        }} 
      />
    </div>
  );
}
