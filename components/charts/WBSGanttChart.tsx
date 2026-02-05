'use client';

/**
 * @fileoverview WBS Gantt Chart Component (ECharts-based)
 * 
 * High-performance ECharts Gantt chart for WBS visualization.
 * Features:
 * - Custom bar rendering with progress fill
 * - Predecessor arrows (Bezier curves)
 * - Milestone diamonds
 * - Critical path highlighting
 * - Horizontal and vertical zoom/scroll
 * - Today line marker
 * - Hierarchical expand/collapse
 * 
 * @module components/charts/WBSGanttChart
 */

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import ChartWrapper from './ChartWrapper';

// ============================================================================
// TYPES
// ============================================================================

export interface WBSGanttItem {
  id: string;
  name: string;
  wbsCode?: string;
  level: number;
  startDate: string | null;
  endDate: string | null;
  percentComplete: number;
  isCritical: boolean;
  isMilestone: boolean;
  hasChildren: boolean;
  isExpanded?: boolean;
  predecessors?: { taskId: string; relationship: string }[];
  taskEfficiency?: number;
  totalFloat?: number;
  itemType?: string;
}

interface WBSGanttChartProps {
  /** Flattened WBS items (already filtered by expand state) */
  items: WBSGanttItem[];
  /** Chart height */
  height?: string | number;
  /** Callback when item is clicked (for expand/collapse) */
  onItemClick?: (itemId: string) => void;
  /** Current scroll position (for sync with table) */
  scrollTop?: number;
  /** Callback when chart scrolls */
  onScroll?: (scrollTop: number) => void;
  /** Row height for sync with table */
  rowHeight?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  PROGRESS_0_25: '#ef4444',   // Red
  PROGRESS_25_50: '#f97316',  // Orange
  PROGRESS_50_75: '#eab308',  // Yellow
  PROGRESS_75_100: '#22c55e', // Green
  CRITICAL: '#ef4444',        // Red for critical path
  MILESTONE: '#ef4444',       // Red for milestones
  ARROW_NORMAL: '#40E0D0',    // Teal
  ARROW_CRITICAL: '#ef4444',  // Red
  TODAY: '#ef4444',           // Red
};

// ============================================================================
// UTILITIES
// ============================================================================

function getProgressColor(percent: number): string {
  if (percent >= 75) return COLORS.PROGRESS_75_100;
  if (percent >= 50) return COLORS.PROGRESS_50_75;
  if (percent >= 25) return COLORS.PROGRESS_25_50;
  return COLORS.PROGRESS_0_25;
}

// ============================================================================
// CHART BUILDING
// ============================================================================

