'use client';

/**
 * @fileoverview ECharts Gantt Chart Component.
 * 
 * Renders a Gantt chart using ECharts for project scheduling visualization.
 * Features:
 * - Task bars with progress fill
 * - Critical path highlighting
 * - Milestone diamonds (red markers at the end of tasks)
 * - Resource names displayed next to bars
 * - Expandable/collapsible hierarchy
 * - Today line marker
 * - Responsive sizing
 * 
 * @module components/charts/EChartsGantt
 */

import React, { useMemo } from 'react';
import ChartWrapper from './ChartWrapper';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import type { Employee } from '@/types/data';

interface EChartsGanttProps {
  data: any;
  height?: string | number;
  hideLabels?: boolean;
  expandedIds?: Set<string>;
  employees?: Employee[];
}

// Helper to get employee name from ID - optimized with Map
const buildEmployeeMap = (employees: Employee[]): Map<string, Employee> => {
  const map = new Map<string, Employee>();
  employees.forEach(emp => {
    if (emp.employeeId) map.set(emp.employeeId, emp);
  });
  return map;
};

const getEmployeeName = (resourceId: string | undefined, employeeMap: Map<string, Employee>): string => {
  if (!resourceId) return '';
  const employee = employeeMap.get(resourceId);
  return employee?.name || resourceId;
};

