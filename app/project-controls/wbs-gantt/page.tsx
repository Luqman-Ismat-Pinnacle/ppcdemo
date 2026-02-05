'use client';

/**
 * @fileoverview WBS & Gantt Chart Page for PPC V3 Project Controls.
 * 
 * High-performance split-pane layout with:
 * - Left: WBS hierarchy table with all data columns
 * - Right: ECharts-based Gantt timeline with bars, arrows, milestones
 * 
 * Features:
 * - Work Breakdown Structure (WBS) hierarchy table
 * - ECharts Gantt chart with zoom/scroll
 * - Critical Path Method (CPM) analysis
 * - Task progress and efficiency tracking
 * - Expandable/collapsible hierarchy navigation
 * - Resource assignment with searchable dropdown
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
  sortByState,
} from '@/lib/sort-utils';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import SearchableDropdown from '@/components/ui/SearchableDropdown';
import WBSGanttChart, { WBSGanttItem } from '@/components/charts/WBSGanttChart';

// ============================================================================
// HELPERS
// ============================================================================

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

// ============================================================================
// COMPONENT
// ============================================================================

export default function WBSGanttPage() {
  const { filteredData, updateData, data: fullData, setHierarchyFilter, dateFilter, hierarchyFilter } = useData();
  const { addEngineLog } = useLogs();
  const data = filteredData;
  const employees = fullData.employees;

  // State
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cpmResult, setCpmResult] = useState<CPMResult | null>(null);
  const [cpmLogs, setCpmLogs] = useState<string[]>([]);
  const [wbsSort, setWbsSort] = useState<SortState | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [wbsSearchQuery, setWbsSearchQuery] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [tableWidth, setTableWidth] = useState(700); // Adjustable table width
  
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // WBS Data
  const wbsDataForTable = useMemo(() => {
    const dateFilterActive = dateFilter && dateFilter.type !== 'all';
    const raw = dateFilterActive ? fullData.wbsData : data.wbsData;
    if (!raw?.items?.length) return { items: [] as any[] };
    if (!dateFilterActive) return raw;
    if (!hierarchyFilter?.path?.length) return raw;
    return { ...raw, items: filterWbsItemsByPath(raw.items, hierarchyFilter.path) };
  }, [dateFilter, fullData.wbsData, data.wbsData, hierarchyFilter?.path]);

  // Project options for CPM
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

  // Sorted items
  const sortedWbsItems = useMemo(() => {
    if (!wbsDataForTable?.items?.length) return [];
    if (!wbsSort) return wbsDataForTable.items;

    const getSortValue = (item: any, key: string) => {
      switch (key) {
        case 'wbsCode': return item.wbsCode;
        case 'name': return item.name;
        case 'itemType': return item.itemType || item.type;
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
  }, [wbsDataForTable?.items, wbsSort]);

  // Search filtered items
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

  // Flatten items for display
  const flatRows = useMemo(() => {
    const list: WBSTableRow[] = [];
    const seenIds = new Set<string>();

    const walk = (item: any, level: number, parentId: string | null, parentVisible: boolean, parentExpanded: boolean) => {
      const id = item?.id ?? '';
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const isVisible = parentId === null || (parentVisible && parentExpanded);
      if (!isVisible) return;

      const hasChildren = !!(item.children && item.children.length > 0);
      const itemType = item.itemType || item.type || 'task';
      const percentComplete = hasChildren
        ? (item.percentComplete ?? getRollupPercentComplete(item))
        : (item.percentComplete ?? 0);

      list.push({
        ...item,
        percentComplete,
        itemType,
        level,
        indentLevel: level - 1,
        hasChildren,
        isExpanded: expandedIds.has(id),
        rowIndex: list.length,
        isVisible: true
      });

      (item.children as any[] || []).forEach((child: any) => 
        walk(child, level + 1, id, true, expandedIds.has(id))
      );
    };

    searchFilteredItems.forEach((item: any) => walk(item, 1, null, true, true));
    return list;
  }, [searchFilteredItems, expandedIds]);

  // Convert to WBSGanttItem for chart
  const ganttItems = useMemo((): WBSGanttItem[] => {
    return flatRows.map(row => ({
      id: row.id,
      name: row.name,
      wbsCode: row.wbsCode,
      level: row.level,
      startDate: row.startDate as string | null,
      endDate: row.endDate as string | null,
      percentComplete: row.percentComplete || 0,
      isCritical: row.isCritical || (row as any).is_critical || false,
      isMilestone: row.is_milestone || row.isMilestone || false,
      hasChildren: row.hasChildren,
      isExpanded: row.isExpanded,
      predecessors: row.predecessors,
      taskEfficiency: row.taskEfficiency,
      totalFloat: row.totalFloat,
      itemType: row.itemType
    }));
  }, [flatRows]);

  // Task name map for predecessor display
  const taskNameMap = useMemo(() => {
    return new Map(flatRows.map(r => [r.id, r.name]));
  }, [flatRows]);

  const getTaskNameFromMap = (taskId: string | undefined): string => {
    if (!taskId) return '-';
    const name = taskNameMap.get(taskId);
    return name?.split(' ').slice(0, 3).join(' ') || taskId.replace('wbs-', '');
  };

  // Employee options for assignment
  const employeeOptions = useMemo(() => {
    return (employees || []).map((emp: any) => ({
      id: emp.id || emp.employeeId,
      name: emp.name || 'Unknown',
      secondary: emp.role || emp.jobTitle || 'No Role',
    }));
  }, [employees]);

  // Auto-expand on data load
  const lastWbsDataKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const items = wbsDataForTable?.items;
    const key = items?.length ? `${items.length}-${(items as any[])[0]?.id ?? ''}` : null;
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

  // Handlers
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
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
  }, [wbsDataForTable?.items]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleAssignResource = useCallback((taskId: string, employeeId: string | null) => {
    if (!data.wbsData?.items) return;
    
    const updateItemsRecursively = (items: any[]): any[] => {
      return items.map(item => {
        if (item.id === taskId) {
          return { ...item, assignedResourceId: employeeId };
        }
        if (item.children) {
          return { ...item, children: updateItemsRecursively(item.children) };
        }
        return item;
      });
    };
    
    const updated = updateItemsRecursively(data.wbsData.items);
    updateData({ wbsData: { ...data.wbsData, items: updated } });
    setEditingTaskId(null);
  }, [data.wbsData, updateData]);

  const handleChartItemClick = useCallback((itemId: string) => {
    const item = flatRows.find(r => r.id === itemId);
    if (item?.hasChildren) {
      toggleExpand(itemId);
    }
  }, [flatRows, toggleExpand]);

  // CPM Analysis
  const runCPM = useCallback(() => {
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

    // Update global state with CPM results
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
          newItem.totalFloat = Math.min(...newItem.children.map((c: any) => c.totalFloat ?? Infinity));
          if (newItem.totalFloat === Infinity) newItem.totalFloat = 0;
        }
        return newItem;
      });
    };

    if (data.wbsData?.items) {
      const logs: string[] = [];
      const startTime = performance.now();
      logs.push(`[${new Date().toLocaleTimeString()}] CPM Engine Initialized`);
      logs.push(`> Loading ${tasks.length} tasks...`);
      
      const updated = updateItems(data.wbsData.items);
      updateData({ wbsData: { ...data.wbsData, items: updated } });
      
      const endTime = performance.now();
      logs.push(`> Calculation completed in ${(endTime - startTime).toFixed(2)}ms`);
      logs.push(`> Critical Path: ${result.stats.criticalTasksCount} tasks`);
      logs.push(`> Average Float: ${result.stats.averageFloat.toFixed(1)} days`);
      
      setCpmLogs(logs);
      addEngineLog('CPM', logs, {
        executionTimeMs: endTime - startTime,
        projectDurationDays: result.projectDuration,
        criticalPathCount: result.stats.criticalTasksCount,
      });
    }
  }, [wbsDataForTable?.items, selectedProjectId, fullData, data.wbsData, updateData, setHierarchyFilter, addEngineLog]);

  // Progress color helper
  const getProgressColor = (pct: number) => {
    if (pct >= 75) return '#22c55e';
    if (pct >= 50) return '#eab308';
    if (pct >= 25) return '#f97316';
    return '#ef4444';
  };

  // Virtualization
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const rowHeight = 32;
  const buffer = 10;

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const updateHeight = () => setViewportHeight(el.clientHeight);
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const { virtualRows, paddingTop, paddingBottom } = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
    const endRow = Math.min(flatRows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer);
    return {
      virtualRows: flatRows.slice(startRow, endRow),
      paddingTop: startRow * rowHeight,
      paddingBottom: (flatRows.length - endRow) * rowHeight
    };
  }, [scrollTop, viewportHeight, flatRows, rowHeight]);

  return (
    <div className="page-panel full-height-page" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Header */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div>
          <h1 className="page-title">WBS & Gantt Chart</h1>
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
                width: '100%',
                padding: '0.4rem 0.6rem 0.4rem 2rem',
                fontSize: '0.8rem',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <svg viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          
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
      <div style={{ display: 'flex', gap: '1rem', padding: '0 1.5rem 0.5rem', fontSize: '0.7rem', color: '#888', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 12, background: '#ef4444', borderRadius: 2 }}></div> 0-25%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 12, background: '#f97316', borderRadius: 2 }}></div> 25-50%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 12, background: '#eab308', borderRadius: 2 }}></div> 50-75%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 12, background: '#22c55e', borderRadius: 2 }}></div> 75-100%</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '1rem' }}><div style={{ width: 12, height: 12, border: '2px solid #ef4444' }}></div> Critical Path</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444"><path d="M12 2l6 10-6 10-6-10z" /></svg>
          Milestone
        </div>
      </div>

      {/* CPM Results */}
      {cpmResult && (
        <div style={{
          display: 'flex',
          gap: '1rem',
          margin: '0 1.5rem 1rem',
          padding: '12px 16px',
          background: 'rgba(20, 20, 25, 0.95)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.08)',
          alignItems: 'center',
          position: 'relative'
        }}>
          <button
            onClick={() => { setCpmResult(null); setCpmLogs([]); }}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
          
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Duration</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#40E0D0' }}>{cpmResult.projectDuration} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>days</span></div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Critical Tasks</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#E91E63' }}>{cpmResult.stats.criticalTasksCount}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Avg Float</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#CDDC39' }}>{cpmResult.stats.averageFloat.toFixed(1)} <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>days</span></div>
            </div>
          </div>
          
          <div style={{ flex: 1, maxHeight: '60px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '8px', fontSize: '0.65rem', fontFamily: 'monospace', color: '#aaa' }}>
            {cpmLogs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content: Split Pane */}
      <div style={{ flex: 1, display: 'flex', gap: '1px', background: 'var(--border-color)', margin: '0 1.5rem 1.5rem', borderRadius: '12px', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: WBS Table */}
        <div 
          ref={tableContainerRef}
          style={{ 
            width: tableWidth, 
            flexShrink: 0, 
            background: 'var(--bg-primary)', 
            overflowX: 'auto', 
            overflowY: 'auto',
            position: 'relative'
          }}
          onScroll={handleScroll}
        >
          <table className="wbs-table" style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-secondary)' }}>
              <tr style={{ height: '36px' }}>
                <th style={{ width: '100px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, whiteSpace: 'nowrap', padding: '0 8px' }}>WBS</th>
                <th style={{ width: '250px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, padding: '0 8px' }}>Name</th>
                <th style={{ width: '70px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600 }}>Type</th>
                <th style={{ width: '80px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600 }}>Resource</th>
                <th style={{ width: '75px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600 }}>Start</th>
                <th style={{ width: '75px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600 }}>End</th>
                <th style={{ width: '50px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, textAlign: 'right' }}>Prog</th>
                <th style={{ width: '40px', background: 'var(--bg-secondary)', borderBottom: '1px solid #333', fontWeight: 600, textAlign: 'center' }}>CP</th>
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && <tr style={{ height: paddingTop }}><td colSpan={8}></td></tr>}
              {virtualRows.map((row) => {
                const isCritical = row.isCritical || (row as any).is_critical;
                const progressColor = getProgressColor(row.percentComplete || 0);
                
                return (
                  <tr key={row.id} style={{ height: rowHeight, background: isCritical ? 'rgba(220, 38, 38, 0.05)' : 'var(--bg-primary)' }}>
                    <td style={{ padding: '0 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: `${(row.level - 1) * 12}px` }}>
                        {row.hasChildren && (
                          <button
                            onClick={() => toggleExpand(row.id)}
                            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '8px' }}
                          >
                            {row.isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span style={{ fontSize: '0.65rem', color: isCritical ? '#ef4444' : 'inherit' }}>{row.wbsCode}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0 8px' }}>
                      <EnhancedTooltip content={row.name || ''}>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: row.hasChildren ? 600 : 400, 
                          color: isCritical ? '#ef4444' : 'inherit',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '230px'
                        }}>{row.name}</span>
                      </EnhancedTooltip>
                    </td>
                    <td><span className={`type-badge ${row.itemType}`} style={{ fontSize: '0.5rem' }}>{(row.itemType || '').replace('_', ' ')}</span></td>
                    <td style={{ fontSize: '0.65rem', padding: '2px' }}>
                      {!row.hasChildren ? (
                        editingTaskId === row.id ? (
                          <div style={{ position: 'relative' }}>
                            <SearchableDropdown
                              options={employeeOptions}
                              value={row.assignedResourceId || null}
                              onChange={(id) => handleAssignResource(row.id, id)}
                              placeholder="Assign..."
                              disabled={false}
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditingTaskId(row.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: row.assignedResourceId ? 'var(--text-primary)' : 'var(--pinnacle-teal)',
                              cursor: 'pointer',
                              padding: '2px',
                              fontSize: '0.65rem'
                            }}
                          >
                            {row.assignedResourceId ? getEmployeeName(row.assignedResourceId, employees) : '+ Assign'}
                          </button>
                        )
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>{getEmployeeName(row.assignedResourceId, employees)}</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.6rem' }}>{row.startDate ? new Date(row.startDate as string).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '-'}</td>
                    <td style={{ fontSize: '0.6rem' }}>{row.endDate ? new Date(row.endDate as string).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '-'}</td>
                    <td style={{ textAlign: 'right', padding: '0 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                        <div style={{ width: '30px', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${row.percentComplete || 0}%`, height: '100%', background: progressColor }}></div>
                        </div>
                        <span style={{ fontSize: '0.6rem', color: progressColor }}>{row.percentComplete || 0}%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isCritical && <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.6rem' }}>CP</span>}
                    </td>
                  </tr>
                );
              })}
              {paddingBottom > 0 && <tr style={{ height: paddingBottom }}><td colSpan={8}></td></tr>}
            </tbody>
          </table>
        </div>

        {/* Resize Handle */}
        <div
          style={{
            width: '6px',
            background: 'var(--bg-tertiary)',
            cursor: 'col-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = tableWidth;
            
            const onMouseMove = (e: MouseEvent) => {
              const delta = e.clientX - startX;
              setTableWidth(Math.max(400, Math.min(1000, startWidth + delta)));
            };
            
            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        >
          <div style={{ width: '2px', height: '30px', background: 'rgba(255,255,255,0.2)', borderRadius: '1px' }}></div>
        </div>

        {/* Right: ECharts Gantt */}
        <div ref={chartContainerRef} style={{ flex: 1, background: 'var(--bg-primary)', minWidth: 0 }}>
          <WBSGanttChart
            items={ganttItems}
            height="100%"
            onItemClick={handleChartItemClick}
            rowHeight={rowHeight}
          />
        </div>
      </div>
    </div>
  );
}
