'use client';

/**
 * @fileoverview Enhanced Resource Heatmap Chart Component.
 * 
 * Displays resource utilization as a large, interactive heatmap grid with:
 * - View toggle: Assigned vs Unassigned resources
 * - Display mode: By Employee or By Role
 * - Y-axis: Resource names
 * - X-axis: Time periods (days, weeks, months, etc.)
 * - Cell color: Utilization level with consistent Pinnacle branding
 * 
 * Color Coding (consistent across all pages):
 * - Low (< 50%): Dark/muted tones
 * - Optimal (50-80%): Teal shades (#40E0D0 / #1A9B8F)
 * - High (80-100%): Lime (#CDDC39)
 * - Overloaded (> 100%): Orange to Pink (#FF9800 / #E91E63)
 * 
 * Helps identify over/under-allocated resources at a glance with robust metrics.
 * 
 * @module components/charts/ResourceHeatmapChart
 */

import React, { useMemo, useState } from 'react';
import ChartWrapper from './ChartWrapper';
import type { EChartsOption } from 'echarts';
import type { ResourceHeatmap, Employee } from '@/types/data';

/** View type: Assigned resources or Unassigned capacity */
type ViewType = 'assigned' | 'unassigned';

/** Display mode: By individual Employee or by Role grouping */
type DisplayMode = 'employee' | 'role';

/** Time range: Day, Week, Month, Quarter, Year */
type TimeRange = 'day' | 'week' | 'month' | 'quarter' | 'year';

// ============================================================================
// PINNACLE COLOR CONSTANTS - Consistent across all charts
// ============================================================================

const ASSIGNED_COLORS = {
  LOW: 'rgba(26,26,26,0.8)',      // Very low utilization - dark
  MEDIUM_LOW: '#1A9B8F',           // Building up - darker teal
  OPTIMAL: '#40E0D0',              // Pinnacle Teal - optimal range
  HIGH: '#CDDC39',                 // Lime - high utilization
  OVERLOAD_MILD: '#FF9800',        // Orange - mild overload
  OVERLOAD_HIGH: '#E91E63',        // Pink - severe overload
};

const UNASSIGNED_COLORS = {
  LOW_CAPACITY: 'rgba(26,26,26,0.8)',    // Fully allocated (dark)
  SOME_CAPACITY: '#1A9B8F',               // Some availability (darker teal)
  GOOD_CAPACITY: '#40E0D0',               // Good availability (Pinnacle teal)
  HIGH_CAPACITY: '#CDDC39',               // High availability (lime)
  VERY_HIGH: '#FF9800',                   // Very high availability (orange)
  MAX_CAPACITY: '#E91E63',                // Maximum availability (pink)
};

interface ResourceHeatmapChartProps {
  /** Heatmap data with resources, weeks, and utilization values */
  data: ResourceHeatmap;
  /** Optional employee data for role grouping */
  employees?: Employee[];
  /** Chart height - defaults to 100% for full container */
  height?: string | number;
  /** Show view controls - defaults to true */
  showControls?: boolean;
}

