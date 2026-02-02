'use client';

/**
 * @fileoverview Resource Gantt Chart Component
 * 
 * ECharts-based Gantt chart showing resource assignments over time.
 * Displays hierarchical view: Employee → Tasks with utilization coloring.
 * 
 * Features:
 * - Hierarchical expand/collapse (Employee → Tasks)
 * - Task bars with progress and utilization coloring
 * - Time axis with zoom/pan
 * - Tooltips showing dates, hours, utilization
 * - Today line marker
 * 
 * @module components/charts/ResourceGanttChart
 */

import React, { useMemo, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import ChartWrapper from './ChartWrapper';
import type { Employee, Task } from '@/types/data';

// ============================================================================
// TYPES
// ============================================================================

interface ResourceGanttProps {
  /** Tasks with assignments */
  tasks: Task[];
  /** Employee data */
  employees: Employee[];
  /** Chart height */
  height?: string | number;
  /** Show controls */
  showControls?: boolean;
}

interface GanttItem {
  id: string;
  name: string;
  type: 'employee' | 'task';
  level: number;
  startDate: string | null;
  endDate: string | null;
  percentComplete: number;
  baselineHours: number;
  actualHours: number;
  utilization: number;
  isCritical?: boolean;
  parentId?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = {
  UNDER: '#1A9B8F',        // < 50% - Underutilized
  OPTIMAL: '#40E0D0',      // 50-80% - Pinnacle Teal
  HIGH: '#CDDC39',         // 80-100% - Lime
  OVER: '#FF9800',         // > 100% - Orange
  CRITICAL: '#ef4444',     // Critical path
};

// ============================================================================
// DATA PROCESSING
// ============================================================================

function buildGanttItems(
  tasks: Task[],
  employees: Employee[],
  expandedEmployees: Set<string>
): GanttItem[] {
  const items: GanttItem[] = [];
  
  // Build employee -> tasks map
  const tasksByEmployee = new Map<string, Task[]>();
  const employeeMap = new Map<string, Employee>();
  
  employees.forEach(emp => {
    const id = emp.id || emp.employeeId;
    if (id) {
      employeeMap.set(id, emp);
      tasksByEmployee.set(id, []);
    }
  });
  
  // Group tasks by assigned resource
  tasks.forEach(task => {
    const resourceId = task.assignedResourceId || task.employeeId || (task as any).assigned_resource_id;
    if (resourceId && tasksByEmployee.has(resourceId)) {
      tasksByEmployee.get(resourceId)!.push(task);
    }
  });
  
  // Build hierarchical items
  employees.forEach(emp => {
    const empId = emp.id || emp.employeeId;
    if (!empId) return;
    
    const empTasks = tasksByEmployee.get(empId) || [];
    if (empTasks.length === 0) return; // Skip employees with no tasks
    
    // Calculate employee-level aggregates
    const totalBaseline = empTasks.reduce((sum, t) => sum + (t.baselineHours || 0), 0);
    const totalActual = empTasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
    const utilization = totalBaseline > 0 ? Math.round((totalActual / totalBaseline) * 100) : 0;
    
    // Get date range across all tasks
    const dates = empTasks
      .flatMap(t => [t.startDate, t.endDate, t.baselineStartDate, t.baselineEndDate])
      .filter((d): d is string => !!d)
      .map(d => new Date(d).getTime())
      .filter(d => !isNaN(d));
    
    const minDate = dates.length > 0 ? new Date(Math.min(...dates)).toISOString().split('T')[0] : null;
    const maxDate = dates.length > 0 ? new Date(Math.max(...dates)).toISOString().split('T')[0] : null;
    
    // Add employee row
    items.push({
      id: `emp-${empId}`,
      name: emp.name || empId,
      type: 'employee',
      level: 0,
      startDate: minDate,
      endDate: maxDate,
      percentComplete: Math.round(empTasks.reduce((sum, t) => sum + (t.percentComplete || 0), 0) / empTasks.length) || 0,
      baselineHours: totalBaseline,
      actualHours: totalActual,
      utilization,
      parentId: undefined
    });
    
    // Add task rows if expanded
    if (expandedEmployees.has(empId)) {
      empTasks.forEach(task => {
        const taskId = task.id || task.taskId;
        const baseline = task.baselineHours || 0;
        const actual = task.actualHours || 0;
        const taskUtil = baseline > 0 ? Math.round((actual / baseline) * 100) : 0;
        
        items.push({
          id: `task-${taskId}`,
          name: task.name || task.taskName || 'Unnamed Task',
          type: 'task',
          level: 1,
          startDate: task.startDate || task.baselineStartDate || null,
          endDate: task.endDate || task.baselineEndDate || null,
          percentComplete: task.percentComplete || 0,
          baselineHours: baseline,
          actualHours: actual,
          utilization: taskUtil,
          isCritical: task.isCritical || task.is_critical || false,
          parentId: `emp-${empId}`
        });
      });
    }
  });
  
  return items;
}

function getBarColor(utilization: number, isCritical?: boolean): string {
  if (isCritical) return COLORS.CRITICAL;
  if (utilization > 100) return COLORS.OVER;
  if (utilization >= 80) return COLORS.HIGH;
  if (utilization >= 50) return COLORS.OPTIMAL;
  return COLORS.UNDER;
}

// ============================================================================
// CHART RENDERING
// ============================================================================

function buildChartOption(
  items: GanttItem[],
  onToggle: (id: string) => void
): EChartsOption {
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
  
  // Prepare series data
  const seriesData = items.map((item, index) => ({
    name: item.name,
    value: [
      index,
      item.startDate ? new Date(item.startDate).getTime() : minTime,
      item.endDate ? new Date(item.endDate).getTime() : maxTime,
      item.percentComplete,
      item.utilization,
      item.type,
      item.isCritical || false,
      item.id,
      item.baselineHours,
      item.actualHours
    ],
    itemStyle: { color: getBarColor(item.utilization, item.isCritical) }
  }));
  
  // Custom renderer for Gantt bars
  const renderItem = (params: any, api: any): any => {
    const categoryIndex = api.value(0);
    const start = api.coord([api.value(1), categoryIndex]);
    const end = api.coord([api.value(2), categoryIndex]);
    const progress = api.value(3);
    const utilization = api.value(4);
    const itemType = api.value(5);
    const isCritical = api.value(6);
    
    const h = itemType === 'employee' ? 24 : 18;
    const barWidth = Math.max(end[0] - start[0], 4);
    
    const rectShape = echarts.graphic.clipRectByRect(
      { x: start[0], y: start[1] - h / 2, width: barWidth, height: h },
      { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
    );
    
    if (!rectShape) return undefined;
    
    const color = getBarColor(utilization, isCritical);
    const children: any[] = [];
    
    // Background bar
    children.push({
      type: 'rect',
      shape: rectShape,
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
        { x: start[0], y: start[1] - h / 2, width: progressWidth, height: h },
        { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
      );
      if (progressRect) {
        children.push({
          type: 'rect',
          shape: progressRect,
          style: { fill: color, opacity: 1 }
        });
      }
    }
    
    // Utilization text on bar
    if (barWidth > 50) {
      children.push({
        type: 'text',
        style: {
          text: `${utilization}%`,
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
    
    return { type: 'group', children };
  };
  
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (!params?.value) return '';
        const index = params.value[0];
        const item = items[index];
        if (!item) return '';
        
        const typeLabel = item.type === 'employee' ? 'Resource' : 'Task';
        const icon = item.type === 'employee' ? '👤' : '📋';
        
        return `
          <div style="padding:8px 12px;">
            <div style="font-weight:600;color:#40E0D0;margin-bottom:8px;border-bottom:1px solid rgba(64,224,208,0.3);padding-bottom:6px;">
              ${icon} ${item.name}
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.6);margin-bottom:4px;">${typeLabel}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);">Progress</div>
                <div style="font-weight:600;color:#fff;">${item.percentComplete}%</div>
              </div>
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);">Utilization</div>
                <div style="font-weight:600;color:${getBarColor(item.utilization)}">${item.utilization}%</div>
              </div>
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);">Baseline Hrs</div>
                <div style="font-weight:600;color:#fff;">${item.baselineHours.toFixed(1)}</div>
              </div>
              <div>
                <div style="font-size:10px;color:rgba(255,255,255,0.5);">Actual Hrs</div>
                <div style="font-weight:600;color:#fff;">${item.actualHours.toFixed(1)}</div>
              </div>
            </div>
            ${item.startDate && item.endDate ? `
              <div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.7);">
                ${item.startDate} → ${item.endDate}
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
      left: 220,
      right: 30,
      top: 40,
      bottom: 40,
      containLabel: false
    },
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 10,
        height: 20,
        fillerColor: 'rgba(64,224,208,0.2)',
        borderColor: 'rgba(64,224,208,0.3)',
        handleStyle: { color: '#40E0D0' }
      },
      {
        type: 'inside',
        xAxisIndex: 0,
        zoomOnMouseWheel: 'ctrl'
      },
      {
        type: 'slider',
        yAxisIndex: 0,
        left: 5,
        width: 16,
        start: 0,
        end: items.length > 20 ? Math.round((20 / items.length) * 100) : 100,
        showDetail: false,
        fillerColor: 'rgba(64,224,208,0.2)',
        borderColor: 'rgba(64,224,208,0.3)',
        handleStyle: { color: '#40E0D0' }
      }
    ],
    xAxis: {
      type: 'time',
      position: 'top',
      min: minTime - padding,
      max: maxTime + padding,
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 }
    },
    yAxis: {
      type: 'category',
      data: items.map(item => item.id),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 11,
        fontWeight: 500,
        formatter: (id: string) => {
          const item = items.find(i => i.id === id);
          if (!item) return '';
          const prefix = item.level > 0 ? '    ' : '';
          const icon = item.type === 'employee' ? '▶ ' : '  ';
          return `${prefix}${icon}${item.name}`;
        }
      }
    },
    series: [
      {
        name: 'Resource Gantt',
        type: 'custom',
        renderItem,
        encode: { x: [1, 2], y: 0 },
        data: seriesData,
        clip: true
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
            lineStyle: { color: '#ef4444', width: 2, type: 'solid' },
            label: {
              formatter: 'Today',
              position: 'start',
              color: '#ef4444',
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

export default function ResourceGanttChart({
  tasks,
  employees,
  height = 500,
  showControls = true
}: ResourceGanttProps) {
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  
  // Toggle employee expansion
  const toggleEmployee = useCallback((empId: string) => {
    setExpandedEmployees(prev => {
      const next = new Set(prev);
      if (next.has(empId)) {
        next.delete(empId);
      } else {
        next.add(empId);
      }
      return next;
    });
  }, []);
  
  // Build items
  const items = useMemo(() => 
    buildGanttItems(tasks, employees, expandedEmployees),
    [tasks, employees, expandedEmployees]
  );
  
  // Build chart option
  const option = useMemo(() => 
    buildChartOption(items, toggleEmployee),
    [items, toggleEmployee]
  );
  
  // Stats
  const stats = useMemo(() => {
    const employeeItems = items.filter(i => i.type === 'employee');
    const avgUtil = employeeItems.length > 0
      ? Math.round(employeeItems.reduce((sum, i) => sum + i.utilization, 0) / employeeItems.length)
      : 0;
    const overloaded = employeeItems.filter(i => i.utilization > 100).length;
    const underutilized = employeeItems.filter(i => i.utilization < 50).length;
    
    return { avgUtil, overloaded, underutilized, total: employeeItems.length };
  }, [items]);
  
  // Handle row click to toggle expansion
  const handleChartClick = useCallback((params: any) => {
    if (params?.value) {
      const itemId = params.value[7] as string;
      if (itemId?.startsWith('emp-')) {
        const empId = itemId.replace('emp-', '');
        toggleEmployee(empId);
      }
    }
  }, [toggleEmployee]);
  
  // Empty state
  if (items.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: typeof height === 'number' ? height : 400,
        background: 'var(--bg-tertiary)',
        borderRadius: 8,
        border: '1px solid var(--border-color)',
        color: 'var(--text-muted)'
      }}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.5, marginBottom: 16 }}>
          <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="9" y1="4" x2="9" y2="20" />
        </svg>
        <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>No Resource Assignments</p>
        <p style={{ margin: '8px 0 0', fontSize: '0.85rem', opacity: 0.7 }}>
          Assign resources to tasks to see the Gantt view
        </p>
      </div>
    );
  }
  
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
          border: '1px solid rgba(64,224,208,0.1)',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Stats */}
          <div style={{ display: 'flex', gap: '24px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Resources</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#40E0D0' }}>{stats.total}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Avg Util</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: getBarColor(stats.avgUtil) }}>{stats.avgUtil}%</div>
            </div>
            {stats.overloaded > 0 && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Overloaded</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: COLORS.OVER }}>{stats.overloaded}</div>
              </div>
            )}
          </div>
          
          {/* Legend */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <LegendItem color={COLORS.UNDER} label="< 50%" />
            <LegendItem color={COLORS.OPTIMAL} label="50-80%" />
            <LegendItem color={COLORS.HIGH} label="80-100%" />
            <LegendItem color={COLORS.OVER} label="> 100%" />
          </div>
          
          {/* Expand/Collapse All */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                const allEmpIds = employees.map(e => e.id || e.employeeId).filter(Boolean) as string[];
                setExpandedEmployees(new Set(allEmpIds));
              }}
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Expand All
            </button>
            <button
              onClick={() => setExpandedEmployees(new Set())}
              style={{
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Collapse All
            </button>
          </div>
        </div>
      )}
      
      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChartWrapper
          option={option}
          height={height}
          onClick={handleChartClick}
          enableCompare
          enableExport
          enableFullscreen
          visualId="resource-gantt"
          visualTitle="Resource Gantt"
        />
      </div>
    </div>
  );
}

// Legend item component
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>{label}</span>
    </div>
  );
}
