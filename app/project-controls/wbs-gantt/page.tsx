'use client';

/**
 * @fileoverview Advanced WBS & Gantt Chart Page for PPC V3 Project Controls.
 * 
 * Enhanced visualization with executive-level features:
 * - Inazuma (Lightning) Progress Line - zigzag showing schedule deviation
 * - Collapsible WBS Hierarchy with smart color aggregation
 * - Baseline Ghosting - ghost bars showing original schedule creep
 * - Dependency Curves with color coding (critical, non-critical, causing delay)
 * - FTE Sparklines - mini resource charts in sidebar
 * - Full CPM analysis integration
 * 
 * @module app/project-controls/wbs-gantt/page
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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

// Helper to get employee name from ID
const getEmployeeName = (resourceId: string | undefined, employees: Employee[]): string => {
  if (!resourceId) return '-';
  const employee = employees.find(e => (e as any).id === resourceId || e.employeeId === resourceId);
  return employee?.name?.split(' ')[0] || resourceId;
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

// ===== FTE SPARKLINE COMPONENT =====
function FTESparkline({ baselineHours, daysRequired, percentComplete }: { baselineHours: number; daysRequired: number; percentComplete: number }) {
  const width = 60;
  const height = 16;
  
  // Generate sparkline data based on hours/days
  const points = useMemo(() => {
    if (!baselineHours || !daysRequired || daysRequired === 0) return null;
    
    const ftePerDay = baselineHours / (daysRequired * 8); // Assuming 8hr day
    const numPoints = Math.min(Math.max(3, Math.ceil(daysRequired / 5)), 10);
    const pts: { x: number; y: number }[] = [];
    
    // Simulate FTE distribution (front-loaded, bell curve, or flat based on task type)
    for (let i = 0; i < numPoints; i++) {
      const progress = i / (numPoints - 1);
      // Bell curve distribution
      const intensity = Math.exp(-Math.pow((progress - 0.3) * 3, 2));
      pts.push({
        x: (i / (numPoints - 1)) * width,
        y: height - (intensity * ftePerDay * 4) - 2
      });
    }
    
    return pts;
  }, [baselineHours, daysRequired]);
  
  if (!points || points.length < 2) return <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>-</span>;
  
  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  const progressX = (percentComplete / 100) * width;
  
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Background grid */}
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="var(--border-color)" strokeWidth="0.5" />
      
      {/* FTE line */}
      <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="1.5" opacity="0.8" />
      
      {/* Progress marker */}
      <line x1={progressX} y1="0" x2={progressX} y2={height} stroke="var(--pinnacle-teal)" strokeWidth="1" strokeDasharray="2,1" />
      
      {/* Filled area under curve up to progress */}
      <defs>
        <clipPath id={`clip-${Math.random().toString(36).substr(2, 9)}`}>
          <rect x="0" y="0" width={progressX} height={height} />
        </clipPath>
      </defs>
      <path d={`${pathD} L ${width},${height - 2} L 0,${height - 2} Z`} fill="rgba(59,130,246,0.2)" />
    </svg>
  );
}

// ===== WORST-CASE STATUS AGGREGATION =====
function getWorstCaseStatus(items: any[]): { color: string; status: 'critical' | 'behind' | 'at-risk' | 'on-track' } {
  let worstStatus: 'critical' | 'behind' | 'at-risk' | 'on-track' = 'on-track';
  
  const checkItem = (item: any) => {
    if (item.isCritical || item.is_critical) {
      worstStatus = 'critical';
      return;
    }
    const progress = item.percentComplete || 0;
    const efficiency = item.taskEfficiency || 100;
    
    if (progress < 25 && efficiency < 80) {
      if (worstStatus !== 'critical') worstStatus = 'behind';
    } else if (progress < 50 || efficiency < 90) {
      if (worstStatus !== 'critical' && worstStatus !== 'behind') worstStatus = 'at-risk';
    }
    
    if (item.children) item.children.forEach(checkItem);
  };
  
  items.forEach(checkItem);
  
  const colors = {
    'critical': '#EF4444',
    'behind': '#F97316',
    'at-risk': '#EAB308',
    'on-track': '#22C55E'
  };
  
  return { color: colors[worstStatus], status: worstStatus };
}

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

const WBS_TABLE_FONT = { header: '1rem', cell: '0.95rem', fontWeight: 600 as const };