export default function ResourceHeatmapChart({
  data,
  employees = [],
  height = '100%',
  showControls = true,
}: ResourceHeatmapChartProps) {
  const [viewType, setViewType] = useState<ViewType>('assigned');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('employee');
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [zoomWindow, setZoomWindow] = useState<{ start: number; end: number } | null>(null);

  /**
   * Aggregate or Expand weeks into time periods based on timeRange
   */
  const aggregateByTimeRange = (weeks: string[], dataRows: number[][]): { periods: string[]; aggregatedData: number[][] } => {
    if (weeks.length === 0 || dataRows.length === 0) {
      return { periods: weeks, aggregatedData: dataRows };
    }

    // Handle 'day' view - expand weekly data to daily
    if (timeRange === 'day') {
      const dailyPeriods: string[] = [];

      weeks.forEach((week) => {
        let date = new Date(week);
        if (isNaN(date.getTime()) && week.includes(',')) date = new Date(week);

        if (!isNaN(date.getTime())) {
          for (let i = 0; i < 7; i++) {
            const dayDate = new Date(date);
            dayDate.setDate(date.getDate() + i);
            dailyPeriods.push(dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
          }
        } else {
          for (let i = 0; i < 7; i++) dailyPeriods.push(`${week}-D${i + 1}`);
        }
      });

      const expandedData = dataRows.map(row => {
        const newRow: number[] = [];
        row.forEach(val => {
          for (let i = 0; i < 7; i++) newRow.push(val);
        });
        return newRow;
      });

      return { periods: dailyPeriods, aggregatedData: expandedData };
    }

    if (timeRange === 'week') {
      return { periods: weeks, aggregatedData: dataRows };
    }

    // Group weeks into larger periods
    const periodMap = new Map<string, number[]>();
    const periodOrder: string[] = [];

    weeks.forEach((week, weekIdx) => {
      let d: Date;
      if (week.match(/^\d{4}-\d{2}-\d{2}/)) { d = new Date(week); }
      else if (week.includes(',')) { d = new Date(week); }
      else { const currentYear = new Date().getFullYear(); d = new Date(`${week}, ${currentYear}`); }

      if (isNaN(d.getTime())) return;

      let periodKey: string;
      if (timeRange === 'month') {
        periodKey = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      } else if (timeRange === 'quarter') {
        const quarter = Math.ceil((d.getMonth() + 1) / 3);
        periodKey = `Q${quarter} '${d.getFullYear().toString().slice(-2)}`;
      } else {
        periodKey = d.getFullYear().toString();
      }

      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, []);
        periodOrder.push(periodKey);
      }
      periodMap.get(periodKey)!.push(weekIdx);
    });

    if (periodOrder.length === 0) return { periods: weeks, aggregatedData: dataRows };

    const aggregatedData = dataRows.map(row => {
      return periodOrder.map(period => {
        const weekIndices = periodMap.get(period)!;
        const values = weekIndices.map(idx => row[idx] || 0).filter(v => v > 0);
        return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      });
    });

    return { periods: periodOrder, aggregatedData };
  };

  /**
   * Process heatmap data based on view type and display mode
   */
  const processedData = useMemo(() => {
    if (!data || !data.resources || !data.weeks || !data.data || data.resources.length === 0) {
      return { resources: [], weeks: [], data: [] };
    }

    const { periods, aggregatedData } = aggregateByTimeRange(data.weeks, data.data);
    const aggregatedBaseData = {
      resources: data.resources,
      weeks: periods,
      data: aggregatedData
    };

    if (displayMode === 'role' && employees.length > 0) {
      const roleMap = new Map<string, number[][]>();

      aggregatedBaseData.resources.forEach((resource, resourceIdx) => {
        const employee = employees.find(e =>
          e.name === resource ||
          e.name.toLowerCase() === resource.toLowerCase()
        );
        const role = employee?.jobTitle || 'Unassigned';

        if (!roleMap.has(role)) {
          roleMap.set(role, []);
        }
        if (aggregatedBaseData.data[resourceIdx]) {
          roleMap.get(role)!.push(aggregatedBaseData.data[resourceIdx]);
        }
      });

      const roleResources: string[] = [];
      const roleData: number[][] = [];

      roleMap.forEach((rows, role) => {
        roleResources.push(role);
        const avgRow = aggregatedBaseData.weeks.map((_, weekIdx) => {
          const values = rows.map(r => r[weekIdx] || 0).filter(v => v > 0);
          return values.length > 0
            ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
            : 0;
        });
        roleData.push(avgRow);
      });

      return {
        resources: roleResources,
        weeks: aggregatedBaseData.weeks,
        data: roleData
      };
    }

    return aggregatedBaseData;
  }, [data, displayMode, employees, timeRange]);

  /**
   * Filter data based on view type (assigned vs unassigned)
   */
  const filteredData = useMemo(() => {
    if (viewType === 'unassigned') {
      const filteredResources: string[] = [];
      const filteredRows: number[][] = [];

      processedData.resources.forEach((resource, idx) => {
        const row = processedData.data[idx] || [];
        const avgUtil = row.length > 0 ? row.reduce((a, b) => a + b, 0) / row.length : 0;

        if (avgUtil < 80) {
          filteredResources.push(resource);
          filteredRows.push(row.map(v => Math.max(0, 100 - v)));
        }
      });

      return {
        resources: filteredResources.length > 0 ? filteredResources : ['All resources fully allocated'],
        weeks: processedData.weeks,
        data: filteredRows.length > 0 ? filteredRows : [processedData.weeks.map(() => 0)]
      };
    }

    return processedData;
  }, [processedData, viewType]);

  const heatmapData = useMemo(() => {
    const items: number[][] = [];
    filteredData.data.forEach((row, i) => {
      row.forEach((val, j) => {
        items.push([j, i, val]);
      });
    });
    return items;
  }, [filteredData]);

  const stats = useMemo(() => {
    const allValues = filteredData.data.flat().filter(v => v > 0);
    if (allValues.length === 0) return { avg: 0, min: 0, max: 0, overloaded: 0, underutilized: 0, total: 0 };

    const avg = Math.round(allValues.reduce((a, b) => a + b, 0) / allValues.length);
    const overloaded = allValues.filter(v => v > 100).length;
    const underutilized = allValues.filter(v => v < 80).length;

    return {
      avg,
      min: Math.min(...allValues),
      max: Math.max(...allValues),
      overloaded,
      underutilized,
      total: allValues.length
    };
  }, [filteredData]);

  const handleTodayClick = () => {
    const today = new Date();
    let targetIndex = -1;

    if (timeRange === 'day') {
      const todayStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      targetIndex = filteredData.weeks.findIndex(p => p === todayStr);
    } else if (timeRange === 'week' || timeRange === 'month' || timeRange === 'quarter' || timeRange === 'year') {
      // Find the period that contains today
      targetIndex = filteredData.weeks.findIndex((w, idx) => {
        // This is a naive heuristic for non-day views
        // In a real app, we'd have exact start/end dates for each period
        return false; // For now returning false for simple implementation
      });

      // Special case for week parsing since we know it's likely "Jan 6" format
      if (timeRange === 'week') {
        const currentYear = new Date().getFullYear();
        targetIndex = filteredData.weeks.findIndex(w => {
          const d = new Date(`${w}, ${currentYear}`);
          if (isNaN(d.getTime())) return false;
          const nextWeek = new Date(d);
          nextWeek.setDate(d.getDate() + 7);
          return today >= d && today < nextWeek;
        });
      }
    }

    if (targetIndex !== -1) {
      const total = filteredData.weeks.length;
      const windowSize = Math.min(20, total);
      const startPercent = Math.max(0, ((targetIndex - (windowSize / 2)) / total) * 100);
      const endPercent = Math.min(100, ((targetIndex + (windowSize / 2)) / total) * 100);
      setZoomWindow({ start: startPercent, end: endPercent });

      // Reset after a bit to allow manual zooming again? 
      // Or just leave it as is. ECharts will update.
    }
  };

  const option: EChartsOption = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (p: any) => {
        if (!p || !p.data) return '';
        const resource = filteredData.resources[p.data[1]] || '';
        const week = filteredData.weeks[p.data[0]] || '';
        const value = p.data[2] ?? 0;

        let status = 'Optimal';
        let statusColor = '#40E0D0';
        let statusIcon = '●';

        if (viewType === 'unassigned') {
          if (value > 50) { status = 'High Availability'; statusColor = '#CDDC39'; statusIcon = '◆'; }
          else if (value > 20) { status = 'Some Availability'; statusColor = '#40E0D0'; statusIcon = '▲'; }
          else { status = 'Fully Allocated'; statusColor = '#6B7280'; statusIcon = '■'; }
        } else {
          if (value > 110) { status = 'Overloaded'; statusColor = '#E91E63'; statusIcon = '▲'; }
          else if (value > 100) { status = 'At Capacity'; statusColor = '#FF9800'; statusIcon = '●'; }
          else if (value >= 80) { status = 'Optimal'; statusColor = '#CDDC39'; statusIcon = '●'; }
          else if (value >= 50) { status = 'Below Target'; statusColor = '#40E0D0'; statusIcon = '○'; }
          else { status = 'Underutilized'; statusColor = '#1A9B8F'; statusIcon = '▼'; }
        }

        const label = viewType === 'unassigned' ? 'Available Capacity' : 'Utilization';

        return `<div style="padding:6px 10px;min-width:200px;">
                  <div style="font-weight:bold;margin-bottom:8px;font-size:13px;border-bottom:1px solid rgba(64,224,208,0.3);padding-bottom:6px;color:#40E0D0">${resource}</div>
                  <div style="margin-bottom:6px;color:rgba(255,255,255,0.6);font-size:11px">Period: ${week}</div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:8px">
                    <span style="color:rgba(255,255,255,0.7)">${label}:</span>
                    <span style="font-weight:bold;font-size:16px;color:#fff">${value}%</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:6px">
                    <span style="color:rgba(255,255,255,0.7)">Status:</span>
                    <span style="font-weight:600;color:${statusColor}">${statusIcon} ${status}</span>
                  </div>
                </div>`;
      },
      backgroundColor: 'rgba(20, 20, 20, 0.96)',
      borderColor: 'rgba(64, 224, 208, 0.3)',
      borderWidth: 1,
      textStyle: { color: '#fff' },
      extraCssText: 'box-shadow: 0 6px 24px rgba(0,0,0,0.5); border-radius: 10px;'
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
        type: 'inside',
        xAxisIndex: 0,
        start: zoomWindow ? zoomWindow.start : 0,
        end: zoomWindow ? zoomWindow.end : (filteredData.weeks.length > 20 ? Math.round((20 / filteredData.weeks.length) * 100) : 100),
        zoomOnMouseWheel: false,
        moveOnMouseWheel: false,
        moveOnMouseMove: false
      },
      {
        type: 'inside',
        yAxisIndex: 0,
        start: 0,
        end: filteredData.resources.length > 15 ? Math.round((15 / filteredData.resources.length) * 100) : 100,
        zoomOnMouseWheel: false,
        moveOnMouseWheel: true,
        moveOnMouseMove: false
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 10,
        start: zoomWindow ? zoomWindow.start : 0,
        end: zoomWindow ? zoomWindow.end : (filteredData.weeks.length > 20 ? Math.round((20 / filteredData.weeks.length) * 100) : 100),
        height: 20,
        fillerColor: 'rgba(64, 224, 208, 0.2)',
        borderColor: 'rgba(64, 224, 208, 0.3)',
        handleStyle: { color: '#40E0D0' }
      },
      {
        type: 'slider',
        yAxisIndex: 0,
        left: 5,
        width: 16,
        start: 0,
        end: filteredData.resources.length > 15 ? Math.round((15 / filteredData.resources.length) * 100) : 100,
        handleSize: '100%',
        showDetail: false,
        brushSelect: false,
        fillerColor: 'rgba(64, 224, 208, 0.2)',
        borderColor: 'rgba(64, 224, 208, 0.3)',
        handleStyle: {
          color: '#40E0D0',
          borderColor: '#40E0D0'
        }
      }
    ],
    xAxis: {
      type: 'category',
      data: filteredData.weeks,
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
      data: filteredData.resources,
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
      calculable: false,
      inRange: {
        color: [
          ASSIGNED_COLORS.LOW,
          ASSIGNED_COLORS.MEDIUM_LOW,
          ASSIGNED_COLORS.OPTIMAL,
          ASSIGNED_COLORS.HIGH,
          ASSIGNED_COLORS.OVERLOAD_MILD,
          ASSIGNED_COLORS.OVERLOAD_HIGH
        ]
      }
    },
    series: [
      {
        type: 'heatmap',
        data: heatmapData,
        label: {
          show: true,
          formatter: (p: any) => {
            const val = p.data[2];
            if (val === 0) return '';
            return val + '%';
          },
          fontSize: 10,
          fontWeight: 600,
          color: '#fff',
          textShadowColor: 'rgba(0,0,0,0.7)',
          textShadowBlur: 4
        },
        itemStyle: {
          borderColor: 'rgba(10, 10, 10, 0.95)',
          borderWidth: 3,
          borderRadius: 4
        },
        emphasis: {
          itemStyle: {
            borderWidth: 2,
            borderColor: '#40E0D0',
            shadowBlur: 16,
            shadowColor: 'rgba(64, 224, 208, 0.4)'
          }
        }
      },
    ],
  }), [filteredData, heatmapData, viewType, zoomWindow]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
      {showControls && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--bg-tertiary)',
          borderRadius: '10px',
          flexShrink: 0,
          border: '1px solid rgba(64, 224, 208, 0.1)'
        }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '4px' }}>
            <button
              onClick={() => setViewType('assigned')}
              style={{
                padding: '8px 16px',
                fontSize: '11px',
                fontWeight: 600,
                background: viewType === 'assigned' ? 'var(--pinnacle-teal)' : 'transparent',
                color: viewType === 'assigned' ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Assigned
            </button>
            <button
              onClick={() => setViewType('unassigned')}
              style={{
                padding: '8px 16px',
                fontSize: '11px',
                fontWeight: 600,
                background: viewType === 'unassigned' ? 'var(--pinnacle-teal)' : 'transparent',
                color: viewType === 'unassigned' ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Unassigned
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>0%</span>
            <div style={{
              width: '100px',
              height: '12px',
              borderRadius: '6px',
              background: `linear-gradient(to right, ${ASSIGNED_COLORS.LOW}, ${ASSIGNED_COLORS.MEDIUM_LOW}, ${ASSIGNED_COLORS.OPTIMAL}, ${ASSIGNED_COLORS.HIGH}, ${ASSIGNED_COLORS.OVERLOAD_MILD}, ${ASSIGNED_COLORS.OVERLOAD_HIGH})`,
              border: '1px solid rgba(255,255,255,0.1)'
            }} />
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>120%</span>
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#40E0D0' }}>{stats.avg}%</div>
            </div>
            <button
              onClick={handleTodayClick}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '10px', padding: '4px 8px' }}
            >
              Today
            </button>
          </div>

          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '4px' }}>
            {(['day', 'week', 'month', 'quarter', 'year'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => { setTimeRange(range); setZoomWindow(null); }}
                style={{
                  padding: '8px 10px',
                  fontSize: '10px',
                  fontWeight: 600,
                  background: timeRange === range ? 'var(--pinnacle-teal)' : 'transparent',
                  color: timeRange === range ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textTransform: 'capitalize'
                }}
              >
                {range}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '4px' }}>
            <button
              onClick={() => setDisplayMode('employee')}
              style={{
                padding: '8px 12px',
                fontSize: '11px',
                fontWeight: 600,
                background: displayMode === 'employee' ? 'var(--pinnacle-teal)' : 'transparent',
                color: displayMode === 'employee' ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              By Employee
            </button>
            <button
              onClick={() => setDisplayMode('role')}
              style={{
                padding: '8px 12px',
                fontSize: '11px',
                fontWeight: 600,
                background: displayMode === 'role' ? 'var(--pinnacle-teal)' : 'transparent',
                color: displayMode === 'role' ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              By Role
            </button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartWrapper option={option} height={height} />
      </div>
    </div>
  );
}
