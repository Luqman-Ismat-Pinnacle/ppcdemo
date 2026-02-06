'use client';

/**
 * @fileoverview Advanced ECharts WBS Gantt Chart for PPC V3
 * 
 * Full Apache ECharts implementation with:
 * - Interactive Gantt bars with progress fill
 * - Dependency arrows (Bezier curves) with color coding
 * - Baseline ghost bars for schedule creep visualization
 * - Inazuma (Lightning) progress line
 * - Collapsible WBS hierarchy
 * - FTE resource indicators
 * - Critical path highlighting
 * - Zoom and pan controls
 * 
 * @module app/project-controls/wbs-gantt/page
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import { useLogs } from '@/lib/logs-context';
import { CPMEngine, CPMTask, CPMResult } from '@/lib/cpm-engine';
import { formatCurrency } from '@/lib/wbs-utils';
import type { Employee } from '@/types/data';
import ChartWrapper from '@/components/charts/ChartWrapper';
import SearchableDropdown from '@/components/ui/SearchableDropdown';
import type { EChartsOption } from 'echarts';

// Helper to get employee name
const getEmployeeName = (resourceId: string | undefined, employees: Employee[]): string => {
  if (!resourceId) return '-';
  const employee = employees.find(e => (e as any).id === resourceId || e.employeeId === resourceId);
  return employee?.name?.split(' ')[0] || resourceId;
};

// Filter WBS items by hierarchy path
function filterWbsItemsByPath(items: any[], path: (string | undefined)[]): any[] {
  return items
    .filter((item: any) => {
      if (path[0] && item.type === 'portfolio' && item.name !== path[0]) return false;
      if (path[1] && item.type === 'customer' && item.name !== path[1]) return false;
      if (path[2] && item.type === 'site' && item.name !== path[2]) return false;
      if (path[3] && item.type === 'project' && item.name !== path[3]) return false;
      if (path[4] && item.type === 'unit' && item.name !== path[4]) return false;
      if (path[5] && item.type === 'phase' && item.name !== path[5]) return false;
      return true;
    })
    .map((item: any) => ({
      ...item,
      children: item.children ? filterWbsItemsByPath(item.children, path) : undefined,
    }));
}

// Get worst-case status for collapsed parents
function getWorstCaseColor(items: any[]): string {
  let worst = '#22C55E'; // Green - on track
  
  const check = (item: any) => {
    if (item.isCritical || item.is_critical) {
      worst = '#EF4444';
      return;
    }
    const progress = item.percentComplete || 0;
    if (progress < 25) {
      if (worst !== '#EF4444') worst = '#F97316';
    } else if (progress < 50) {
      if (worst === '#22C55E') worst = '#EAB308';
    }
    if (item.children) item.children.forEach(check);
  };
  
  items.forEach(check);
  return worst;
}

export default function WBSGanttPage() {
  const { filteredData, updateData, data: fullData, setHierarchyFilter, dateFilter, hierarchyFilter } = useData();
  const { addEngineLog } = useLogs();
  const data = filteredData;
  const employees = fullData.employees;

  // Settings
  const [showBaseline, setShowBaseline] = useState(true);
  const [showInazuma, setShowInazuma] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cpmResult, setCpmResult] = useState<CPMResult | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [wbsSearchQuery, setWbsSearchQuery] = useState('');

  // WBS Data
  const wbsDataForTable = useMemo(() => {
    const dateFilterActive = dateFilter && dateFilter.type !== 'all';
    const raw = dateFilterActive ? fullData.wbsData : data.wbsData;
    if (!raw?.items?.length) return { items: [] as any[] };
    if (!dateFilterActive) return raw;
    if (!hierarchyFilter?.path?.length) return raw;
    return { ...raw, items: filterWbsItemsByPath(raw.items, hierarchyFilter.path) };
  }, [dateFilter, fullData.wbsData, data.wbsData, hierarchyFilter?.path]);

  const today = useMemo(() => new Date(), []);

  const projectOptions = useMemo(() => {
    return (fullData.projects || [])
      .filter((p: any) => p.has_schedule === true || p.hasSchedule === true)
      .map((p: any) => ({
        id: p.id || p.projectId,
        name: p.name,
        secondary: p.projectId
      }));
  }, [fullData.projects]);

  // Rollup percent complete
  const getRollupPercentComplete = (item: any): number => {
    if (!item?.children?.length) return item?.percentComplete ?? 0;
    const childPcts = (item.children as any[]).map((c: any) => getRollupPercentComplete(c));
    const sum = childPcts.reduce((a, b) => a + b, 0);
    return childPcts.length ? Math.round(sum / childPcts.length) : (item.percentComplete ?? 0);
  };

  // Search filter
  const searchFilteredItems = useMemo(() => {
    const items = wbsDataForTable?.items || [];
    const q = (wbsSearchQuery || '').trim().toLowerCase();
    if (!q) return items;

    const itemMatches = (item: any) => {
      const name = (item.name ?? '').toLowerCase();
      const wbsCode = (item.wbsCode ?? '').toLowerCase();
      return name.includes(q) || wbsCode.includes(q);
    };

    const filterBySearch = (items: any[]): any[] => {
      return items
        .map((item: any) => {
          const filteredChildren = item.children?.length ? filterBySearch(item.children) : undefined;
          const selfMatches = itemMatches(item);
          const childMatches = filteredChildren && filteredChildren.length > 0;
          if (selfMatches || childMatches) return { ...item, children: filteredChildren };
          return null;
        })
        .filter(Boolean);
    };

    return filterBySearch(items);
  }, [wbsDataForTable?.items, wbsSearchQuery]);

  // Build flat rows for Gantt
  const flatRows = useMemo(() => {
    const rows: any[] = [];
    const seenIds = new Set<string>();

    const walk = (item: any, level: number, parentId: string | null) => {
      const id = item?.id ?? '';
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const hasChildren = !!(item.children && item.children.length > 0);
      const isExpanded = expandedIds.has(id);
      const percentComplete = hasChildren
        ? (item.percentComplete ?? getRollupPercentComplete(item))
        : (item.percentComplete ?? 0);
      const worstColor = hasChildren && !isExpanded ? getWorstCaseColor(item.children) : null;

      rows.push({
        ...item,
        id,
        level,
        parentId,
        hasChildren,
        isExpanded,
        percentComplete,
        worstColor,
        rowIndex: rows.length
      });

      if (hasChildren && isExpanded) {
        item.children.forEach((child: any) => walk(child, level + 1, id));
      }
    };

    searchFilteredItems.forEach((item: any) => walk(item, 0, null));
    return rows;
  }, [searchFilteredItems, expandedIds]);

  // Auto-expand on first load
  const lastWbsDataKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const items = wbsDataForTable?.items;
    const key = items?.length ? `${items.length}-${(items as any[])[0]?.id ?? ''}` : null;
    if (key === lastWbsDataKeyRef.current) return;
    lastWbsDataKeyRef.current = key;
    if (!items?.length) return;
    
    // Default expand to level 2
    const idsToExpand = new Set<string>();
    const walk = (items: any[], level: number) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0 && level < 2) {
          idsToExpand.add(item.id);
          walk(item.children, level + 1);
        }
      });
    };
    walk(items, 0);
    setExpandedIds(idsToExpand);
  }, [wbsDataForTable?.items]);

  // Toggle expand
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Expand/Collapse controls
  const expandAll = () => {
    const allIds = new Set<string>();
    const collectIds = (items: any[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          allIds.add(item.id);
          collectIds(item.children);
        }
      });
    };
    if (wbsDataForTable?.items?.length) collectIds(wbsDataForTable.items);
    setExpandedIds(allIds);
  };

  const collapseAll = () => setExpandedIds(new Set());

  const collapseToLevel = (targetLevel: number) => {
    const idsToExpand = new Set<string>();
    const walk = (items: any[], level: number) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0 && level < targetLevel) {
          idsToExpand.add(item.id);
          walk(item.children, level + 1);
        }
      });
    };
    if (wbsDataForTable?.items?.length) walk(wbsDataForTable.items, 0);
    setExpandedIds(idsToExpand);
  };

  // Run CPM Analysis
  const runCPM = () => {
    const engine = new CPMEngine();
    const tasks: Partial<CPMTask>[] = [];

    const collectTasks = (items: any[]) => {
      items.forEach(item => {
        if (!item.children || item.children.length === 0) {
          tasks.push({
            id: item.id,
            name: item.name,
            wbsCode: item.wbsCode,
            daysRequired: (item.is_milestone || item.isMilestone) ? 0 : (item.daysRequired || 1),
            predecessors: item.predecessors || []
          });
        } else {
          collectTasks(item.children);
        }
      });
    };

    if (wbsDataForTable?.items?.length) {
      let itemsToAnalyze = wbsDataForTable.items;

      if (selectedProjectId) {
        const project = fullData.projects?.find((p: any) => (p.id === selectedProjectId || p.projectId === selectedProjectId));
        if (project) {
          const site = fullData.sites?.find((s: any) => s.id === project.siteId);
          const customer = fullData.customers?.find((c: any) => c.id === site?.customerId);
          const portfolio = fullData.portfolios?.find((p: any) => p.id === customer?.portfolioId);
          const owner = fullData.employees?.find((e: any) => e.id === portfolio?.employeeId);
          const portfolioName = owner ? `${owner.name.split(' ')[0]}'s Portfolio` : portfolio?.name;

          if (portfolioName && customer && site) {
            setHierarchyFilter({ path: [portfolioName, customer.name, site.name, project.name] });
          } else if (project.name) {
            setHierarchyFilter({ path: ['', '', '', project.name] });
          }
        }

        const findProject = (nodes: any[]): any | null => {
          for (const node of nodes) {
            if (node.id === selectedProjectId || node.projectId === selectedProjectId) return node;
            if (node.children) {
              const found = findProject(node.children);
              if (found) return found;
            }
          }
          return null;
        };
        const projNode = findProject(itemsToAnalyze);
        if (projNode) itemsToAnalyze = [projNode];
      }

      collectTasks(itemsToAnalyze);
    }

    engine.loadTasks(tasks as any);
    const result = engine.calculate();
    setCpmResult(result);

    const updateItems = (items: any[]): any[] => {
      return items.map(item => {
        const cpmTask = result.tasks.find(t => t.id === item.id);
        const newItem = { ...item };
        if (cpmTask) {
          newItem.isCritical = cpmTask.isCritical;
          newItem.totalFloat = cpmTask.totalFloat;
        }
        if (newItem.children) {
          newItem.children = updateItems(newItem.children);
          newItem.isCritical = newItem.children.some((c: any) => c.isCritical);
        }
        return newItem;
      });
    };

    if (data.wbsData?.items) {
      const updated = updateItems(data.wbsData.items);
      updateData({ wbsData: { ...data.wbsData, items: updated } });
    }
  };

  // Calculate date range
  const { minDate, maxDate } = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;

    flatRows.forEach(item => {
      if (item.startDate) {
        const d = new Date(item.startDate);
        if (!min || d < min) min = d;
      }
      if (item.endDate) {
        const d = new Date(item.endDate);
        if (!max || d > max) max = d;
      }
      if (item.baselineStart) {
        const d = new Date(item.baselineStart);
        if (!min || d < min) min = d;
      }
      if (item.baselineEnd) {
        const d = new Date(item.baselineEnd);
        if (!max || d > max) max = d;
      }
    });

    // Add buffer
    const buffer = 14 * 24 * 60 * 60 * 1000; // 14 days
    return {
      minDate: min ? new Date(min.getTime() - buffer) : new Date(),
      maxDate: max ? new Date(max.getTime() + buffer) : new Date()
    };
  }, [flatRows]);

  // Build ECharts option
  const chartOption: EChartsOption = useMemo(() => {
    if (flatRows.length === 0) {
      return {
        title: { text: 'No WBS Data', left: 'center', top: 'center', textStyle: { color: 'var(--text-muted)' } }
      };
    }

    const categories = flatRows.map((row, idx) => {
      const indent = '  '.repeat(row.level);
      const prefix = row.hasChildren ? (row.isExpanded ? '▼ ' : '▶ ') : '  ';
      return `${indent}${prefix}${row.wbsCode || ''} ${row.name || ''}`.slice(0, 50);
    });

    // Task bars data
    const taskData: any[] = [];
    const baselineData: any[] = [];
    const progressData: any[] = [];
    const milestoneData: any[] = [];

    flatRows.forEach((row, idx) => {
      if (!row.startDate || !row.endDate) return;

      const start = new Date(row.startDate).getTime();
      const end = new Date(row.endDate).getTime();
      const isCritical = row.isCritical || row.is_critical;
      const isMilestone = row.is_milestone || row.isMilestone;
      const progress = row.percentComplete || 0;

      // Progress color
      const getColor = (pct: number) => {
        if (pct >= 100) return '#22C55E';
        if (pct >= 75) return '#22C55E';
        if (pct >= 50) return '#EAB308';
        if (pct >= 25) return '#F97316';
        return '#EF4444';
      };

      const barColor = row.worstColor || (isCritical ? '#EF4444' : getColor(progress));

      if (isMilestone) {
        milestoneData.push({
          value: [idx, start, start, row.name],
          itemStyle: { color: '#EF4444' },
          taskId: row.id
        });
      } else {
        // Background bar (full duration)
        taskData.push({
          value: [idx, start, end, row.name],
          itemStyle: { 
            color: progress === 0 ? barColor : 'rgba(55, 65, 81, 0.6)',
            borderColor: isCritical ? '#EF4444' : 'transparent',
            borderWidth: isCritical ? 2 : 0,
            borderRadius: 3
          },
          taskId: row.id,
          row: row
        });

        // Progress fill
        if (progress > 0) {
          const progressEnd = start + ((end - start) * (progress / 100));
          progressData.push({
            value: [idx, start, progressEnd, `${progress}%`],
            itemStyle: { color: barColor, borderRadius: 3 },
            taskId: row.id
          });
        }
      }

      // Baseline ghost bar
      if (showBaseline && row.baselineStart && row.baselineEnd) {
        const blStart = new Date(row.baselineStart).getTime();
        const blEnd = new Date(row.baselineEnd).getTime();
        baselineData.push({
          value: [idx, blStart, blEnd, 'Baseline'],
          itemStyle: { 
            color: 'rgba(107, 114, 128, 0.3)',
            borderColor: 'rgba(107, 114, 128, 0.6)',
            borderWidth: 1,
            borderRadius: 2
          }
        });
      }
    });

    // Dependency arrows using markLine
    const dependencyLines: any[] = [];
    const rowIndexMap = new Map(flatRows.map((r, i) => [r.id, i]));

    if (showDependencies) {
      flatRows.forEach((row, targetIdx) => {
        if (!row.predecessors || row.predecessors.length === 0) return;
        if (!row.startDate) return;

        const targetStart = new Date(row.startDate).getTime();

        row.predecessors.forEach((pred: any) => {
          const sourceIdx = rowIndexMap.get(pred.taskId);
          if (sourceIdx === undefined) return;

          const sourceRow = flatRows[sourceIdx];
          if (!sourceRow.endDate) return;

          const sourceEnd = new Date(sourceRow.endDate).getTime();
          const isCritical = row.isCritical || row.is_critical;
          const isCausingDelay = sourceEnd > targetStart;

          dependencyLines.push({
            coords: [
              [sourceEnd, sourceIdx],
              [targetStart, targetIdx]
            ],
            lineStyle: {
              color: isCritical ? '#EF4444' : isCausingDelay ? '#F97316' : '#6B7280',
              width: isCritical ? 2 : 1,
              type: isCausingDelay ? 'dashed' : 'solid',
              curveness: 0.3
            }
          });
        });
      });
    }

    // Inazuma (Progress deviation line)
    const inazumaPoints: any[] = [];
    if (showInazuma) {
      const todayTime = today.getTime();
      flatRows.forEach((row, idx) => {
        if (!row.startDate || !row.endDate) return;

        const start = new Date(row.startDate).getTime();
        const end = new Date(row.endDate).getTime();

        if (start > todayTime || end < start) return;

        const taskDuration = end - start;
        const elapsed = todayTime - start;
        const expectedProgress = Math.min(100, (elapsed / taskDuration) * 100);
        const actualProgress = row.percentComplete || 0;
        const deviation = actualProgress - expectedProgress;

        // Convert deviation to time offset (max +/- 7 days)
        const maxOffset = 7 * 24 * 60 * 60 * 1000;
        const timeOffset = (deviation / 100) * maxOffset;
        const xPos = todayTime + timeOffset;

        inazumaPoints.push([xPos, idx]);
      });
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(22, 27, 34, 0.95)',
        borderColor: 'var(--border-color)',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          if (params.seriesName === 'Tasks' && params.data?.row) {
            const r = params.data.row;
            const slipped = r.baselineEnd && new Date(r.baselineEnd) < new Date(r.endDate);
            return `<strong>${r.name}</strong><br/>
              WBS: ${r.wbsCode || '-'}<br/>
              ${r.startDate} - ${r.endDate}<br/>
              Progress: ${r.percentComplete || 0}%<br/>
              ${r.baselineHours ? `Baseline: ${r.baselineHours}h | ` : ''}${r.actualHours ? `Actual: ${r.actualHours}h` : ''}<br/>
              ${r.isCritical ? '<span style="color:#EF4444">CRITICAL PATH</span>' : ''}
              ${slipped ? '<span style="color:#F59E0B">SLIPPED FROM BASELINE</span>' : ''}`;
          }
          return '';
        }
      },
      grid: {
        left: 350,
        right: 50,
        top: 40,
        bottom: 60,
        containLabel: false
      },
      xAxis: {
        type: 'time',
        min: minDate.getTime(),
        max: maxDate.getTime(),
        axisLabel: {
          color: 'var(--text-muted)',
          fontSize: 10,
          formatter: (value: number) => {
            const d = new Date(value);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }
        },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } }
      },
      yAxis: {
        type: 'category',
        data: categories,
        inverse: true,
        axisLabel: {
          color: 'var(--text-primary)',
          fontSize: 10,
          width: 340,
          overflow: 'truncate',
          align: 'left',
          formatter: (value: string) => value
        },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
        splitLine: { show: false }
      },
      dataZoom: [
        { type: 'slider', xAxisIndex: 0, height: 20, bottom: 10, borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' },
        { type: 'inside', xAxisIndex: 0 },
        { type: 'slider', yAxisIndex: 0, width: 20, right: 10, borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-tertiary)' },
        { type: 'inside', yAxisIndex: 0 }
      ],
      series: [
        // Baseline bars (rendered first, behind)
        {
          name: 'Baseline',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const idx = api.value(0);
            const start = api.coord([api.value(1), idx]);
            const end = api.coord([api.value(2), idx]);
            const height = 8;
            const y = start[1] + 8; // Below main bar

            return {
              type: 'rect',
              shape: { x: start[0], y: y, width: end[0] - start[0], height: height },
              style: api.style()
            };
          },
          encode: { x: [1, 2], y: 0 },
          data: baselineData,
          z: 1
        },
        // Task bars
        {
          name: 'Tasks',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const idx = api.value(0);
            const start = api.coord([api.value(1), idx]);
            const end = api.coord([api.value(2), idx]);
            const height = 16;
            const y = start[1] - height / 2;

            return {
              type: 'rect',
              shape: { x: start[0], y: y, width: Math.max(end[0] - start[0], 2), height: height, r: 3 },
              style: api.style()
            };
          },
          encode: { x: [1, 2], y: 0 },
          data: taskData,
          z: 2
        },
        // Progress fill
        {
          name: 'Progress',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const idx = api.value(0);
            const start = api.coord([api.value(1), idx]);
            const end = api.coord([api.value(2), idx]);
            const height = 16;
            const y = start[1] - height / 2;

            return {
              type: 'rect',
              shape: { x: start[0], y: y, width: Math.max(end[0] - start[0], 1), height: height, r: 3 },
              style: api.style()
            };
          },
          encode: { x: [1, 2], y: 0 },
          data: progressData,
          z: 3
        },
        // Milestones
        {
          name: 'Milestones',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const idx = api.value(0);
            const pos = api.coord([api.value(1), idx]);

            return {
              type: 'path',
              shape: {
                pathData: 'M0,-8 L6,0 L0,8 L-6,0 Z',
                x: pos[0],
                y: pos[1]
              },
              style: { fill: '#EF4444' }
            };
          },
          encode: { x: 1, y: 0 },
          data: milestoneData,
          z: 4
        },
        // Today line
        {
          name: 'Today',
          type: 'custom',
          renderItem: (params: any, api: any) => {
            const todayX = api.coord([today.getTime(), 0])[0];
            const height = api.getHeight();

            return {
              type: 'group',
              children: [
                {
                  type: 'line',
                  shape: { x1: todayX, y1: 0, x2: todayX, y2: height },
                  style: { stroke: '#40E0D0', lineWidth: 2, lineDash: [4, 4] }
                },
                {
                  type: 'text',
                  style: {
                    text: 'TODAY',
                    x: todayX + 4,
                    y: 20,
                    fill: '#40E0D0',
                    fontSize: 10,
                    fontWeight: 'bold'
                  }
                }
              ]
            };
          },
          data: [{ value: [0] }],
          z: 10
        },
        // Dependency arrows
        {
          name: 'Dependencies',
          type: 'lines',
          coordinateSystem: 'cartesian2d',
          polyline: false,
          lineStyle: { curveness: 0.3 },
          effect: { show: false },
          symbol: ['none', 'arrow'],
          symbolSize: 8,
          data: dependencyLines,
          z: 5
        },
        // Inazuma line
        ...(showInazuma && inazumaPoints.length > 1 ? [{
          name: 'Inazuma',
          type: 'line',
          smooth: false,
          lineStyle: { color: '#EF4444', width: 3 },
          symbol: 'none',
          data: inazumaPoints,
          z: 15
        }] : [])
      ],
      // Mark today with vertical line using graphic
      graphic: [
        {
          type: 'line',
          left: 'center',
          shape: { x1: 0, y1: 0, x2: 0, y2: 0 },
          invisible: true
        }
      ]
    };
  }, [flatRows, minDate, maxDate, today, showBaseline, showDependencies, showInazuma]);

  // Handle chart click for expand/collapse
  const handleChartClick = useCallback((params: any) => {
    // Try to get row index from the click
    const idx = params.dataIndex ?? params.data?.value?.[0];
    if (idx !== null && idx !== undefined && flatRows[idx]?.hasChildren) {
      toggleExpand(flatRows[idx].id);
    }
  }, [flatRows, toggleExpand]);

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">WBS Gantt Chart</h1>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
            Apache ECharts | Dependencies | Baseline Ghost | Inazuma Progress Line
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', minWidth: '160px' }}>
            <input
              type="text"
              placeholder="Search WBS..."
              value={wbsSearchQuery}
              onChange={(e) => setWbsSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '0.4rem 0.6rem 0.4rem 2rem', fontSize: '0.8rem',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                borderRadius: '6px', color: 'var(--text-primary)', outline: 'none'
              }}
            />
            <svg viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          
          {/* Level Controls */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
            <button onClick={collapseAll} style={{ padding: '0.3rem 0.5rem', fontSize: '0.65rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>L0</button>
            <button onClick={() => collapseToLevel(2)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.65rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>L2</button>
            <button onClick={() => collapseToLevel(3)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.65rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>L3</button>
            <button onClick={expandAll} style={{ padding: '0.3rem 0.5rem', fontSize: '0.65rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>All</button>
          </div>
          
          <div style={{ width: '180px' }}>
            <SearchableDropdown options={projectOptions} value={selectedProjectId} onChange={setSelectedProjectId} placeholder="Select Project..." disabled={false} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={runCPM}>Run CPM</button>
        </div>
      </div>

      {/* Feature Toggles + Legend */}
      <div style={{ display: 'flex', gap: '1.5rem', padding: '0 1.5rem 0.75rem', fontSize: '0.7rem', color: '#888', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInazuma} onChange={(e) => setShowInazuma(e.target.checked)} style={{ accentColor: '#EF4444' }} />
          <span style={{ color: '#EF4444' }}>Inazuma Line</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} style={{ accentColor: '#6B7280' }} />
          <span>Baseline Ghost</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showDependencies} onChange={(e) => setShowDependencies(e.target.checked)} style={{ accentColor: '#40E0D0' }} />
          <span>Dependencies</span>
        </label>
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 14, height: 8, background: '#22C55E', borderRadius: 2 }}></div> 75-100%</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 14, height: 8, background: '#EAB308', borderRadius: 2 }}></div> 50-75%</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 14, height: 8, background: '#F97316', borderRadius: 2 }}></div> 25-50%</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 14, height: 8, background: '#EF4444', borderRadius: 2 }}></div> 0-25% / Critical</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 14, height: 6, background: 'rgba(107,114,128,0.4)', borderRadius: 2 }}></div> Baseline</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 2, height: 14, background: '#40E0D0' }}></div> Today</div>
        </div>
      </div>

      {/* CPM Results */}
      {cpmResult && (
        <div style={{
          display: 'flex', gap: '1rem', margin: '0 1.5rem 0.75rem',
          background: 'rgba(20, 20, 25, 0.95)', padding: '10px 16px', borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.08)', alignItems: 'center'
        }}>
          <div style={{ padding: '6px 14px', background: '#111', borderRadius: '8px', minWidth: '100px' }}>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Duration</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{cpmResult.projectDuration}d</div>
          </div>
          <div style={{ padding: '6px 14px', background: '#111', borderRadius: '8px', minWidth: '100px' }}>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#EF4444' }}>{cpmResult.stats.criticalTasksCount}</div>
          </div>
          <div style={{ padding: '6px 14px', background: '#111', borderRadius: '8px', minWidth: '100px' }}>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Float</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#40E0D0' }}>{cpmResult.stats.averageFloat.toFixed(1)}d</div>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => setCpmResult(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '22px', height: '22px', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>x</button>
        </div>
      )}

      {/* ECharts Gantt */}
      <div style={{ flex: 1, minHeight: 0, padding: '0 1.5rem 1.5rem' }}>
        <div style={{ height: '100%', minHeight: '500px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <ChartWrapper 
            option={chartOption} 
            height="100%" 
            onClick={handleChartClick}
          />
        </div>
      </div>
    </div>
  );
}
