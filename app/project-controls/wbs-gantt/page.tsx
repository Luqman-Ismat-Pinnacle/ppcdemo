'use client';

/**
 * @fileoverview Advanced WBS & Gantt Chart — PPC V3 Project Controls.
 *
 * Executive-level visualization with:
 * - Collapsible WBS Hierarchy with progress-based color aggregation
 * - Baseline Ghosting — ghost bars showing original schedule creep
 * - Dependency Curves with color coding (critical / non-critical / delay)
 * - FTE Sparklines — mini resource charts in sidebar
 * - Full CPM analysis integration
 * - Virtual scrolling for large datasets
 * - Fit-to-view zoom, row density, Ctrl+wheel zoom
 * - Rich floating bar tooltips
 * 
 * @module app/project-controls/wbs-gantt/page
 */

import React, { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react';
import { useData } from '@/lib/data-context';
import { useRouteLoading } from '@/lib/route-loading-context';
import PageLoader from '@/components/ui/PageLoader';
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

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS & STYLES
// ═══════════════════════════════════════════════════════════════════

/** WBS-level type colours used for badges */
const WBS_COLORS: Record<string, string> = {
  portfolio: '#40E0D0',
  customer: '#CDDC39',
  site: '#E91E63',
  project: '#FF9800',
  unit: '#7C4DFF',
  sub_project: '#1A9B8F',
  phase: '#1A9B8F',
  task: '#9E9D24',
  sub_task: '#AD1457',
  critical: '#DC2626',
};

type GanttInterval = 'week' | 'month' | 'quarter' | 'year';
type RowDensity = 'compact' | 'normal' | 'comfortable';

const ROW_HEIGHTS: Record<RowDensity, number> = { compact: 24, normal: 32, comfortable: 42 };

/** Column widths — sized to always fit header text and common content */
const COL = {
  NAME: 280,
  TYPE: 90,       // fits "sub project" badge
  RESOURCE: 80,
  EMPLOYEE: 90,
  SPARKLINE: 70,
  START: 82,
  END: 82,
  DAYS: 48,
  BL_HRS: 56,
  ACT_HRS: 56,
  REM_HRS: 50,
  BL_COST: 65,
  ACT_COST: 65,
  REM_COST: 68,   // fits "Rem Cost" header
  EFF: 48,        // fits "Eff%" header
  PROG: 50,
  PRED: 70,
  TF: 40,
  CP: 36,
} as const;

/** Shared header-cell style — individual cells only override what differs. */
const TH_BASE: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  borderBottom: '1px solid #333',
  fontWeight: 600,
  fontSize: '0.65rem',
};

/** Shared data-cell font size used on most <td> elements. */
const TD_FONT: React.CSSProperties = { fontSize: '0.6rem' };

/** Progress-to-colour mapping (used for ALL bars — leaf and rollup). */
const getProgressColor = (pct: number): string => {
  if (pct >= 75) return '#22c55e';
  if (pct >= 50) return '#eab308';
  if (pct >= 25) return '#f97316';
  return '#ef4444';
};

// ═══════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/** Resolve employee first name from ID. */
const getEmployeeName = (rid: string | undefined, employees: Employee[]): string => {
  if (!rid) return '-';
  const emp = employees.find(e => (e as any).id === rid || e.employeeId === rid);
  return emp?.name?.split(' ')[0] || rid;
};

/** Recursively aggregate worst-case child status for collapsed parents. */
function getWorstCaseStatus(items: any[]): { color: string; status: 'critical' | 'behind' | 'at-risk' | 'on-track' } {
  let worst: 'critical' | 'behind' | 'at-risk' | 'on-track' = 'on-track';
  const check = (item: any) => {
    if (worst === 'critical') return;
    if (item.isCritical || item.is_critical) { worst = 'critical'; return; }
    const p = item.percentComplete || 0;
    const e = item.taskEfficiency || 100;
    if (p < 25 && e < 80) { if (worst !== 'critical') worst = 'behind'; }
    else if (p < 50 || e < 90) { if (worst === 'on-track') worst = 'at-risk'; }
    if (item.children) item.children.forEach(check);
  };
  items.forEach(check);
  const colors = { critical: '#EF4444', behind: '#F97316', 'at-risk': '#EAB308', 'on-track': '#22C55E' };
  return { color: colors[worst], status: worst };
}

/** Filter WBS items by hierarchy path. */
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

/** Simple average rollup of percent-complete down the tree. */
function getRollupPercentComplete(item: any): number {
  if (!item?.children?.length) return item?.percentComplete ?? 0;
  const pcts = item.children.map((c: any) => getRollupPercentComplete(c));
  const sum = pcts.reduce((a: number, b: number) => a + b, 0);
  return pcts.length ? Math.round(sum / pcts.length) : (item.percentComplete ?? 0);
}

// ═══════════════════════════════════════════════════════════════════
// SUB-COMPONENTS (memoised for perf)
// ═══════════════════════════════════════════════════════════════════

