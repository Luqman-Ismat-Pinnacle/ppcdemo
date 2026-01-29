'use client';

/**
 * @fileoverview Resourcing Page for PPC V3 Project Controls.
 * 
 * Enhanced resource allocation and utilization visualization with:
 * - Large, interactive resource heatmap with view toggles
 * - Resource Gantt chart with assignment timelines
 * - Expandable resource hierarchy
 * - Efficiency and utilization metrics
 * - Assigned vs Unassigned capacity views
 * - Employee vs Role grouping options
 * 
 * @module app/project-controls/resourcing/page
 */

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useData } from '@/lib/data-context';
import ResourceHeatmapChart from '@/components/charts/ResourceHeatmapChart';
import ResourceLevelingChart from '@/components/charts/ResourceLevelingChart';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import {
  DEFAULT_LEVELING_PARAMS,
  LEVELING_PARAM_LABELS,
  LevelingLogEntry,
  LevelingNumericParam,
  LevelingParams,
  deriveLevelingInputs,
  runResourceLeveling
} from '@/lib/resource-leveling-engine';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';

type GanttInterval = 'week' | 'month' | 'quarter' | 'year';
type GanttGroupBy = 'employee' | 'role';

export default function ResourcingPage() {
  const { filteredData } = useData();
  const data = filteredData;

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [ganttInterval, setGanttInterval] = useState<GanttInterval>('week');
  const [ganttGroupBy, setGanttGroupBy] = useState<GanttGroupBy>('employee');
  const containerRef = useRef<HTMLDivElement>(null);
  const [topDelaysSort, setTopDelaysSort] = useState<SortState | null>(null);
  const [resourceGanttSort, setResourceGanttSort] = useState<SortState | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('All');

  // Derive unique roles
  const uniqueRoles = useMemo(() => {
    if (!data.employees) return ['All'];
    const roles = new Set<string>(['All']);
    data.employees.forEach(e => {
      if (e.jobTitle) roles.add(e.jobTitle);
    });
    return Array.from(roles).sort();
  }, [data.employees]);

  // Filter Heatmap Data
  const filteredHeatmapData = useMemo(() => {
    if (roleFilter === 'All' || !data.resourceHeatmap) return data.resourceHeatmap;

    const indices: number[] = [];
    data.resourceHeatmap.resources.forEach((name, i) => {
      const emp = data.employees.find(e => e.name === name || e.name.toLowerCase() === name.toLowerCase());
      // If employee not found or role matches, keep it. 
      // If logic is strict "Filter Roles", we should only keep matching roles.
      if (emp && emp.jobTitle === roleFilter) {
        indices.push(i);
      }
    });

    return {
      resources: indices.map(i => data.resourceHeatmap.resources[i]),
      weeks: data.resourceHeatmap.weeks,
      data: indices.map(i => data.resourceHeatmap.data[i])
    };
  }, [data.resourceHeatmap, roleFilter, data.employees]);

  const [levelingParams, setLevelingParams] = useState<LevelingParams>(DEFAULT_LEVELING_PARAMS);
  const [levelingLog, setLevelingLog] = useState<LevelingLogEntry[]>([
    {
      timestamp: new Date().toISOString(),
      type: 'leveling',
      message: 'Resource leveling engine initialized with default parameters',
      params: { ...DEFAULT_LEVELING_PARAMS }
    }
  ]);
  const [isLevelingParamsOpen, setIsLevelingParamsOpen] = useState(false);
  const [editingLevelingParam, setEditingLevelingParam] = useState<LevelingNumericParam | null>(null);
  const [isLevelingRunning, setIsLevelingRunning] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Use actual current date
  const today = useMemo(() => new Date(), []);

  // Calculate date range from resource data
  const { projectStart, projectEnd } = useMemo(() => {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    const findDateRange = (items: any[]) => {
      items.forEach(item => {
        if (item.startDate) {
          const start = new Date(item.startDate);
          if (!minDate || start < minDate) minDate = start;
        }
        if (item.endDate) {
          const end = new Date(item.endDate);
          if (!maxDate || end > maxDate) maxDate = end;
        }
        if (item.children) findDateRange(item.children);
      });
    };

    if (data.resourceGantt?.items) findDateRange(data.resourceGantt.items);

    // Default fallback if no dates found
    const defaultStart = new Date();
    defaultStart.setMonth(defaultStart.getMonth() - 3);
    const defaultEnd = new Date();
    defaultEnd.setMonth(defaultEnd.getMonth() + 6);

    return {
      projectStart: minDate || defaultStart,
      projectEnd: maxDate || defaultEnd
    };
  }, [data.resourceGantt?.items]);

  const levelingInputs = useMemo(() => deriveLevelingInputs(data, levelingParams), [data, levelingParams]);
  const levelingResult = useMemo(() => (
    runResourceLeveling(
      levelingInputs.tasks,
      levelingInputs.resources,
      levelingInputs.project,
      levelingParams,
      levelingInputs.warnings
    )
  ), [levelingInputs, levelingParams]);

  const levelingParamKeys = Object.keys(LEVELING_PARAM_LABELS) as LevelingNumericParam[];

  const updateLevelingParam = useCallback((key: LevelingNumericParam, value: number) => {
    setLevelingParams(prev => ({ ...prev, [key]: value }));
    const logEntry: LevelingLogEntry = {
      timestamp: new Date().toISOString(),
      type: 'update',
      message: `Parameter "${key}" updated to ${value}`,
      params: { [key]: value } as Partial<LevelingParams>
    };
    setLevelingLog(prev => [logEntry, ...prev].slice(0, 50));
    setEditingLevelingParam(null);
  }, []);

  const toggleLevelingFlag = useCallback((key: 'preferSingleResource' | 'allowSplits' | 'workdaysOnly') => {
    setLevelingParams(prev => {
      const nextValue = !prev[key];
      const logEntry: LevelingLogEntry = {
        timestamp: new Date().toISOString(),
        type: 'update',
        message: `${key} set to ${nextValue ? 'on' : 'off'}`,
        params: { [key]: nextValue } as Partial<LevelingParams>
      };
      setLevelingLog(log => [logEntry, ...log].slice(0, 50));
      return { ...prev, [key]: nextValue };
    });
  }, []);

  const runLevelingEngine = useCallback(() => {
    setIsLevelingRunning(true);
    setTimeout(() => {
      const summary = levelingResult.summary;
      const logEntry: LevelingLogEntry = {
        timestamp: new Date().toISOString(),
        type: 'leveling',
        message: `Leveling run complete (${summary.scheduledTasks}/${summary.totalTasks} tasks scheduled)`,
        params: { ...levelingParams },
        results: {
          scheduledTasks: summary.scheduledTasks,
          maxDelayDays: summary.maxDelayDays,
          avgUtilization: summary.averageUtilization
        }
      };
      setLevelingLog(prev => [logEntry, ...prev].slice(0, 50));
      setIsLevelingRunning(false);
    }, 500);
  }, [levelingParams, levelingResult.summary]);

  // Build "By Role" grouped data
  const groupedByRole = useMemo(() => {
    if (!data.resourceGantt?.items?.length) return [];

    const roleMap = new Map<string, any[]>();

    data.resourceGantt.items.forEach((item: any) => {
      const role = item.role || 'Unassigned';
      if (!roleMap.has(role)) {
        roleMap.set(role, []);
      }
      roleMap.get(role)!.push(item);
    });

    return Array.from(roleMap.entries()).map(([role, employees]) => ({
      id: `role-${role}`,
      name: role,
      type: 'role',
      role: role,
      startDate: employees.reduce((min: string, e: any) => (!min || e.startDate < min) ? e.startDate : min, ''),
      endDate: employees.reduce((max: string, e: any) => (!max || e.endDate > max) ? e.endDate : max, ''),
      utilization: Math.round(employees.reduce((sum: number, e: any) => sum + (e.utilization || 0), 0) / employees.length),
      efficiency: Math.round(employees.reduce((sum: number, e: any) => sum + (e.efficiency || 100), 0) / employees.length),
      children: employees
    }));
  }, [data.resourceGantt?.items]);

  // Get items based on group-by selection
  const ganttItems = useMemo(() => {
    let items: any[] = ganttGroupBy === 'role' ? groupedByRole : (data.resourceGantt?.items || []);

    if (roleFilter !== 'All') {
      items = items.filter(item => {
        // Since we don't have direct role prop on all items, we rely on name or lookup
        // But buildResourceGantt adds 'role' prop to resource items!
        // For task items (children), we should keep them if parent matches.
        // But this is a flat filter on the root items list (which are resources).

        // If grouped by role, items are Role Groups. 
        if (ganttGroupBy === 'role') {
          return item.name === roleFilter;
        } else {
          // Grouped by employee
          // Check item.role (added in buildResourceGantt)
          // Or check if employee jobTitle matches
          const emp = data.employees?.find(e => e.name === item.name);
          return ((item as any).role === roleFilter) || (emp && emp.jobTitle === roleFilter);
        }
      });
    }

    return items;
  }, [ganttGroupBy, groupedByRole, data.resourceGantt?.items, roleFilter, data.employees]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedIds(newExpanded);
  };

  // Generate Date Columns based on interval with 5 column buffer
  const dateColumns = useMemo(() => {
    const columns: { start: Date; end: Date; label: string }[] = [];
    const bufferStart = new Date(projectStart);
    const bufferEnd = new Date(projectEnd);
    let current = new Date(bufferStart);
    const bufferPeriods = 5;

    switch (ganttInterval) {
      case 'week': {
        bufferStart.setDate(bufferStart.getDate() - (7 * bufferPeriods));
        bufferEnd.setDate(bufferEnd.getDate() + (7 * bufferPeriods));

        const day = current.getDay();
        const diff = current.getDate() - day + (day === 0 ? -6 : 1);
        current = new Date(current.setDate(diff));
        current.setDate(current.getDate() - (7 * bufferPeriods));

        while (current <= bufferEnd) {
          const end = new Date(current);
          end.setDate(end.getDate() + 6);
          columns.push({
            start: new Date(current),
            end,
            label: `${current.getMonth() + 1}/${current.getDate()}`
          });
          current.setDate(current.getDate() + 7);
        }
        break;
      }
      case 'month': {
        bufferStart.setMonth(bufferStart.getMonth() - bufferPeriods);
        bufferEnd.setMonth(bufferEnd.getMonth() + bufferPeriods);

        current = new Date(bufferStart.getFullYear(), bufferStart.getMonth(), 1);
        while (current <= bufferEnd) {
          const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
          columns.push({
            start: new Date(current),
            end,
            label: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          });
          current.setMonth(current.getMonth() + 1);
        }
        break;
      }
      case 'quarter': {
        bufferStart.setMonth(bufferStart.getMonth() - (3 * bufferPeriods));
        bufferEnd.setMonth(bufferEnd.getMonth() + (3 * bufferPeriods));

        const startQuarter = Math.floor(bufferStart.getMonth() / 3);
        current = new Date(bufferStart.getFullYear(), startQuarter * 3, 1);
        while (current <= bufferEnd) {
          const quarterNum = Math.floor(current.getMonth() / 3) + 1;
          const end = new Date(current.getFullYear(), current.getMonth() + 3, 0);
          columns.push({
            start: new Date(current),
            end,
            label: `Q${quarterNum} ${current.getFullYear().toString().slice(-2)}`
          });
          current.setMonth(current.getMonth() + 3);
        }
        break;
      }
      case 'year': {
        bufferStart.setFullYear(bufferStart.getFullYear() - bufferPeriods);
        bufferEnd.setFullYear(bufferEnd.getFullYear() + bufferPeriods);

        current = new Date(bufferStart.getFullYear(), 0, 1);
        while (current <= bufferEnd) {
          const end = new Date(current.getFullYear(), 11, 31);
          columns.push({
            start: new Date(current),
            end,
            label: current.getFullYear().toString()
          });
          current.setFullYear(current.getFullYear() + 1);
        }
        break;
      }
    }
    return columns;
  }, [ganttInterval, projectStart, projectEnd]);

  const sortedGanttItems = useMemo(() => {
    if (!resourceGanttSort) return ganttItems;

    const getOverlapMs = (start: Date, end: Date, colStart: Date, colEnd: Date) => {
      const rangeStart = start > colStart ? start : colStart;
      const rangeEnd = end < colEnd ? end : colEnd;
      const overlap = rangeEnd.getTime() - rangeStart.getTime();
      return overlap > 0 ? overlap : 0;
    };

    const getSortValue = (item: any, key: string) => {
      if (key.startsWith('period-')) {
        const index = Number(key.replace('period-', ''));
        const column = dateColumns[index];
        if (!column || !item.startDate || !item.endDate) return null;
        const itemStart = new Date(item.startDate);
        const itemEnd = new Date(item.endDate);
        return getOverlapMs(itemStart, itemEnd, column.start, column.end);
      }
      switch (key) {
        case 'name':
          return item.name;
        case 'utilization':
          return item.utilization ?? null;
        case 'efficiency':
          return item.efficiency ?? null;
        default:
          return null;
      }
    };

    const sortItems = (items: any[]): any[] => {
      const sorted = sortByState(items, resourceGanttSort, getSortValue);
      return sorted.map((item) => (
        item.children ? { ...item, children: sortItems(item.children) } : item
      ));
    };

    return sortItems(ganttItems);
  }, [ganttItems, resourceGanttSort, dateColumns]);

  // Flatten hierarchical resourcing data
  const flatResourceItems = useMemo(() => {
    const flatItems: any[] = [];
    const flatten = (items: any[], level = 0, parentId: string | null = null) => {
      items.forEach((item, index) => {
        const id = item.id || `${parentId || 'root'}-${item.name}-${index}`;
        const isExpanded = expandedIds.has(id);
        const hasChildren = item.children && item.children.length > 0;

        flatItems.push({ ...item, id, level, hasChildren, isExpanded });

        if (hasChildren && isExpanded) {
          flatten(item.children, level + 1, id);
        }
      });
    };
    flatten(sortedGanttItems);
    return flatItems;
  }, [sortedGanttItems, expandedIds]);

  // Get column width based on interval
  const columnWidth = useMemo(() => {
    switch (ganttInterval) {
      case 'week': return 40;
      case 'month': return 80;
      case 'quarter': return 120;
      case 'year': return 200;
    }
  }, [ganttInterval]);

  // Find the "today" column index
  const todayColumnIndex = useMemo(() => {
    return dateColumns.findIndex(col => today >= col.start && today <= col.end);
  }, [dateColumns, today]);

  // Scroll to today - centers today column in the view
  const scrollToToday = () => {
    if (!containerRef.current || todayColumnIndex < 0) return;
    const fixedColsWidth = 220 + 70 + 70; // Resource/Task + Util% + Eff%
    const viewportWidth = containerRef.current.clientWidth - fixedColsWidth;
    const todayPosition = (todayColumnIndex * columnWidth) + (columnWidth / 2);
    const scrollX = todayPosition - (viewportWidth / 2) + fixedColsWidth;
    containerRef.current.scrollTo({
      left: Math.max(0, scrollX),
      behavior: 'smooth'
    });
  };

  // Expand All resources
  const expandAll = () => {
    const allIds = new Set<string>();

    const collectIds = (items: any[], parentId: string | null = null) => {
      items.forEach((item, index) => {
        const id = item.id || `${parentId || 'root'}-${item.name}-${index}`;
        if (item.children && item.children.length > 0) {
          allIds.add(id);
          collectIds(item.children, id);
        }
      });
    };

    if (ganttItems.length > 0) collectIds(ganttItems);
    setExpandedIds(allIds);
  };

  // Collapse All
  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Calculate bar position for a date range
  const getBarPosition = (itemStart: Date, itemEnd: Date, colStart: Date, colEnd: Date) => {
    const colDuration = colEnd.getTime() - colStart.getTime();
    const overlapStart = Math.max(itemStart.getTime(), colStart.getTime());
    const overlapEnd = Math.min(itemEnd.getTime(), colEnd.getTime());

    const left = ((overlapStart - colStart.getTime()) / colDuration) * 100;
    const width = ((overlapEnd - overlapStart) / colDuration) * 100;

    return { left, width };
  };

  const topDelays = useMemo(() => levelingResult.delayedTasks.slice(0, 5), [levelingResult.delayedTasks]);
  const sortedTopDelays = useMemo(() => {
    return sortByState(topDelays, topDelaysSort, (task, key) => {
      switch (key) {
        case 'task':
          return task.name;
        case 'delayDays':
          return task.delayDays;
        case 'importance':
          return task.importance;
        default:
          return null;
      }
    });
  }, [topDelays, topDelaysSort]);

  const formatNumericValue = (value: number | null | undefined, digits = 2) => {
    if (value == null || Number.isNaN(value)) return '--';
    return value.toFixed(digits);
  };

  const formatPercentValue = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return '--';
    return `${value.toFixed(0)}%`;
  };

  const formatQty = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return '--';
    return value.toLocaleString();
  };

  const formatTime = (value: string | undefined) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' });
  };

  const taskProductivity = data.taskProductivity || [];
  const phaseProductivity = data.phaseProductivity || [];
  const projectProductivity = data.projectProductivity || [];

  const sortedProductivityTasks = useMemo(() => {
    return [...taskProductivity].sort((a, b) => (b.productivityVariance ?? 0) - (a.productivityVariance ?? 0));
  }, [taskProductivity]);

  const topProductivityTasks = sortedProductivityTasks.slice(0, 6);
  const highlightPhaseProductivity = phaseProductivity.slice(0, 3);
  const highlightProjectProductivity = projectProductivity.slice(0, 3);

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minHeight: 'calc(100vh - 100px)', overflow: 'auto' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Resourcing</h1>
        </div>
      </div>

      {/* Resource Leveling Engine */}
      <div className="chart-card" style={{ flex: '0 0 auto' }}>
        <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <path d="M3 3h6l2 4h10v10a4 4 0 01-4 4H7a4 4 0 01-4-4V3z"></path>
              <path d="M7 14h10"></path>
              <path d="M7 10h6"></path>
            </svg>
            Resource Leveling Engine
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setIsLevelingParamsOpen(!isLevelingParamsOpen)}
            >
              Engine Parameters
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={runLevelingEngine}
              disabled={isLevelingRunning}
              style={{ minWidth: '120px' }}
            >
              {isLevelingRunning ? 'Running...' : 'Run Leveling'}
            </button>
          </div>
        </div>
        <div className="chart-card-body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
            <EnhancedTooltip content={{ title: 'Total Tasks', description: 'Total number of tasks considered for leveling.', calculation: 'Count of all tasks in the scope' }}>
              <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Total Tasks</div>
                <div className="metric-value">{levelingResult.summary.totalTasks}</div>
              </div>
            </EnhancedTooltip>
            <EnhancedTooltip content={{ title: 'Scheduled', description: 'Tasks successfully scheduled within constraints.', calculation: 'Total Tasks - Unscheduled Tasks' }}>
              <div className="metric-card accent-teal">
                <div className="metric-label">Scheduled</div>
                <div className="metric-value">{levelingResult.summary.scheduledTasks}</div>
              </div>
            </EnhancedTooltip>
            <EnhancedTooltip content={{ title: 'Unscheduled', description: 'Tasks that could not be scheduled due to conflicts or constraints.', details: ['Check "Scheduling Issues" below for reasons'] }}>
              <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Unscheduled</div>
                <div className="metric-value" style={{ color: levelingResult.errors.length > 0 ? '#EF4444' : 'var(--text-primary)' }}>
                  {levelingResult.errors.length}
                </div>
              </div>
            </EnhancedTooltip>
            <EnhancedTooltip content={{ title: 'Avg Utilization', description: 'Average resource utilization across the project duration.', calculation: 'Sum(Daily Utilization) / Total Days' }}>
              <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Avg Utilization</div>
                <div className="metric-value">{levelingResult.summary.averageUtilization.toFixed(0)}%</div>
              </div>
            </EnhancedTooltip>
            <EnhancedTooltip content={{ title: 'Peak Utilization', description: 'Highest recorded utilization percentage on any single day.', details: ['Identify bottleneck periods'] }}>
              <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Peak Utilization</div>
                <div className="metric-value">{levelingResult.summary.peakUtilization.toFixed(0)}%</div>
              </div>
            </EnhancedTooltip>
            <EnhancedTooltip content={{ title: 'Max Delay', description: 'Maximum number of days any task was delayed by leveling.', details: ['Shows impact on schedule timeline'] }}>
              <div className="metric-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                <div className="metric-label">Max Delay</div>
                <div className="metric-value">{levelingResult.summary.maxDelayDays} days</div>
              </div>
            </EnhancedTooltip>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Scheduling window: {hasMounted ? `${levelingResult.projectWindow.startDate} to ${levelingResult.projectWindow.endDate}` : 'Calculating...'}
          </div>

          {levelingInputs.warnings.length > 0 && (
            <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#F59E0B', marginBottom: '6px' }}>Input Warnings</div>
              {levelingInputs.warnings.slice(0, 3).map((warning, idx) => (
                <div key={idx} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{warning}</div>
              ))}
            </div>
          )}

          {levelingResult.errors.length > 0 && (
            <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#EF4444', marginBottom: '6px' }}>Scheduling Issues</div>
              {levelingResult.errors.slice(0, 3).map((error, idx) => (
                <div key={idx} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                  {error.name}: {error.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Resource Leveling View - Quarterly Table and Monthly Chart */}
      <div className="chart-card grid-full" style={{ marginTop: '2rem' }}>
        <div className="chart-card-header">
          <h3 className="chart-card-title">Project Resource Leveling</h3>
        </div>
        <div className="chart-card-body">
          {/* Quarterly Summary Table */}
          {data.resourceLeveling && data.resourceLeveling.quarterly && data.resourceLeveling.quarterly.length > 0 ? (
            <div style={{ marginBottom: '2rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>by Quarter</h4>
              <table className="data-table" style={{ width: '100%', marginBottom: '1rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Metric</th>
                    {data.resourceLeveling.quarterly.map((q, idx) => (
                      <th key={idx} style={{ textAlign: 'right' }}>{q.quarterLabel}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>
                      <EnhancedTooltip content={{ title: 'Total Project Hours', description: 'Sum of all hours assigned to tasks in this quarter.', calculation: 'Σ (Task Hours)' }}>
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Total Project Hours</span>
                      </EnhancedTooltip>
                    </td>
                    {data.resourceLeveling.quarterly.map((q, idx) => (
                      <td key={idx} style={{ textAlign: 'right' }}>{q.totalProjectHours.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>
                      <EnhancedTooltip content={{ title: 'Projected FTE Utilization', description: 'Full-Time Equivalent resources utilized.', calculation: 'Total Hours / (Working Days × 8)' }}>
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Projected FTE Utilization</span>
                      </EnhancedTooltip>
                    </td>
                    {data.resourceLeveling.quarterly.map((q, idx) => (
                      <td key={idx} style={{ textAlign: 'right' }}>{q.projectedFTEUtilization.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>
                      <EnhancedTooltip content={{ title: 'Variance', description: 'Difference between Available Capacity and Requested Hours.', calculation: 'Capacity - Requested' }}>
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Variance</span>
                      </EnhancedTooltip>
                    </td>
                    {data.resourceLeveling.quarterly.map((q, idx) => (
                      <td key={idx} style={{ textAlign: 'right', color: q.variance < 0 ? '#F59E0B' : q.variance > 0 ? '#E91E63' : 'var(--text-primary)' }}>
                        {q.variance > 0 ? '+' : ''}{q.variance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>
                      <EnhancedTooltip content={{ title: 'Variance %', description: 'Percentage variance from capacity.', calculation: '(Variance / Capacity) × 100' }}>
                        <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Variance %</span>
                      </EnhancedTooltip>
                    </td>
                    {data.resourceLeveling.quarterly.map((q, idx) => {
                      const bgColor = q.variancePercent < -10 ? 'rgba(245, 158, 11, 0.2)' :
                        q.variancePercent > 10 ? 'rgba(233, 30, 99, 0.2)' :
                          'rgba(16, 185, 129, 0.2)';
                      const textColor = q.variancePercent < -10 ? '#F59E0B' :
                        q.variancePercent > 10 ? '#E91E63' :
                          '#10B981';
                      return (
                        <td key={idx} style={{ textAlign: 'right', background: bgColor, color: textColor, fontWeight: 600 }}>
                          {q.variancePercent > 0 ? '+' : ''}{q.variancePercent.toFixed(0)}%
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #F59E0B' }}></span>
                  risk of under utilization
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'rgba(233, 30, 99, 0.2)', border: '1px solid #E91E63' }}></span>
                  risk of over utilization
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ display: 'inline-block', width: '12px', height: '12px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10B981' }}></span>
                  within 10%
                </span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No quarterly data available
            </div>
          )}

          {/* Monthly Bar Chart */}
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-primary)' }}>Monthly View</h4>
            <ResourceLevelingChart data={data.resourceLeveling || { monthly: [], quarterly: [] }} height="400px" />
          </div>
        </div>
      </div>

      {isLevelingParamsOpen && (
        <div className="chart-card" style={{ background: 'rgba(64, 224, 208, 0.05)', flexShrink: 0 }}>
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
                <line x1="1" y1="14" x2="7" y2="14"></line>
                <line x1="9" y1="8" x2="15" y2="8"></line>
                <line x1="17" y1="16" x2="23" y2="16"></line>
              </svg>
              Engine Parameters
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {(['preferSingleResource', 'allowSplits', 'workdaysOnly'] as const).map(flag => (
                <button
                  key={flag}
                  onClick={() => toggleLevelingFlag(flag)}
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    background: levelingParams[flag] ? 'var(--pinnacle-teal)' : 'transparent',
                    color: levelingParams[flag] ? '#000' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {flag.replace(/([A-Z])/g, ' $1')}
                </button>
              ))}
            </div>
          </div>
          <div className="chart-card-body" style={{ padding: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {levelingParamKeys.map(key => {
                const config = LEVELING_PARAM_LABELS[key];
                const isEditing = editingLevelingParam === key;

                return (
                  <div
                    key={key}
                    style={{
                      padding: '1rem',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '10px',
                      border: isEditing ? '2px solid var(--pinnacle-teal)' : '1px solid var(--border-color)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        marginBottom: '0.5rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: 600,
                        cursor: 'help'
                      }}
                      title={config.description}
                    >
                      {config.label}
                    </div>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="number"
                          value={levelingParams[key]}
                          onChange={(e) => setLevelingParams({ ...levelingParams, [key]: parseFloat(e.target.value) })}
                          min={config.min}
                          max={config.max}
                          step={config.step}
                          style={{
                            width: '90px',
                            padding: '0.4rem 0.6rem',
                            fontSize: '0.9rem',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--pinnacle-teal)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            outline: 'none'
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => updateLevelingParam(key, levelingParams[key])}
                          style={{
                            padding: '0.4rem 0.75rem',
                            fontSize: '0.75rem',
                            background: 'var(--pinnacle-teal)',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#000',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingLevelingParam(null)}
                          style={{
                            padding: '0.4rem 0.75rem',
                            fontSize: '0.75rem',
                            background: 'var(--bg-hover)',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => setEditingLevelingParam(key)}
                        style={{
                          fontSize: '1.5rem',
                          fontWeight: 700,
                          color: 'var(--pinnacle-teal)',
                          cursor: 'pointer'
                        }}
                      >
                        {levelingParams[key]}
                      </div>
                    )}
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      {config.description}
                    </div>
                    <input
                      type="range"
                      min={config.min}
                      max={config.max}
                      step={config.step}
                      value={levelingParams[key]}
                      onChange={(e) => setLevelingParams({ ...levelingParams, [key]: parseFloat(e.target.value) })}
                      style={{ width: '100%', marginTop: '8px', accentColor: 'var(--pinnacle-teal)' }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <h3 className="chart-card-title">Top Delays</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ maxHeight: '240px', overflow: 'auto' }}>
            {topDelays.length === 0 ? (
              <div style={{ padding: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                No delayed tasks detected.
              </div>
            ) : (
              <table className="data-table" style={{ fontSize: '0.75rem' }}>
                <thead>
                  <tr>
                    {[
                      { key: 'task', label: 'Task', align: 'left' as const },
                      { key: 'delayDays', label: 'Delay', align: 'center' as const },
                      { key: 'importance', label: 'Importance', align: 'center' as const },
                    ].map(({ key, label, align }) => {
                      const indicator = formatSortIndicator(topDelaysSort, key);
                      return (
                        <th key={key} style={{ textAlign: align }}>
                          <button
                            type="button"
                            onClick={() => setTopDelaysSort(prev => getNextSortState(prev, key))}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              color: 'inherit',
                              cursor: 'pointer',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {label}
                            {indicator && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{indicator}</span>}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedTopDelays.map(task => (
                    <tr key={task.taskId}>
                      <td>{task.name}</td>
                      <td style={{ textAlign: 'center' }}>{task.delayDays}d</td>
                      <td style={{ textAlign: 'center' }}>{task.importance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Engine Log</h3>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '12px' }}>
              {levelingLog.length} entries
            </span>
          </div>
          <div className="chart-card-body no-padding" style={{ maxHeight: '240px', overflow: 'auto' }}>
            <div style={{ padding: '0.5rem' }}>
              {levelingLog.map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '0.75rem',
                    borderBottom: idx < levelingLog.length - 1 ? '1px solid var(--border-color)' : 'none',
                    fontSize: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{
                      color: entry.type === 'leveling' ? 'var(--pinnacle-teal)' : entry.type === 'update' ? 'var(--pinnacle-lime)' : '#F59E0B',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      fontSize: '0.65rem',
                      letterSpacing: '0.05em'
                    }}>
                      {entry.type}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                      {hasMounted ? formatTime(entry.timestamp) : '--:--:--'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>{entry.message}</div>
                  {entry.results && (
                    <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.7rem', display: 'flex', gap: '12px' }}>
                      <span>Scheduled: <strong style={{ color: 'var(--pinnacle-teal)' }}>{entry.results.scheduledTasks}</strong></span>
                      <span>Delay: <strong style={{ color: '#F59E0B' }}>{entry.results.maxDelayDays}d</strong></span>
                      <span>Avg Util: <strong>{entry.results.avgUtilization.toFixed(0)}%</strong></span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="chart-card-title">Productivity Snapshot</h3>
        </div>
        <div className="chart-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: '100%', fontSize: '0.75rem' }}>
              <thead>
                <tr>
                  {['Task', 'Baseline', 'Actual', 'Completed', 'UOM', 'Hrs/Unit', 'Prod Var', 'Performing %'].map(label => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topProductivityTasks.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', fontSize: '0.75rem' }}>No productivity data available</td>
                  </tr>
                )}
                {topProductivityTasks.map(task => (
                  <tr key={task.taskId}>
                    <td>{task.taskName}</td>
                    <td>{formatQty(task.baselineQty)}</td>
                    <td>{formatQty(task.actualQty)}</td>
                    <td>{formatQty(task.completedQty)}</td>
                    <td>{task.uom || '--'}</td>
                    <td>{formatNumericValue(task.hrsPerUnit)}</td>
                    <td>{formatNumericValue(task.productivityVariance)}</td>
                    <td>{formatPercentValue(task.performingMetric)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Phase Productivity</div>
              <table className="data-table" style={{ fontSize: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Qty Rem</th>
                    <th>Hrs/Unit</th>
                    <th>Prod Var</th>
                    <th>Performing %</th>
                  </tr>
                </thead>
                <tbody>
                  {highlightPhaseProductivity.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center' }}>No phase data</td>
                    </tr>
                  )}
                  {highlightPhaseProductivity.map(phase => (
                    <tr key={phase.phaseId}>
                      <td>{phase.phaseName}</td>
                      <td>{formatQty(phase.qtyRemaining)}</td>
                      <td>{formatNumericValue(phase.hrsPerUnit)}</td>
                      <td>{formatNumericValue(phase.productivityVariance)}</td>
                      <td>{formatPercentValue(phase.performingMetric)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>Project Productivity</div>
              <table className="data-table" style={{ fontSize: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Qty Rem</th>
                    <th>Hrs/Unit</th>
                    <th>Prod Var</th>
                    <th>Performing %</th>
                  </tr>
                </thead>
                <tbody>
                  {highlightProjectProductivity.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center' }}>No project data</td>
                    </tr>
                  )}
                  {highlightProjectProductivity.map(project => (
                    <tr key={project.projectId}>
                      <td>{project.projectName}</td>
                      <td>{formatQty(project.qtyRemaining)}</td>
                      <td>{formatNumericValue(project.hrsPerUnit)}</td>
                      <td>{formatNumericValue(project.productivityVariance)}</td>
                      <td>{formatPercentValue(project.performingMetric)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Resource Heatmap - Full Width, Much Larger */}
      <div className="chart-card" style={{
        flex: '0 0 auto',
        minHeight: '700px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div className="chart-card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <rect x="7" y="7" width="3" height="3"></rect>
              <rect x="14" y="7" width="3" height="3"></rect>
              <rect x="7" y="14" width="3" height="3"></rect>
              <rect x="14" y="14" width="3" height="3"></rect>
            </svg>
            Resource Utilization Heatmap
          </h3>
        </div>
        <div className="chart-card-body" style={{ flex: 1, minHeight: 0, padding: '12px' }}>
          <ResourceHeatmapChart
            data={data.resourceHeatmap}
            employees={data.employees}
            height="100%"
            showControls={true}
          />
        </div>
      </div>

      {/* Resource Gantt Table - Much Larger */}
      <div className="chart-card" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', minHeight: '600px', overflow: 'hidden' }}>
        <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)' }}>
          <h3 className="chart-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--pinnacle-teal)" strokeWidth="2">
              <line x1="4" y1="9" x2="20" y2="9"></line>
              <line x1="4" y1="15" x2="20" y2="15"></line>
              <rect x="6" y="6" width="8" height="6" rx="1" fill="var(--pinnacle-teal)" opacity="0.3"></rect>
              <rect x="10" y="12" width="10" height="6" rx="1" fill="var(--pinnacle-teal)" opacity="0.3"></rect>
            </svg>
            Resource Gantt Chart
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Role Filter */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '3px' }}>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: '120px'
                }}
              >
                {uniqueRoles.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>

            {/* Group By Selector */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '3px' }}>
              {(['employee', 'role'] as GanttGroupBy[]).map(groupBy => (
                <button
                  key={groupBy}
                  onClick={() => { setGanttGroupBy(groupBy); setExpandedIds(new Set()); }}
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    background: ganttGroupBy === groupBy ? 'var(--pinnacle-teal)' : 'transparent',
                    color: ganttGroupBy === groupBy ? '#000' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textTransform: 'capitalize'
                  }}
                >
                  By {groupBy}
                </button>
              ))}
            </div>
            {/* Interval Selector */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '3px' }}>
              {(['week', 'month', 'quarter', 'year'] as GanttInterval[]).map(interval => (
                <button
                  key={interval}
                  onClick={() => setGanttInterval(interval)}
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    background: ganttInterval === interval ? 'var(--pinnacle-teal)' : 'transparent',
                    color: ganttInterval === interval ? '#000' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    textTransform: 'capitalize'
                  }}
                >
                  {interval}
                </button>
              ))}
            </div>
            <button
              onClick={scrollToToday}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.3rem 0.6rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12,6 12,12 16,14"></polyline>
              </svg>
              Today
            </button>
            <button
              onClick={collapseAll}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Collapse All
            </button>
            <button
              onClick={expandAll}
              style={{
                padding: '0.3rem 0.6rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              Expand All
            </button>
          </div>
        </div>
        <div
          className="chart-card-body no-padding"
          style={{ flex: 1, overflow: 'auto', position: 'relative' }}
          ref={containerRef}
        >
          <table
            className="wbs-table"
            style={{
              width: 'max-content',
              minWidth: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              // Limit width to actual content - prevent empty scroll space
              maxWidth: `${500 + (dateColumns.length * 40)}px`
            }}
          >
            <thead>
              <tr style={{ height: '36px' }}>
                <th style={{ width: '220px', position: 'sticky', left: 0, zIndex: 20, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => setResourceGanttSort(prev => getNextSortState(prev, 'name'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Resource / Task
                    {formatSortIndicator(resourceGanttSort, 'name') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(resourceGanttSort, 'name')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ width: '70px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setResourceGanttSort(prev => getNextSortState(prev, 'utilization'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Util%
                    {formatSortIndicator(resourceGanttSort, 'utilization') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(resourceGanttSort, 'utilization')}
                      </span>
                    )}
                  </button>
                </th>
                <th style={{ width: '70px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setResourceGanttSort(prev => getNextSortState(prev, 'efficiency'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    Eff%
                    {formatSortIndicator(resourceGanttSort, 'efficiency') && (
                      <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                        {formatSortIndicator(resourceGanttSort, 'efficiency')}
                      </span>
                    )}
                  </button>
                </th>
                {dateColumns.map((col, i) => {
                  const isCurrentPeriod = today >= col.start && today <= col.end;
                  return (
                    <th key={i} style={{
                      width: `${columnWidth}px`,
                      textAlign: 'center',
                      fontSize: '0.62rem',
                      borderLeft: '1px solid #333',
                      background: isCurrentPeriod ? 'rgba(64, 224, 208, 0.2)' : 'var(--bg-secondary)',
                      color: isCurrentPeriod ? 'var(--pinnacle-teal)' : 'inherit'
                    }}>
                      <button
                        type="button"
                        onClick={() => setResourceGanttSort(prev => getNextSortState(prev, `period-${i}`))}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          cursor: 'pointer',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: 'inherit',
                        }}
                      >
                        {col.label}
                        {formatSortIndicator(resourceGanttSort, `period-${i}`) && (
                          <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>
                            {formatSortIndicator(resourceGanttSort, `period-${i}`)}
                          </span>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {flatResourceItems.map((item) => {
                const efficiency = item.efficiency || 0;
                const utilColor = item.utilization != null
                  ? item.utilization > 110 ? '#ef4444' : item.utilization > 90 ? '#40E0D0' : '#CDDC39'
                  : 'inherit';

                const barColor = efficiency >= 100 ? '#40E0D0' : efficiency >= 90 ? '#CDDC39' : '#F59E0B';

                return (
                  <tr key={item.id} className={item.hasChildren ? 'rollup' : ''} style={{ height: '32px' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--bg-primary)', borderRight: '1px solid var(--border-color)' }}>
                      <div style={{ paddingLeft: `${item.level * 14}px`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {item.hasChildren && (
                          <button
                            onClick={() => toggleExpand(item.id)}
                            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '9px' }}
                          >
                            {item.isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span style={{ fontSize: '0.72rem', fontWeight: item.type === 'resource' ? 700 : 400 }}>{item.name}</span>
                      </div>
                    </td>
                    <td className="number" style={{ fontSize: '0.7rem', color: utilColor, textAlign: 'center' }}>{item.utilization != null ? `${item.utilization}%` : '-'}</td>
                    <td className="number" style={{ fontSize: '0.7rem', textAlign: 'center' }}>{item.efficiency != null ? `${Math.round(item.efficiency)}%` : '-'}</td>

                    {dateColumns.map((col, i) => {
                      const isCurrentPeriod = today >= col.start && today <= col.end;
                      const cellBg = isCurrentPeriod ? 'rgba(64, 224, 208, 0.05)' : 'transparent';

                      if (!item.startDate || !item.endDate) return <td key={i} style={{ borderLeft: '1px solid #222', background: cellBg }}></td>;

                      const itemStart = new Date(item.startDate);
                      const itemEnd = new Date(item.endDate);

                      if (itemStart <= col.end && itemEnd >= col.start) {
                        const { left, width } = getBarPosition(itemStart, itemEnd, col.start, col.end);

                        return (
                          <td key={i} style={{ position: 'relative', padding: 0, borderLeft: '1px solid #222', background: cellBg }}>
                            <div
                              title={`${item.name}\n${item.startDate} - ${item.endDate}\nUtilization: ${item.utilization || 0}%`}
                              style={{
                                position: 'absolute',
                                left: `${left}%`,
                                width: `${Math.max(width, 8)}%`,
                                height: '16px',
                                top: '8px',
                                background: barColor,
                                opacity: item.type === 'resource' ? 0.4 : 1,
                                borderRadius: '3px',
                                zIndex: 2
                              }}
                            />
                          </td>
                        );
                      }
                      return <td key={i} style={{ borderLeft: '1px solid #222', background: cellBg }}></td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