function buildChartOption(
  items: WBSGanttItem[],
  rowHeight: number
): EChartsOption {
  if (items.length === 0) {
    return { series: [] };
  }

  // Calculate date range
  const allDates = items
    .flatMap(item => [item.startDate, item.endDate])
    .filter((d): d is string => !!d)
    .map(d => new Date(d).getTime())
    .filter(d => !isNaN(d));

  if (allDates.length === 0) {
    return { series: [] };
  }

  const minTime = Math.min(...allDates);
  const maxTime = Math.max(...allDates);
  const padding = (maxTime - minTime) * 0.05;
  const today = new Date().getTime();

  // Build ID to index map for predecessor lookup
  const idToIndex = new Map(items.map((item, idx) => [item.id, idx]));

  // Prepare bar series data
  const barData = items.map((item, index) => ({
    name: item.name,
    value: [
      index,                                                    // 0: y-axis category index
      item.startDate ? new Date(item.startDate).getTime() : minTime,  // 1: start time
      item.endDate ? new Date(item.endDate).getTime() : maxTime,      // 2: end time
      item.percentComplete || 0,                                // 3: progress
      item.isCritical ? 1 : 0,                                  // 4: critical flag
      item.isMilestone ? 1 : 0,                                 // 5: milestone flag
      item.hasChildren ? 1 : 0,                                 // 6: has children
      item.level,                                               // 7: hierarchy level
      item.id,                                                  // 8: item ID
      item.taskEfficiency || 0,                                 // 9: efficiency
      item.totalFloat ?? 0,                                     // 10: total float
    ],
    itemStyle: { 
      color: item.isCritical ? COLORS.CRITICAL : getProgressColor(item.percentComplete || 0) 
    }
  }));

  // Prepare predecessor arrow data
  const arrowData: any[] = [];
  items.forEach((item, targetIdx) => {
    if (!item.predecessors || item.predecessors.length === 0) return;
    
    item.predecessors.forEach(pred => {
      const sourceIdx = idToIndex.get(pred.taskId);
      if (sourceIdx === undefined) return;
      
      const sourceItem = items[sourceIdx];
      if (!sourceItem.endDate || !item.startDate) return;
      
      arrowData.push({
        value: [
          sourceIdx,                                              // 0: source row index
          targetIdx,                                              // 1: target row index
          new Date(sourceItem.endDate).getTime(),                 // 2: source end time
          new Date(item.startDate).getTime(),                     // 3: target start time
          item.isCritical && sourceItem.isCritical ? 1 : 0,       // 4: critical path
        ]
      });
    });
  });

  // Custom bar renderer
  const renderBar = (params: any, api: any): any => {
    const categoryIndex = api.value(0);
    const start = api.coord([api.value(1), categoryIndex]);
    const end = api.coord([api.value(2), categoryIndex]);
    const progress = api.value(3);
    const isCritical = api.value(4) === 1;
    const isMilestone = api.value(5) === 1;
    const hasChildren = api.value(6) === 1;
    const level = api.value(7);

    const barHeight = hasChildren ? 22 : 18;
    const barWidth = Math.max(end[0] - start[0], 4);

    // Clip to visible area
    const rectShape = echarts.graphic.clipRectByRect(
      { x: start[0], y: start[1] - barHeight / 2, width: barWidth, height: barHeight },
      { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
    );

    if (!rectShape) return undefined;

    const color = isCritical ? COLORS.CRITICAL : getProgressColor(progress);
    const children: any[] = [];

    if (isMilestone) {
      // Milestone: Diamond shape
      const diamondSize = 14;
      const cx = end[0];
      const cy = start[1];
      
      children.push({
        type: 'path',
        shape: {
          d: `M ${cx} ${cy - diamondSize/2} L ${cx + diamondSize/2} ${cy} L ${cx} ${cy + diamondSize/2} L ${cx - diamondSize/2} ${cy} Z`
        },
        style: {
          fill: COLORS.MILESTONE,
          stroke: '#fff',
          lineWidth: 1.5
        },
        z2: 15
      });
      
      // Vertical dashed line for milestone
      children.push({
        type: 'line',
        shape: {
          x1: cx,
          y1: cy - barHeight,
          x2: cx,
          y2: params.coordSys.y
        },
        style: {
          stroke: COLORS.MILESTONE,
          lineWidth: 1,
          lineDash: [4, 4]
        },
        z2: 5
      });
    } else {
      // Regular bar: Background + Progress fill
      
      // Background bar (planned duration)
      children.push({
        type: 'rect',
        shape: { ...rectShape, r: 3 },
        style: {
          fill: color,
          opacity: 0.25,
          stroke: isCritical ? COLORS.CRITICAL : 'rgba(255,255,255,0.15)',
          lineWidth: isCritical ? 2 : 1
        }
      });

      // Progress fill
      if (progress > 0) {
        const progressWidth = barWidth * (progress / 100);
        const progressRect = echarts.graphic.clipRectByRect(
          { x: start[0], y: start[1] - barHeight / 2, width: progressWidth, height: barHeight },
          { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
        );

        if (progressRect) {
          children.push({
            type: 'rect',
            shape: { ...progressRect, r: 3 },
            style: { fill: color, opacity: 1 }
          });
        }
      }

      // Progress text on bar (if wide enough)
      if (barWidth > 50) {
        children.push({
          type: 'text',
          style: {
            text: `${progress}%`,
            x: start[0] + 8,
            y: start[1],
            fill: '#fff',
            fontSize: 10,
            fontWeight: 600,
            align: 'left',
            verticalAlign: 'middle',
            textShadowColor: 'rgba(0,0,0,0.5)',
            textShadowBlur: 2
          }
        });
      }
    }

    return { type: 'group', children };
  };

  // Custom arrow renderer (Bezier curves)
  const renderArrow = (params: any, api: any): any => {
    const sourceIdx = api.value(0);
    const targetIdx = api.value(1);
    const sourceEndTime = api.value(2);
    const targetStartTime = api.value(3);
    const isCritical = api.value(4) === 1;

    const sourceCoord = api.coord([sourceEndTime, sourceIdx]);
    const targetCoord = api.coord([targetStartTime, targetIdx]);

    const x1 = sourceCoord[0];
    const y1 = sourceCoord[1];
    const x2 = targetCoord[0];
    const y2 = targetCoord[1];

    // Control point offset for Bezier curve
    const cpOffset = Math.max(Math.abs(x2 - x1) * 0.4, 20);
    const color = isCritical ? COLORS.ARROW_CRITICAL : COLORS.ARROW_NORMAL;

    return {
      type: 'group',
      children: [
        // Bezier curve
        {
          type: 'bezierCurve',
          shape: {
            x1, y1,
            x2, y2,
            cpX1: x1 + cpOffset,
            cpY1: y1,
            cpX2: x2 - cpOffset,
            cpY2: y2
          },
          style: {
            stroke: color,
            lineWidth: isCritical ? 2 : 1.5,
            fill: 'none',
            opacity: 0.6,
            lineDash: isCritical ? undefined : [4, 4]
          }
        },
        // Arrow head
        {
          type: 'polygon',
          shape: {
            points: [
              [x2, y2],
              [x2 - 8, y2 - 4],
              [x2 - 8, y2 + 4]
            ]
          },
          style: {
            fill: color,
            opacity: 0.8
          }
        }
      ]
    };
  };

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (!params?.value || params.seriesName === 'Arrows') return '';
        
        const index = params.value[0];
        const item = items[index];
        if (!item) return '';

        const progress = item.percentComplete || 0;
        const progressColor = getProgressColor(progress);

        return `
          <div style="padding:8px 12px;">
            <div style="font-weight:600;color:#40E0D0;margin-bottom:8px;border-bottom:1px solid rgba(64,224,208,0.3);padding-bottom:6px;display:flex;align-items:center;gap:8px;">
              <span style="font-size:14px;">${item.name}</span>
              ${item.isMilestone ? '<span style="background:#ef4444;color:white;font-size:9px;padding:2px 6px;border-radius:10px;font-weight:bold;">MILESTONE</span>' : ''}
            </div>
            ${item.wbsCode ? `<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:8px;">${item.wbsCode}</div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);">Start</div>
                <div style="font-weight:600;color:#fff;">${item.startDate || 'N/A'}</div>
              </div>
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);">End</div>
                <div style="font-weight:600;color:#fff;">${item.endDate || 'N/A'}</div>
              </div>
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);">Progress</div>
                <div style="font-weight:600;color:${progressColor};">${progress}%</div>
              </div>
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);">Float</div>
                <div style="font-weight:600;color:#fff;">${item.totalFloat ?? '-'} days</div>
              </div>
            </div>
            ${item.taskEfficiency ? `
              <div style="margin-top:8px;">
                <span style="color:rgba(255,255,255,0.5);font-size:10px;">Efficiency:</span>
                <span style="color:#fff;font-weight:600;margin-left:4px;">${Math.round(item.taskEfficiency)}%</span>
              </div>
            ` : ''}
            ${item.isCritical ? `
              <div style="margin-top:8px;color:#ef4444;font-weight:600;font-size:11px;">
                ⚠️ Critical Path
              </div>
            ` : ''}
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
      left: 20,
      right: 30,
      top: 50,
      bottom: 50,
      containLabel: false
    },
    dataZoom: [
      // Horizontal slider at bottom
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 10,
        height: 20,
        fillerColor: 'rgba(64,224,208,0.2)',
        borderColor: 'rgba(64,224,208,0.3)',
        handleStyle: { color: '#40E0D0' },
        textStyle: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
        brushSelect: false
      },
      // Horizontal inside zoom (Ctrl + scroll)
      {
        type: 'inside',
        xAxisIndex: 0,
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      },
      // Vertical slider on left
      {
        type: 'slider',
        yAxisIndex: 0,
        left: 0,
        width: 16,
        start: 0,
        end: items.length > 30 ? Math.round((30 / items.length) * 100) : 100,
        showDetail: false,
        fillerColor: 'rgba(64,224,208,0.2)',
        borderColor: 'rgba(64,224,208,0.3)',
        handleStyle: { color: '#40E0D0' },
        brushSelect: false
      },
      // Vertical inside zoom (Shift + scroll)
      {
        type: 'inside',
        yAxisIndex: 0,
        zoomOnMouseWheel: 'shift',
        moveOnMouseMove: false
      }
    ],
    xAxis: {
      type: 'time',
      position: 'top',
      min: minTime - padding,
      max: maxTime + padding,
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { 
        color: 'rgba(255,255,255,0.7)', 
        fontSize: 10,
        formatter: (value: number) => {
          const date = new Date(value);
          return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
        }
      }
    },
    yAxis: {
      type: 'category',
      data: items.map(item => item.id),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: false  // Labels handled by external table
      }
    },
    series: [
      // Gantt bars
      {
        name: 'Gantt',
        type: 'custom',
        renderItem: renderBar,
        encode: { x: [1, 2], y: 0 },
        data: barData,
        clip: true,
        z: 10
      },
      // Predecessor arrows
      {
        name: 'Arrows',
        type: 'custom',
        renderItem: renderArrow,
        data: arrowData,
        clip: true,
        z: 5
      },
      // Today line
      {
        name: 'Today',
        type: 'line',
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          data: [{
            xAxis: today,
            lineStyle: { color: COLORS.TODAY, width: 2, type: 'solid' },
            label: {
              formatter: 'Today',
              position: 'start',
              color: COLORS.TODAY,
              fontSize: 10,
              fontWeight: 'bold'
            }
          }]
        }
      }
    ]
  };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function WBSGanttChart({
  items,
  height = 600,
  onItemClick,
  scrollTop,
  onScroll,
  rowHeight = 30
}: WBSGanttChartProps) {
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Build chart option
  const option = useMemo(() => 
    buildChartOption(items, rowHeight),
    [items, rowHeight]
  );

  // Handle chart click for expand/collapse
  const handleChartClick = useCallback((params: any) => {
    if (params?.value && onItemClick) {
      const itemId = params.value[8];
      if (itemId) {
        onItemClick(itemId);
      }
    }
  }, [onItemClick]);

  // Empty state
  if (items.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: typeof height === 'number' ? height : 400,
        padding: 24,
        background: 'var(--bg-tertiary)',
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        color: 'var(--text-muted)',
        textAlign: 'center'
      }}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6, marginBottom: 16 }}>
          <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
        <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>No data available</p>
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', opacity: 0.9 }}>
          Load project data to see the Gantt chart.
        </p>
      </div>
    );
  }

  return (
    <ChartWrapper
      option={option}
      height={height}
      onClick={handleChartClick}
      enableExport
      enableFullscreen
      visualId="wbs-gantt-echarts"
      visualTitle="WBS Gantt"
    />
  );
}