/** Mini FTE sparkline rendered inside the sidebar. */
let _sparkId = 0;
const FTESparkline = memo(function FTESparkline({
  baselineHours, daysRequired, percentComplete,
}: { baselineHours: number; daysRequired: number; percentComplete: number }) {
  const W = 60, H = 16;
  const clipId = useMemo(() => `fte-clip-${++_sparkId}`, []);

  const points = useMemo(() => {
    if (!baselineHours || !daysRequired) return null;
    const ftePerDay = baselineHours / (daysRequired * 8);
    const n = Math.min(Math.max(3, Math.ceil(daysRequired / 5)), 10);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const intensity = Math.exp(-Math.pow((t - 0.3) * 3, 2));
      pts.push({ x: t * W, y: H - intensity * ftePerDay * 4 - 2 });
    }
    return pts;
  }, [baselineHours, daysRequired]);

  if (!points || points.length < 2) return <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>-</span>;

  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
  const progressX = (percentComplete / 100) * W;

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <line x1="0" y1={H - 2} x2={W} y2={H - 2} stroke="var(--border-color)" strokeWidth="0.5" />
      <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="1.5" opacity="0.8" />
      <line x1={progressX} y1="0" x2={progressX} y2={H} stroke="var(--pinnacle-teal)" strokeWidth="1" strokeDasharray="2,1" />
      <defs><clipPath id={clipId}><rect x="0" y="0" width={progressX} height={H} /></clipPath></defs>
      <path d={`${pathD} L ${W},${H - 2} L 0,${H - 2} Z`} fill="rgba(59,130,246,0.2)" />
    </svg>
  );
});

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function WBSGanttPage() {
  const { filteredData, updateData, data: fullData, setHierarchyFilter, dateFilter, hierarchyFilter, isLoading } = useData();
  const { routeChanging, setRouteReady } = useRouteLoading();
  useEffect(() => { setRouteReady(); }, [setRouteReady]);
  const { addEngineLog } = useLogs();
  const data = filteredData;
  const employees = fullData.employees;

  // ── State ──────────────────────────────────────────────────────
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showSparklines, setShowSparklines] = useState(true);
  
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cpmResult, setCpmResult] = useState<CPMResult | null>(null);
  const [cpmLogs, setCpmLogs] = useState<string[]>([]);
  const [ganttInterval, setGanttInterval] = useState<GanttInterval>('week');
  const [wbsSort, setWbsSort] = useState<SortState | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [wbsSearchQuery, setWbsSearchQuery] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [rowDensity, setRowDensity] = useState<RowDensity>('normal');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [barTip, setBarTip] = useState<{ row: any; x: number; y: number } | null>(null);
  
  // ── Refs ───────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const lastWbsDataKeyRef = useRef<string | null>(null);

  // ── Close assign dropdown on click-away ────────────────────────
  useEffect(() => {
    if (!editingTaskId) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.searchable-dropdown') || t.closest('[data-assign-cell]')) return;
      setEditingTaskId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingTaskId]);

  // ── Derived data: WBS source (respects date filter) ────────────
  const wbsDataForTable = useMemo(() => {
    const dateFilterActive = dateFilter && dateFilter.type !== 'all';
    const raw = dateFilterActive ? fullData.wbsData : data.wbsData;
    if (!raw?.items?.length) return { items: [] as any[] };
    if (!dateFilterActive) return raw;
    if (!hierarchyFilter?.path?.length) return raw;
    return { ...raw, items: filterWbsItemsByPath(raw.items, hierarchyFilter.path) };
  }, [dateFilter, fullData.wbsData, data.wbsData, hierarchyFilter?.path]);

  // ── Project options for CPM selector (show all projects; sort those with schedule first) ──
  const projectOptions = useMemo(() => {
    const list = (fullData.projects || []).map((p: any) => ({
      id: p.id || p.projectId,
      name: p.name,
      secondary: p.projectId,
      hasSchedule: p.has_schedule === true || p.hasSchedule === true,
    }));
    return list
      .sort((a: any, b: any) => (b.hasSchedule ? 1 : 0) - (a.hasSchedule ? 1 : 0))
      .map(({ id, name, secondary }) => ({ id, name, secondary }));
  }, [fullData.projects]);

  // ── Employee options for Assign dropdown ───────────────────────
  const employeeOptions = useMemo(() =>
    (employees || []).map((emp: any) => ({
      id: emp.id || emp.employeeId,
      name: emp.name || 'Unknown',
      secondary: emp.role || emp.jobTitle || 'No Role',
      role: (emp.role || emp.jobTitle || '').toLowerCase(),
    })),
    [employees],
  );

  const today = useMemo(() => new Date(), []);

  // ── Date range from data ───────────────────────────────────────
  const { projectStart, projectEnd } = useMemo(() => {
    let minD: Date | null = null;
    let maxD: Date | null = null;
    const scan = (items: any[]) => {
      for (const item of items) {
        for (const k of ['startDate', 'baselineStart']) {
          if (item[k]) { const d = new Date(item[k]); if (!minD || d < minD) minD = d; }
        }
        for (const k of ['endDate', 'baselineEnd']) {
          if (item[k]) { const d = new Date(item[k]); if (!maxD || d > maxD) maxD = d; }
        }
        if (item.children) scan(item.children);
      }
    };
    if (wbsDataForTable?.items?.length) scan(wbsDataForTable.items);
    const now = new Date();
    if (!minD || now < minD) minD = now;
    if (!maxD || now > maxD) maxD = now;
    return { projectStart: minD!, projectEnd: maxD! };
  }, [wbsDataForTable?.items]);

  // ── Generate timeline columns ──────────────────────────────────
  const dateColumns = useMemo(() => {
    const cols: { start: Date; end: Date; label: string }[] = [];
    const bs = new Date(projectStart);
    const be = new Date(projectEnd);
    const buf = 5;

    switch (ganttInterval) {
      case 'week': {
        bs.setDate(bs.getDate() - 7 * buf);
        be.setDate(be.getDate() + 7 * buf);
        let c = new Date(bs);
        const day = c.getDay();
        c.setDate(c.getDate() - day + (day === 0 ? -6 : 1));
        c.setDate(c.getDate() - 7 * buf);
        while (c <= be) {
          const e = new Date(c); e.setDate(e.getDate() + 6);
          cols.push({ start: new Date(c), end: e, label: c.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) });
          c.setDate(c.getDate() + 7);
        }
        break;
      }
      case 'month': {
        bs.setMonth(bs.getMonth() - buf);
        be.setMonth(be.getMonth() + buf);
        let c = new Date(bs.getFullYear(), bs.getMonth(), 1);
        while (c <= be) {
          cols.push({ start: new Date(c), end: new Date(c.getFullYear(), c.getMonth() + 1, 0), label: c.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
          c.setMonth(c.getMonth() + 1);
        }
        break;
      }
      case 'quarter': {
        bs.setMonth(bs.getMonth() - 3 * buf);
        be.setMonth(be.getMonth() + 3 * buf);
        let c = new Date(bs.getFullYear(), Math.floor(bs.getMonth() / 3) * 3, 1);
        while (c <= be) {
          const q = Math.floor(c.getMonth() / 3) + 1;
          cols.push({ start: new Date(c), end: new Date(c.getFullYear(), c.getMonth() + 3, 0), label: `Q${q} ${String(c.getFullYear()).slice(-2)}` });
          c.setMonth(c.getMonth() + 3);
        }
        break;
      }
      case 'year': {
        bs.setFullYear(bs.getFullYear() - buf);
        be.setFullYear(be.getFullYear() + buf);
        let c = new Date(bs.getFullYear(), 0, 1);
        while (c <= be) {
          cols.push({ start: new Date(c), end: new Date(c.getFullYear(), 11, 31), label: String(c.getFullYear()) });
          c.setFullYear(c.getFullYear() + 1);
        }
        break;
      }
    }
    return cols;
  }, [ganttInterval, projectStart, projectEnd]);

  const baseColumnWidth = ganttInterval === 'week' ? 40 : ganttInterval === 'month' ? 80 : ganttInterval === 'quarter' ? 120 : 200;
  const columnWidth = Math.round(baseColumnWidth * timelineZoom);

  const todayColumnIndex = useMemo(() =>
    dateColumns.findIndex(col => today >= col.start && today <= col.end),
    [dateColumns, today],
  );

  // ── Sorting / search / flat rows ───────────────────────────────
  const sortedWbsItems = useMemo(() => {
    if (!wbsDataForTable?.items?.length) return [];
    if (!wbsSort) return wbsDataForTable.items;
    const getVal = (item: any, key: string) => {
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
      const sorted = sortByState(items, wbsSort, getVal);
      return sorted.map(i => i.children ? { ...i, children: sortItems(i.children) } : i);
    };
    return sortItems(wbsDataForTable.items);
  }, [wbsDataForTable?.items, wbsSort, employees]);

  const searchFilteredItems = useMemo(() => {
    const q = (wbsSearchQuery || '').trim().toLowerCase();
    if (!q) return sortedWbsItems;
    const matches = (item: any) => ((item.name ?? '') + ' ' + (item.wbsCode ?? '')).toLowerCase().includes(q);
    const filter = (items: any[]): any[] =>
      items.map((item: any) => {
        const fc = item.children?.length ? filter(item.children) : undefined;
        return (matches(item) || (fc && fc.length > 0)) ? { ...item, children: fc } : null;
      }).filter(Boolean);
    return filter(sortedWbsItems);
  }, [sortedWbsItems, wbsSearchQuery]);

  // Auto-expand on search
  useEffect(() => {
    if (!(wbsSearchQuery || '').trim()) return;
    const ids = new Set<string>();
    const collect = (list: any[]) => list.forEach((it: any) => {
      if (it.children?.length) { ids.add(it.id); collect(it.children); }
    });
    collect(searchFilteredItems);
    setExpandedIds(prev => new Set([...prev, ...ids]));
  }, [wbsSearchQuery, searchFilteredItems]);

  // Build flat rows — memoised
  const allRowsWithParent = useMemo(() => {
    const list: { row: WBSTableRow; parentId: string | null; level: number }[] = [];
    const seen = new Set<string>();
    const walk = (item: any, level: number, parentId: string | null) => {
      const id = item?.id ?? '';
      if (seen.has(id)) return;
      seen.add(id);
      const hasChildren = !!(item.children?.length);
      const itemType = item.itemType || item.type || 'task';
      const percentComplete = hasChildren
        ? (item.percentComplete ?? getRollupPercentComplete(item))
        : (item.percentComplete ?? 0);
      const worstCase = hasChildren ? getWorstCaseStatus(item.children) : null;
      list.push({
        parentId, level,
        row: {
          ...item, percentComplete, itemType, level,
          indentLevel: level - 1, hasChildren,
          isExpanded: expandedIds.has(id), rowIndex: 0, isVisible: true,
          worstCaseStatus: worstCase,
        } as any,
      });
      (item.children as any[] || []).forEach((c: any) => walk(c, level + 1, id));
    };
    searchFilteredItems.forEach((it: any) => walk(it, 1, null));
    return list;
  }, [searchFilteredItems, expandedIds]);

  const flatRows = useMemo(() => {
    const vis = new Set<string>();
    const rows: WBSTableRow[] = [];
    allRowsWithParent.forEach(({ row, parentId }) => {
      const id = row.id ?? '';
      const isRoot = parentId === null;
      if (isRoot || (vis.has(parentId!) && expandedIds.has(parentId!))) {
        vis.add(id);
        rows.push({ ...row, rowIndex: rows.length, isVisible: true });
      }
    });
    return rows;
  }, [allRowsWithParent, expandedIds]);

  // Auto-expand on first load (level 2)
  useEffect(() => {
    const items = wbsDataForTable?.items;
    const key = items?.length ? `${items.length}-${(items as any[])[0]?.id ?? ''}` : null;
    if (key === lastWbsDataKeyRef.current) return;
    lastWbsDataKeyRef.current = key;
    if (!items?.length) return;
    collapseToLevel(2);
  }, [wbsDataForTable?.items]);

  const taskNameMap = useMemo(() => new Map(flatRows.map(r => [r.id, r.name])), [flatRows]);
  const getTaskNameFromMap = useCallback(
    (tid?: string) => tid ? (taskNameMap.get(tid)?.split(' ').slice(0, 3).join(' ') || tid.replace('wbs-', '')) : '-',
    [taskNameMap],
  );

  // ── Layout measurements ────────────────────────────────────────
  const wbsCodeColWidth = useMemo(() => {
    if (!flatRows.length) return 80;
    const maxLvl = flatRows.reduce((m, r) => Math.max(m, r.indentLevel || 0), 0);
    return Math.max(80, 80 + Math.max(0, maxLvl - 1) * 12);
  }, [flatRows]);

  /** Sum of all fixed (non-timeline) column widths */
  const fixedColsWidth = useMemo(() =>
    wbsCodeColWidth + COL.NAME + COL.TYPE + COL.RESOURCE + COL.EMPLOYEE
    + COL.START + COL.END + COL.DAYS + COL.BL_HRS + COL.ACT_HRS + COL.REM_HRS
    + COL.BL_COST + COL.ACT_COST + COL.REM_COST + COL.EFF + COL.PROG
    + COL.PRED + COL.TF + COL.CP + (showSparklines ? COL.SPARKLINE : 0),
    [wbsCodeColWidth, showSparklines],
  );

  const rowHeight = ROW_HEIGHTS[rowDensity];
  const headerHeight = 38;
  const BUFFER = 10;
  const totalRowsHeight = flatRows.length * rowHeight;

  // ── Virtualisation ─────────────────────────────────────────────
  const { virtualRows, paddingTop, paddingBottom } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER);
    const end = Math.min(flatRows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + BUFFER);
    return { virtualRows: flatRows.slice(start, end), paddingTop: start * rowHeight, paddingBottom: (flatRows.length - end) * rowHeight };
  }, [scrollTop, viewportHeight, flatRows, rowHeight]);

  // ── Viewport resize observer ───────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wbsDataForTable?.items?.length]);

  // ── Scroll handler (rAF throttled, clears bar tooltip) ─────────
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => { scrollRafRef.current = null; setScrollTop(top); });
    if (barTip) setBarTip(null);
  }, [barTip]);

  // ── Wheel zoom (Ctrl/Cmd = timeline zoom) ─────────────────────
  const handleWheelZoom = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setTimelineZoom(prev => Math.max(0.25, Math.min(4, prev + (e.deltaY > 0 ? -0.1 : 0.1))));
    }
  }, []);

  // ── Expand / collapse helpers ──────────────────────────────────
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const ids = new Set<string>();
    const collect = (items: any[]) => items.forEach(it => { if (it.children?.length) { ids.add(it.id); collect(it.children); } });
    if (wbsDataForTable?.items?.length) collect(wbsDataForTable.items);
    setExpandedIds(ids);
  }, [wbsDataForTable?.items]);

  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);

  const collapseToLevel = useCallback((target: number) => {
    const ids = new Set<string>();
    const walk = (items: any[], lvl: number) => items.forEach(it => {
      if (it.children?.length && lvl < target) { ids.add(it.id); walk(it.children, lvl + 1); }
    });
    if (wbsDataForTable?.items?.length) walk(wbsDataForTable.items, 1);
    setExpandedIds(ids);
  }, [wbsDataForTable?.items]);

  const scrollToToday = useCallback(() => {
    if (!containerRef.current || todayColumnIndex < 0) return;
    const stickyW = wbsCodeColWidth + COL.NAME;
    const vpW = containerRef.current.clientWidth;
    const todayPx = todayColumnIndex * columnWidth;
    containerRef.current.scrollTo({ left: Math.max(0, fixedColsWidth - stickyW + todayPx - (vpW - stickyW) / 2 + columnWidth / 2), behavior: 'smooth' });
  }, [todayColumnIndex, columnWidth, fixedColsWidth, wbsCodeColWidth]);

  // ── Fit-to-view zoom ──────────────────────────────────────────
  const fitToView = useCallback(() => {
    if (!containerRef.current || !dateColumns.length) return;
    const available = containerRef.current.clientWidth - fixedColsWidth;
    if (available > 0) {
      const fitWidth = available / dateColumns.length;
      setTimelineZoom(Math.max(0.25, Math.min(4, fitWidth / baseColumnWidth)));
    }
  }, [fixedColsWidth, dateColumns.length, baseColumnWidth]);

  // ── Bar tooltip handlers ──────────────────────────────────────
  const handleBarMouseEnter = useCallback((e: React.MouseEvent, row: any) => {
    const x = Math.min(e.clientX + 16, window.innerWidth - 350);
    const y = Math.max(10, Math.min(e.clientY - 20, window.innerHeight - 360));
    setBarTip({ row, x, y });
  }, []);

  const handleBarMouseLeave = useCallback(() => setBarTip(null), []);

  // ── Assign resource ────────────────────────────────────────────
  const handleAssignResource = useCallback((taskId: string, empId: string | null) => {
    if (!data.wbsData?.items) return;
    const upd = (items: any[]): any[] =>
      items.map(it => it.id === taskId ? { ...it, assignedResourceId: empId } : it.children ? { ...it, children: upd(it.children) } : it);
    updateData({ wbsData: { ...data.wbsData, items: upd(data.wbsData.items) } });
    setEditingTaskId(null);
  }, [data.wbsData, updateData]);

  // ── Run CPM Analysis ───────────────────────────────────────────
  const runCPM = useCallback(() => {
    const engine = new CPMEngine();
    const tasks: Partial<CPMTask>[] = [];
    const collectTasks = (items: any[]) => {
      items.forEach(it => {
        if (!it.children || !it.children.length) {
          tasks.push({ id: it.id, name: it.name, wbsCode: it.wbsCode, daysRequired: (it.is_milestone || it.isMilestone) ? 0 : (it.daysRequired || 1), predecessors: it.predecessors || [] });
        } else collectTasks(it.children);
      });
    };
    if (wbsDataForTable?.items?.length) {
      let items = wbsDataForTable.items;
      if (selectedProjectId) {
        const project = fullData.projects?.find((p: any) => p.id === selectedProjectId || p.projectId === selectedProjectId);
        if (project) {
          const site = fullData.sites?.find((s: any) => s.id === project.siteId);
          const customer = fullData.customers?.find((c: any) => c.id === site?.customerId);
          const portfolio = fullData.portfolios?.find((p: any) => p.id === customer?.portfolioId);
          const owner = fullData.employees?.find((e: any) => e.id === portfolio?.employeeId);
          const pName = owner ? `${owner.name.split(' ')[0]}'s Portfolio` : portfolio?.name;
          if (pName && customer && site) setHierarchyFilter({ path: [pName, customer.name, site.name, project.name] });
          else if (project.name) setHierarchyFilter({ path: ['', '', '', project.name] });
        }
        const findProj = (nodes: any[]): any | null => {
          for (const n of nodes) { if (n.id === selectedProjectId || n.projectId === selectedProjectId) return n; if (n.children) { const f = findProj(n.children); if (f) return f; } } return null;
        };
        const pn = findProj(items);
        if (pn) items = [pn];
      }
      collectTasks(items);
    }
    engine.loadTasks(tasks as any);
    const result = engine.calculate();
    setCpmResult(result);

    const updateItems = (items: any[]): any[] =>
      items.map(item => {
        const ct = result.tasks.find(t => t.id === item.id);
        const ni: any = { ...item };
        if (ct) { ni.isCritical = ct.isCritical; ni.earlyStart = ct.earlyStart; ni.earlyFinish = ct.earlyFinish; ni.lateStart = ct.lateStart; ni.lateFinish = ct.lateFinish; ni.totalFloat = ct.totalFloat; }
        if (ni.children) { ni.children = updateItems(ni.children); ni.isCritical = ni.children.some((c: any) => c.isCritical); ni.totalFloat = Math.min(...ni.children.map((c: any) => c.totalFloat ?? Infinity)); if (ni.totalFloat === Infinity) ni.totalFloat = 0; }
        return ni;
      });

    if (data.wbsData?.items) {
      const logs: string[] = [];
      const t0 = performance.now();
      logs.push(`[${new Date().toLocaleTimeString()}] Engine Initialized`);
      logs.push(`> Loading ${tasks.length} tasks...`);
      logs.push(`> ${tasks.filter(t => t.predecessors?.length).length} tasks have predecessor links`);
      const updated = updateItems(data.wbsData.items);
      updateData({ wbsData: { ...data.wbsData, items: updated } });
      const dt = performance.now() - t0;
      logs.push(`> Calculation took ${dt.toFixed(2)}ms`);
      logs.push(`RESULTS: Duration ${result.projectDuration}d | Critical Tasks ${result.stats.criticalTasksCount} | Avg Float ${result.stats.averageFloat.toFixed(1)}d`);
      setCpmLogs(logs);
      addEngineLog('CPM', logs, { executionTimeMs: dt, projectDurationDays: result.projectDuration, criticalPathCount: result.stats.criticalTasksCount });
    }
  }, [wbsDataForTable?.items, selectedProjectId, data.wbsData, fullData, updateData, addEngineLog, setHierarchyFilter]);

  // ── Draw Dependency Arrows (SVG) ───────────────────────────────
  useEffect(() => {
    if (!showDependencies) return;
    const draw = () => {
      const svg = svgRef.current;
      if (!svg || !flatRows.length || !dateColumns.length) return;
      const tlStart = dateColumns[0].start.getTime();
      const tlEnd = dateColumns[dateColumns.length - 1].end.getTime();
      const tlDur = tlEnd - tlStart;
      const tlPx = dateColumns.length * columnWidth;

      // Build multiple lookup maps so we can resolve by various ID formats
      const rowMapById = new Map<string, number>();
      flatRows.forEach((r, i) => {
        rowMapById.set(r.id, i);
        // Also index by the raw ID without WBS prefix (e.g., "wbs-task-123" → "123")
        const rawId = r.id.replace(/^wbs-(task|phase|unit|project|sub_task)-/, '');
        if (rawId !== r.id) rowMapById.set(rawId, i);
        // Also by taskId if present
        if ((r as any).taskId) rowMapById.set((r as any).taskId, i);
      });

      // Clear non-defs children
      Array.from(svg.children).forEach(ch => { if (ch.nodeName !== 'defs') svg.removeChild(ch); });
      svg.style.width = `${fixedColsWidth + tlPx}px`;
      svg.style.height = `${headerHeight + totalRowsHeight}px`;

      // Debug: log how many rows have predecessors
      const withPreds = flatRows.filter(r => r.predecessors?.length);
      if (typeof window !== 'undefined') {
        console.log(`[Gantt Arrows] ${flatRows.length} rows, ${withPreds.length} with predecessors, ${rowMapById.size} in rowMap`);
        if (withPreds.length > 0) {
          console.log(`[Gantt Arrows] Sample predecessor:`, withPreds[0].id, withPreds[0].predecessors?.[0]);
        }
      }

      flatRows.forEach((item, idx) => {
        if (!item.predecessors?.length || !item.startDate) return;
        const ty = headerHeight + idx * rowHeight + rowHeight / 2;
        const tOff = Math.max(0, new Date(item.startDate).getTime() - tlStart);
        const tx = fixedColsWidth + (tOff / tlDur) * tlPx;

        item.predecessors.forEach((pred: any) => {
          // Resolve predecessor row — try predecessorTaskId (from MPP), then taskId (legacy), then with wbs prefix
          const predId = pred.predecessorTaskId || pred.taskId || '';
          let si = rowMapById.get(predId);
          if (si === undefined) si = rowMapById.get(`wbs-task-${predId}`);
          if (si === undefined) return;
          const src = flatRows[si];
          if (!src.endDate) return;

          const relationship = (pred.relationship || 'FS').toUpperCase();
          const sy = headerHeight + si * rowHeight + rowHeight / 2;

          // Determine start/end x based on relationship type
          let fromX: number, toX: number;
          if (relationship === 'SS') {
            // Start-to-Start: from predecessor start to successor start
            const sStartOff = Math.max(0, new Date(src.startDate || src.endDate).getTime() - tlStart);
            fromX = fixedColsWidth + (sStartOff / tlDur) * tlPx;
            toX = tx;
          } else if (relationship === 'FF') {
            // Finish-to-Finish: from predecessor end to successor end
            const sEndOff = Math.max(0, Math.min(tlEnd, new Date(src.endDate).getTime()) - tlStart);
            const tEndOff = Math.max(0, Math.min(tlEnd, new Date(item.endDate || item.startDate).getTime()) - tlStart);
            fromX = fixedColsWidth + (sEndOff / tlDur) * tlPx;
            toX = fixedColsWidth + (tEndOff / tlDur) * tlPx;
          } else if (relationship === 'SF') {
            // Start-to-Finish: from predecessor start to successor end
            const sStartOff = Math.max(0, new Date(src.startDate || src.endDate).getTime() - tlStart);
            const tEndOff = Math.max(0, Math.min(tlEnd, new Date(item.endDate || item.startDate).getTime()) - tlStart);
            fromX = fixedColsWidth + (sStartOff / tlDur) * tlPx;
            toX = fixedColsWidth + (tEndOff / tlDur) * tlPx;
          } else {
            // FS (Finish-to-Start) — default
            const sOff = Math.max(0, Math.min(tlEnd, new Date(src.endDate).getTime()) - tlStart);
            fromX = fixedColsWidth + (sOff / tlDur) * tlPx;
            toX = tx;
          }

          const cp = Math.max(Math.abs(toX - fromX) * 0.5, 20);
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', `M${fromX},${sy} C${fromX + cp},${sy} ${toX - cp},${ty} ${toX},${ty}`);

          const crit = item.isCritical || (item as any).is_critical;
          const delay = src.endDate && item.startDate && new Date(src.endDate) > new Date(item.startDate);
          if (crit && (item.totalFloat === 0 || item.totalFloat === undefined)) {
            path.setAttribute('stroke', '#EF4444'); path.setAttribute('stroke-width', '2');
          } else if (delay) {
            path.setAttribute('stroke', '#EF4444'); path.setAttribute('stroke-width', '1.5'); path.setAttribute('stroke-dasharray', '4,2');
          } else {
            path.setAttribute('stroke', '#40E0D0'); path.setAttribute('stroke-width', '1.5');
          }
          path.setAttribute('fill', 'none');
          path.setAttribute('marker-end', crit ? 'url(#arrowhead-red)' : delay ? 'url(#arrowhead-red)' : 'url(#arrowhead-teal)');
          path.setAttribute('opacity', '0.7');

          // Add relationship label on hover
          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent = `${src.name || predId} → ${item.name || ''} (${relationship}${pred.lagDays ? `, lag: ${pred.lagDays}d` : ''})`;
          path.appendChild(title);

          svg.appendChild(path);
        });
      });
    };
    requestAnimationFrame(draw);
  }, [flatRows, dateColumns, columnWidth, fixedColsWidth, totalRowsHeight, showDependencies, rowHeight, headerHeight]);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  if (isLoading || routeChanging) return <PageLoader />;

  const tableWidth = fixedColsWidth + dateColumns.length * columnWidth;

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden', padding: '0.5rem 1rem 0.25rem', gap: '0.35rem' }}>
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', minWidth: '180px' }}>
            <input
              type="text" placeholder="Search WBS..." value={wbsSearchQuery}
              onChange={e => setWbsSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '0.4rem 0.6rem 0.4rem 2rem', fontSize: '0.8rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none' }}
            />
            <svg viewBox="0 0 24 24" width="14" height="14" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          
          {/* Interval Selector (primary scale) */}
          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
            {(['week', 'month', 'quarter', 'year'] as GanttInterval[]).map(iv => (
              <button key={iv} onClick={() => setGanttInterval(iv)} style={{
                padding: '0.3rem 0.6rem', fontSize: '0.7rem', fontWeight: 600,
                background: ganttInterval === iv ? 'var(--pinnacle-teal)' : 'transparent',
                color: ganttInterval === iv ? '#000' : 'var(--text-secondary)',
                border: 'none', borderRadius: '4px', cursor: 'pointer', textTransform: 'capitalize',
              }}>{iv}</button>
            ))}
          </div>
          
          {/* Zoom Controls — Fit + fine-tune +/- + Density + Today */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '3px 8px', border: '1px solid var(--border-color)' }}>
            {/* Fit to View */}
            <button onClick={fitToView} title="Fit all content in view" style={{
              padding: '3px 8px', fontSize: '0.6rem', fontWeight: 600,
              background: 'rgba(64,224,208,0.1)', border: '1px solid rgba(64,224,208,0.3)',
              borderRadius: '4px', color: 'var(--pinnacle-teal)', cursor: 'pointer',
            }}>Fit</button>
            <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 2px' }} />
            {/* Timeline zoom +/- */}
            <button onClick={() => setTimelineZoom(z => Math.max(0.25, z - 0.2))} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 3px', lineHeight: 1 }} title="Zoom out timeline">-</button>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: '32px', textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(timelineZoom * 100)}%</span>
            <button onClick={() => setTimelineZoom(z => Math.min(4, z + 0.2))} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', padding: '0 3px', lineHeight: 1 }} title="Zoom in timeline">+</button>
            <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 2px' }} />
            {/* Row density */}
            {(['compact', 'normal', 'comfortable'] as RowDensity[]).map(d => (
              <button key={d} onClick={() => setRowDensity(d)} title={`${d} row height`} style={{
                padding: '3px 6px', fontSize: '0.55rem', fontWeight: 600,
                background: rowDensity === d ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: rowDensity === d ? '#fff' : 'var(--text-muted)',
                border: rowDensity === d ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                borderRadius: '3px', cursor: 'pointer', textTransform: 'capitalize',
              }}>{d === 'compact' ? 'S' : d === 'normal' ? 'M' : 'L'}</button>
            ))}
            <div style={{ width: '1px', height: '16px', background: 'var(--border-color)', margin: '0 2px' }} />
            {/* Reset */}
            <button onClick={() => { setTimelineZoom(1); setRowDensity('normal'); }} style={{ padding: '2px 6px', fontSize: '0.6rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }} title="Reset zoom & density">Reset</button>
          </div>
          
          <button className="btn btn-secondary btn-sm" onClick={scrollToToday}>Today</button>
          
          {/* Level Controls */}
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '2px' }}>
            {([['L0', collapseAll], ['L2', () => collapseToLevel(2)], ['L3', () => collapseToLevel(3)], ['All', expandAll]] as [string, () => void][]).map(([label, fn]) => (
              <button key={label} onClick={fn} style={{ padding: '0.3rem 0.5rem', fontSize: '0.65rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
          
          <div style={{ width: '180px' }}>
            <SearchableDropdown options={projectOptions} value={selectedProjectId} onChange={setSelectedProjectId} placeholder="Select Project..." disabled={false} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={runCPM}>Run CPM</button>
        </div>
      </div>

      {/* ── Feature Toggles & Legend ──────────────────────────────── */}
      <div style={{ display: 'flex', gap: '1rem', padding: '0 0.5rem', fontSize: '0.7rem', color: '#888', flexShrink: 0, flexWrap: 'wrap' }}>
        {[
          { checked: showBaseline, set: setShowBaseline, color: '#6B7280', label: 'Baseline Ghost' },
          { checked: showDependencies, set: setShowDependencies, color: '#40E0D0', label: 'Dependencies' },
          { checked: showSparklines, set: setShowSparklines, color: '#3B82F6', label: 'FTE Sparklines' },
        ].map(t => (
          <label key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type="checkbox" checked={t.checked} onChange={e => t.set(e.target.checked)} style={{ accentColor: t.color }} />
            <span style={{ color: t.color }}>{t.label}</span>
        </label>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 4, background: '#EF4444', borderRadius: 2 }} /> Critical Path</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 4, background: '#6B7280', borderRadius: 2 }} /> Non-Critical</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 4, background: '#6B7280', borderRadius: 2, borderBottom: '1px dashed #EF4444' }} /> Delay</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><div style={{ width: 12, height: 6, background: 'rgba(107,114,128,0.4)', borderRadius: 2 }} /> Baseline</div>
        </div>
      </div>

      {/* ── CPM Results Panel ─────────────────────────────────────── */}
      {cpmResult && (
        <div style={{ display: 'flex', gap: '1rem', margin: '0 0.25rem', background: 'rgba(20,20,25,0.95)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', alignItems: 'center', flexShrink: 0 }}>
          {[
            { label: 'Duration', value: `${cpmResult.projectDuration}d` },
            { label: 'Critical Tasks', value: String(cpmResult.stats.criticalTasksCount), color: '#EF4444' },
            { label: 'Avg Float', value: `${cpmResult.stats.averageFloat.toFixed(1)}d`, color: '#40E0D0' },
          ].map(m => (
            <div key={m.label} className="metric-card" style={{ padding: '6px 14px', background: '#111', minWidth: '110px' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{m.label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
          ))}
          <div style={{ flex: 1, fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cpmLogs[cpmLogs.length - 1] || 'Analysis complete'}
          </div>
          <button onClick={() => { setCpmResult(null); setCpmLogs([]); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: '#fff', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* ── Gantt Container (all scrolling happens HERE) ──────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', position: 'relative' }}>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          onWheel={handleWheelZoom}
          style={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain', position: 'relative' }}
        >
          {/* Dependency SVG */}
          <svg ref={svgRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 5 }}>
            <defs>
              <marker id="arrowhead-red" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#EF4444" /></marker>
              <marker id="arrowhead-gray" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#6B7280" /></marker>
              <marker id="arrowhead-teal" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#40E0D0" /></marker>
            </defs>
          </svg>
          {/* Inazuma line removed per user request */}

          {/* ── TABLE ───────────────────────────────────────────── */}
          <table ref={tableRef} className="wbs-table" style={{ tableLayout: 'fixed', width: `${tableWidth}px`, borderCollapse: 'separate', borderSpacing: 0 }}>
            <colgroup>
              <col style={{ width: `${wbsCodeColWidth}px` }} />
              <col style={{ width: `${COL.NAME}px` }} />
              <col style={{ width: `${COL.TYPE}px` }} />
              <col style={{ width: `${COL.RESOURCE}px` }} />
              <col style={{ width: `${COL.EMPLOYEE}px` }} />
              {showSparklines && <col style={{ width: `${COL.SPARKLINE}px` }} />}
              <col style={{ width: `${COL.START}px` }} /><col style={{ width: `${COL.END}px` }} />
              <col style={{ width: `${COL.DAYS}px` }} /><col style={{ width: `${COL.BL_HRS}px` }} /><col style={{ width: `${COL.ACT_HRS}px` }} /><col style={{ width: `${COL.REM_HRS}px` }} />
              <col style={{ width: `${COL.BL_COST}px` }} /><col style={{ width: `${COL.ACT_COST}px` }} /><col style={{ width: `${COL.REM_COST}px` }} />
              <col style={{ width: `${COL.EFF}px` }} /><col style={{ width: `${COL.PROG}px` }} />
              <col style={{ width: `${COL.PRED}px` }} /><col style={{ width: `${COL.TF}px` }} /><col style={{ width: `${COL.CP}px` }} />
              {dateColumns.map((_, i) => <col key={i} style={{ width: `${columnWidth}px` }} />)}
            </colgroup>

            {/* ── THEAD (sticky top) ─────────────────────────────── */}
            <thead style={{ position: 'sticky', top: 0, zIndex: 90, background: 'var(--bg-secondary)' }}>
              <tr style={{ height: `${headerHeight}px` }}>
                <th style={{ ...TH_BASE, position: 'sticky', left: 0, top: 0, zIndex: 100, background: 'var(--bg-secondary)', borderRight: '1px solid #444' }}>WBS</th>
                <th style={{ ...TH_BASE, position: 'sticky', left: `${wbsCodeColWidth}px`, top: 0, zIndex: 100, background: 'var(--bg-secondary)', borderRight: '1px solid #444' }}>Name</th>
                <th style={TH_BASE}>Type</th>
                <th style={TH_BASE}>Resource</th>
                <th style={TH_BASE}>Employee</th>
                {showSparklines && <th style={TH_BASE}>FTE Load</th>}
                <th style={TH_BASE}>Start</th>
                <th style={TH_BASE}>End</th>
                <th style={TH_BASE} className="number">Days</th>
                <th style={TH_BASE} className="number">BL Hrs</th>
                <th style={{ ...TH_BASE, color: 'var(--pinnacle-teal)' }} className="number">Act Hrs</th>
                <th style={TH_BASE} className="number">Rem</th>
                <th style={TH_BASE} className="number">BL Cost</th>
                <th style={{ ...TH_BASE, color: 'var(--pinnacle-teal)' }} className="number">Act Cost</th>
                <th style={TH_BASE} className="number">Rem Cost</th>
                <th style={TH_BASE} className="number">Eff%</th>
                <th style={TH_BASE} className="number">Prog</th>
                <th style={TH_BASE}>Pred</th>
                <th style={{ ...TH_BASE, color: '#ff6b6b' }} className="number">TF</th>
                <th style={{ ...TH_BASE, borderRight: '1px solid #444' }}>CP</th>
                {dateColumns.map((col, i) => {
                  const cur = today >= col.start && today <= col.end;
                  return (
                    <th key={i} style={{ textAlign: 'center', fontSize: '0.55rem', borderLeft: '1px solid #333', borderBottom: '1px solid #333', background: cur ? 'rgba(239,68,68,0.15)' : 'var(--bg-secondary)', color: cur ? '#EF4444' : 'inherit', fontWeight: 600, position: 'sticky', top: 0, zIndex: 90 }}>
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ── TBODY (virtualised) ────────────────────────────── */}
            <tbody>
              {paddingTop > 0 && <tr style={{ height: `${paddingTop}px` }}><td colSpan={100} style={{ padding: 0, border: 'none' }} /></tr>}
              {virtualRows.map(row => {
                const isCritical = row.isCritical || (row as any).is_critical;
                const efficiency = row.taskEfficiency || 0;
                const progress = row.percentComplete || 0;
                const isExpanded = expandedIds.has(row.id);
                const worstCase = (row as any).worstCaseStatus;
                
                // Simplified bar colour: progress-based for ALL bars (parent + leaf), critical path override
                const barColor = isCritical ? '#EF4444' : getProgressColor(progress);
                const typeColor = WBS_COLORS[row.itemType] || '#6B7280';

                const rowBg = isCritical ? 'rgba(220,38,38,0.05)' : 'var(--bg-primary)';
                const stickyBg = isCritical ? '#1a1010' : 'var(--bg-primary)';

                return (
                  <tr key={row.id} style={{ height: `${rowHeight}px`, background: rowBg }}>
                    {/* WBS Code — sticky left */}
                    <td style={{ position: 'sticky', left: 0, zIndex: 10, background: stickyBg, borderRight: '1px solid #444', boxShadow: isCritical ? 'inset 2px 0 0 #ef4444' : 'none', overflow: 'hidden' }}>
                      <div style={{ paddingLeft: `${(row.indentLevel || 0) * 12}px`, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {row.hasChildren && (
                          <button onClick={() => toggleExpand(row.id)} style={{ color: worstCase && !isExpanded ? worstCase.color : '#fff', cursor: 'pointer', padding: 0, fontSize: '8px', background: 'none', border: 'none' }}>
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                        <span style={{ color: isCritical ? '#ef4444' : 'inherit', fontSize: '0.6rem', fontWeight: isCritical ? 700 : 400, whiteSpace: 'nowrap' }}>{row.wbsCode}</span>
                      </div>
                    </td>
                    {/* Name — sticky left */}
                    <td style={{ position: 'sticky', left: `${wbsCodeColWidth}px`, zIndex: 10, background: stickyBg, borderRight: '1px solid #444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <EnhancedTooltip content={row.name || ''}>
                        <span style={{ fontWeight: row.hasChildren || isCritical ? 700 : 400, fontSize: '0.65rem', color: isCritical ? '#ef4444' : row.hasChildren && !isExpanded && worstCase ? worstCase.color : 'inherit' }}>{row.name}</span>
                      </EnhancedTooltip>
                    </td>
                    {/* Type badge */}
                    <td style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}><span className={`type-badge ${row.itemType}`} style={{ fontSize: '0.5rem' }}>{(row.itemType || '').replace('_', ' ')}</span></td>
                    {/* Resource */}
                    <td style={{ ...TD_FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(row as any).assignedResource || ''}>{(row as any).assignedResource || '-'}</td>
                    {/* Employee (Assign dropdown) */}
                    <td style={{ ...TD_FONT, overflow: 'visible', position: 'relative' }} data-assign-cell="true">
                      {(row.itemType === 'task' || row.itemType === 'sub_task' || row.itemType === 'phase') ? (
                        editingTaskId === row.id ? (
                          <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 50, minWidth: '220px' }}>
                            <SearchableDropdown options={employeeOptions} value={row.assignedResourceId || null} onChange={id => handleAssignResource(row.id, id)} placeholder="Assign..." disabled={false} width="220px" />
                          </div>
                        ) : (
                          <button onClick={() => setEditingTaskId(row.id)} style={{ background: 'none', border: 'none', color: row.assignedResourceId ? 'var(--text-primary)' : 'var(--pinnacle-teal)', cursor: 'pointer', fontSize: '0.6rem', padding: '2px', whiteSpace: 'nowrap' }}>
                            {row.assignedResourceId ? getEmployeeName(row.assignedResourceId, employees) : '+ Assign'}
                          </button>
                        )
                      ) : '-'}
                    </td>
                    {/* FTE Sparkline (conditional) */}
                    {showSparklines && (
                      <td style={{ padding: '2px 4px' }}>
                        <FTESparkline baselineHours={row.baselineHours || 0} daysRequired={row.daysRequired || 0} percentComplete={progress} />
                      </td>
                    )}
                    {/* Dates + Metrics */}
                    <td style={TD_FONT}>{row.startDate ? new Date(row.startDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '-'}</td>
                    <td style={TD_FONT}>{row.endDate ? new Date(row.endDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '-'}</td>
                    <td className="number" style={TD_FONT}>{row.daysRequired != null && isFinite(Number(row.daysRequired)) ? Number(row.daysRequired).toFixed(0) : '-'}</td>
                    <td className="number" style={TD_FONT}>{row.baselineHours && isFinite(Number(row.baselineHours)) ? Number(row.baselineHours).toFixed(0) : '-'}</td>
                    <td className="number" style={{ ...TD_FONT, color: 'var(--pinnacle-teal)' }}>{row.actualHours && isFinite(Number(row.actualHours)) ? Number(row.actualHours).toFixed(0) : '-'}</td>
                    <td className="number" style={TD_FONT}>{(row as any).remainingHours != null && isFinite(Number((row as any).remainingHours)) ? Number((row as any).remainingHours).toFixed(0) : '-'}</td>
                    <td className="number" style={TD_FONT}>{formatCurrency(Number(row.baselineCost))}</td>
                    <td className="number" style={{ ...TD_FONT, color: 'var(--pinnacle-teal)' }}>{formatCurrency(Number(row.actualCost))}</td>
                    <td className="number" style={TD_FONT}>{formatCurrency(Number((row as any).remainingCost))}</td>
                    <td className="number" style={{ ...TD_FONT, color: efficiency >= 100 ? '#22c55e' : efficiency >= 80 ? '#eab308' : '#ef4444' }}>{row.taskEfficiency ? `${Math.round(row.taskEfficiency)}%` : '-'}</td>
                    <td><div className="progress-bar" style={{ width: '30px', height: '6px' }}><div className="progress-bar-fill" style={{ width: `${progress}%`, background: barColor }} /></div></td>
                    <td style={{ fontSize: '0.5rem' }} title={row.predecessors?.map((p: any) => getTaskNameFromMap(p.taskId)).join(', ')}>{row.predecessors?.length ? `${row.predecessors.length} dep` : '-'}</td>
                    <td className="number" style={{ ...TD_FONT, color: (row.totalFloat != null && row.totalFloat <= 0) ? '#ef4444' : 'inherit' }}>{row.totalFloat != null ? row.totalFloat : '-'}</td>
                    <td style={{ textAlign: 'center', borderRight: '1px solid #444' }}>{isCritical && <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.6rem' }}>CP</span>}</td>

                    {/* ── Gantt Timeline Cells ─────────────────────── */}
                    {dateColumns.map((col, i) => {
                      const isCurrentPeriod = today >= col.start && today <= col.end;
                      // Only render bar in first cell (it spans via absolute positioning)
                      const bar = (() => {
                        if (i !== 0 || !row.startDate || !row.endDate) return null;
                        const iStart = new Date(row.startDate);
                        const iEnd = new Date(row.endDate);
                        if (Number.isNaN(iStart.getTime()) || Number.isNaN(iEnd.getTime())) return null;
                        const tlStart = dateColumns[0].start;
                        const tlEnd = dateColumns[dateColumns.length - 1].end;
                        const tlDur = tlEnd.getTime() - tlStart.getTime();
                        if (iEnd < tlStart || iStart > tlEnd) return null;

                        const leftPct = (Math.max(0, iStart.getTime() - tlStart.getTime()) / tlDur) * 100;
                        const widthPct = ((Math.min(iEnd.getTime(), tlEnd.getTime()) - Math.max(iStart.getTime(), tlStart.getTime())) / tlDur) * 100;
                            const isMilestone = row.is_milestone || row.isMilestone;
                        const pct = progress;
                        const blStart = (row as any).baselineStart;
                        const blEnd = (row as any).baselineEnd;
                        const hasSlipped = blEnd && new Date(blEnd) < iEnd;

                            // Baseline ghost bar
                            let baselineBar = null;
                        if (showBaseline && blStart && blEnd) {
                          const bs = new Date(blStart), be = new Date(blEnd);
                          if (!Number.isNaN(bs.getTime()) && !Number.isNaN(be.getTime())) {
                            const bL = (Math.max(0, bs.getTime() - tlStart.getTime()) / tlDur) * 100;
                            const bW = ((Math.min(be.getTime(), tlEnd.getTime()) - Math.max(bs.getTime(), tlStart.getTime())) / tlDur) * 100;
                                baselineBar = (
                              <div style={{
                                position: 'absolute', left: `calc(${dateColumns.length * 100}% * ${bL / 100})`,
                                width: `calc(${dateColumns.length * 100}% * ${bW / 100})`, height: '6px', top: '18px',
                                background: 'rgba(107,114,128,0.4)', borderRadius: '2px', zIndex: 3, border: '1px solid rgba(107,114,128,0.6)',
                              }} />
                            );
                          }
                        }

                        // Determine parent bar styles — unified progress-based coloring
                        const isParent = row.hasChildren;
                        const barHeight = isMilestone ? '16px' : isParent ? '10px' : '14px';
                        const barTop = isMilestone ? '6px' : isParent ? '8px' : '5px';
                        const barBg = isMilestone ? 'transparent' : isParent ? `${barColor}22` : (pct === 0 ? '#333' : '#444');
                        const barBorder = isCritical
                          ? '2px solid #ef4444'
                          : isParent
                            ? `1px solid ${barColor}88`
                            : hasSlipped ? '1px solid #F59E0B' : 'none';

                            return (
                              <>
                                {baselineBar}
                                <div
                              onMouseEnter={(e) => handleBarMouseEnter(e, row)}
                              onMouseLeave={handleBarMouseLeave}
                                  style={{
                                    position: 'absolute',
                                    left: `calc(${dateColumns.length * 100}% * ${leftPct / 100})`,
                                width: `calc(${dateColumns.length * 100}% * ${widthPct / 100})`,
                                height: barHeight, top: barTop,
                                background: barBg, borderRadius: '3px', zIndex: 5,
                                border: barBorder,
                                boxShadow: hasSlipped ? '0 0 6px rgba(245,158,11,0.5)' : '0 1px 3px rgba(0,0,0,0.3)',
                                display: 'flex', alignItems: 'center',
                                cursor: 'default',
                              }}
                            >
                              {!isMilestone && <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: '3px' }} />}
                              {isMilestone && <div style={{ width: '4px', height: '100%', background: '#ef4444', marginLeft: '-2px' }} />}
                                </div>
                              </>
                            );
                      })();

                      return (
                        <td key={i} style={{ borderLeft: '1px solid #222', background: isCurrentPeriod ? 'rgba(239,68,68,0.08)' : 'transparent', position: 'relative', padding: 0, overflow: i === 0 ? 'visible' : 'hidden' }}>
                          {bar}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {paddingBottom > 0 && <tr style={{ height: `${paddingBottom}px` }}><td colSpan={100} style={{ padding: 0, border: 'none' }} /></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Rich Floating Bar Tooltip ────────────────────────────── */}
      {barTip && (
        <div style={{
          position: 'fixed', left: barTip.x, top: barTip.y, zIndex: 10000,
          width: '320px', maxWidth: 'calc(100vw - 24px)',
          background: 'rgba(18, 18, 22, 0.97)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '10px', padding: '14px 16px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.7)', pointerEvents: 'none',
          backdropFilter: 'blur(20px)', fontSize: '0.72rem', color: '#d0d0d0', lineHeight: 1.5,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fff', flex: 1, marginRight: '8px', lineHeight: 1.3 }}>
              {barTip.row.name}
            </div>
            <span style={{
              fontSize: '0.52rem', fontWeight: 600, padding: '2px 6px', borderRadius: '4px',
              background: `${WBS_COLORS[barTip.row.itemType] || '#666'}33`,
              color: WBS_COLORS[barTip.row.itemType] || '#999', whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {(barTip.row.itemType || '').replace('_', ' ')}
            </span>
          </div>
          <div style={{ fontSize: '0.62rem', color: '#777', marginBottom: '8px' }}>WBS {barTip.row.wbsCode}</div>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

          {/* Dates */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '2px' }}>
            <span>{barTip.row.startDate ? new Date(barTip.row.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</span>
            <span style={{ color: '#555' }}>→</span>
            <span>{barTip.row.endDate ? new Date(barTip.row.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</span>
          </div>
          <div style={{ fontSize: '0.62rem', color: '#777', marginBottom: '6px' }}>
            {barTip.row.daysRequired ? `${Number(barTip.row.daysRequired).toFixed(0)} working days` : ''}
          </div>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ flex: 1, height: '7px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${barTip.row.percentComplete || 0}%`, height: '100%', background: getProgressColor(barTip.row.percentComplete || 0), borderRadius: '4px', transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontWeight: 700, color: getProgressColor(barTip.row.percentComplete || 0), fontSize: '0.78rem', minWidth: '36px', textAlign: 'right' }}>
              {Math.round(barTip.row.percentComplete || 0)}%
            </span>
          </div>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

          {/* Metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px', marginBottom: '6px', fontSize: '0.65rem' }}>
            <div><span style={{ color: '#777' }}>BL Hours: </span><span style={{ color: '#e0e0e0' }}>{barTip.row.baselineHours && isFinite(Number(barTip.row.baselineHours)) ? Number(barTip.row.baselineHours).toLocaleString() : '-'}</span></div>
            <div><span style={{ color: '#777' }}>Act Hours: </span><span style={{ color: 'var(--pinnacle-teal)' }}>{barTip.row.actualHours && isFinite(Number(barTip.row.actualHours)) ? Number(barTip.row.actualHours).toLocaleString() : '-'}</span></div>
            <div><span style={{ color: '#777' }}>BL Cost: </span><span style={{ color: '#e0e0e0' }}>{formatCurrency(Number(barTip.row.baselineCost))}</span></div>
            <div><span style={{ color: '#777' }}>Act Cost: </span><span style={{ color: 'var(--pinnacle-teal)' }}>{formatCurrency(Number(barTip.row.actualCost))}</span></div>
          </div>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />

          {/* Footer details */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: '0.62rem' }}>
            {barTip.row.assignedResourceId && (
              <span><span style={{ color: '#777' }}>Resource: </span>{getEmployeeName(barTip.row.assignedResourceId, employees)}</span>
            )}
            {(barTip.row.assignedResource) && !barTip.row.assignedResourceId && (
              <span><span style={{ color: '#777' }}>Resource: </span>{barTip.row.assignedResource}</span>
            )}
            {barTip.row.taskEfficiency != null && barTip.row.taskEfficiency > 0 && (
              <span><span style={{ color: '#777' }}>Efficiency: </span><span style={{ color: barTip.row.taskEfficiency >= 100 ? '#22c55e' : barTip.row.taskEfficiency >= 80 ? '#eab308' : '#ef4444' }}>{Math.round(barTip.row.taskEfficiency)}%</span></span>
            )}
            {barTip.row.totalFloat != null && (
              <span><span style={{ color: '#777' }}>Float: </span><span style={{ color: barTip.row.totalFloat <= 0 ? '#ef4444' : '#e0e0e0' }}>{barTip.row.totalFloat}d</span></span>
            )}
          </div>

          {/* Status badges */}
          {(barTip.row.isCritical || barTip.row.is_critical) && (
            <div style={{ marginTop: '8px', padding: '4px 10px', background: 'rgba(239,68,68,0.12)', borderRadius: '5px', color: '#ef4444', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.5px' }}>
              CRITICAL PATH
            </div>
          )}
          {barTip.row.baselineEnd && barTip.row.endDate && new Date(barTip.row.baselineEnd) < new Date(barTip.row.endDate) && (
            <div style={{ marginTop: '4px', padding: '4px 10px', background: 'rgba(245,158,11,0.12)', borderRadius: '5px', color: '#F59E0B', fontSize: '0.6rem', fontWeight: 600 }}>
              SLIPPED {Math.round((new Date(barTip.row.endDate).getTime() - new Date(barTip.row.baselineEnd).getTime()) / (1000 * 60 * 60 * 24))} days from baseline
            </div>
          )}
        </div>
      )}
    </div>
  );
}