export default function WBSGanttPage() {
  const { filteredData, updateData, data: fullData, setHierarchyFilter, dateFilter, hierarchyFilter, isLoading: dataLoading } = useData();
  const { addEngineLog } = useLogs();
  const fixedColsWidth = 1560; // Includes Employee column
  const data = filteredData;
  const employees = fullData.employees;

  // Settings
  const [showBaseline, setShowBaseline] = useState(true);
  const [showInazuma, setShowInazuma] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showSparklines, setShowSparklines] = useState(true);

  // When a date filter is active, use full-data WBS so actual hours stay cumulative
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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [verticalZoom, setVerticalZoom] = useState(1);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const inazumaSvgRef = useRef<SVGSVGElement>(null);

  const projectOptions = useMemo(() => {
    return (fullData.projects || [])
      .filter((p: any) => p.has_schedule === true || p.hasSchedule === true)
      .map((p: any) => ({
        id: p.id || p.projectId,
        name: p.name,
        secondary: p.projectId
      }));
  }, [fullData.projects]);

  const today = useMemo(() => new Date(), []);

  // Calculate date range from data with buffer
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
        // Also check baseline dates
        if (item.baselineStart) {
          const bStart = new Date(item.baselineStart);
          if (minDate === null || bStart < minDate) minDate = bStart;
        }
        if (item.baselineEnd) {
          const bEnd = new Date(item.baselineEnd);
          if (maxDate === null || bEnd > maxDate) maxDate = bEnd;
        }
        if (item.children) findDateRange(item.children);
      });
    };

    if (wbsDataForTable?.items?.length) findDateRange(wbsDataForTable.items);

    const currentToday = new Date();
    if (minDate === null || currentToday < minDate) minDate = currentToday;
    if (maxDate === null || currentToday > maxDate) maxDate = currentToday;

    return { projectStart: minDate, projectEnd: maxDate };
  }, [wbsDataForTable?.items]);

  // Generate Date Columns
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
            label: current.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
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

  const baseColumnWidth = useMemo(() => {
    switch (ganttInterval) {
      case 'week': return 40;
      case 'month': return 80;
      case 'quarter': return 120;
      case 'year': return 200;
      default: return 40;
    }
  }, [ganttInterval]);
  
  const columnWidth = Math.round(baseColumnWidth * timelineZoom);

  const todayColumnIndex = useMemo(() => {
    return dateColumns.findIndex(col => today >= col.start && today <= col.end);
  }, [dateColumns, today]);

  const scrollToToday = () => {
    if (!containerRef.current || todayColumnIndex < 0) return;
    const stickyColsWidth = 300;
    const viewportWidth = containerRef.current.clientWidth;
    const todayPositionInGantt = todayColumnIndex * columnWidth;
    const targetScrollX = fixedColsWidth - stickyColsWidth + todayPositionInGantt - (viewportWidth - stickyColsWidth) / 2 + columnWidth / 2;
    containerRef.current.scrollTo({ left: Math.max(0, targetScrollX), behavior: 'smooth' });
  };

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

  // Collapse to level (for smart hierarchy)
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
    if (wbsDataForTable?.items?.length) walk(wbsDataForTable.items, 1);
    setExpandedIds(idsToExpand);
  };

  const sortedWbsItems = useMemo(() => {
    if (!wbsDataForTable?.items?.length) return [];
    if (!wbsSort) return wbsDataForTable.items;

    const getSortValue = (item: any, key: string) => {
      switch (key) {
        case 'wbsCode': return item.wbsCode;
        case 'name': return item.name;
        case 'itemType': return item.itemType || item.type;
        case 'resource': return getEmployeeName(item.assignedResourceId, employees);
        case 'startDate': return item.startDate ? new Date(item.startDate) : null;
        case 'endDate': return item.endDate ? new Date(item.endDate) : null;
        case 'percentComplete': return item.percentComplete ?? null;
        default: return null;
      }
    };

    const sortItems = (items: any[]): any[] => {
      const sorted = sortByState(items, wbsSort, getSortValue);
      return sorted.map((item) => (
        item.children ? { ...item, children: sortItems(item.children) } : item
      ));
    };

    return sortItems(wbsDataForTable.items);
  }, [wbsDataForTable?.items, wbsSort, employees]);

  // Search filter
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
          if (selfMatches || childMatches) return { ...item, children: filteredChildren };
          return null;
        })
        .filter(Boolean);
    };

    return filterBySearch(sortedWbsItems);
  }, [sortedWbsItems, wbsSearchQuery]);

  // Auto-expand on search
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

  // Rollup percent complete
  const getRollupPercentComplete = (item: any): number => {
    if (!item?.children?.length) return item?.percentComplete ?? 0;
    const childPcts = (item.children as any[]).map((c: any) => getRollupPercentComplete(c));
    const sum = childPcts.reduce((a, b) => a + b, 0);
    return childPcts.length ? Math.round(sum / childPcts.length) : (item.percentComplete ?? 0);
  };

  // Build flat rows
  const allRowsWithParent = useMemo(() => {
    const list: { row: WBSTableRow; parentId: string | null; level: number }[] = [];
    const seenIds = new Set<string>();

    const walk = (item: any, level: number, parentId: string | null) => {
      const id = item?.id ?? '';
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const hasChildren = !!(item.children && item.children.length > 0);
      const itemType = item.itemType || item.type || 'task';
      const percentComplete = hasChildren
        ? (item.percentComplete ?? getRollupPercentComplete(item))
        : (item.percentComplete ?? 0);

      // Get worst case status for collapsed parents
      const worstCase = hasChildren ? getWorstCaseStatus(item.children) : null;

      list.push({
        parentId,
        level,
        row: {
          ...item,
          percentComplete,
          itemType,
          level,
          indentLevel: level - 1,
          hasChildren,
          isExpanded: expandedIds.has(id),
          rowIndex: 0,
          isVisible: true,
          worstCaseStatus: worstCase
        } as any
      });

      (item.children as any[] || []).forEach((child: any) => walk(child, level + 1, id));
    };

    searchFilteredItems.forEach((item: any) => walk(item, 1, null));
    return list;
  }, [searchFilteredItems, expandedIds]);

  const flatRows = useMemo(() => {
    const visibleIds = new Set<string>();
    const visible: WBSTableRow[] = [];
    
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

  // Auto-expand on first load
  const lastWbsDataKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const items = wbsDataForTable?.items;
    const key = items?.length ? `${items.length}-${(items as any[])[0]?.id ?? ''}` : null;
    if (key === lastWbsDataKeyRef.current) return;
    lastWbsDataKeyRef.current = key;
    if (!items?.length) return;
    
    // Default to level 2 expanded (smart hierarchy)
    collapseToLevel(2);
  }, [wbsDataForTable?.items]);

  const taskNameMap = useMemo(() => new Map(flatRows.map(r => [r.id, r.name])), [flatRows]);

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
          newItem.earlyStart = cpmTask.earlyStart;
          newItem.earlyFinish = cpmTask.earlyFinish;
          newItem.lateStart = cpmTask.lateStart;
          newItem.lateFinish = cpmTask.lateFinish;
          newItem.totalFloat = cpmTask.totalFloat;
        }

        if (newItem.children) {
          newItem.children = updateItems(newItem.children);
          newItem.isCritical = newItem.children.some((c: any) => c.isCritical);
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
      logs.push(`RESULTS: Duration ${result.projectDuration}d | Critical Tasks ${result.stats.criticalTasksCount} | Avg Float ${result.stats.averageFloat.toFixed(1)}d`);
      
      setCpmLogs(logs);
      addEngineLog('CPM', logs, {
        executionTimeMs: endTime - startTime,
        projectDurationDays: result.projectDuration,
        criticalPathCount: result.stats.criticalTasksCount,
      });
    }
  };

  // Virtualization
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => setViewportHeight(el.clientHeight);
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wbsDataForTable?.items?.length]);

  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(top);
    });
  };

  const baseRowHeight = 32;
  const rowHeight = Math.round(baseRowHeight * verticalZoom);
  const headerHeight = 38;
  const buffer = 10;
  
  const handleWheelZoom = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setTimelineZoom(prev => Math.max(0.25, Math.min(3, prev + delta)));
    } else if (e.shiftKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setVerticalZoom(prev => Math.max(0.5, Math.min(2, prev + delta)));
    }
  };
  
  const employeeOptions = useMemo(() => {
    return (employees || []).map((emp: any) => ({
      id: emp.id || emp.employeeId,
      name: emp.name || 'Unknown',
      secondary: emp.role || emp.jobTitle || 'No Role',
      role: (emp.role || emp.jobTitle || '').toLowerCase()
    }));
  }, [employees]);
  
  const handleAssignResource = (taskId: string, employeeId: string | null) => {
    if (!data.wbsData?.items) return;
    
    const updateItemsRecursively = (items: any[]): any[] => {
      return items.map(item => {
        if (item.id === taskId) return { ...item, assignedResourceId: employeeId };
        if (item.children) return { ...item, children: updateItemsRecursively(item.children) };
        return item;
      });
    };
    
    const updated = updateItemsRecursively(data.wbsData.items);
    updateData({ wbsData: { ...data.wbsData, items: updated } });
    setEditingTaskId(null);
  };

  // Dynamically calculate WBS code column width based on deepest visible indent level
  const wbsCodeColWidth = useMemo(() => {
    if (flatRows.length === 0) return 80;
    const maxLevel = flatRows.reduce((max, r) => Math.max(max, r.indentLevel || 0), 0);
    // Base 80px + 12px per additional indent level beyond 1
    return Math.max(80, 80 + Math.max(0, maxLevel - 1) * 12);
  }, [flatRows]);

  const totalRowsHeight = flatRows.length * rowHeight;

  const { virtualRows, paddingTop, paddingBottom } = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
    const endRow = Math.min(flatRows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer);

    return {
      virtualRows: flatRows.slice(startRow, endRow),
      paddingTop: startRow * rowHeight,
      paddingBottom: (flatRows.length - endRow) * rowHeight,
      startRow
    };
  }, [scrollTop, viewportHeight, flatRows, rowHeight, buffer]);

  // ===== DRAW DEPENDENCY ARROWS =====
  useEffect(() => {
    if (!showDependencies) return;
    const drawArrows = () => {
      if (!svgRef.current || flatRows.length === 0 || dateColumns.length === 0) return;

      const svg = svgRef.current;
      const timelineStart = dateColumns[0].start.getTime();
      const timelineEnd = dateColumns[dateColumns.length - 1].end.getTime();
      const totalDuration = timelineEnd - timelineStart;
      const timelinePixelWidth = dateColumns.length * columnWidth;

      const taskRowIndex = new Map(flatRows.map((r, i) => [r.id, i]));

      // Clear existing
      const children = Array.from(svg.children);
      children.forEach(child => {
        if (child.nodeName !== 'defs') svg.removeChild(child);
      });

      svg.style.width = `${fixedColsWidth + timelinePixelWidth}px`;
      svg.style.height = `${headerHeight + totalRowsHeight}px`;

      flatRows.forEach((item, index) => {
        if (!item.predecessors || item.predecessors.length === 0) return;
        if (!item.startDate) return;

        const targetRowIndex = index;
        const targetY = headerHeight + (targetRowIndex * rowHeight) + (rowHeight / 2);
        const targetStart = new Date(item.startDate).getTime();
        const targetHeadOffset = Math.max(0, targetStart - timelineStart);
        const targetLeftPct = targetHeadOffset / totalDuration;
        const targetX = fixedColsWidth + (targetLeftPct * timelinePixelWidth);

        item.predecessors.forEach((pred: any) => {
          const sourceRowIndex = taskRowIndex.get(pred.taskId);
          if (sourceRowIndex === undefined) return;

          const sourceItem = flatRows[sourceRowIndex];
          if (!sourceItem.endDate) return;

          const sourceY = headerHeight + (sourceRowIndex * rowHeight) + (rowHeight / 2);
          const sourceEnd = new Date(sourceItem.endDate).getTime();
          const sourceTailOffset = Math.max(0, Math.min(timelineEnd, sourceEnd) - timelineStart);
          const sourceRightPct = sourceTailOffset / totalDuration;
          const sourceX = fixedColsWidth + (sourceRightPct * timelinePixelWidth);

          const dist = Math.abs(targetX - sourceX);
          const cpOffset = Math.max(dist * 0.5, 20);

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const d = `M${sourceX},${sourceY} C${sourceX + cpOffset},${sourceY} ${targetX - cpOffset},${targetY} ${targetX},${targetY}`;

          path.setAttribute('d', d);
          
          // Color coding for dependencies
          const isCritical = item.isCritical || item.is_critical;
          const isCausingDelay = sourceItem.endDate && item.startDate && new Date(sourceItem.endDate) > new Date(item.startDate);
          
          if (isCritical && (item.totalFloat === 0 || item.totalFloat === undefined)) {
            // Solid red - Critical path with zero float
            path.setAttribute('stroke', '#EF4444');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-dasharray', 'none');
          } else if (isCausingDelay) {
            // Dashed red - Dependency causing delay
            path.setAttribute('stroke', '#EF4444');
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('stroke-dasharray', '4,2');
          } else {
            // Gray - Non-critical
            path.setAttribute('stroke', '#6B7280');
            path.setAttribute('stroke-width', '1');
            path.setAttribute('stroke-dasharray', 'none');
          }
          
          path.setAttribute('fill', 'none');
          path.setAttribute('marker-end', isCritical ? 'url(#arrowhead-red)' : 'url(#arrowhead-gray)');
          path.setAttribute('opacity', '0.6');

          svg.appendChild(path);
        });
      });
    };

    requestAnimationFrame(drawArrows);
  }, [flatRows, dateColumns, columnWidth, fixedColsWidth, totalRowsHeight, showDependencies, rowHeight, headerHeight]);

  // ===== DRAW INAZUMA (LIGHTNING) PROGRESS LINE =====
  useEffect(() => {
    if (!showInazuma) return;
    
    const drawInazuma = () => {
      if (!inazumaSvgRef.current || flatRows.length === 0 || dateColumns.length === 0) return;

      const svg = inazumaSvgRef.current;
      const timelineStart = dateColumns[0].start.getTime();
      const timelineEnd = dateColumns[dateColumns.length - 1].end.getTime();
      const totalDuration = timelineEnd - timelineStart;
      const timelinePixelWidth = dateColumns.length * columnWidth;
      const todayTime = today.getTime();
      
      // Calculate today's X position
      const todayOffset = Math.max(0, todayTime - timelineStart);
      const todayX = fixedColsWidth + (todayOffset / totalDuration) * timelinePixelWidth;

      // Clear existing
      svg.innerHTML = '';
      svg.style.width = `${fixedColsWidth + timelinePixelWidth}px`;
      svg.style.height = `${headerHeight + totalRowsHeight}px`;

      // Build the zigzag path
      const points: { x: number; y: number }[] = [];
      
      flatRows.forEach((item, index) => {
        if (!item.startDate || !item.endDate) return;
        
        const itemStart = new Date(item.startDate).getTime();
        const itemEnd = new Date(item.endDate).getTime();
        
        // Only include tasks that span today
        if (itemStart > todayTime || itemEnd < itemStart) return;
        
        const taskDuration = itemEnd - itemStart;
        const elapsed = todayTime - itemStart;
        const expectedProgress = Math.min(100, (elapsed / taskDuration) * 100);
        const actualProgress = item.percentComplete || 0;
        
        // Calculate deviation: positive = ahead, negative = behind
        const deviation = actualProgress - expectedProgress;
        
        // Convert deviation to X offset (max +/- 50px)
        const maxOffset = 50;
        const xOffset = (deviation / 100) * maxOffset;
        
        const y = headerHeight + (index * rowHeight) + (rowHeight / 2);
        const x = todayX + xOffset;
        
        points.push({ x, y });
      });

      if (points.length < 2) return;

      // Create the zigzag path
      let pathD = `M ${points[0].x},${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        pathD += ` L ${points[i].x},${points[i].y}`;
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('stroke', '#EF4444');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('filter', 'drop-shadow(0 0 4px rgba(239,68,68,0.5))');

      // Add glow effect
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      glow.setAttribute('d', pathD);
      glow.setAttribute('stroke', '#EF4444');
      glow.setAttribute('stroke-width', '8');
      glow.setAttribute('fill', 'none');
      glow.setAttribute('opacity', '0.2');
      glow.setAttribute('stroke-linejoin', 'round');
      
      svg.appendChild(glow);
      svg.appendChild(path);

      // Add "Today" label at top
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', todayX.toString());
      label.setAttribute('y', (headerHeight - 5).toString());
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#EF4444');
      label.setAttribute('font-size', '10');
      label.setAttribute('font-weight', 'bold');
      label.textContent = 'INAZUMA';
      svg.appendChild(label);
    };

    requestAnimationFrame(drawInazuma);
  }, [flatRows, dateColumns, columnWidth, fixedColsWidth, totalRowsHeight, today, showInazuma, rowHeight, headerHeight]);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedIds(newExpanded);
  };

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">Advanced WBS & Gantt</h1>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
            Inazuma Progress Line | Baseline Ghosting | Smart Hierarchy | Dependency Curves | FTE Sparklines
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', minWidth: '180px' }}>
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
          
          {/* Interval Selector */}
          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
            {(['week', 'month', 'quarter', 'year'] as GanttInterval[]).map(interval => (
              <button key={interval} onClick={() => setGanttInterval(interval)} style={{
                padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
                background: ganttInterval === interval ? 'var(--pinnacle-teal)' : 'transparent',
                color: ganttInterval === interval ? '#000' : 'var(--text-secondary)',
                border: 'none', borderRadius: '4px', cursor: 'pointer', textTransform: 'capitalize'
              }}>
                {interval}
              </button>
            ))}
          </div>
          
          {/* Zoom Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '4px 10px', border: '1px solid var(--border-color)' }}>
            <input type="range" min="0.25" max="3" step="0.1" value={timelineZoom} onChange={(e) => setTimelineZoom(parseFloat(e.target.value))} style={{ width: '50px', accentColor: 'var(--pinnacle-teal)' }} title="Horizontal" />
            <input type="range" min="0.5" max="2" step="0.1" value={verticalZoom} onChange={(e) => setVerticalZoom(parseFloat(e.target.value))} style={{ width: '50px', accentColor: 'var(--pinnacle-teal)' }} title="Vertical" />
            <button onClick={() => { setTimelineZoom(1); setVerticalZoom(1); }} style={{ padding: '2px 6px', fontSize: '0.6rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}>Reset</button>
          </div>
          
          <button className="btn btn-secondary btn-sm" onClick={scrollToToday}>Today</button>
          
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

      {/* Feature Toggles */}
      <div style={{ display: 'flex', gap: '1rem', padding: '0 1.5rem 0.5rem', fontSize: '0.7rem', color: '#888', flexShrink: 0, flexWrap: 'wrap' }}>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showSparklines} onChange={(e) => setShowSparklines(e.target.checked)} style={{ accentColor: '#3B82F6' }} />
          <span>FTE Sparklines</span>
        </label>
        
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 4, background: '#EF4444', borderRadius: 2 }}></div> Critical Path</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 4, background: '#6B7280', borderRadius: 2 }}></div> Non-Critical</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 4, background: '#6B7280', borderRadius: 2, borderBottom: '1px dashed #EF4444' }}></div> Delay</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 6, background: 'rgba(107,114,128,0.4)', borderRadius: 2 }}></div> Baseline</div>
        </div>
      </div>

      {cpmResult && (
        <div style={{
          display: 'flex', gap: '1rem', margin: '0 1.5rem 1rem',
          background: 'rgba(20, 20, 25, 0.95)', padding: '12px 16px', borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)', alignItems: 'center'
        }}>
          <div className="metric-card" style={{ padding: '8px 16px', background: '#111', minWidth: '120px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Duration</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{cpmResult.projectDuration}d</div>
          </div>
          <div className="metric-card" style={{ padding: '8px 16px', background: '#111', minWidth: '120px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical Tasks</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#EF4444' }}>{cpmResult.stats.criticalTasksCount}</div>
          </div>
          <div className="metric-card" style={{ padding: '8px 16px', background: '#111', minWidth: '120px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg Float</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#40E0D0' }}>{cpmResult.stats.averageFloat.toFixed(1)}d</div>
          </div>
          <div style={{ flex: 1, fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cpmLogs[cpmLogs.length - 1] || 'Analysis complete'}
          </div>
          <button onClick={() => { setCpmResult(null); setCpmLogs([]); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: '#fff', cursor: 'pointer' }}>x</button>
        </div>
      )}

      <div className="chart-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '60vh' }}>
        <div className="chart-card-body no-padding" style={{ flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'scroll', position: 'relative' }} ref={containerRef} onScroll={handleScroll} onWheel={handleWheelZoom}>
          {dataLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', color: 'var(--text-muted)', fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>
              <span>Loading WBS &amp; Gantt...</span>
            </div>
          ) : (
          <>
          {/* SVG for Dependencies */}
          <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 5 }}>
            <defs>
              <marker id="arrowhead-red" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#EF4444" />
              </marker>
              <marker id="arrowhead-gray" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#6B7280" />
              </marker>
            </defs>
          </svg>
          
          {/* SVG for Inazuma Line */}
          <svg ref={inazumaSvgRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 15 }} />

          <table ref={tableRef} className="wbs-table" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0, maxWidth: `${fixedColsWidth + (dateColumns.length * columnWidth)}px` }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 90, background: 'var(--bg-secondary)' }}>
              <tr style={{ height: `${headerHeight}px` }}>
                <th style={{ width: `${wbsCodeColWidth}px`, minWidth: `${wbsCodeColWidth}px`, position: 'sticky', left: 0, top: 0, zIndex: 100, background: 'var(--bg-secondary)', borderRight: '1px solid #444', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header, transition: 'width 0.2s' }}>WBS</th>
                <th style={{ width: '280px', minWidth: '280px', maxWidth: '280px', position: 'sticky', left: `${wbsCodeColWidth}px`, top: 0, zIndex: 100, background: 'var(--bg-secondary)', borderRight: '1px solid #444', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header, transition: 'left 0.2s' }}>Name</th>
                <th style={{ width: '65px', minWidth: '65px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }}>Type</th>
                <th style={{ width: '80px', minWidth: '80px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }}>Resource</th>
                <th style={{ width: '90px', minWidth: '90px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }}>Employee</th>
                {showSparklines && <th style={{ width: '70px', minWidth: '70px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }}>FTE Load</th>}
                <th style={{ width: '75px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }}>Start</th>
                <th style={{ width: '75px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }}>End</th>
                <th style={{ width: '40px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }} className="number">Days</th>
                <th style={{ width: '50px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }} className="number">BL Hrs</th>
                <th style={{ width: '50px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header, color: 'var(--pinnacle-teal)' }} className="number">Act Hrs</th>
                <th style={{ width: '50px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }} className="number">Rem</th>
                <th style={{ width: '65px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }} className="number">BL Cost</th>
                <th style={{ width: '65px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header, color: 'var(--pinnacle-teal)' }} className="number">Act Cost</th>
                <th style={{ width: '65px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }} className="number">Rem Cost</th>
                <th style={{ width: '40px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }} className="number">Eff%</th>
                <th style={{ width: '50px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }} className="number">Prog</th>
                <th style={{ width: '70px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }}>Pred</th>
                <th style={{ width: '35px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header, color: '#ff6b6b' }} className="number">TF</th>
                <th style={{ width: '30px', background: 'var(--bg-secondary)', borderRight: '1px solid #444', borderBottom: '1px solid #333', fontWeight: 700, fontSize: WBS_TABLE_FONT.header }}>CP</th>
                {dateColumns.map((col, i) => {
                  const isCurrentPeriod = today >= col.start && today <= col.end;
                  return (
                    <th key={i} style={{
                      width: `${columnWidth}px`, textAlign: 'center', fontSize: WBS_TABLE_FONT.header,
                      borderLeft: '1px solid #333', borderBottom: '1px solid #333',
                      background: isCurrentPeriod ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-secondary)',
                      color: isCurrentPeriod ? '#EF4444' : 'inherit', fontWeight: 600,
                      position: 'sticky', top: 0, zIndex: 90
                    }}>
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && <tr style={{ height: `${paddingTop}px` }}><td colSpan={100} style={{ padding: 0, border: 'none' }}></td></tr>}
              {virtualRows.map((row) => {
                const isCritical = row.isCritical || (row as any).is_critical;
                const efficiency = row.taskEfficiency || 0;
                const progress = row.percentComplete || 0;
                const isExpanded = expandedIds.has(row.id);
                const worstCase = (row as any).worstCaseStatus;
                
                // Smart color: collapsed parents show worst-case child status
                const getProgressColor = (pct: number) => {
                  if (pct >= 100) return '#22c55e';
                  if (pct >= 75) return '#22c55e';
                  if (pct >= 50) return '#eab308';
                  if (pct >= 25) return '#f97316';
                  return '#ef4444';
                };
                
                const barColor = row.hasChildren && !isExpanded && worstCase
                  ? worstCase.color
                  : isCritical ? '#EF4444' : getProgressColor(progress);

                return (
                  <tr key={row.id} style={{ height: `${rowHeight}px`, background: isCritical ? 'rgba(220, 38, 38, 0.05)' : 'var(--bg-primary)' }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, background: isCritical ? '#1a1010' : 'var(--bg-primary)', borderRight: '1px solid #444', boxShadow: isCritical ? 'inset 2px 0 0 #ef4444' : 'none', width: `${wbsCodeColWidth}px`, minWidth: `${wbsCodeColWidth}px`, transition: 'width 0.2s' }}>
                      <div style={{ paddingLeft: `${(row.indentLevel || 0) * 12}px`, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {row.hasChildren && (
                          <button onClick={() => toggleExpand(row.id)} style={{ color: worstCase && !isExpanded ? worstCase.color : '#fff', cursor: 'pointer', padding: 0, fontSize: '8px', background: 'none', border: 'none' }}>
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span style={{ color: isCritical ? '#ef4444' : 'inherit', fontSize: WBS_TABLE_FONT.cell, fontWeight: isCritical ? 700 : WBS_TABLE_FONT.fontWeight, whiteSpace: 'nowrap' }}>{row.wbsCode}</span>
                      </div>
                    </td>
                    <td style={{ position: 'sticky', left: `${wbsCodeColWidth}px`, zIndex: 10, background: isCritical ? '#1a1010' : 'var(--bg-primary)', borderRight: '1px solid #444', width: '280px', minWidth: '280px', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'left 0.2s' }}>
                      <EnhancedTooltip content={row.name || ''}>
                        <span style={{ fontWeight: row.hasChildren || isCritical ? 700 : WBS_TABLE_FONT.fontWeight, fontSize: WBS_TABLE_FONT.cell, color: isCritical ? '#ef4444' : row.hasChildren && !isExpanded && worstCase ? worstCase.color : 'inherit' }}>{row.name}</span>
                      </EnhancedTooltip>
                    </td>
                    <td style={{ width: '65px', minWidth: '65px' }}><span className={`type-badge ${row.itemType}`} style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>{(row.itemType || '').replace('_', ' ')}</span></td>
                    <td style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight, width: '80px', minWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(row as any).assignedResource || ''}>
                      {(row as any).assignedResource || '-'}
                    </td>
                    <td style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight, width: '90px', minWidth: '90px' }}>
                      {!row.hasChildren ? (
                        editingTaskId === row.id ? (
                          <SearchableDropdown options={employeeOptions} value={row.assignedResourceId || null} onChange={(id) => handleAssignResource(row.id, id)} placeholder="Assign..." disabled={false} />
                        ) : (
                          <button onClick={() => setEditingTaskId(row.id)} style={{ background: 'none', border: 'none', color: row.assignedResourceId ? 'var(--text-primary)' : 'var(--pinnacle-teal)', cursor: 'pointer', fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight, padding: '2px' }}>
                            {row.assignedResourceId ? getEmployeeName(row.assignedResourceId, employees) : '+ Assign'}
                          </button>
                        )
                      ) : '-'}
                    </td>
                    {showSparklines && (
                      <td style={{ padding: '2px 4px' }}>
                        <FTESparkline baselineHours={row.baselineHours || 0} daysRequired={row.daysRequired || 0} percentComplete={row.percentComplete || 0} />
                      </td>
                    )}
                    <td style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>{row.startDate ? new Date(row.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '-'}</td>
                    <td style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>{row.endDate ? new Date(row.endDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '-'}</td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>{row.daysRequired != null ? Number(row.daysRequired).toFixed(0) : '-'}</td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>{row.baselineHours ? Number(row.baselineHours).toFixed(0) : '-'}</td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight, color: 'var(--pinnacle-teal)' }}>{row.actualHours ? Number(row.actualHours).toFixed(0) : '-'}</td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>{(row as any).remainingHours != null ? Number((row as any).remainingHours).toFixed(0) : '-'}</td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>{row.baselineCost != null ? formatCurrency(row.baselineCost) : '-'}</td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight, color: 'var(--pinnacle-teal)' }}>{row.actualCost != null ? formatCurrency(row.actualCost) : '-'}</td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }}>{row.baselineCost != null ? formatCurrency(Math.max(0, (row.baselineCost || 0) - (row.actualCost || 0))) : '-'}</td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight, color: efficiency >= 100 ? '#22c55e' : efficiency >= 80 ? '#eab308' : '#ef4444' }}>{row.taskEfficiency ? `${Math.round(row.taskEfficiency)}%` : '-'}</td>
                    <td>
                      <div className="progress-bar" style={{ width: '30px', height: '6px' }}>
                        <div className="progress-bar-fill" style={{ width: `${row.percentComplete || 0}%`, background: barColor }}></div>
                      </div>
                    </td>
                    <td style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight }} title={row.predecessors?.map((p: any) => getTaskNameFromMap(p.taskId)).join(', ')}>
                      {row.predecessors?.length ? `${row.predecessors.length} dep` : '-'}
                    </td>
                    <td className="number" style={{ fontSize: WBS_TABLE_FONT.cell, fontWeight: WBS_TABLE_FONT.fontWeight, color: (row.totalFloat != null && row.totalFloat <= 0) ? '#ef4444' : 'inherit' }}>
                      {row.totalFloat != null ? row.totalFloat : '-'}
                    </td>
                    <td style={{ textAlign: 'center', borderRight: '1px solid #444' }}>
                      {isCritical && <span style={{ color: '#ef4444', fontWeight: 800, fontSize: WBS_TABLE_FONT.cell }}>CP</span>}
                    </td>

                    {/* Gantt Timeline Cells */}
                    {dateColumns.map((col, i) => {
                      const isCurrentPeriod = today >= col.start && today <= col.end;
                      
                      const content = (() => {
                        if (i === 0 && row.startDate && row.endDate) {
                          const itemStart = new Date(row.startDate);
                          const itemEnd = new Date(row.endDate);
                          if (Number.isNaN(itemStart.getTime()) || Number.isNaN(itemEnd.getTime())) return null;
                          
                          const timelineStart = dateColumns[0].start;
                          const timelineEnd = dateColumns[dateColumns.length - 1].end;
                          const totalDuration = timelineEnd.getTime() - timelineStart.getTime();

                          if (itemEnd >= timelineStart && itemStart <= timelineEnd) {
                            const startOffset = Math.max(0, itemStart.getTime() - timelineStart.getTime());
                            const leftPct = (startOffset / totalDuration) * 100;
                            const effectiveEnd = Math.min(itemEnd.getTime(), timelineEnd.getTime());
                            const effectiveStart = Math.max(itemStart.getTime(), timelineStart.getTime());
                            const widthPct = ((effectiveEnd - effectiveStart) / totalDuration) * 100;

                            const isMilestone = row.is_milestone || row.isMilestone;
                            const pct = row.percentComplete || 0;

                            // Baseline ghost bar
                            const baselineStart = (row as any).baselineStart;
                            const baselineEnd = (row as any).baselineEnd;
                            let baselineBar = null;
                            
                            if (showBaseline && baselineStart && baselineEnd) {
                              const blStart = new Date(baselineStart);
                              const blEnd = new Date(baselineEnd);
                              if (!Number.isNaN(blStart.getTime()) && !Number.isNaN(blEnd.getTime())) {
                                const blStartOffset = Math.max(0, blStart.getTime() - timelineStart.getTime());
                                const blLeftPct = (blStartOffset / totalDuration) * 100;
                                const blEffEnd = Math.min(blEnd.getTime(), timelineEnd.getTime());
                                const blEffStart = Math.max(blStart.getTime(), timelineStart.getTime());
                                const blWidthPct = ((blEffEnd - blEffStart) / totalDuration) * 100;

                                baselineBar = (
                                  <div
                                    title={`Baseline: ${baselineStart} - ${baselineEnd}`}
                                    style={{
                                      position: 'absolute',
                                      width: `calc(${dateColumns.length * 100}% * ${blWidthPct / 100})`,
                                      left: `calc(${dateColumns.length * 100}% * ${blLeftPct / 100})`,
                                      height: '6px',
                                      top: '18px',
                                      background: 'rgba(107, 114, 128, 0.4)',
                                      borderRadius: '2px',
                                      zIndex: 3,
                                      border: '1px solid rgba(107, 114, 128, 0.6)'
                                    }}
                                  />
                                );
                              }
                            }

                            // Check if slipped from baseline
                            const hasSlipped = baselineEnd && new Date(baselineEnd) < itemEnd;

                            return (
                              <>
                                {baselineBar}
                                <div
                                  title={`${row.name}\n${row.startDate} - ${row.endDate}\nProgress: ${pct}%${hasSlipped ? '\nSLIPPED from baseline!' : ''}`}
                                  style={{
                                    position: 'absolute',
                                    width: `calc(${dateColumns.length * 100}% * ${widthPct / 100})`,
                                    left: `calc(${dateColumns.length * 100}% * ${leftPct / 100})`,
                                    height: isMilestone ? '16px' : '14px',
                                    top: isMilestone ? '6px' : '5px',
                                    background: isMilestone ? 'transparent' : (pct === 0 ? '#333' : '#444'),
                                    borderRadius: '3px',
                                    zIndex: 5,
                                    border: isCritical ? '2px solid #ef4444' : hasSlipped ? '1px solid #F59E0B' : 'none',
                                    boxShadow: hasSlipped ? '0 0 6px rgba(245, 158, 11, 0.5)' : '0 1px 3px rgba(0,0,0,0.3)',
                                    display: 'flex', alignItems: 'center'
                                  }}
                                >
                                  {!isMilestone && (
                                    <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px', transition: 'width 0.3s' }} />
                                  )}
                                  {isMilestone && (
                                    <div style={{ width: '4px', height: '100%', background: '#ef4444', marginLeft: '-2px' }} />
                                  )}
                                </div>
                              </>
                            );
                          }
                        }
                        return null;
                      })();

                      return (
                        <td key={i} style={{
                          borderLeft: '1px solid #222',
                          background: isCurrentPeriod ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                          position: 'relative', padding: 0, overflow: i === 0 ? 'visible' : 'hidden'
                        }}>
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {paddingBottom > 0 && <tr style={{ height: `${paddingBottom}px` }}><td colSpan={100} style={{ padding: 0, border: 'none' }}></td></tr>}
            </tbody>
          </table>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
