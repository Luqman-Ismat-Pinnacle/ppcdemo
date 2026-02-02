'use client';

/**
 * @fileoverview Resource Heatmap Chart - Clean Rewrite
 * 
 * Displays resource utilization as an interactive heatmap with:
 * - View: Assigned (utilization) vs Unassigned (available capacity)
 * - Display: By Employee or By Role
 * - Time Aggregation: Day, Week, Month, Quarter, Year
 * - Color scale: Low → Optimal → High → Overloaded
 * 
 * @module components/charts/ResourceHeatmapChart
 */

import React, { useMemo, useState, useCallback } from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { ResourceHeatmap, Employee } from '@/types/data';

// ============================================================================
// TYPES
// ============================================================================

type ViewType = 'assigned' | 'unassigned';
type DisplayMode = 'employee' | 'role';
type TimeAggregation = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface HeatmapChartProps {
  data?: ResourceHeatmap | null;
  employees?: Employee[];
  height?: string | number;
  showControls?: boolean;
}

interface ProcessedData {
  resources: string[];
  periods: string[];
  values: number[][];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  LOW: 'rgba(26,26,26,0.8)',       // < 50% - underutilized
  BUILDING: '#1A9B8F',              // 50-70% - building up  
  OPTIMAL: '#40E0D0',               // 70-90% - Pinnacle Teal
  HIGH: '#CDDC39',                  // 90-100% - Lime
  OVERLOAD: '#FF9800',              // 100-110% - Orange
  CRITICAL: '#E91E63',              // > 110% - Pink
} as const;

const COLOR_STOPS = [
  COLORS.LOW,
  COLORS.BUILDING,
  COLORS.OPTIMAL,
  COLORS.HIGH,
  COLORS.OVERLOAD,
  COLORS.CRITICAL,
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/** Parse date string to Date object */
function parseDate(dateStr: string): Date | null {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
  }
  // Try "Jan 6" format
  const currentYear = new Date().getFullYear();
  const d = new Date(`${dateStr}, ${currentYear}`);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/** Get period key for aggregation */
function getPeriodKey(date: Date, aggregation: TimeAggregation): string {
  switch (aggregation) {
    case 'day':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'week':
      // Get Monday of the week
      const monday = new Date(date);
      const day = date.getDay();
      monday.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
      return monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'month':
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    case 'quarter':
      const q = Math.ceil((date.getMonth() + 1) / 3);
      return `Q${q} '${date.getFullYear().toString().slice(-2)}`;
    case 'year':
      return date.getFullYear().toString();
  }
}

/** Aggregate values by averaging */
function aggregateValues(values: number[]): number {
  const nonZero = values.filter(v => v > 0);
  if (nonZero.length === 0) return 0;
  return Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length);
}

// ============================================================================
// DATA PROCESSING HOOKS
// ============================================================================

