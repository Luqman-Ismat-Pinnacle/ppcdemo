'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DataEditor, { GridCell, GridCellKind, GridColumn, Item, Rectangle, Theme } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { Arrow, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { useData } from '@/lib/data-context';
import PageLoader from '@/components/ui/PageLoader';

type TimelineInterval = 'week' | 'month' | 'quarter' | 'year';

type FlatWbsRow = {
  id: string;
  taskId: string;
  wbsCode: string;
  name: string;
  type: string;
  resourceName: string;
  assignedResource: string;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
  startDate: Date | null;
  endDate: Date | null;
  baselineStart: Date | null;
  baselineEnd: Date | null;
  daysRequired: number;
  baselineHours: number;
  actualHours: number;
  remainingHours: number;
  work: number;
  baselineCost: number;
  actualCost: number;
  remainingCost: number;
  scheduleCost: number;
  efficiency: number;
  percentComplete: number;
  predecessorIds: string[];
  totalFloat: number;
  isCritical: boolean;
};

type ColumnDef = {
  id: string;
  title: string;
  width: number;
  value: (row: FlatWbsRow) => string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 40;

const TYPE_COLOR: Record<string, string> = {
  portfolio: '#8b5cf6',
  customer: '#0ea5e9',
  site: '#14b8a6',
  project: '#f59e0b',
  unit: '#22c55e',
  phase: '#3b82f6',
  sub_task: '#9ca3af',
  task: '#2ed3c6',
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
};

const readString = (value: unknown, ...keys: string[]): string => {
  const rec = toRecord(value);
  for (const key of keys) {
    const raw = rec[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  }
  return '';
};

const readNumber = (value: unknown, ...keys: string[]): number => {
  const rec = toRecord(value);
  for (const key of keys) {
    const raw = rec[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
};

const readDate = (value: unknown, ...keys: string[]): Date | null => {
  const rec = toRecord(value);
  for (const key of keys) {
    const raw = rec[key];
    if (!raw) continue;
    const d = new Date(String(raw));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
};

const normalizeTaskId = (value: string): string => String(value || '').trim().replace(/^wbs-(task|sub_task)-/i, '');

const inferType = (item: Record<string, unknown>): string => {
  const id = readString(item, 'id').toLowerCase();
  if (id.startsWith('wbs-portfolio-')) return 'portfolio';
  if (id.startsWith('wbs-customer-')) return 'customer';
  if (id.startsWith('wbs-site-')) return 'site';
  if (id.startsWith('wbs-project-')) return 'project';
  if (id.startsWith('wbs-unit-')) return 'unit';
  if (id.startsWith('wbs-phase-')) return 'phase';
  if (id.startsWith('wbs-sub_task-')) return 'sub_task';
  if (id.startsWith('wbs-task-')) return 'task';
  return readString(item, 'itemType', 'type') || 'task';
};

const getPredecessorIds = (item: Record<string, unknown>): string[] => {
  const direct = toRecord(item).predecessors;
  if (Array.isArray(direct)) {
    return direct
      .map((p) => normalizeTaskId(readString(p, 'predecessorTaskId', 'predecessor_task_id', 'taskId')))
      .filter(Boolean);
  }

  const raw = readString(item, 'predecessorId', 'predecessor_id');
  if (!raw) return [];
  return raw
    .split(/[;,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((token) => {
      const relMatch = token.match(/(FS|SS|FF|SF)(?:\s*[+-].*)?$/i);
      const idPart = relMatch && typeof relMatch.index === 'number' ? token.slice(0, relMatch.index).trim() : token;
      return normalizeTaskId(idPart);
    })
    .filter(Boolean);
};

const useElementSize = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSize({ width: Math.max(0, Math.floor(rect.width)), height: Math.max(0, Math.floor(rect.height)) });
  }, []);

  useLayoutEffect(() => {
    const id = requestAnimationFrame(measure);
    measure();

    const onResize = () => measure();
    window.addEventListener('resize', onResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      ro = new ResizeObserver(() => measure());
      ro.observe(ref.current);
    }

    const intervalId = window.setInterval(measure, 350);

    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', onResize);
      if (ro) ro.disconnect();
      window.clearInterval(intervalId);
    };
  }, [measure]);

  return { ref, size };
};

const formatDate = (d: Date | null): string => (d ? d.toLocaleDateString('en-US') : '-');
const formatInt = (n: number): string => (Number.isFinite(n) ? Math.round(n).toString() : '-');
const formatPct = (n: number): string => `${Math.round(n || 0)}%`;
const formatCurrency = (n: number): string => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : '-');

const ALL_COLUMNS: ColumnDef[] = [
  { id: 'wbs', title: 'WBS', width: 120, value: (r) => r.wbsCode },
  { id: 'name', title: 'Name', width: 260, value: (r) => r.name },
  { id: 'type', title: 'Type', width: 110, value: (r) => r.type },
  { id: 'resource', title: 'Resource', width: 160, value: (r) => r.assignedResource || r.resourceName },
  { id: 'start', title: 'Start', width: 105, value: (r) => formatDate(r.startDate) },
  { id: 'end', title: 'End', width: 105, value: (r) => formatDate(r.endDate) },
  { id: 'days', title: 'Days', width: 70, value: (r) => formatInt(r.daysRequired) },
  { id: 'blh', title: 'BL Hrs', width: 90, value: (r) => formatInt(r.baselineHours) },
  { id: 'acth', title: 'Act Hrs', width: 90, value: (r) => formatInt(r.actualHours) },
  { id: 'remh', title: 'Rem Hrs', width: 95, value: (r) => formatInt(r.remainingHours) },
  { id: 'work', title: 'Work', width: 90, value: (r) => formatInt(r.work) },
  { id: 'blc', title: 'BL Cost', width: 110, value: (r) => formatCurrency(r.baselineCost) },
  { id: 'actc', title: 'Act Cost', width: 110, value: (r) => formatCurrency(r.actualCost) },
  { id: 'remc', title: 'Rem Cost', width: 110, value: (r) => formatCurrency(r.remainingCost) },
  { id: 'sched', title: 'Sched Cost', width: 120, value: (r) => formatCurrency(r.scheduleCost) },
  { id: 'eff', title: 'Eff%', width: 70, value: (r) => formatPct(r.efficiency) },
  { id: 'pct', title: 'Progress', width: 80, value: (r) => formatPct(r.percentComplete) },
  { id: 'pred', title: 'Predecessors', width: 150, value: (r) => r.predecessorIds.join(', ') || '-' },
  { id: 'tf', title: 'TF', width: 60, value: (r) => formatInt(r.totalFloat) },
  { id: 'cp', title: 'CP', width: 60, value: (r) => (r.isCritical ? 'CP' : '-') },
];

const defaultVisibleColumns = new Set(ALL_COLUMNS.map((c) => c.id));

const getProgressColor = (progress: number, critical: boolean) => {
  if (critical) return '#ef4444';
  if (progress >= 100) return '#22c55e';
  if (progress >= 75) return '#2ed3c6';
  if (progress >= 50) return '#0ea5e9';
  if (progress >= 25) return '#f59e0b';
  return '#6b7280';
};

export default function WBSGanttV2Page() {
  const { filteredData, data: fullData, isLoading } = useData();
  const splitHostRef = useRef<HTMLDivElement>(null);
  const leftPanel = useElementSize<HTMLDivElement>();
  const rightPanel = useElementSize<HTMLDivElement>();
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const columnsMenuRef = useRef<HTMLDivElement>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [pxPerDay, setPxPerDay] = useState(2.5);
  const [timelineInterval, setTimelineInterval] = useState<TimelineInterval>('month');
  const [showDependencies, setShowDependencies] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);
  const [leftPanePct, setLeftPanePct] = useState(50);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(new Set(defaultVisibleColumns));
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);

  const [gridTheme, setGridTheme] = useState<Theme | undefined>(undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const styles = getComputedStyle(document.documentElement);
    const pick = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

    setGridTheme({
      accentColor: pick('--pinnacle-teal', '#2ed3c6'),
      accentFg: '#06171b',
      accentLight: 'rgba(46,211,198,0.22)',
      textDark: pick('--text-primary', '#e5e7eb'),
      textMedium: pick('--text-secondary', '#cbd5e1'),
      textLight: pick('--text-muted', '#94a3b8'),
      textBubble: '#e2e8f0',
      bgIconHeader: pick('--bg-secondary', '#111827'),
      fgIconHeader: pick('--text-secondary', '#cbd5e1'),
      textHeader: pick('--text-secondary', '#cbd5e1'),
      textHeaderSelected: pick('--text-primary', '#e5e7eb'),
      bgCell: pick('--bg-primary', '#0f172a'),
      bgCellMedium: pick('--bg-secondary', '#111827'),
      bgHeader: pick('--bg-secondary', '#111827'),
      bgHeaderHasFocus: pick('--bg-tertiary', '#1f2937'),
      bgHeaderHovered: pick('--bg-tertiary', '#1f2937'),
      bgBubble: pick('--bg-tertiary', '#1f2937'),
      bgBubbleSelected: pick('--bg-tertiary', '#1f2937'),
      bgSearchResult: 'rgba(46,211,198,0.2)',
      borderColor: pick('--border-color', '#334155'),
      drilldownBorder: pick('--border-color', '#334155'),
      linkColor: pick('--pinnacle-teal', '#2ed3c6'),
      cellHorizontalPadding: 10,
      cellVerticalPadding: 7,
      headerFontStyle: '600 12px var(--font-montserrat, sans-serif)',
      headerIconSize: 16,
      baseFontStyle: '500 11px var(--font-montserrat, sans-serif)',
      markerFontStyle: '500 11px var(--font-mono, monospace)',
      fontFamily: 'var(--font-montserrat, sans-serif)',
      editorFontSize: '11px',
      lineHeight: 1.3,
      horizontalBorderColor: pick('--border-color', '#334155'),
      headerBottomBorderColor: pick('--border-color', '#334155'),
      roundingRadius: 6,
    });
  }, []);

  useEffect(() => {
    const defaults: Record<TimelineInterval, number> = {
      week: 4,
      month: 2,
      quarter: 1,
      year: 0.55,
    };
    setPxPerDay(defaults[timelineInterval]);
  }, [timelineInterval]);

  useEffect(() => {
    if (!draggingSplit) return;

    const onMove = (e: MouseEvent) => {
      const host = splitHostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPanePct(Math.max(25, Math.min(75, pct)));
    };

    const onUp = () => setDraggingSplit(false);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [draggingSplit]);

  useEffect(() => {
    if (!columnsMenuOpen) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (columnsMenuRef.current?.contains(target)) return;
      setColumnsMenuOpen(false);
    };

    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [columnsMenuOpen]);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    (fullData.employees || []).forEach((emp: unknown) => {
      const id = readString(emp, 'id', 'employeeId');
      const name = readString(emp, 'name');
      if (id) map.set(id, name || id);
    });
    return map;
  }, [fullData.employees]);

  const wbsRootItems = useMemo(() => {
    const raw = ((filteredData as Record<string, unknown>).wbsData as Record<string, unknown> | undefined)?.items;
    return Array.isArray(raw) ? raw : [];
  }, [filteredData]);

  const expandAll = useCallback(() => {
    const ids = new Set<string>();
    const walk = (items: unknown[]) => {
      items.forEach((item) => {
        const rec = toRecord(item);
        const id = readString(rec, 'id');
        const children = Array.isArray(rec.children) ? rec.children : [];
        if (id && children.length) ids.add(id);
        if (children.length) walk(children);
      });
    };
    walk(wbsRootItems);
    setExpandedIds(ids);
  }, [wbsRootItems]);

  const collapseToLevel = useCallback((targetLevel: number) => {
    const ids = new Set<string>();
    const walk = (items: unknown[], level: number) => {
      items.forEach((item) => {
        const rec = toRecord(item);
        const id = readString(rec, 'id');
        const children = Array.isArray(rec.children) ? rec.children : [];
        if (id && children.length && level < targetLevel) ids.add(id);
        if (children.length) walk(children, level + 1);
      });
    };
    walk(wbsRootItems, 1);
    setExpandedIds(ids);
  }, [wbsRootItems]);

  useEffect(() => {
    if (!wbsRootItems.length) return;
    collapseToLevel(2);
  }, [wbsRootItems, collapseToLevel]);

  const flatRows = useMemo(() => {
    const rows: FlatWbsRow[] = [];

    const walk = (items: unknown[], level: number, parentVisible: boolean) => {
      items.forEach((item) => {
        const rec = toRecord(item);
        const id = readString(rec, 'id');
        if (!id || !parentVisible) return;

        const children = Array.isArray(rec.children) ? rec.children : [];
        const hasChildren = children.length > 0;
        const isExpanded = expandedIds.has(id);

        const startDate = readDate(rec, 'startDate', 'baselineStartDate', 'actualStartDate');
        const endDateRaw = readDate(rec, 'endDate', 'baselineEndDate', 'actualEndDate');
        const baselineStart = readDate(rec, 'baselineStart', 'baselineStartDate');
        const baselineEnd = readDate(rec, 'baselineEnd', 'baselineEndDate');

        const daysRequiredRaw = Math.max(0, readNumber(rec, 'daysRequired', 'duration'));
        const fallbackEnd = startDate ? new Date(startDate.getTime() + Math.max(1, daysRequiredRaw || 1) * DAY_MS) : null;
        const endDate = endDateRaw && startDate && endDateRaw < startDate ? startDate : (endDateRaw || fallbackEnd);
        const daysRequired = daysRequiredRaw || (startDate && endDate ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS)) : 0);

        const baselineHours = readNumber(rec, 'baselineHours', 'baseline_hours');
        const actualHours = readNumber(rec, 'actualHours', 'actual_hours');
        const remainingHours = readNumber(rec, 'remainingHours', 'remaining_hours');
        const work = actualHours + remainingHours;

        const baselineCost = readNumber(rec, 'baselineCost', 'baseline_cost');
        const actualCost = readNumber(rec, 'actualCost', 'actual_cost');
        const remainingCost = readNumber(rec, 'remainingCost', 'remaining_cost');
        const scheduleCost = actualCost + remainingCost;

        const efficiency = baselineHours > 0 ? (actualHours / baselineHours) * 100 : 0;

        const taskId = normalizeTaskId(readString(rec, 'taskId', 'task_id', 'id'));
        const assignedResourceId = readString(rec, 'assignedResourceId', 'assigned_resource_id', 'employeeId', 'employee_id');

        rows.push({
          id,
          taskId,
          wbsCode: readString(rec, 'wbsCode', 'wbs_code') || '-',
          name: readString(rec, 'name', 'taskName') || '-',
          type: inferType(rec),
          resourceName: employeeNameById.get(assignedResourceId) || '-',
          assignedResource: readString(rec, 'assignedResource', 'assigned_resource'),
          level,
          hasChildren,
          isExpanded,
          startDate,
          endDate,
          baselineStart,
          baselineEnd,
          daysRequired,
          baselineHours,
          actualHours,
          remainingHours,
          work,
          baselineCost,
          actualCost,
          remainingCost,
          scheduleCost,
          efficiency,
          percentComplete: Math.max(0, Math.min(100, Math.round(readNumber(rec, 'percentComplete', 'percent_complete')))),
          predecessorIds: getPredecessorIds(rec),
          totalFloat: readNumber(rec, 'totalFloat', 'total_float'),
          isCritical: Boolean(rec.isCritical || rec.is_critical),
        });

        if (hasChildren) {
          walk(children, level + 1, isExpanded);
        }
      });
    };

    walk(wbsRootItems, 1, true);
    return rows;
  }, [expandedIds, wbsRootItems, employeeNameById]);

  const visibleDefs = useMemo(() => ALL_COLUMNS.filter((c) => visibleColumnIds.has(c.id)), [visibleColumnIds]);
  const columns = useMemo<GridColumn[]>(() => visibleDefs.map((c) => ({ id: c.id, title: c.title, width: c.width })), [visibleDefs]);

  const getCellContent = useCallback((cell: Item): GridCell => {
    const [col, row] = cell;
    const r = flatRows[row];
    if (!r) {
      return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
    }

    const def = visibleDefs[col];
    if (!def) {
      return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
    }

    let text = def.value(r);

    if (def.id === 'wbs' || def.id === 'name') {
      const indent = '\u00A0\u00A0'.repeat(Math.max(0, r.level - 1));
      const expander = r.hasChildren ? (r.isExpanded ? '▾ ' : '▸ ') : '';
      text = def.id === 'name' ? `${indent}${expander}${text}` : `${indent}${text}`;
    }

    return {
      kind: GridCellKind.Text,
      data: text,
      displayData: text,
      allowOverlay: false,
    };
  }, [flatRows, visibleDefs]);

  const onCellClicked = useCallback((cell: Item) => {
    const [col, row] = cell;
    const def = visibleDefs[col];
    if (!def || (def.id !== 'wbs' && def.id !== 'name')) return;
    const target = flatRows[row];
    if (!target?.hasChildren) return;

    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(target.id)) next.delete(target.id);
      else next.add(target.id);
      return next;
    });
  }, [flatRows, visibleDefs]);

  const onVisibleRegionChanged = useCallback((range: Rectangle, _tx: number, ty: number) => {
    const byRange = Math.max(0, range.y * ROW_HEIGHT);
    setVerticalOffset(Math.max(byRange, ty));
  }, []);

  const rowsWithDates = useMemo(() => flatRows.filter((r) => {
    if (!r.startDate || !r.endDate) return false;
    const y1 = r.startDate.getFullYear();
    const y2 = r.endDate.getFullYear();
    return y1 >= 2000 && y1 <= 2100 && y2 >= 2000 && y2 <= 2100;
  }), [flatRows]);

  const timelineRange = useMemo(() => {
    if (!rowsWithDates.length) {
      const now = new Date();
      return {
        min: new Date(now.getFullYear(), now.getMonth() - 6, 1),
        max: new Date(now.getFullYear(), now.getMonth() + 6, 1),
      };
    }

    const starts = rowsWithDates.map((r) => r.startDate as Date).sort((a, b) => a.getTime() - b.getTime());
    const ends = rowsWithDates.map((r) => r.endDate as Date).sort((a, b) => a.getTime() - b.getTime());

    const lo = Math.max(0, Math.floor(starts.length * 0.01));
    const hi = Math.max(0, Math.floor(ends.length * 0.99) - 1);

    const min = starts[lo] || starts[0];
    const max = ends[hi] || ends[ends.length - 1];

    return {
      min: new Date(min.getTime() - 30 * DAY_MS),
      max: new Date(max.getTime() + 30 * DAY_MS),
    };
  }, [rowsWithDates]);

  const rightPanelWidth = Math.max(0, rightPanel.size.width);
  const rightPanelHeight = Math.max(0, rightPanel.size.height);

  const totalDays = Math.max(1, Math.ceil((timelineRange.max.getTime() - timelineRange.min.getTime()) / DAY_MS));
  const timelineInnerWidth = Math.max(rightPanelWidth, Math.round(totalDays * pxPerDay) + 140);

  const toX = useCallback((d: Date) => {
    const days = (d.getTime() - timelineRange.min.getTime()) / DAY_MS;
    return 70 + days * pxPerDay;
  }, [timelineRange.min, pxPerDay]);

  const visibleWindow = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(verticalOffset / ROW_HEIGHT) - 3);
    const count = Math.ceil(Math.max(0, rightPanelHeight - HEADER_HEIGHT) / ROW_HEIGHT) + 6;
    const endIdx = Math.min(flatRows.length - 1, startIdx + count);
    return { startIdx, endIdx };
  }, [verticalOffset, rightPanelHeight, flatRows.length]);

  const indexByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    flatRows.forEach((r, idx) => {
      const rid = normalizeTaskId(r.id);
      if (rid && !map.has(rid)) map.set(rid, idx);
      if (r.taskId && !map.has(r.taskId)) map.set(r.taskId, idx);
    });
    return map;
  }, [flatRows]);

  const monthTicks = useMemo(() => {
    const ticks: Date[] = [];
    const start = new Date(timelineRange.min.getFullYear(), timelineRange.min.getMonth(), 1);
    const end = new Date(timelineRange.max.getFullYear(), timelineRange.max.getMonth(), 1);
    const cursor = new Date(start);
    while (cursor <= end) {
      ticks.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  }, [timelineRange]);

  const quarterTicks = useMemo(() => {
    const ticks: Date[] = [];
    const startQuarter = Math.floor(timelineRange.min.getMonth() / 3) * 3;
    const start = new Date(timelineRange.min.getFullYear(), startQuarter, 1);
    const end = new Date(timelineRange.max.getFullYear(), timelineRange.max.getMonth(), 1);
    const cursor = new Date(start);
    while (cursor <= end) {
      ticks.push(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + 3);
    }
    return ticks;
  }, [timelineRange]);

  const yearTicks = useMemo(() => {
    const ticks: Date[] = [];
    const start = new Date(timelineRange.min.getFullYear(), 0, 1);
    const end = new Date(timelineRange.max.getFullYear(), 11, 31);
    const cursor = new Date(start);
    while (cursor <= end) {
      ticks.push(new Date(cursor));
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
    return ticks;
  }, [timelineRange]);

  const scrollToToday = useCallback(() => {
    const el = rightScrollRef.current;
    if (!el) return;
    const x = toX(new Date());
    const target = Math.max(0, x - el.clientWidth / 2);
    el.scrollTo({ left: target, behavior: 'smooth' });
  }, [toX]);

  const fitToView = useCallback(() => {
    if (rightPanelWidth <= 0) return;
    const fit = (rightPanelWidth - 140) / Math.max(1, totalDays);
    setPxPerDay(Math.max(0.25, Math.min(12, fit)));
  }, [rightPanelWidth, totalDays]);

  const toggleColumn = useCallback((id: string) => {
    setVisibleColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 3) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectEssentialColumns = useCallback(() => {
    setVisibleColumnIds(new Set(['wbs', 'name', 'type', 'resource', 'start', 'end', 'pct', 'pred']));
  }, []);

  const selectAllColumns = useCallback(() => {
    setVisibleColumnIds(new Set(ALL_COLUMNS.map((c) => c.id)));
  }, []);

  if (isLoading) return <PageLoader message="Loading WBS Gantt V2..." />;

  return (
    <div className="page-panel" style={{ height: 'calc(100vh - 62px)', display: 'flex', flexDirection: 'column', gap: 8, padding: '0.5rem 0.75rem 0.5rem' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>WBS Gantt V2</h1>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
            Original theme + hierarchy + dependencies + resizable split
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
            {(['week', 'month', 'quarter', 'year'] as TimelineInterval[]).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setTimelineInterval(iv)}
                style={{
                  padding: '0.3rem 0.55rem',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  background: timelineInterval === iv ? 'var(--pinnacle-teal)' : 'transparent',
                  color: timelineInterval === iv ? '#041717' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 4,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                }}
              >
                {iv}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--bg-tertiary)', borderRadius: 8, padding: '3px 8px', border: '1px solid var(--border-color)' }}>
            <button type="button" onClick={fitToView} style={{ padding: '3px 8px', fontSize: '0.62rem', fontWeight: 700, background: 'rgba(46,211,198,0.14)', border: '1px solid rgba(46,211,198,0.45)', borderRadius: 4, color: 'var(--pinnacle-teal)', cursor: 'pointer' }}>Fit</button>
            <button type="button" onClick={() => setPxPerDay((v) => Math.max(0.25, v - 0.5))} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}>-</button>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', minWidth: 38, textAlign: 'center', fontWeight: 700 }}>{Math.round(pxPerDay * 100) / 100}</span>
            <button type="button" onClick={() => setPxPerDay((v) => Math.min(12, v + 0.5))} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem' }}>+</button>
            <button type="button" onClick={scrollToToday} style={{ padding: '3px 8px', fontSize: '0.62rem', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer' }}>Today</button>
          </div>

          <div style={{ display: 'flex', gap: 2, background: 'var(--bg-tertiary)', borderRadius: 6, padding: 2 }}>
            <button type="button" onClick={() => setExpandedIds(new Set())} style={{ padding: '0.3rem 0.5rem', fontSize: '0.62rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}>L0</button>
            <button type="button" onClick={() => collapseToLevel(2)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.62rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}>L2</button>
            <button type="button" onClick={() => collapseToLevel(3)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.62rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}>L3</button>
            <button type="button" onClick={expandAll} style={{ padding: '0.3rem 0.5rem', fontSize: '0.62rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}>All</button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', color: '#6b7280' }}>
            <input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} style={{ accentColor: '#6b7280' }} />
            <span>Baseline</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', color: '#40e0d0' }}>
            <input type="checkbox" checked={showDependencies} onChange={(e) => setShowDependencies(e.target.checked)} style={{ accentColor: '#40e0d0' }} />
            <span>Dependencies</span>
          </label>

          <div ref={columnsMenuRef} style={{ position: 'relative' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setColumnsMenuOpen((v) => !v)}>
              Columns ({visibleDefs.length})
            </button>
            {columnsMenuOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 220, maxHeight: 340, overflow: 'auto', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', padding: 8, zIndex: 500 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <button type="button" onClick={selectEssentialColumns} style={{ flex: 1, padding: '4px 6px', fontSize: '0.62rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer' }}>Essential</button>
                  <button type="button" onClick={selectAllColumns} style={{ flex: 1, padding: '4px 6px', fontSize: '0.62rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer' }}>All</button>
                </div>
                {ALL_COLUMNS.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 2px', fontSize: '0.67rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={visibleColumnIds.has(c.id)} onChange={() => toggleColumn(c.id)} style={{ accentColor: 'var(--pinnacle-teal)' }} />
                    <span>{c.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{flatRows.length} rows</div>
        </div>
      </div>

      <div ref={splitHostRef} style={{ flex: 1, minHeight: 0, display: 'flex', gap: 0, border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div
          ref={leftPanel.ref}
          style={{ width: `${leftPanePct}%`, minHeight: 0, minWidth: 0, overflow: 'hidden', background: 'var(--bg-card)', position: 'relative' }}
        >
          {leftPanel.size.width > 20 && leftPanel.size.height > 20 ? (
            <DataEditor
              columns={columns}
              rows={flatRows.length}
              rowHeight={ROW_HEIGHT}
              headerHeight={HEADER_HEIGHT}
              getCellContent={getCellContent}
              onVisibleRegionChanged={onVisibleRegionChanged}
              onCellClicked={onCellClicked}
              smoothScrollX
              smoothScrollY
              width={leftPanel.size.width}
              height={leftPanel.size.height}
              theme={gridTheme}
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Preparing WBS grid...</div>
          )}
        </div>

        <div
          style={{ width: 8, cursor: 'col-resize', background: 'var(--bg-tertiary)', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', display: 'grid', placeItems: 'center', userSelect: 'none' }}
          onMouseDown={() => setDraggingSplit(true)}
          title="Resize panels"
        >
          <div style={{ width: 2, height: 30, borderRadius: 2, background: 'var(--text-muted)', opacity: 0.55 }} />
        </div>

        <div
          ref={rightPanel.ref}
          style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', background: 'var(--bg-card)', position: 'relative' }}
        >
          {rightPanelWidth > 20 && rightPanelHeight > 20 ? (
            <div ref={rightScrollRef} style={{ width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
              <Stage width={timelineInnerWidth} height={rightPanelHeight}>
                <Layer>
                  <Rect x={0} y={0} width={timelineInnerWidth} height={HEADER_HEIGHT} fill={'#0d1625'} />

                  {monthTicks.map((tick) => {
                    const x = toX(tick);
                    return <Line key={`m-${tick.toISOString()}`} points={[x, HEADER_HEIGHT, x, rightPanelHeight]} stroke={'#23334b'} strokeWidth={0.9} />;
                  })}

                  {quarterTicks.map((tick) => {
                    const x = toX(tick);
                    const q = Math.floor(tick.getMonth() / 3) + 1;
                    return (
                      <React.Fragment key={`q-${tick.toISOString()}`}>
                        <Line points={[x, 0, x, rightPanelHeight]} stroke={'#314762'} strokeWidth={1.1} />
                        {(timelineInterval === 'week' || timelineInterval === 'month') && (
                          <Text x={x + 3} y={2} text={`Q${q}`} fill={'#9eb0c7'} fontSize={10} />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {yearTicks.map((tick) => {
                    const x = toX(tick);
                    return (
                      <React.Fragment key={`y-${tick.toISOString()}`}>
                        <Line points={[x, 0, x, rightPanelHeight]} stroke={'#4a607c'} strokeWidth={1.35} />
                        <Text x={x + 4} y={12} text={String(tick.getFullYear())} fill={'#d0d9e8'} fontSize={11} />
                      </React.Fragment>
                    );
                  })}

                  {/* Today line */}
                  {(() => {
                    const now = new Date();
                    const x = toX(now);
                    if (x < 0 || x > timelineInnerWidth) return null;
                    return (
                      <React.Fragment>
                        <Line points={[x, 0, x, rightPanelHeight]} stroke="#ef4444" strokeWidth={1.2} dash={[6, 4]} />
                        <Text x={x + 4} y={26} text="Today" fill="#ef4444" fontSize={10} />
                      </React.Fragment>
                    );
                  })()}

                  {flatRows.slice(visibleWindow.startIdx, visibleWindow.endIdx + 1).map((row, localIdx) => {
                    const idx = visibleWindow.startIdx + localIdx;
                    const y = HEADER_HEIGHT + idx * ROW_HEIGHT - verticalOffset;

                    if (y + ROW_HEIGHT < HEADER_HEIGHT || y > rightPanelHeight) return null;

                    const barStart = row.startDate ? toX(row.startDate) : null;
                    const barEnd = row.endDate ? toX(row.endDate) : null;

                    return (
                      <React.Fragment key={row.id}>
                        <Rect x={0} y={y} width={timelineInnerWidth} height={ROW_HEIGHT} fill={row.isCritical ? 'rgba(239,68,68,0.05)' : 'transparent'} />
                        <Line points={[0, y + ROW_HEIGHT - 1, timelineInnerWidth, y + ROW_HEIGHT - 1]} stroke={'#1f3149'} strokeWidth={1} />

                        {showBaseline && row.baselineStart && row.baselineEnd && (
                          <Rect
                            x={toX(row.baselineStart)}
                            y={y + 14}
                            width={Math.max(4, toX(row.baselineEnd) - toX(row.baselineStart))}
                            height={6}
                            fill={'rgba(107,114,128,0.45)'}
                            stroke={'rgba(107,114,128,0.75)'}
                            strokeWidth={1}
                            cornerRadius={2}
                          />
                        )}

                        {barStart !== null && barEnd !== null && (
                          <>
                            <Rect
                              x={barStart}
                              y={y + 7}
                              width={Math.max(6, barEnd - barStart)}
                              height={ROW_HEIGHT - 14}
                              fill={TYPE_COLOR[row.type] || '#2ed3c6'}
                              opacity={0.22}
                              cornerRadius={4}
                            />
                            <Rect
                              x={barStart}
                              y={y + 7}
                              width={Math.max(3, (Math.max(6, barEnd - barStart) * row.percentComplete) / 100)}
                              height={ROW_HEIGHT - 14}
                              fill={getProgressColor(row.percentComplete, row.isCritical)}
                              cornerRadius={4}
                            />
                            <Text
                              x={barStart + 6}
                              y={y + 10}
                              width={Math.max(45, barEnd - barStart - 10)}
                              text={row.name}
                              fill={row.isCritical ? '#fff3f3' : '#032320'}
                              fontSize={11}
                              ellipsis
                            />
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {showDependencies && flatRows.slice(visibleWindow.startIdx, visibleWindow.endIdx + 1).flatMap((targetRow, localIdx) => {
                    const targetIdx = visibleWindow.startIdx + localIdx;
                    if (!targetRow.startDate) return [];

                    const targetY = HEADER_HEIGHT + targetIdx * ROW_HEIGHT - verticalOffset + ROW_HEIGHT / 2;
                    const targetX = toX(targetRow.startDate);

                    return targetRow.predecessorIds.flatMap((pred) => {
                      const sourceIdx = indexByTaskId.get(normalizeTaskId(pred));
                      if (sourceIdx === undefined) return [];

                      const source = flatRows[sourceIdx];
                      if (!source?.endDate) return [];

                      const sourceY = HEADER_HEIGHT + sourceIdx * ROW_HEIGHT - verticalOffset + ROW_HEIGHT / 2;
                      if (sourceY < HEADER_HEIGHT - ROW_HEIGHT || sourceY > rightPanelHeight + ROW_HEIGHT) return [];

                      const sourceX = toX(source.endDate);
                      const routeX = targetX >= sourceX ? Math.max(sourceX + 16, targetX - 16) : sourceX + 16;
                      const leftDetourX = targetX >= sourceX ? routeX : Math.max(10, targetX - 18);
                      const key = `${source.id}->${targetRow.id}`;

                      const points = targetX >= sourceX
                        ? [sourceX, sourceY, routeX, sourceY, routeX, targetY, targetX - 10, targetY]
                        : [sourceX, sourceY, routeX, sourceY, routeX, targetY, leftDetourX, targetY, targetX - 10, targetY];

                      const stroke = source.isCritical || targetRow.isCritical ? '#ef4444' : '#40e0d0';

                      return [
                        <Line
                          key={`dep-line-${key}`}
                          points={points}
                          stroke={stroke}
                          strokeWidth={source.isCritical || targetRow.isCritical ? 1.9 : 1.45}
                          lineJoin="round"
                          lineCap="round"
                        />,
                        <Arrow
                          key={`dep-arrow-${key}`}
                          points={[targetX - 15, targetY, targetX - 2, targetY]}
                          stroke={stroke}
                          fill={stroke}
                          strokeWidth={source.isCritical || targetRow.isCritical ? 1.9 : 1.45}
                          pointerLength={5}
                          pointerWidth={5}
                        />,
                      ];
                    });
                  })}
                </Layer>
              </Stage>
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Preparing timeline...</div>
          )}
        </div>
      </div>
    </div>
  );
}
