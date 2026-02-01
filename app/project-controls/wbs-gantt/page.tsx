'use client';

/**
 * @fileoverview WBS & Gantt Chart Page for PPC V3 Project Controls.
 * 
 * Main project scheduling visualization with:
 * - Work Breakdown Structure (WBS) hierarchy table
 * - Gantt chart with task bars and dependencies
 * - Critical Path Method (CPM) analysis
 * - Task progress and efficiency tracking
 * - Expandable/collapsible hierarchy navigation
 * - Resource assignment display
 * 
 * Integrates with CPMEngine for schedule calculations.
 * 
 * @module app/project-controls/wbs-gantt/page
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData } from '@/lib/data-context';
import { useLogs } from '@/lib/logs-context';
import { CPMEngine, CPMTask, CPMResult } from '@/lib/cpm-engine';
import { WBSTableRow } from '@/types/wbs';
import { formatCurrency } from '@/lib/wbs-utils';
import type { Employee } from '@/types/data';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import SearchableDropdown from '@/components/ui/SearchableDropdown';

// Helper to get employee name from ID (supports both employeeId and employee id/PK from assigned_resource_id)
const getEmployeeName = (resourceId: string | undefined, employees: Employee[]): string => {
  if (!resourceId) return '-';
  const employee = employees.find(e => (e as any).id === resourceId || e.employeeId === resourceId);
  return employee?.name?.split(' ')[0] || resourceId;
};

// Helper to get task name from ID
const getTaskName = (taskId: string | undefined, items: WBSTableRow[]): string => {
  if (!taskId) return '-';
  const task = items.find(t => t.id === taskId);
  return task?.name?.split(' ').slice(0, 3).join(' ') || taskId.replace('wbs-', ''); // First 3 words or short ID
};

const WBS_COLORS = {
  portfolio: '#40E0D0',
  customer: '#CDDC39',
  site: '#E91E63',
  project: '#FF9800',
  unit: '#7C4DFF',
  sub_project: '#1A9B8F',
  phase: '#1A9B8F',
  task: '#9E9D24',
  sub_task: '#AD1457',
  critical: '#DC2626'
};

type GanttInterval = 'week' | 'month' | 'quarter' | 'year';

// Filter WBS items by hierarchy path (matches data-context logic); used so WBS table can use fullData.wbsData when date filter is active (cumulative actual hours).
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

export default function WBSGanttPage() {
  const { filteredData, updateData, data: fullData, setHierarchyFilter, dateFilter, hierarchyFilter } = useData();
  const { addEngineLog } = useLogs();
  const fixedColsWidth = 1390; // WBS 100 + Name 450 + Type 80 + ... (Name expanded for full names)
  const data = filteredData;
  const employees = fullData.employees;

  // When a date filter is active, use full-data WBS so actual hours stay cumulative (all-time); apply hierarchy filter locally.
  const wbsDataForTable = useMemo(() => {
    const dateFilterActive = dateFilter && dateFilter.type !== 'all';
    const raw = dateFilterActive ? fullData.wbsData : data.wbsData;
    if (!raw?.items?.length) return { items: [] as any[] };
    if (!dateFilterActive) return raw;
    if (!hierarchyFilter?.path?.length) return raw;
    return { ...raw, items: filterWbsItemsByPath(raw.items, hierarchyFilter.path) };
  }, [dateFilter, fullData.wbsData, data.wbsData, hierarchyFilter?.path]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cpmResult, setCpmResult] = useState<CPMResult | null>(null);
  const [cpmLogs, setCpmLogs] = useState<string[]>([]);
  const [ganttInterval, setGanttInterval] = useState<GanttInterval>('week');
  const [wbsSort, setWbsSort] = useState<SortState | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [wbsSearchQuery, setWbsSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const projectOptions = useMemo(() => {
    return (fullData.projects || [])
      .filter((p: any) => p.has_schedule === true || p.hasSchedule === true) // Only show projects with schedules
      .map((p: any) => ({
        id: p.id || p.projectId,
        name: p.name,
        secondary: p.projectId
      }));
  }, [fullData.projects]);

  // Use actual current date
  const today = useMemo(() => new Date(), []);

  // Calculate date range from data with 5 column buffer
  const { projectStart, projectEnd } = useMemo(() => {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    const findDateRange = (items: any[]) => {
      items.forEach(item => {
        if (item.startDate) {
          const start = new Date(item.startDate);
          if (minDate === null || start < minDate) minDate = start;
        }
        if (item.endDate) {
          const end = new Date(item.endDate);
          if (maxDate === null || end > maxDate) maxDate = end;
        }
        if (item.children) findDateRange(item.children);
      });
    };

    if (wbsDataForTable?.items?.length) findDateRange(wbsDataForTable.items);

    // Force range to include today
    const currentToday = new Date();
    if (minDate === null || currentToday < minDate) minDate = currentToday;
    if (maxDate === null || currentToday > maxDate) maxDate = currentToday;

    return {
      projectStart: minDate,
      projectEnd: maxDate
    };
  }, [wbsDataForTable?.items]);

  // Generate Date Columns based on interval with 5 column buffer
  const dateColumns = useMemo(() => {
    const columns: { start: Date; end: Date; label: string }[] = [];

    // Add buffer columns before start
    const bufferStart = new Date(projectStart);
    const bufferEnd = new Date(projectEnd);

    let current = new Date(bufferStart);

    // Calculate buffer based on interval (5 columns)
    const bufferPeriods = 5;

    switch (ganttInterval) {
      case 'week': {
        // Move start back 5 weeks
        bufferStart.setDate(bufferStart.getDate() - (7 * bufferPeriods));
        // Move end forward 5 weeks
        bufferEnd.setDate(bufferEnd.getDate() + (7 * bufferPeriods));

        // Start on Monday
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
        // Move start back 5 months
        bufferStart.setMonth(bufferStart.getMonth() - bufferPeriods);
        // Move end forward 5 months
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
        // Move start back 5 quarters
        bufferStart.setMonth(bufferStart.getMonth() - (3 * bufferPeriods));
        // Move end forward 5 quarters
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
        // Move start back 5 years
        bufferStart.setFullYear(bufferStart.getFullYear() - bufferPeriods);
        // Move end forward 5 years
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

  // Get column width based on interval
  const columnWidth = useMemo(() => {
    switch (ganttInterval) {
      case 'week': return 40;
      case 'month': return 80;
      case 'quarter': return 120;
      case 'year': return 200;
      default: return 40;
    }
  }, [ganttInterval]);

  // Find the "today" column index
  const todayColumnIndex = useMemo(() => {
    return dateColumns.findIndex(col => today >= col.start && today <= col.end);
  }, [dateColumns, today]);

  // Scroll to today - centers today column in the view
  const scrollToToday = () => {
    if (!containerRef.current || todayColumnIndex < 0) {
      console.warn('Today button: Column not found or container missing', { todayColumnIndex });
      return;
    }

    const stickyColsWidth = 300; // WBS Code + Name that stay sticky
    const viewportWidth = containerRef.current.clientWidth;

    // Calculate the x position of today column relative to the start of date columns
    const todayPositionInGantt = todayColumnIndex * columnWidth;

    // Scroll to center today column (account for sticky columns taking up space)
    // The date columns start at exactly fixedColsWidth px from table left 0
    const targetScrollX = fixedColsWidth - stickyColsWidth + todayPositionInGantt - (viewportWidth - stickyColsWidth) / 2 + columnWidth / 2;

    console.log('Today button scroll:', {
      todayColumnIndex,
      columnWidth,
      todayPositionInGantt,
      fixedColsWidth,
      stickyColsWidth,
      viewportWidth,
      targetScrollX
    });

    containerRef.current.scrollTo({
      left: Math.max(0, targetScrollX),
      behavior: 'smooth'
    });
  };

  // Expand All - collect all IDs with children
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

  // Collapse All
  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const sortedWbsItems = useMemo(() => {
    if (!wbsDataForTable?.items?.length) return [];
    if (!wbsSort) return wbsDataForTable.items;

    const getOverlapMs = (start: Date, end: Date, colStart: Date, colEnd: Date) => {
      const rangeStart = start > colStart ? start : colStart;
      const rangeEnd = end < colEnd ? end : colEnd;
      const overlap = rangeEnd.getTime() - rangeStart.getTime();
      return overlap > 0 ? overlap : 0;
    };

    const getRemainingHours = (item: any) => {
      if (item.remainingHours != null) return item.remainingHours;
      if (item.projectedRemainingHours != null) return item.projectedRemainingHours;
      if (item.baselineHours != null && item.actualHours != null) {
        return Math.max(0, (item.baselineHours || 0) - (item.actualHours || 0));
      }
      return null;
    };

    const getRemainingCost = (item: any) => {
      if (item.remainingCost != null) return item.remainingCost;
      if (item.baselineCost != null && item.actualCost != null) {
        return Math.max(0, (item.baselineCost || 0) - (item.actualCost || 0));
      }
      return null;
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
        case 'wbsCode':
          return item.wbsCode;
        case 'name':
          return item.name;
        case 'itemType':
          return item.itemType || item.type;
        case 'resource':
          return getEmployeeName(item.assignedResourceId, employees);
        case 'startDate':
          return item.startDate ? new Date(item.startDate) : null;
        case 'endDate':
          return item.endDate ? new Date(item.endDate) : null;
        case 'daysRequired':
          return item.daysRequired ?? null;
        case 'baselineHours':
          return item.baselineHours ?? null;
        case 'actualHours':
          return item.actualHours ?? null;
        case 'remainingHours':
          return getRemainingHours(item);
        case 'baselineCost':
          return item.baselineCost ?? null;
        case 'actualCost':
          return item.actualCost ?? null;
        case 'remainingCost':
          return getRemainingCost(item);
        case 'taskEfficiency':
          return item.taskEfficiency ?? null;
        case 'percentComplete':
          return item.percentComplete ?? null;
        case 'predecessors':
          return item.predecessors?.map((p: any) => p.taskId).join(', ') || '';
        case 'isCritical':
          return item.isCritical ?? false;
        default:
          return null;
      }
    };

    const sortItems = (items: any[]): any[] => {
      const sorted = sortByState(items, wbsSort, getSortValue);
      return sorted.map((item) => (
        item.children ? { ...item, children: sortItems(item.children) } : item
      ));
    };

    return sortItems(wbsDataForTable.items);
  }, [wbsDataForTable?.items, wbsSort, dateColumns, employees]);

  // Filter WBS tree by global search: keep items whose name or wbsCode matches (case-insensitive) or have a matching descendant.
  const searchFilteredItems = useMemo(() => {
    const q = (wbsSearchQuery || '').trim().toLowerCase();
    if (!q) return sortedWbsItems;

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
          if (selfMatches || childMatches) {
            return { ...item, children: filteredChildren };
          }
          return null;
        })
        .filter(Boolean);
    };

    return filterBySearch(sortedWbsItems);
  }, [sortedWbsItems, wbsSearchQuery]);

  // When search is active, expand all so matching rows are visible.
  useEffect(() => {
    if (!(wbsSearchQuery || '').trim()) return;
    const idsWithChildren = new Set<string>();
    const collect = (list: any[]) => {
      list.forEach((item: any) => {
        if (item.children && item.children.length > 0) {
          idsWithChildren.add(item.id);
          collect(item.children);
        }
      });
    };
    collect(searchFilteredItems);
    setExpandedIds((prev) => new Set([...prev, ...idsWithChildren]));
  }, [wbsSearchQuery, searchFilteredItems]);

  // Build a single flat list of all WBS nodes (each id appears once), then filter by visibility.
  // This avoids duplication and makes expand/collapse consistent: visibility = root or (parent visible && parent expanded).
  const allRowsWithParent = useMemo(() => {
    const list: { row: WBSTableRow; parentId: string | null; level: number }[] = [];
    const seenIds = new Set<string>();

    const walk = (item: any, level: number, parentId: string | null) => {
      const id = item?.id ?? '';
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const hasChildren = !!(item.children && item.children.length > 0);
      const itemType = item.itemType || item.type || 'task';

      list.push({
        parentId,
        level,
        row: {
          ...item,
          itemType,
          level,
          indentLevel: level - 1,
          hasChildren,
          isExpanded: expandedIds.has(id),
          rowIndex: 0,
          isVisible: true
        }
      });

      (item.children as any[] || []).forEach((child: any) => walk(child, level + 1, id));
    };

    searchFilteredItems.forEach((item: any) => walk(item, 1, null));
    return list;
  }, [searchFilteredItems, expandedIds]);

  const flatRows = useMemo(() => {
    const visibleIds = new Set<string>();
    const visible: WBSTableRow[] = [];
    // Process in tree order (parent before children). Row is visible iff root or (parent visible && parent expanded).
    allRowsWithParent.forEach((entry) => {
      const id = entry.row.id ?? '';
      const isRoot = entry.parentId === null;
      const parentVisible = entry.parentId === null || visibleIds.has(entry.parentId);
      const parentExpanded = entry.parentId === null || expandedIds.has(entry.parentId);
      if (isRoot || (parentVisible && parentExpanded)) {
        visibleIds.add(id);
        visible.push({ ...entry.row, rowIndex: visible.length, isVisible: true });
      }
    });
    return visible;
  }, [allRowsWithParent, expandedIds]);

  // Auto-expand only when WBS data identity changes (first load or filter change), not every render — so Expand All / Collapse All and scroll are not overwritten
  const lastWbsDataKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const items = wbsDataForTable?.items;
    const key = items?.length
      ? `${items.length}-${(items as any[])[0]?.id ?? ''}`
      : null;
    if (key === lastWbsDataKeyRef.current) return;
    lastWbsDataKeyRef.current = key;
    if (!items?.length) return;
    const idsWithChildren = new Set<string>();
    const collectExpandable = (list: any[]) => {
      list.forEach((item: any) => {
        if (item.children && item.children.length > 0) {
          idsWithChildren.add(item.id);
          collectExpandable(item.children);
        }
      });
    };
    collectExpandable(items);
    setExpandedIds(idsWithChildren);
  }, [wbsDataForTable?.items]);

  // Optimize task name lookup
  const taskNameMap = useMemo(() => {
    return new Map(flatRows.map(r => [r.id, r.name]));
  }, [flatRows]);

  const getTaskNameFromMap = (taskId: string | undefined): string => {
    if (!taskId) return '-';
    const name = taskNameMap.get(taskId);
    return name?.split(' ').slice(0, 3).join(' ') || taskId.replace('wbs-', '');
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

      // Filter by selected project if set
      if (selectedProjectId) {
        // 1. Find the project and its hierarchy for auto-filtering
        const project = fullData.projects?.find((p: any) => (p.id === selectedProjectId || p.projectId === selectedProjectId));

        if (project) {
          // Resolve hierarchy names for filter
          const site = fullData.sites?.find((s: any) => s.id === project.siteId);
          const customer = fullData.customers?.find((c: any) => c.id === site?.customerId);
          const portfolio = fullData.portfolios?.find((p: any) => p.id === customer?.portfolioId);

          // Get Portfolio Name (owner name usually)
          const owner = fullData.employees?.find((e: any) => e.id === portfolio?.employeeId);
          const portfolioName = owner ? `${owner.name.split(' ')[0]}'s Portfolio` : portfolio?.name;

          // Apply Filter to Gantt Chart
          if (portfolioName && customer && site) {
            setHierarchyFilter({
              path: [portfolioName, customer.name, site.name, project.name]
            });
          } else if (project.name) {
            // MPP / orphan projects often have no portfolio/customer/site. Filter by project name only (path[3]).
            setHierarchyFilter({
              path: ['', '', '', project.name]
            });
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
        if (projNode) {
          itemsToAnalyze = [projNode];
        }
      }

      collectTasks(itemsToAnalyze);
    }

    engine.loadTasks(tasks as any);
    const result = engine.calculate();
    setCpmResult(result);


    // Update global state with CPM results
    const updateItems = (items: any[]): any[] => {
      return items.map(item => {
        const cpmTask = result.tasks.find(t => t.id === item.id);
        const newItem = { ...item };
        if (cpmTask) {
          newItem.isCritical = cpmTask.isCritical;
          newItem.earlyStart = cpmTask.earlyStart;
          newItem.earlyFinish = cpmTask.earlyFinish;
          newItem.lateStart = cpmTask.lateStart;
          newItem.lateFinish = cpmTask.lateFinish;
          newItem.totalFloat = cpmTask.totalFloat;
        }

        if (newItem.children) {
          newItem.children = updateItems(newItem.children);
          // Rollup: Summary is critical if any child is critical
          newItem.isCritical = newItem.children.some((c: any) => c.isCritical);
          // Rollup: Summary float is min of children
          newItem.totalFloat = Math.min(...newItem.children.map((c: any) => c.totalFloat ?? Infinity));
          if (newItem.totalFloat === Infinity) newItem.totalFloat = 0;
        }
        return newItem;
      });
    };

    if (data.wbsData?.items) {
      const logs: string[] = [];
      const startTime = performance.now();

      logs.push(`[${new Date().toLocaleTimeString()}] Engine Initialized`);
      logs.push(`> Loading ${tasks.length} tasks...`);
      const tasksWithPreds = tasks.filter(t => t.predecessors && t.predecessors.length > 0).length;
      logs.push(`> ${tasksWithPreds} tasks have predecessor links`);

      const updated = updateItems(data.wbsData.items);
      updateData({ wbsData: { ...data.wbsData, items: updated } });

      const endTime = performance.now();
      logs.push(`> Calculation took ${(endTime - startTime).toFixed(2)}ms`);

      logs.push(`----------------------------------------`);

      // Fallback Duration Logic
      let displayDuration = result.projectDuration;
      let durationSource = 'Logic';

      if (result.projectDuration <= 1 && tasksWithPreds === 0) {
        // Fallback to Dates
        const start = projectStart.getTime();
        const end = projectEnd.getTime();
        if (start && end && end > start) {
          const diffTime = Math.abs(end - start);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          displayDuration = diffDays;
          durationSource = 'Dates (No Logic)';
          logs.push(`! NOTE: Using project dates for duration (no logic links active)`);

          // Update result for display
          result.projectDuration = displayDuration;
        }
      }

      logs.push(`RESULTS SUMMARY:`);
      logs.push(`• Duration: ${displayDuration} days (${durationSource})`);
      logs.push(`• Critical Path: ${result.stats.criticalTasksCount} tasks identified`);

      if (result.stats.danglingTasks && result.stats.danglingTasks.length > 0) {
        logs.push(`! WARNING: ${result.stats.danglingTasks.length} tasks have open ends (dangling logic)`);
        // List first 3 dangling
        result.stats.danglingTasks.slice(0, 3).forEach(id => {
          const tName = tasks.find(t => t.id === id)?.name || id;
          logs.push(`  - Unlinked: ${tName}`);
        });
      }

      logs.push(`• Average Float: ${result.stats.averageFloat.toFixed(1)} days`);
      setCpmLogs(logs);
      addEngineLog('CPM', logs, {
        executionTimeMs: endTime - startTime,
        projectDurationDays: displayDuration,
        criticalPathCount: result.stats.criticalTasksCount,
      });
    }
  };

  // Virtualization State
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // Update viewport height on mount/resize
  useEffect(() => {
    if (containerRef.current) {
      setViewportHeight(containerRef.current.clientHeight);
    }
    const handleResize = () => {
      if (containerRef.current) {
        setViewportHeight(containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(top);
    });
  };

  // Reset scroll only when user selects a different project (not on data change, to avoid loop/re-render with long lists)
  const prevProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevProjectIdRef.current === selectedProjectId) return;
    prevProjectIdRef.current = selectedProjectId;
    setScrollTop(0);
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [selectedProjectId]);

  const rowHeight = 30;
  const headerHeight = 36;
  const buffer = 10;

  const totalRowsHeight = flatRows.length * rowHeight;

  const { virtualRows, paddingTop, paddingBottom } = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
    const endRow = Math.min(flatRows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer);

    const visible = flatRows.slice(startRow, endRow);
    const paddingTop = startRow * rowHeight;
    const paddingBottom = (flatRows.length - endRow) * rowHeight;

    return { virtualRows: visible, paddingTop, paddingBottom, startRow };
  }, [scrollTop, viewportHeight, flatRows]);

  // Draw Predecessor Arrows using Math (No DOM access)
  useEffect(() => {
    const drawArrows = () => {
      if (!svgRef.current || flatRows.length === 0 || dateColumns.length === 0) return;

      const svg = svgRef.current;
      const timelineStart = dateColumns[0].start.getTime();
      const timelineEnd = dateColumns[dateColumns.length - 1].end.getTime();
      const totalDuration = timelineEnd - timelineStart;
      const timelinePixelWidth = dateColumns.length * columnWidth;

      // Map taskId to Row Index for fast Y lookup
      const taskRowIndex = new Map(flatRows.map((r, i) => [r.id, i]));

      // Clear existing paths
      const children = Array.from(svg.children);
      children.forEach(child => {
        if (child.nodeName !== 'defs') svg.removeChild(child);
      });

      // Set SVG Size
      svg.style.width = `${fixedColsWidth + timelinePixelWidth}px`;
      svg.style.height = `${headerHeight + totalRowsHeight}px`;

      // Only draw arrows for visible rows or rows connected to visible rows? 
      // For simplicity and correctness, drawing all is safer as long as calculation is fast.
      // Math calculation for 2000 rows is instant.

      flatRows.forEach((item, index) => {
        if (!item.predecessors || item.predecessors.length === 0) return;
        if (!item.startDate) return;

        const targetRowIndex = index;
        const targetY = headerHeight + (targetRowIndex * rowHeight) + (rowHeight / 2);

        // Target X (Start of task bar)
        const targetStart = new Date(item.startDate).getTime();
        if (targetStart < timelineStart) return; // Optimization: Don't draw if target starts before timeline? Actually maybe we should.

        const targetHeadOffset = Math.max(0, targetStart - timelineStart);
        const targetLeftPct = targetHeadOffset / totalDuration;
        const targetX = fixedColsWidth + (targetLeftPct * timelinePixelWidth);

        item.predecessors.forEach((pred: any) => {
          const sourceRowIndex = taskRowIndex.get(pred.taskId);
          if (sourceRowIndex === undefined) return; // Source not in visible hierarchy

          const sourceItem = flatRows[sourceRowIndex];
          if (!sourceItem.endDate) return;

          const sourceY = headerHeight + (sourceRowIndex * rowHeight) + (rowHeight / 2);

          // Source X (End of task bar)
          const sourceEnd = new Date(sourceItem.endDate).getTime();
          const sourceTailOffset = Math.max(0, Math.min(timelineEnd, sourceEnd) - timelineStart);
          const sourceRightPct = sourceTailOffset / totalDuration;
          const sourceX = fixedColsWidth + (sourceRightPct * timelinePixelWidth);

          // Don't draw if completely off-screen (both outside viewport)? 
          // We'll trust browser clipping, but we can optimize.
          // Let's just draw.

          // Path Logic
          const dist = Math.abs(targetX - sourceX);
          const cpOffset = Math.max(dist * 0.5, 20);

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

          // Simple Bezier
          // Start at Source Right, End at Target Left
          const d = `M${sourceX},${sourceY} C${sourceX + cpOffset},${sourceY} ${targetX - cpOffset},${targetY} ${targetX},${targetY}`;

          path.setAttribute('d', d);
          path.setAttribute('stroke', item.isCritical ? '#DC2626' : '#40E0D0');
          path.setAttribute('stroke-width', item.isCritical ? '1.5' : '1');
          path.setAttribute('fill', 'none');
          path.setAttribute('marker-end', 'url(#arrowhead)');
          path.setAttribute('opacity', '0.5');

          svg.appendChild(path);
        });
      });
    };

    // Draw immediately and on resize/data change
    requestAnimationFrame(drawArrows);

  }, [flatRows, dateColumns, columnWidth, fixedColsWidth, totalRowsHeight]); // Depend on totalRowsHeight/flatRows to redraw

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedIds(newExpanded);
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

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">WBS & Gantt Chart</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Global WBS Search */}
          <div style={{ position: 'relative', minWidth: '180px' }}>
            <input
              type="text"
              placeholder="Search WBS (name or code)..."
              value={wbsSearchQuery}
              onChange={(e) => setWbsSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.4rem 0.6rem 0.4rem 2rem',
                fontSize: '0.8rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
              aria-label="Search WBS by name or code"
            />
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              style={{
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: 'var(--text-secondary)',
              }}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            {wbsSearchQuery && (
              <button
                type="button"
                onClick={() => setWbsSearchQuery('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          {/* Interval Selector */}
          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
            {(['week', 'month', 'quarter', 'year'] as GanttInterval[]).map(interval => (
              <button
                key={interval}
                onClick={() => setGanttInterval(interval)}
                style={{
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.7rem',
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
            className="btn btn-secondary btn-sm"
            onClick={scrollToToday}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12,6 12,12 16,14"></polyline>
            </svg>
            Today
          </button>
          <button className="btn btn-secondary btn-sm" onClick={collapseAll}>Collapse All</button>
          <button className="btn btn-secondary btn-sm" onClick={expandAll}>Expand All</button>
          <div style={{ width: '200px' }}>
            <SearchableDropdown
              options={projectOptions}
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              placeholder="Select Project for CPM..."
              disabled={false}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={runCPM}>Run CPM Analysis</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', padding: '0 1.5rem 0.5rem', fontSize: '0.7rem', color: '#888', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 12, background: '#ef4444', borderRadius: 2 }}></div> 0-25%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 12, background: '#f97316', borderRadius: 2 }}></div> 25-50%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 12, background: '#eab308', borderRadius: 2 }}></div> 50-75%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 12, background: '#22c55e', borderRadius: 2 }}></div> 75-100%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '1rem' }}><div style={{ width: 12, height: 12, border: '2px solid #ef4444' }}></div> Critical Path</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 2, height: 12, background: '#ef4444', borderLeft: '1px dashed #ef4444' }}></div> Milestone</div>
      </div>

      {cpmResult && (
        <div style={{
          position: 'relative',
          display: 'flex',
          gap: '1rem',
          marginBottom: '1rem',
          alignItems: 'stretch',
          width: 'calc(100% - 3rem)',
          margin: '0 1.5rem 1rem',
          background: 'rgba(20, 20, 25, 0.95)',
          padding: '12px 16px',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          height: '110px' // Fixed height
        }}>
          <button
            onClick={() => { setCpmResult(null); setCpmLogs([]); }}
            className="btn-icon"
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              color: '#fff',
              cursor: 'pointer',
              zIndex: 20,
              padding: '6px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '50%',
              border: 'none',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            aria-label="Close Analysis"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <div className="metrics-row-compact" style={{ margin: 0, gap: '1rem', display: 'flex', flex: '0 0 auto', alignItems: 'center' }}>
            <div className="metric-card" style={{ width: '140px', padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#111' }}>
              <div className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Duration</div>
              <div className="metric-value" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{cpmResult.projectDuration} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>d</span></div>
            </div>
            <div className="metric-card accent-pink" style={{ width: '140px', padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#111' }}>
              <div className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Critical Tasks</div>
              <div className="metric-value" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{cpmResult.stats.criticalTasksCount}</div>
            </div>
            <div className="metric-card accent-lime" style={{ width: '140px', padding: '10px 16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#111' }}>
              <div className="metric-label" style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Avg Float</div>
              <div className="metric-value" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{cpmResult.stats.averageFloat.toFixed(1)} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>d</span></div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '0.7rem',
              color: '#aaa',
              lineHeight: '1.6',
              padding: '12px'
            }}>
              {cpmLogs.length === 0 ? <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Ready to analyze...</span> : cpmLogs.map((log, i) => (
                <div key={i} style={{ whiteSpace: 'pre-wrap', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '2px', marginBottom: '2px' }}>
                  {log.startsWith('>') ? <span style={{ color: '#40E0D0' }}>{log.substring(0, 2)}</span> : null}
                  {log.startsWith('>') ? log.substring(2) : log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="chart-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <div
          className="chart-card-body no-padding"
          style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}
          ref={containerRef}
          onScroll={handleScroll}
        >
          {/* SVG Overlay for Arrows */}
          <svg
            ref={svgRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '10000px',
              height: '10000px',
              pointerEvents: 'none',
              zIndex: 5
            }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" />
              </marker>
            </defs>
          </svg>

          <table
            ref={tableRef}
            className="wbs-table"
            style={{
              width: 'max-content',
              minWidth: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              // Limit width to actual content - prevent empty scroll space
              maxWidth: `${fixedColsWidth + (dateColumns.length * columnWidth)}px`
            }}
          >
            <thead>
              <tr style={{ height: '36px' }}>
                <th style={{ width: '100px', position: 'sticky', left: 0, top: 0, zIndex: 40, background: 'var(--bg-secondary)', borderRight: '1px solid #444', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  WBS Code
                </th>
                <th style={{ width: '450px', minWidth: '450px', position: 'sticky', left: '100px', top: 0, zIndex: 40, background: 'var(--bg-secondary)', borderRight: '1px solid #444', borderBottom: '1px solid #333', fontWeight: 600 }}>
                  Name
                </th>
                <th style={{ width: '80px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Type
                </th>
                <th style={{ width: '100px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Resource
                </th>
                <th style={{ width: '80px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Start
                </th>
                <th style={{ width: '80px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  End
                </th>
                <th style={{ width: '40px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Days Required', description: 'Estimated working days to complete.' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Days</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '50px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Baseline Hours', description: 'Original budgeted hours.' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>BL Hrs</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '50px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Actual Hours', description: 'Hours logged to date.' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Act Hrs</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '55px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, color: 'var(--pinnacle-teal)', whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Remaining Hours', description: 'Hours left to complete.', calculation: 'Baseline - Actual' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted var(--pinnacle-teal)' }}>Rem Hrs</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '70px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Baseline Cost', description: 'Original budgeted cost.', calculation: 'Baseline Hours × Rate' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>BL Cost</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '70px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Actual Cost', description: 'Cost incurred to date.', calculation: 'Actual Hours × Rate' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Act Cost</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '75px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, color: 'var(--pinnacle-teal)', whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Remaining Cost', description: 'Projected cost to finish.', calculation: 'Remaining Hours × Rate' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted var(--pinnacle-teal)' }}>Rem Cost</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '40px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Efficiency %', description: 'Work rate efficiency.', calculation: 'Earned / Spent' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Eff%</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '40px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Progress', description: 'Percentage complete.' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Prog</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '80px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <EnhancedTooltip content={{ title: 'Predecessors', description: 'Tasks that must finish before this one starts.' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>Pred</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '40px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderRight: '1px solid #444', borderBottom: '1px solid #333', fontWeight: 600, color: '#ff6b6b', whiteSpace: 'nowrap' }} className="number">
                  <EnhancedTooltip content={{ title: 'Total Float', description: 'Days task can delay without delaying project.' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>TF</span>
                  </EnhancedTooltip>
                </th>
                <th style={{ width: '30px', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <EnhancedTooltip content={{ title: 'Critical Path', description: 'Tasks driving the project end date.' }}>
                    <span style={{ cursor: 'help', borderBottom: '1px dotted #666' }}>CP</span>
                  </EnhancedTooltip>
                </th>
                {/* Gantt Timeline Headers */}
                {dateColumns.map((col, i) => {
                  const isCurrentPeriod = today >= col.start && today <= col.end;
                  return (
                    <th key={i} style={{
                      width: `${columnWidth}px`,
                      textAlign: 'center',
                      fontSize: '0.6rem',
                      borderLeft: '1px solid #333',
                      borderBottom: '1px solid #333',
                      background: isCurrentPeriod ? 'rgba(64, 224, 208, 0.2)' : 'var(--bg-secondary)',
                      color: isCurrentPeriod ? 'var(--pinnacle-teal)' : 'inherit',
                      fontWeight: 600,
                      position: 'sticky',
                      top: 0,
                      zIndex: 30
                    }}>
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr style={{ height: `${paddingTop}px` }}>
                  <td colSpan={100} style={{ padding: 0, border: 'none' }}></td>
                </tr>
              )}
              {virtualRows.map((row) => {
                const isCritical = row.isCritical;
                const efficiency = row.taskEfficiency || 0;
                const progress = row.percentComplete || 0;
                const effColor = efficiency >= 100 ? '#40E0D0' : efficiency >= 90 ? '#CDDC39' : '#F59E0B';
                const progressColor = progress >= 100 ? '#22c55e' : progress >= 75 ? '#22c55e' : progress >= 50 ? '#eab308' : progress >= 25 ? '#f97316' : '#ef4444';
                const itemColor = isCritical
                  ? WBS_COLORS.critical
                  : row.hasChildren
                    ? progressColor
                    : effColor;
                const isExpanded = expandedIds.has(row.id);

                return (
                  <tr
                    key={row.id}
                    data-id={row.id}
                    className={row.hasChildren ? 'rollup' : ''}
                    style={{
                      height: '30px',
                      background: isCritical ? 'rgba(220, 38, 38, 0.05)' : 'var(--bg-primary)'
                    }}
                  >
                    <td style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 10,
                      background: isCritical ? '#1a1010' : 'var(--bg-primary)',
                      borderRight: '1px solid #444',
                      boxShadow: isCritical ? 'inset 2px 0 0 #ef4444' : 'none'
                    }}>
                      <div style={{ paddingLeft: `${row.indentLevel * 12}px`, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {row.hasChildren && (
                          <button
                            className="btn-chevron-no-highlight"
                            onClick={() => toggleExpand(row.id)}
                            style={{ color: '#fff', cursor: 'pointer', padding: 0, fontSize: '8px' }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span style={{ color: isCritical ? '#ef4444' : 'inherit', fontSize: '0.65rem', fontWeight: isCritical ? 700 : 400 }}>{row.wbsCode}</span>
                      </div>
                    </td>
                    <td style={{
                      position: 'sticky',
                      left: '100px',
                      zIndex: 10,
                      background: isCritical ? '#1a1010' : 'var(--bg-primary)',
                      borderRight: '1px solid #444',
                      minWidth: '450px',
                      width: '450px'
                    }}>
                      <EnhancedTooltip content={row.name || ''}>
                        <span style={{ fontWeight: row.hasChildren || isCritical ? 700 : 400, fontSize: '0.7rem', color: isCritical ? '#ef4444' : 'inherit', display: 'block', whiteSpace: 'normal', wordBreak: 'break-word' }}>{row.name}</span>
                      </EnhancedTooltip>
                    </td>
                    <td><span className={`type-badge ${row.itemType}`} style={{ fontSize: '0.5rem' }}>{(row.itemType || '').replace('_', ' ')}</span></td>
                    <td style={{ fontSize: '0.65rem' }}>{getEmployeeName(row.assignedResourceId, employees)}</td>
                    <td style={{ fontSize: '0.65rem' }}>{row.startDate ? new Date(row.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : '-'}</td>
                    <td style={{ fontSize: '0.65rem' }}>{row.endDate ? new Date(row.endDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : '-'}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{row.daysRequired !== undefined && row.daysRequired !== null ? Number(row.daysRequired).toFixed(2) : '-'}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{row.baselineHours ? Number(row.baselineHours).toFixed(2) : '-'}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{row.actualHours ? Number(row.actualHours).toFixed(2) : '-'}</td>
                    <td className="number" style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)' }}>{(() => {
                      const remHrs = (row as any).remainingHours ?? row.projectedRemainingHours ?? (row.baselineHours && row.actualHours ? Math.max(0, (row.baselineHours || 0) - (row.actualHours || 0)) : null);
                      return remHrs !== null ? remHrs.toFixed(2) : '-';
                    })()}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{formatCurrency(row.baselineCost || 0)}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{formatCurrency(row.actualCost || 0)}</td>
                    <td className="number" style={{ fontSize: '0.65rem', color: 'var(--pinnacle-teal)' }}>{formatCurrency(row.remainingCost ?? Math.max(0, (row.baselineCost || 0) - (row.actualCost || 0)))}</td>
                    <td className="number" style={{ fontSize: '0.65rem' }}>{row.taskEfficiency ? `${Math.round(row.taskEfficiency)}%` : '-'}</td>
                    <td>
                      <div
                        className="progress-bar"
                        style={{
                          width: '25px',
                          height: '6px',
                          background: row.hasChildren && (row.percentComplete || 0) === 0 ? progressColor : undefined
                        }}
                      >
                        <div className="progress-bar-fill" style={{ width: `${row.percentComplete || 0}%`, background: itemColor }}></div>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.55rem' }} title={row.predecessors?.map((p: any) => `${getTaskNameFromMap(p.taskId)} (${p.relationship})`).join(', ') || ''}>
                      {row.predecessors?.map((p: any) => `${getTaskNameFromMap(p.taskId)}`).join(', ') || '-'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {(isCritical || (row as any).is_critical || (row.totalFloat !== undefined && row.totalFloat <= 0)) ? (
                        <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.65rem' }}>CP</span>
                      ) : ''}
                    </td>

                    {/* Gantt Timeline Cells */}
                    {/* Gantt Timeline Cells */}
                    {dateColumns.map((col, i) => {
                      const isCurrentPeriod = today >= col.start && today <= col.end;
                      const cellBg = isCurrentPeriod ? 'rgba(64, 224, 208, 0.05)' : 'transparent';

                      // Render the continuous bar container ONLY in the first cell
                      // But we must render the TD for every cell to maintain the grid

                      const content = (() => {
                        if (i === 0 && row.startDate && row.endDate) {
                          const itemStart = new Date(row.startDate);
                          const itemEnd = new Date(row.endDate);
                          if (Number.isNaN(itemStart.getTime()) || Number.isNaN(itemEnd.getTime())) return null;
                          const timelineStart = dateColumns[0].start;
                          const timelineEnd = dateColumns[dateColumns.length - 1].end;
                          const totalDuration = timelineEnd.getTime() - timelineStart.getTime();

                          // Check overlap with timeline (draw bar for any row with valid dates: task, unit, phase, project, site, etc.)
                          if (itemEnd >= timelineStart && itemStart <= timelineEnd) {
                            const startOffset = Math.max(0, itemStart.getTime() - timelineStart.getTime());
                            const leftPct = (startOffset / totalDuration) * 100;

                            const effectiveEnd = Math.min(itemEnd.getTime(), timelineEnd.getTime());
                            const effectiveStart = Math.max(itemStart.getTime(), timelineStart.getTime());
                            const widthPct = ((effectiveEnd - effectiveStart) / totalDuration) * 100;

                            const isMilestone = row.is_milestone || row.isMilestone;

                            const getProgressColor = (pct: number) => {
                              if (pct >= 100) return '#22c55e';
                              if (pct >= 75) return '#22c55e';
                              if (pct >= 50) return '#eab308';
                              if (pct >= 25) return '#f97316';
                              return '#ef4444';
                            };
                            const progressColor = getProgressColor(row.percentComplete || 0);
                            const pct = row.percentComplete || 0;
                            const barBg = isMilestone ? 'transparent' : (pct === 0 ? progressColor : '#333');

                            return (
                              <div
                                className="gantt-bar-segment"
                                data-id={row.id}
                                title={`${row.name}${isMilestone ? ' (Milestone)' : ''}\n${row.startDate} - ${row.endDate}\nProgress: ${row.percentComplete}%\nTotal Float: ${row.totalFloat ?? '-'} days${row.taskEfficiency ? `\nEfficiency: ${Math.round(row.taskEfficiency)}%` : ''}`}
                                style={{
                                  position: 'absolute',
                                  // width calculation: parent is 1 cell width. We need width relative to (cellWidth * numCols).
                                  // widthPct is 0-100 of TOTAL timeline.
                                  // leftPct is 0-100 of TOTAL timeline.
                                  // So pixel width = widthPct/100 * (numCols * colWidth).
                                  // In percentage relative to THIS 1st cell: width = (numCols * 100%) * (widthPct/100) = numCols * widthPct
                                  width: `calc(${dateColumns.length * 100}% * ${widthPct / 100})`,
                                  left: `calc(${dateColumns.length * 100}% * ${leftPct / 100})`,
                                  height: '18px',
                                  top: '6px',
                                  background: barBg,
                                  borderRadius: '3px',
                                  zIndex: 5,
                                  border: (row.isCritical || row.is_critical) ? '2px solid #ef4444' : 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-start',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                  pointerEvents: 'auto' // Ensure tooltips work
                                }}
                              >
                                {/* Progress Fill */}
                                {!isMilestone && (
                                  <div style={{
                                    width: `${row.percentComplete || 0}%`,
                                    height: '100%',
                                    background: progressColor,
                                    borderRadius: '3px',
                                    transition: 'width 0.3s'
                                  }} />
                                )}

                                {/* Milestone Marker */}
                                {isMilestone && (
                                  <div style={{
                                    width: '4px',
                                    height: '100%',
                                    background: '#ef4444',
                                    borderRadius: '0',
                                    marginLeft: '-2px'
                                  }} />
                                )}

                                {/* Label */}
                                <span style={{
                                  marginLeft: isMilestone ? '8px' : 'calc(100% + 8px)',
                                  whiteSpace: 'nowrap',
                                  fontSize: '0.65rem',
                                  color: '#aaa',
                                  position: 'absolute',
                                  left: isMilestone ? '0' : '0'
                                }}>
                                  {row.name}
                                </span>
                              </div>
                            );
                          }
                        }
                        return null;
                      })();

                      return (
                        <td key={i} style={{ borderLeft: '1px solid #222', background: cellBg, position: 'relative', padding: 0, overflow: i === 0 ? 'visible' : 'hidden' }}>
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr style={{ height: `${paddingBottom}px` }}>
                  <td colSpan={100} style={{ padding: 0, border: 'none' }}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