function useProcessedData(
  data: ResourceHeatmap | null | undefined,
  employees: Employee[],
  displayMode: DisplayMode,
  aggregation: TimeAggregation,
  viewType: ViewType
): ProcessedData {
  return useMemo(() => {
    // Default empty state
    const empty: ProcessedData = { resources: [], periods: [], values: [] };
    
    if (!data?.resources?.length || !data?.weeks?.length || !data?.data?.length) {
      return empty;
    }

    // Step 1: Parse weeks into period groups based on aggregation
    const weekDates = data.weeks.map(parseDate);
    const periodGroups = new Map<string, number[]>(); // periodKey -> weekIndices
    const periodOrder: string[] = [];

    if (aggregation === 'day') {
      // Expand each week to 7 days
      data.weeks.forEach((_, weekIdx) => {
        const date = weekDates[weekIdx];
        if (!date) return;
        for (let i = 0; i < 7; i++) {
          const dayDate = new Date(date);
          dayDate.setDate(date.getDate() + i);
          const key = getPeriodKey(dayDate, 'day');
          if (!periodGroups.has(key)) {
            periodGroups.set(key, []);
            periodOrder.push(key);
          }
          periodGroups.get(key)!.push(weekIdx);
        }
      });
    } else if (aggregation === 'week') {
      // Keep weekly data as-is
      data.weeks.forEach((week, idx) => {
        const date = weekDates[idx];
        const key = date ? getPeriodKey(date, 'week') : week;
        if (!periodGroups.has(key)) {
          periodGroups.set(key, []);
          periodOrder.push(key);
        }
        periodGroups.get(key)!.push(idx);
      });
    } else {
      // Aggregate to month/quarter/year
      data.weeks.forEach((_, idx) => {
        const date = weekDates[idx];
        if (!date) return;
        const key = getPeriodKey(date, aggregation);
        if (!periodGroups.has(key)) {
          periodGroups.set(key, []);
          periodOrder.push(key);
        }
        periodGroups.get(key)!.push(idx);
      });
    }

    if (periodOrder.length === 0) return empty;

    // Step 2: Build resource data based on display mode
    let resourceNames: string[];
    let resourceData: number[][];

    if (displayMode === 'role' && employees.length > 0) {
      // Group by role
      const roleGroups = new Map<string, number[]>(); // role -> resourceIndices
      
      data.resources.forEach((name, idx) => {
        const emp = employees.find(e => 
          e.name === name || e.name?.toLowerCase() === name?.toLowerCase()
        );
        const role = emp?.jobTitle || emp?.role || 'Unassigned';
        if (!roleGroups.has(role)) {
          roleGroups.set(role, []);
        }
        roleGroups.get(role)!.push(idx);
      });

      resourceNames = Array.from(roleGroups.keys()).sort();
      resourceData = resourceNames.map(role => {
        const indices = roleGroups.get(role)!;
        return periodOrder.map(period => {
          const weekIndices = periodGroups.get(period)!;
          const values: number[] = [];
          indices.forEach(resIdx => {
            weekIndices.forEach(weekIdx => {
              const val = data.data[resIdx]?.[weekIdx];
              if (typeof val === 'number' && val > 0) values.push(val);
            });
          });
          return aggregateValues(values);
        });
      });
    } else {
      // By employee - direct mapping
      resourceNames = [...data.resources];
      resourceData = data.data.map(row => {
        return periodOrder.map(period => {
          const weekIndices = periodGroups.get(period)!;
          const values = weekIndices.map(idx => row[idx] || 0);
          return aggregation === 'day' ? values[0] || 0 : aggregateValues(values);
        });
      });
    }

    // Step 3: Apply view type transformation
    if (viewType === 'unassigned') {
      // Filter to resources with < 80% avg utilization, show available capacity
      const filtered: { name: string; row: number[] }[] = [];
      
      resourceNames.forEach((name, idx) => {
        const row = resourceData[idx];
        const avg = aggregateValues(row);
        if (avg < 80) {
          filtered.push({
            name,
            row: row.map(v => Math.max(0, 100 - v))
          });
        }
      });

      if (filtered.length === 0) {
        return {
          resources: ['All resources fully allocated'],
          periods: periodOrder,
          values: [periodOrder.map(() => 0)]
        };
      }

      return {
        resources: filtered.map(f => f.name),
        periods: periodOrder,
        values: filtered.map(f => f.row)
      };
    }

    return {
      resources: resourceNames,
      periods: periodOrder,
      values: resourceData
    };
  }, [data, employees, displayMode, aggregation, viewType]);
}

// ============================================================================
// CHART OPTIONS
// ============================================================================