const EChartsGantt: React.FC<EChartsGanttProps> = React.memo(({ data, height = '500px', hideLabels = false, expandedIds, employees = [] }) => {
  // Build employee Map once for O(1) lookups
  const employeeMap = useMemo(() => buildEmployeeMap(employees), [employees]);

  const chartData = useMemo(() => {
    const flatItems: any[] = [];

    const flatten = (items: any[], level = 0) => {
      items.forEach((item) => {
        flatItems.push({
          ...item,
          level
        });
        if (item.children && (expandedIds ? expandedIds.has(item.id) : item.isExpanded !== false)) {
          flatten(item.children, level + 1);
        }
      });
    };

    if (data.items) flatten(data.items);
    return flatItems;
  }, [data.items, expandedIds]);

  const categories = chartData.map(item => item.id);

  const seriesData = chartData.map((item, index) => {
    const startTime = new Date(item.startDate).getTime();
    const endTime = new Date(item.endDate).getTime();

    const eff = item.taskEfficiency || 0;
    let color;
    if (item.isCritical) color = '#ef4444';
    else if (eff >= 100) color = '#40E0D0';
    else if (eff >= 90) color = '#CDDC39';
    else if (eff >= 80) color = '#FF9800';
    else if (eff > 0) color = '#E91E63';
    else {
      color = item.itemType === 'portfolio' ? '#40E0D0' :
        item.itemType === 'customer' ? '#CDDC39' :
          item.itemType === 'site' ? '#E91E63' :
            item.itemType === 'project' ? '#FF9800' : '#4A90E2';
    }

    // Get resource name from assignments if available
    const resourceNames = item.resource_assignments?.length
      ? item.resource_assignments.map((ra: any) => ra.resource_name).join(', ')
      : getEmployeeName(item.resourceId, employeeMap);

    return {
      name: item.name,
      value: [
        index,
        startTime,
        endTime,
        item.percentComplete || 0,
        item.itemType,
        color,
        item.isCritical,
        item.id,
        resourceNames,
        item.is_milestone || false
      ],
      itemStyle: { normal: { color } }
    };
  });

  // Calculate links (arrows) for predecessors
  const linkData: any[] = [];
  chartData.forEach((item, index) => {
    if (item.predecessors && item.predecessors.length > 0) {
      item.predecessors.forEach((pred: any) => {
        const sourceIndex = chartData.findIndex(t => t.id === pred.taskId);
        if (sourceIndex !== -1) {
          linkData.push({
            source: sourceIndex,
            target: index,
            relationship: pred.relationship,
            isCritical: item.isCritical && chartData[sourceIndex].isCritical
          });
        }
      });
    }
  });

  const renderItem = (params: any, api: any): any => {
    const categoryIndex = api.value(0);
    const start = api.coord([api.value(1), categoryIndex]);
    const end = api.coord([api.value(2), categoryIndex]);
    const progress = api.value(3);
    const color = api.value(5);
    const isCritical = api.value(6);
    const resourceNames = api.value(8);
    const isMilestone = api.value(9);

    const h = 20; // Task bar height
    const barWidth = Math.max(end[0] - start[0], 2);

    // Base bar shape
    const rectShape = echarts.graphic.clipRectByRect(
      { x: start[0], y: start[1] - h / 2, width: barWidth, height: h },
      { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
    );

    if (!rectShape) return undefined;

    const children: any[] = [];

    // 1. Draw the background bar (planned duration)
    children.push({
      type: 'rect',
      shape: rectShape,
      style: {
        fill: color,
        opacity: 0.2,
        stroke: isCritical ? '#ef4444' : 'rgba(255,255,255,0.1)',
        lineWidth: isCritical ? 2 : 1
      }
    });

    // 2. Draw the progress bar (actual completion)
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

    // 3. Draw Milestone marker and vertical line if applicable
    if (isMilestone) {
      const markerSize = 12;
      // Position at the END of the task
      const markerX = end[0];
      const markerY = start[1];

      // Vertical line to top
      children.push({
        type: 'line',
        shape: {
          x1: markerX,
          y1: markerY,
          x2: markerX,
          y2: params.coordSys.y
        },
        style: {
          stroke: '#ef4444',
          lineWidth: 1,
          lineDash: [4, 4]
        },
        z: 5
      });

      children.push({
        type: 'path',
        shape: {
          // Diamond shape path
          d: `M ${markerX} ${markerY - markerSize / 2} L ${markerX + markerSize / 2} ${markerY} L ${markerX} ${markerY + markerSize / 2} L ${markerX - markerSize / 2} ${markerY} Z`
        },
        style: {
          fill: '#ef4444',
          stroke: '#fff',
          lineWidth: 1
        },
        z2: 10 // Ensure it's on top
      });
    }

    // 4. Draw Resource Text
    if (resourceNames && barWidth > 10) {
      children.push({
        type: 'text',
        style: {
          text: resourceNames,
          x: start[0] + barWidth + 10, // Offset from the bar
          y: start[1],
          fill: '#6b7280', // Text color
          fontSize: 10,
          align: 'left',
          verticalAlign: 'middle'
        },
        silent: true
      });
    }

    return {
      type: 'group',
      children
    };
  };

  const renderLink = (params: any, api: any): any => {
    const sourceIndex = api.value(0);
    const targetIndex = api.value(1);

    const sourceItem = chartData[sourceIndex];
    const targetItem = chartData[targetIndex];

    if (!sourceItem || !targetItem) return undefined;

    const sourceCoord = api.coord([new Date(sourceItem.endDate).getTime(), sourceIndex]);
    const targetCoord = api.coord([new Date(targetItem.startDate).getTime(), targetIndex]);

    const x1 = sourceCoord[0];
    const y1 = sourceCoord[1];
    const x2 = targetCoord[0];
    const y2 = targetCoord[1];

    const cp = targetItem.isCritical && sourceItem.isCritical;

    return {
      type: 'group' as const,
      children: [
        {
          type: 'bezierCurve' as const,
          shape: {
            x1, y1, x2, y2,
            cpX1: x1 + (x2 - x1) / 2,
            cpY1: y1,
            cpX2: x1 + (x2 - x1) / 2,
            cpY2: y2
          },
          style: {
            stroke: cp ? '#ef4444' : '#40E0D0',
            lineWidth: 1.5,
            fill: 'none',
            lineDash: cp ? [0, 0] : [4, 4]
          }
        },
        {
          type: 'polygon' as const,
          shape: {
            points: [[x2, y2], [x2 - 8, y2 - 4], [x2 - 8, y2 + 4]]
          },
          style: {
            fill: cp ? '#ef4444' : '#40E0D0'
          }
        }
      ]
    };
  };

  const option: EChartsOption = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        if (params.seriesType === 'custom' && params.seriesName === 'Links') return '';
        const index = params.value[0];
        const item = chartData[index];
        if (!item) return '';

        const resourceNames = item.resource_assignments?.length
          ? item.resource_assignments.map((ra: any) => ra.resource_name).join(', ')
          : getEmployeeName(item.resourceId, employeeMap);

        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <span style="font-weight:bold;font-size:14px">${item.name}</span>
                  ${item.is_milestone ? '<span style="background:#ef4444;color:white;font-size:10px;padding:1px 6px;border-radius:10px;font-weight:bold">MILESTONE</span>' : ''}
                </div>
                <div style="font-size:12px;color:rgba(255,255,255,0.7)">
                  <div>Period: <span style="color:white">${item.startDate}</span> to <span style="color:white">${item.endDate}</span></div>
                  <div style="margin-top:2px">Progress: <span style="color:white;font-weight:600">${item.percentComplete}%</span></div>
                  ${resourceNames ? `<div style="margin-top:2px">Assigned: <span style="color:white">${resourceNames}</span></div>` : ''}
                  ${item.taskEfficiency ? `<div style="margin-top:2px">Efficiency: <span style="color:white">${item.taskEfficiency.toFixed(0)}%</span></div>` : ''}
                  ${item.isCritical ? '<div style="color:#ef4444;font-weight:bold;margin-top:6px;display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;background:#ef4444;border-radius:50%"></span> Critical Path</div>' : ''}
                </div>`;
      }
    },
    grid: { left: hideLabels ? 0 : 220, right: 150, top: 40, bottom: 20, containLabel: true },
    xAxis: {
      type: 'time',
      position: 'top',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
      axisLabel: { color: '#9ca3af', fontSize: 10 }
    },
    yAxis: {
      type: 'category',
      data: categories,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: !hideLabels,
        color: '#9ca3af',
        fontSize: 10,
        formatter: (id: string) => {
          const item = chartData.find(t => t.id === id);
          return item ? `${' '.repeat(item.level * 2)}${item.name}` : '';
        }
      }
    },
    series: [
      {
        name: 'Gantt',
        type: 'custom',
        renderItem: renderItem,
        encode: { x: [1, 2], y: 0 },
        data: seriesData,
        clip: true
      },
      {
        name: 'Links',
        type: 'custom',
        renderItem: renderLink,
        data: linkData.map(l => [l.source, l.target]),
        clip: true,
        z: 10
      }
    ]
  }), [chartData, categories, seriesData, linkData, hideLabels, employeeMap]);

  return <ChartWrapper option={option} height={height} />;
});

EChartsGantt.displayName = 'EChartsGantt';

export default EChartsGantt;
