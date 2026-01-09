'use client';

/**
 * @fileoverview ECharts Gantt Chart Component.
 * 
 * Renders a Gantt chart using ECharts for project scheduling visualization.
 * Features:
 * - Task bars with progress fill
 * - Critical path highlighting
 * - Milestone diamonds
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

// Helper to get employee name from ID
const getEmployeeName = (resourceId: string | undefined, employees: Employee[]): string => {
  if (!resourceId) return '';
  const employee = employees.find(e => e.employeeId === resourceId);
  return employee?.name || resourceId;
};

const EChartsGantt: React.FC<EChartsGanttProps> = ({ data, height = '500px', hideLabels = false, expandedIds, employees = [] }) => {
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
    
    // Get resource name if available
    const resourceName = getEmployeeName(item.resourceId, employees);
    
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
        resourceName
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
    
    const h = 32 * 0.6; // Matches row height in table
    const barWidth = Math.max(end[0] - start[0], 5);
    
    const rectShape = echarts.graphic.clipRectByRect(
      { x: start[0], y: start[1] - h / 2, width: barWidth, height: h },
      { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
    );

    // Calculate progress width based on total bar width, not screen coordinates
    const progressWidth = barWidth * (progress / 100);
    const progressShape = progress > 0 ? echarts.graphic.clipRectByRect(
      { x: start[0], y: start[1] - h / 2, width: Math.max(progressWidth, 2), height: h },
      { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
    ) : null;

    if (!rectShape) return undefined;
    
    const children: any[] = [
      {
        type: 'rect' as const,
        shape: rectShape,
        style: { 
          fill: color, 
          opacity: 0.3, 
          stroke: isCritical ? '#ef4444' : 'transparent', 
          lineWidth: isCritical ? 2 : 1 
        }
      }
    ];
    
    // Only add progress fill if there's progress and a valid shape
    if (progressShape && progress > 0) {
      children.push({
        type: 'rect' as const,
        shape: progressShape,
        style: { fill: color, opacity: 1 }
      });
    }
    
    return {
      type: 'group' as const,
      children
    };
  };

  const renderLink = (params: any, api: any): any => {
    const sourceIndex = api.value(0);
    const targetIndex = api.value(1);
    
    const sourceItem = chartData[sourceIndex];
    const targetItem = chartData[targetIndex];
    
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
        const item = chartData[params.value[0]];
        if (!item) return '';
        const resourceName = getEmployeeName(item.resourceId, employees);
        return `<div style="font-weight:bold;margin-bottom:4px">${item.name}</div>
                <div>Period: ${item.startDate} to ${item.endDate}</div>
                <div>Progress: ${item.percentComplete}%</div>
                ${resourceName ? `<div>Assigned: ${resourceName}</div>` : ''}
                ${item.taskEfficiency ? `<div>Efficiency: ${item.taskEfficiency.toFixed(0)}%</div>` : ''}
                ${item.isCritical ? '<div style="color:#ef4444;font-weight:bold;margin-top:2px">Critical Path</div>' : ''}`;
      }
    },
    grid: { left: hideLabels ? 0 : 220, right: 20, top: 40, bottom: 20, containLabel: true },
    xAxis: {
      type: 'time',
      position: 'top',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
      axisLabel: { color: 'var(--text-muted)', fontSize: 10 }
    },
    yAxis: {
      type: 'category',
      data: categories,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: !hideLabels,
        color: 'var(--text-secondary)',
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
  }), [chartData, categories, seriesData, linkData, hideLabels, employees]);

  return <ChartWrapper option={option} height={height} />;
};

export default EChartsGantt;