function buildChartOption(
  processed: ProcessedData,
  viewType: ViewType,
  zoomStart: number,
  zoomEnd: number
): EChartsOption {
  // Convert to ECharts heatmap format: [xIdx, yIdx, value]
  const heatmapData: number[][] = [];
  processed.values.forEach((row, yIdx) => {
    row.forEach((val, xIdx) => {
      heatmapData.push([xIdx, yIdx, val]);
    });
  });

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params: any) => {
        if (!params?.data) return '';
        const [xIdx, yIdx, value] = params.data;
        const resource = processed.resources[yIdx] || '';
        const period = processed.periods[xIdx] || '';
        
        const { status, color } = getStatus(value, viewType);
        const label = viewType === 'unassigned' ? 'Available' : 'Utilization';

        return `
          <div style="padding:8px 12px;min-width:180px;">
            <div style="font-weight:600;color:#40E0D0;border-bottom:1px solid rgba(64,224,208,0.3);padding-bottom:6px;margin-bottom:8px;">
              ${resource}
            </div>
            <div style="color:rgba(255,255,255,0.6);font-size:11px;margin-bottom:8px;">
              ${period}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:rgba(255,255,255,0.7)">${label}:</span>
              <span style="font-weight:700;font-size:16px;color:#fff">${value}%</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
              <span style="color:rgba(255,255,255,0.7)">Status:</span>
              <span style="font-weight:600;color:${color}">${status}</span>
            </div>
          </div>
        `;
      },
      backgroundColor: 'rgba(20,20,20,0.96)',
      borderColor: 'rgba(64,224,208,0.3)',
      borderWidth: 1,
      textStyle: { color: '#fff' },
      extraCssText: 'box-shadow:0 6px 24px rgba(0,0,0,0.5);border-radius:10px;'
    },
    grid: {
      left: 180,
      right: 30,
      top: 20,
      bottom: 60,
      containLabel: false
    },
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 10,
        start: zoomStart,
        end: zoomEnd,
        height: 20,
        fillerColor: 'rgba(64,224,208,0.2)',
        borderColor: 'rgba(64,224,208,0.3)',
        handleStyle: { color: '#40E0D0' }
      },
      {
        type: 'slider',
        yAxisIndex: 0,
        left: 5,
        width: 16,
        start: 0,
        end: processed.resources.length > 15 ? Math.round((15 / processed.resources.length) * 100) : 100,
        showDetail: false,
        fillerColor: 'rgba(64,224,208,0.2)',
        borderColor: 'rgba(64,224,208,0.3)',
        handleStyle: { color: '#40E0D0' }
      },
      { type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: false },
      { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: true }
    ],
    xAxis: {
      type: 'category',
      data: processed.periods,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 11,
        fontWeight: 500,
        rotate: 45,
        margin: 18,
        interval: 0
      },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'category',
      data: processed.resources,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11,
        fontWeight: 500,
        width: 160,
        overflow: 'truncate',
        margin: 8
      },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    visualMap: {
      show: false,
      min: 0,
      max: viewType === 'unassigned' ? 100 : 120,
      inRange: { color: COLOR_STOPS }
    },
    series: [{
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: true,
        formatter: (p: any) => p.data[2] === 0 ? '' : `${p.data[2]}%`,
        fontSize: 10,
        fontWeight: 600,
        color: '#fff',
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowBlur: 4
      },
      itemStyle: {
        borderColor: 'rgba(10,10,10,0.95)',
        borderWidth: 3,
        borderRadius: 4
      },
      emphasis: {
        itemStyle: {
          borderWidth: 2,
          borderColor: '#40E0D0',
          shadowBlur: 16,
          shadowColor: 'rgba(64,224,208,0.4)'
        }
      }
    }]
  };
}

function getStatus(value: number, viewType: ViewType): { status: string; color: string } {
  if (viewType === 'unassigned') {
    if (value > 50) return { status: 'High Availability', color: COLORS.HIGH };
    if (value > 20) return { status: 'Some Availability', color: COLORS.OPTIMAL };
    return { status: 'Fully Allocated', color: '#6B7280' };
  }
  
  if (value > 110) return { status: 'Overloaded', color: COLORS.CRITICAL };
  if (value > 100) return { status: 'At Capacity', color: COLORS.OVERLOAD };
  if (value >= 80) return { status: 'Optimal', color: COLORS.HIGH };
  if (value >= 50) return { status: 'Below Target', color: COLORS.OPTIMAL };
  return { status: 'Underutilized', color: COLORS.BUILDING };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ResourceHeatmapChart({
  data,
  employees = [],
  height = '100%',
  showControls = true,
}: HeatmapChartProps) {
  // State
  const [viewType, setViewType] = useState<ViewType>('assigned');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('employee');
  const [aggregation, setAggregation] = useState<TimeAggregation>('week');
  const [zoomRange, setZoomRange] = useState<{ start: number; end: number } | null>(null);

  // Process data
  const processed = useProcessedData(data, employees, displayMode, aggregation, viewType);

  // Calculate statistics
  const stats = useMemo(() => {
    const allValues = processed.values.flat().filter(v => v > 0);
    if (allValues.length === 0) return { avg: 0, overloaded: 0, underutilized: 0 };
    
    return {
      avg: Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length),
      overloaded: allValues.filter(v => v > 100).length,
      underutilized: allValues.filter(v => v < 50).length
    };
  }, [processed]);

  // Calculate default zoom based on period count
  const defaultZoom = useMemo(() => {
    const total = processed.periods.length;
    const visibleCount = 20;
    if (total <= visibleCount) return { start: 0, end: 100 };
    return { start: 0, end: Math.round((visibleCount / total) * 100) };
  }, [processed.periods.length]);

  const zoom = zoomRange || defaultZoom;

  // Build chart option
  const option = useMemo(() => 
    buildChartOption(processed, viewType, zoom.start, zoom.end),
    [processed, viewType, zoom]
  );

  // Reset zoom when aggregation changes
  const handleAggregationChange = useCallback((newAgg: TimeAggregation) => {
    setAggregation(newAgg);
    setZoomRange(null);
  }, []);

  // Empty state
  const isEmpty = processed.resources.length === 0 || processed.periods.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {/* Controls */}
      {showControls && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--bg-tertiary)',
          borderRadius: '10px',
          flexShrink: 0,
          border: '1px solid rgba(64,224,208,0.1)',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* View Toggle */}
          <ToggleGroup
            options={[
              { key: 'assigned', label: 'Assigned' },
              { key: 'unassigned', label: 'Unassigned' }
            ]}
            selected={viewType}
            onChange={(v) => setViewType(v as ViewType)}
          />

          {/* Color Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>0%</span>
            <div style={{
              width: '100px',
              height: '12px',
              borderRadius: '6px',
              background: `linear-gradient(to right, ${COLOR_STOPS.join(', ')})`,
              border: '1px solid rgba(255,255,255,0.1)'
            }} />
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>120%</span>
          </div>

          {/* Stats */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Avg</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#40E0D0' }}>{stats.avg}%</div>
          </div>

          {/* Time Aggregation */}
          <ToggleGroup
            options={[
              { key: 'day', label: 'Day' },
              { key: 'week', label: 'Week' },
              { key: 'month', label: 'Month' },
              { key: 'quarter', label: 'Qtr' },
              { key: 'year', label: 'Year' }
            ]}
            selected={aggregation}
            onChange={(v) => handleAggregationChange(v as TimeAggregation)}
          />

          {/* Display Mode */}
          <ToggleGroup
            options={[
              { key: 'employee', label: 'By Employee' },
              { key: 'role', label: 'By Role' }
            ]}
            selected={displayMode}
            onChange={(v) => setDisplayMode(v as DisplayMode)}
          />
        </div>
      )}

      {/* Chart or Empty State */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {isEmpty ? (
          <EmptyState 
            employees={employees}
            data={data}
            displayMode={displayMode}
          />
        ) : (
          <ChartWrapper
            option={option}
            height={height}
            enableCompare
            enableExport
            enableFullscreen
            visualId="resource-heatmap"
            visualTitle="Resource Heatmap"
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ToggleOption {
  key: string;
  label: string;
}

function ToggleGroup({
  options,
  selected,
  onChange
}: {
  options: ToggleOption[];
  selected: string;
  onChange: (key: string) => void;
}) {
  return (
    <div style={{
      display: 'flex',
      gap: '4px',
      background: 'var(--bg-secondary)',
      borderRadius: '8px',
      padding: '4px'
    }}>
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: 600,
            background: selected === key ? 'var(--pinnacle-teal)' : 'transparent',
            color: selected === key ? '#000' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({
  employees,
  data,
  displayMode
}: {
  employees: Employee[];
  data?: ResourceHeatmap | null;
  displayMode: DisplayMode;
}) {
  let message = 'No resource heatmap data available.';
  
  if (!employees?.length && (!data?.resources?.length)) {
    message = 'No employees found. Sync Workday data to load employees.';
  } else if (data?.resources?.length && !data?.weeks?.length) {
    message = 'No time periods available. Sync hours data or check the date range.';
  } else if (employees?.length && displayMode === 'role') {
    message = 'No employees match the current role filter. Try "By Employee" view.';
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: 280,
      padding: 24,
      background: 'var(--bg-tertiary)',
      borderRadius: 8,
      border: '1px solid var(--border-color)',
      color: 'var(--text-muted)',
      textAlign: 'center'
    }}>
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 16, opacity: 0.5 }}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <rect x="7" y="7" width="3" height="3" />
        <rect x="14" y="7" width="3" height="3" />
        <rect x="7" y="14" width="3" height="3" />
        <rect x="14" y="14" width="3" height="3" />
      </svg>
      <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
        No Heatmap Data
      </p>
      <p style={{ margin: '12px 0 0', fontSize: '0.85rem', opacity: 0.8, maxWidth: 400 }}>
        {message}
      </p>
    </div>
  );
}
