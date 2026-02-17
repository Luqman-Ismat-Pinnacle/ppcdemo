'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DataEditor, { DataEditorRef, GridCell, GridCellKind, GridColumn, Item, Rectangle, Theme } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { Arrow, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { useData } from '@/lib/data-context';
import { useSnapshotVariance } from '@/lib/use-snapshot-variance';
import { CPMEngine } from '@/lib/cpm-engine';
import PageLoader from '@/components/ui/PageLoader';

type TimelineInterval = 'day' | 'month' | 'quarter' | 'year';

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
  varianceHours: number | null;
  varianceCost: number | null;
};

type ColumnDef = {
  id: string;
  title: string;
  width: number;
  value: (row: FlatWbsRow) => string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 42;
const HEADER_HEIGHT = 44;

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
  { id: 'fte', title: 'FTE Load', width: 120, value: () => '' },
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
  const { getSnapshotValue, hasComparison } = useSnapshotVariance();
  const splitHostRef = useRef<HTMLDivElement>(null);
  const dataEditorRef = useRef<DataEditorRef | null>(null);
  const leftPanel = useElementSize<HTMLDivElement>();
  const rightPanel = useElementSize<HTMLDivElement>();
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const rightVirtualScrollRef = useRef<HTMLDivElement>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [pxPerDay, setPxPerDay] = useState(2.5);
  const [timelineInterval, setTimelineInterval] = useState<TimelineInterval>('month');
  const [showDependencies, setShowDependencies] = useState(true);
  const [showBaseline, setShowBaseline] = useState(true);
  const [showVariance, setShowVariance] = useState(false);
  const [runCpm, setRunCpm] = useState(true);
  const [leftPanePct, setLeftPanePct] = useState(50);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<Set<string>>(new Set(defaultVisibleColumns));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [headerFilterColumnId, setHeaderFilterColumnId] = useState<string | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ columnId: string; x: number; y: number } | null>(null);
  const [barTip, setBarTip] = useState<{ row: FlatWbsRow; x: number; y: number } | null>(null);
  const [hoursBreakdownRow, setHoursBreakdownRow] = useState<FlatWbsRow | null>(null);

  const [gridTheme, setGridTheme] = useState<Theme | undefined>(undefined);
  const [uiColors, setUiColors] = useState({
    textPrimary: '#e5e7eb',
    textSecondary: '#cbd5e1',
    textMuted: '#94a3b8',
    bgPrimary: 'rgba(0,0,0,0.5)',
    bgSecondary: 'rgba(0,0,0,0.82)',
    bgTertiary: 'rgba(7,13,19,0.92)',
    border: '#334155',
    teal: '#40e0d0',
  });
  const [timelineColors, setTimelineColors] = useState({
    header: 'rgba(0,0,0,0.88)',
    gridMinor: 'rgba(100,131,167,0.2)',
    gridMajor: 'rgba(100,131,167,0.42)',
    rowLine: 'rgba(95,126,163,0.26)',
    text: '#e2ebff',
    quarter: '#9eb0c7',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const styles = getComputedStyle(document.documentElement);
    const pick = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

    setGridTheme({
      accentColor: pick('--pinnacle-teal', '#2ed3c6'),
      accentFg: '#010509',
      accentLight: 'rgba(64,224,208,0.32)',
      textDark: pick('--text-primary', '#e5e7eb'),
      textMedium: pick('--text-secondary', '#cbd5e1'),
      textLight: pick('--text-muted', '#94a3b8'),
      textBubble: '#e2e8f0',
      bgIconHeader: 'rgba(6,10,14,0.96)',
      fgIconHeader: pick('--text-secondary', '#cbd5e1'),
      textHeader: pick('--text-primary', '#e5e7eb'),
      textHeaderSelected: pick('--text-primary', '#e5e7eb'),
      bgCell: 'rgba(0,0,0,0.56)',
      bgCellMedium: 'rgba(0,0,0,0.72)',
      bgHeader: 'rgba(0,0,0,0.88)',
      bgHeaderHasFocus: 'rgba(0,0,0,0.96)',
      bgHeaderHovered: 'rgba(6,10,14,0.95)',
      bgBubble: 'rgba(0,0,0,0.84)',
      bgBubbleSelected: 'rgba(0,0,0,0.9)',
      bgSearchResult: 'rgba(46,211,198,0.2)',
      borderColor: pick('--border-color', '#334155'),
      drilldownBorder: pick('--border-color', '#334155'),
      linkColor: pick('--pinnacle-teal', '#2ed3c6'),
      cellHorizontalPadding: 10,
      cellVerticalPadding: 7,
      headerFontStyle: '700 11px var(--font-montserrat, sans-serif)',
      headerIconSize: 16,
      baseFontStyle: '600 11px var(--font-montserrat, sans-serif)',
      markerFontStyle: '600 11px var(--font-mono, monospace)',
      fontFamily: 'var(--font-montserrat, sans-serif)',
      editorFontSize: '11px',
      lineHeight: 1.3,
      horizontalBorderColor: pick('--border-color', '#334155'),
      headerBottomBorderColor: pick('--border-color', '#334155'),
      roundingRadius: 6,
    });

    setTimelineColors({
      header: 'rgba(0,0,0,0.88)',
      gridMinor: 'rgba(100,131,167,0.2)',
      gridMajor: 'rgba(100,131,167,0.42)',
      rowLine: 'rgba(95,126,163,0.26)',
      text: '#e2ebff',
      quarter: '#9eb0c7',
    });

    setUiColors({
      textPrimary: pick('--text-primary', '#e5e7eb'),
      textSecondary: pick('--text-secondary', '#cbd5e1'),
      textMuted: pick('--text-muted', '#94a3b8'),
      bgPrimary: 'rgba(0,0,0,0.5)',
      bgSecondary: 'rgba(0,0,0,0.82)',
      bgTertiary: 'rgba(7,13,19,0.92)',
      border: pick('--border-color', '#334155'),
      teal: '#40e0d0',
    });
  }, []);

  useEffect(() => {
    const defaults: Record<TimelineInterval, number> = {
      day: 16,
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
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-header-filter-popup]') || target.closest('[data-header-menu-popup]')) return;
      setHeaderFilterColumnId(null);
      setHeaderMenu(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    (fullData.employees || []).forEach((emp: unknown) => {
      const id = readString(emp, 'id', 'employeeId');
      const name = readString(emp, 'name');
      if (id) map.set(id, name || id);
    });
    return map;
  }, [fullData.employees]);

  const predecessorMapByTaskId = useMemo(() => {
    const map = new Map<string, string[]>();
    const allTasks = [...(filteredData.tasks || []), ...(fullData.tasks || [])];
    allTasks.forEach((task: unknown) => {
      const rec = toRecord(task);
      const taskId = normalizeTaskId(readString(rec, 'id', 'taskId', 'task_id'));
      if (!taskId) return;

      const fromArrayRaw = rec.predecessors;
      const fromArray = Array.isArray(fromArrayRaw)
        ? fromArrayRaw
          .map((p) => normalizeTaskId(readString(p, 'predecessorTaskId', 'predecessor_task_id', 'taskId', 'task_id', 'id')))
          .filter(Boolean)
        : [];

      const raw = readString(rec, 'predecessorId', 'predecessor_id', 'predecessorsText', 'predecessors_text');
      const fromString = raw
        ? raw
          .split(/[;,]+/)
          .map((token) => token.trim())
          .filter(Boolean)
          .map((token) => {
            const relMatch = token.match(/(FS|SS|FF|SF)(?:\s*[+-].*)?$/i);
            const idPart = relMatch && typeof relMatch.index === 'number' ? token.slice(0, relMatch.index).trim() : token;
            return normalizeTaskId(idPart);
          })
          .filter(Boolean)
        : [];

      const merged = Array.from(new Set([...fromArray, ...fromString]));
      if (merged.length > 0) map.set(taskId, merged);
    });
    return map;
  }, [filteredData.tasks, fullData.tasks]);

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
          predecessorIds: (() => {
            const direct = getPredecessorIds(rec);
            if (direct.length > 0) return direct;
            return predecessorMapByTaskId.get(taskId) || [];
          })(),
          totalFloat: readNumber(rec, 'totalFloat', 'total_float'),
          isCritical: Boolean(rec.isCritical || rec.is_critical),
          varianceHours: null,
          varianceCost: null,
        });

        if (hasChildren) {
          walk(children, level + 1, isExpanded);
        }
      });
    };

    walk(wbsRootItems, 1, true);
    return rows;
  }, [expandedIds, wbsRootItems, employeeNameById, predecessorMapByTaskId]);

  const visibleDefs = useMemo(() => ALL_COLUMNS.filter((c) => visibleColumnIds.has(c.id)), [visibleColumnIds]);
  const columns = useMemo<GridColumn[]>(
    () => visibleDefs.map((c) => ({ id: c.id, title: c.title, width: Math.max(56, Math.round(columnWidths[c.id] || c.width)) })),
    [visibleDefs, columnWidths],
  );
  const numericColumnIds = useMemo(() => new Set(['days', 'blh', 'acth', 'remh', 'work', 'blc', 'actc', 'remc', 'sched', 'eff', 'pct', 'tf']), []);

  const baseFilteredRows = useMemo(() => {
    return flatRows.filter((row) => {
      for (const def of visibleDefs) {
        const query = (columnFilters[def.id] || '').trim().toLowerCase();
        if (!query) continue;
        const value = def.value(row).toLowerCase();
        if (!value.includes(query)) return false;
      }
      return true;
    });
  }, [flatRows, visibleDefs, columnFilters]);

  const cpmByTaskId = useMemo(() => {
    if (!runCpm) return new Map<string, { totalFloat: number; isCritical: boolean }>();
    const tasks = baseFilteredRows
      .filter((r) => r.type === 'task' || r.type === 'sub_task')
      .map((r) => ({
        id: normalizeTaskId(r.taskId || r.id),
        name: r.name,
        wbsCode: r.wbsCode,
        daysRequired: Math.max(1, r.daysRequired || 1),
        predecessors: r.predecessorIds.map((pid) => ({ taskId: normalizeTaskId(pid), relationship: 'FS' as const, lagDays: 0 })),
      }))
      .filter((t) => t.id);
    const map = new Map<string, { totalFloat: number; isCritical: boolean }>();
    if (!tasks.length) return map;
    try {
      const engine = new CPMEngine();
      engine.loadTasks(tasks);
      const result = engine.calculate();
      result.tasks.forEach((t) => {
        map.set(normalizeTaskId(t.id), { totalFloat: t.totalFloat, isCritical: t.isCritical });
      });
    } catch {
      return map;
    }
    return map;
  }, [baseFilteredRows, runCpm]);

  const filteredRows = useMemo(() => {
    return baseFilteredRows.map((r) => {
      const taskId = normalizeTaskId(r.taskId || r.id);
      const cpm = cpmByTaskId.get(taskId);
      const snapActualHours = taskId ? getSnapshotValue('actualHours', { taskId }) : null;
      const snapActualCost = taskId ? getSnapshotValue('actualCost', { taskId }) : null;
      return {
        ...r,
        totalFloat: cpm?.totalFloat ?? r.totalFloat,
        isCritical: cpm?.isCritical ?? r.isCritical,
        varianceHours: snapActualHours == null ? null : r.actualHours - snapActualHours,
        varianceCost: snapActualCost == null ? null : r.actualCost - snapActualCost,
      };
    });
  }, [baseFilteredRows, cpmByTaskId, getSnapshotValue]);

  const cpmStats = useMemo(() => {
    const rows = filteredRows.filter((r) => r.type === 'task' || r.type === 'sub_task');
    let critical = 0;
    rows.forEach((r) => {
      const cpm = cpmByTaskId.get(normalizeTaskId(r.taskId || r.id));
      if (cpm?.isCritical) critical += 1;
    });
    return { total: rows.length, critical };
  }, [filteredRows, cpmByTaskId]);

  const taskNameById = useMemo(() => {
    const map = new Map<string, string>();
    filteredRows.forEach((r) => {
      const id = normalizeTaskId(r.taskId || r.id);
      if (id && r.name) map.set(id, r.name);
    });
    (fullData.tasks || []).forEach((t: unknown) => {
      const id = normalizeTaskId(readString(t, 'id', 'taskId', 'task_id'));
      const name = readString(t, 'name', 'taskName');
      if (id && name && !map.has(id)) map.set(id, name);
    });
    return map;
  }, [filteredRows, fullData.tasks]);

  const getDisplayText = useCallback((def: ColumnDef, r: FlatWbsRow): string => {
    let text = def.value(r);

    if (def.id === 'wbs' || def.id === 'name') {
      const indent = '\u00A0\u00A0'.repeat(Math.max(0, r.level - 1));
      const expander = r.hasChildren ? (r.isExpanded ? '▾ ' : '▸ ') : '';
      text = def.id === 'name' ? `${indent}${expander}${text}` : `${indent}${text}`;
    }
    if (def.id === 'pred') {
      text = r.predecessorIds.length
        ? r.predecessorIds
          .map((pid) => taskNameById.get(normalizeTaskId(pid)) || normalizeTaskId(pid))
          .join(', ')
        : '-';
    }

    return text;
  }, [taskNameById]);

  const getCellContent = useCallback((cell: Item): GridCell => {
    const [col, row] = cell;
    const r = filteredRows[row];
    if (!r) {
      return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
    }

    const def = visibleDefs[col];
    if (!def) {
      return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
    }

    let text = getDisplayText(def, r);
    if (showVariance) {
      const taskId = normalizeTaskId(r.taskId || r.id);
      const snapPlanHours = taskId ? getSnapshotValue('planHours', { taskId }) : null;
      const snapActualHours = taskId ? getSnapshotValue('actualHours', { taskId }) : null;
      const snapPlanCost = taskId ? getSnapshotValue('planCost', { taskId }) : null;
      const snapActualCost = taskId ? getSnapshotValue('actualCost', { taskId }) : null;

      if (def.id === 'blh' && snapPlanHours != null) {
        const v = Math.round(r.baselineHours - snapPlanHours);
        text = `${text} (${v > 0 ? '+' : ''}${v})`;
      }
      if (def.id === 'acth' && r.varianceHours != null) {
        const v = Math.round(r.varianceHours);
        text = `${text} (${v > 0 ? '+' : ''}${v})`;
      }
      if (def.id === 'remh' && snapPlanHours != null && snapActualHours != null) {
        const snapRem = Math.max(0, snapPlanHours - snapActualHours);
        const v = Math.round(r.remainingHours - snapRem);
        text = `${text} (${v > 0 ? '+' : ''}${v})`;
      }
      if (def.id === 'blc' && snapPlanCost != null) {
        const v = Math.round(r.baselineCost - snapPlanCost);
        text = `${text} (${v > 0 ? '+' : ''}${formatCurrency(v)})`;
      }
      if (def.id === 'actc' && r.varianceCost != null) {
        const v = Math.round(r.varianceCost);
        text = `${text} (${v > 0 ? '+' : ''}${formatCurrency(v)})`;
      }
      if (def.id === 'remc' && snapPlanCost != null && snapActualCost != null) {
        const snapRemCost = Math.max(0, snapPlanCost - snapActualCost);
        const v = Math.round(r.remainingCost - snapRemCost);
        text = `${text} (${v > 0 ? '+' : ''}${formatCurrency(v)})`;
      }
    }

    return {
      kind: GridCellKind.Text,
      data: text,
      displayData: text,
      allowOverlay: false,
    };
  }, [filteredRows, visibleDefs, getDisplayText, showVariance, getSnapshotValue]);

  const drawHeader = useCallback((args: any, drawContent: () => void) => {
    const { ctx, rect, column } = args;
    ctx.fillStyle = uiColors.bgSecondary;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    drawContent();

    ctx.strokeStyle = uiColors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.width - 0.5, rect.y);
    ctx.lineTo(rect.x + rect.width - 0.5, rect.y + rect.height);
    ctx.stroke();

    if (column?.id === 'acth' || column?.id === 'actc') {
      ctx.fillStyle = uiColors.teal;
      ctx.fillRect(rect.x + 1, rect.y + rect.height - 2, rect.width - 2, 1);
    }

  }, [uiColors]);

  const drawCell = useCallback((args: any) => {
    const { ctx, rect, col, row } = args;
    const r = filteredRows[row];
    const def = visibleDefs[col];
    if (!r || !def) return;

    const isNumeric = numericColumnIds.has(def.id);
    const isCritical = r.isCritical;
    const bg = isCritical ? 'rgba(220,38,38,0.07)' : uiColors.bgPrimary;

    ctx.fillStyle = bg;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    ctx.strokeStyle = uiColors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.width - 0.5, rect.y);
    ctx.lineTo(rect.x + rect.width - 0.5, rect.y + rect.height);
    ctx.stroke();

    let color = uiColors.textSecondary;
    if (def.id === 'acth' || def.id === 'actc') color = uiColors.teal;
    if (showVariance && def.id === 'blh') {
      const taskId = normalizeTaskId(r.taskId || r.id);
      const snap = taskId ? getSnapshotValue('planHours', { taskId }) : null;
      if (snap != null) color = (r.baselineHours - snap) > 0 ? '#ef4444' : '#22c55e';
    }
    if (showVariance && def.id === 'acth' && r.varianceHours != null) color = r.varianceHours > 0 ? '#ef4444' : '#22c55e';
    if (showVariance && def.id === 'remh') {
      const taskId = normalizeTaskId(r.taskId || r.id);
      const snapP = taskId ? getSnapshotValue('planHours', { taskId }) : null;
      const snapA = taskId ? getSnapshotValue('actualHours', { taskId }) : null;
      if (snapP != null && snapA != null) color = (r.remainingHours - Math.max(0, snapP - snapA)) > 0 ? '#ef4444' : '#22c55e';
    }
    if (showVariance && def.id === 'blc') {
      const taskId = normalizeTaskId(r.taskId || r.id);
      const snap = taskId ? getSnapshotValue('planCost', { taskId }) : null;
      if (snap != null) color = (r.baselineCost - snap) > 0 ? '#ef4444' : '#22c55e';
    }
    if (showVariance && def.id === 'actc' && r.varianceCost != null) color = r.varianceCost > 0 ? '#ef4444' : '#22c55e';
    if (showVariance && def.id === 'remc') {
      const taskId = normalizeTaskId(r.taskId || r.id);
      const snapP = taskId ? getSnapshotValue('planCost', { taskId }) : null;
      const snapA = taskId ? getSnapshotValue('actualCost', { taskId }) : null;
      if (snapP != null && snapA != null) color = (r.remainingCost - Math.max(0, snapP - snapA)) > 0 ? '#ef4444' : '#22c55e';
    }
    if (def.id === 'pct') color = getProgressColor(r.percentComplete, r.isCritical);
    if (def.id === 'tf' && r.totalFloat <= 0) color = '#ef4444';
    if (def.id === 'cp' && r.isCritical) color = '#ef4444';
    if (def.id === 'name' || def.id === 'wbs') color = uiColors.textPrimary;

    const text = getDisplayText(def, r);

    if (def.id === 'type') {
      const badgeColor = TYPE_COLOR[r.type] || '#6b7280';
      const label = r.type.replace('_', ' ').toUpperCase();
      ctx.font = '600 9px var(--font-montserrat, sans-serif)';
      const textWidth = Math.min(rect.width - 10, ctx.measureText(label).width + 8);
      const badgeW = Math.max(36, textWidth + 4);
      const badgeX = rect.x + 5;
      const badgeY = rect.y + Math.floor((rect.height - 14) / 2);
      ctx.fillStyle = `${badgeColor}33`;
      ctx.fillRect(badgeX, badgeY, badgeW, 14);
      ctx.strokeStyle = `${badgeColor}99`;
      ctx.strokeRect(badgeX, badgeY, badgeW, 14);
      ctx.fillStyle = badgeColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, badgeX + 4, badgeY + 7);
      return;
    }

    if (def.id === 'fte') {
      const baselineHours = Math.max(0, r.baselineHours || 0);
      const days = Math.max(1, r.daysRequired || 1);
      const ftePerDay = baselineHours > 0 ? baselineHours / (days * 8) : 0;
      const intensity = Math.max(0.2, Math.min(1, r.percentComplete / 100 || 0.2));
      const plotX = rect.x + 6;
      const plotY = rect.y + 7;
      const plotW = rect.width - 12;
      const plotH = rect.height - 14;
      const maxFte = 3.5;
      const yForValue = (val: number) => {
        const normalized = Math.max(0, Math.min(1, val / maxFte));
        return plotY + plotH - normalized * (plotH - 2);
      };

      ctx.strokeStyle = uiColors.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, plotY + plotH);
      ctx.lineTo(plotX + plotW, plotY + plotH);
      ctx.stroke();

      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i <= 18; i += 1) {
        const t = i / 18;
        const gaussian = Math.exp(-Math.pow((t - 0.32) * 2.9, 2));
        const variation = 0.78 + gaussian * 0.5;
        const y = yForValue(ftePerDay * variation * intensity);
        const x = plotX + t * plotW;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      const progressX = plotX + (Math.max(0, Math.min(100, r.percentComplete)) / 100) * plotW;
      ctx.strokeStyle = '#40e0d0';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(progressX, plotY);
      ctx.lineTo(progressX, plotY + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    ctx.font = `${def.id === 'name' && (r.hasChildren || r.isCritical) ? '700' : '600'} 11px var(--font-montserrat, sans-serif)`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = def.id === 'tf' ? 'center' : isNumeric ? 'right' : 'left';

    const x = def.id === 'tf' ? rect.x + rect.width / 2 : isNumeric ? rect.x + rect.width - 6 : rect.x + 6;
    const y = rect.y + rect.height / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4);
    ctx.clip();
    ctx.fillText(text, x, y);
    ctx.restore();
  }, [filteredRows, visibleDefs, numericColumnIds, uiColors, getDisplayText, showVariance, getSnapshotValue]);

  const onCellClicked = useCallback((cell: Item) => {
    const [col, row] = cell;
    const def = visibleDefs[col];
    const target = filteredRows[row];
    if (!def || !target) return;

    if (def.id === 'acth' && (target.type === 'task' || target.type === 'sub_task' || target.type === 'phase' || target.type === 'unit')) {
      setHoursBreakdownRow(target);
      return;
    }
    if (def.id !== 'wbs' && def.id !== 'name') return;
    if (!target.hasChildren) return;

    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(target.id)) next.delete(target.id);
      else next.add(target.id);
      return next;
    });
  }, [filteredRows, visibleDefs]);

  const onHeaderClicked = useCallback((col: number, event: any) => {
    const def = visibleDefs[col];
    if (!def) return;
    const panelRect = leftPanel.ref.current?.getBoundingClientRect();
    setHeaderMenu({
      columnId: def.id,
      x: (panelRect?.left || 0) + (event.bounds?.x ?? 0),
      y: (panelRect?.top || 0) + HEADER_HEIGHT + 2,
    });
  }, [visibleDefs, leftPanel.ref]);

  const onHeaderMouseMove = useCallback((event: any) => {
    if (event?.kind !== 'header') {
      setHeaderMenu(null);
      return;
    }
    if (typeof event.localEventY === 'number' && event.localEventY > HEADER_HEIGHT) {
      setHeaderMenu(null);
      return;
    }
    const col = event.location?.[0];
    if (typeof col !== 'number') return;
    const def = visibleDefs[col];
    if (!def) return;
    const panelRect = leftPanel.ref.current?.getBoundingClientRect();
    const next = {
      columnId: def.id,
      x: (panelRect?.left || 0) + (event.bounds?.x ?? 0),
      y: (panelRect?.top || 0) + HEADER_HEIGHT + 2,
    };
    setHeaderMenu((prev) => (prev?.columnId === next.columnId ? prev : next));
  }, [visibleDefs, leftPanel.ref]);

  const onVisibleRegionChanged = useCallback((range: Rectangle) => {
    const byRange = Math.max(0, range.y * ROW_HEIGHT);
    setVerticalOffset((prev) => (Math.abs(prev - byRange) > 0.5 ? byRange : prev));
  }, []);

  const rowsWithDates = useMemo(() => filteredRows.filter((r) => {
    if (!r.startDate || !r.endDate) return false;
    const y1 = r.startDate.getFullYear();
    const y2 = r.endDate.getFullYear();
    return y1 >= 2000 && y1 <= 2100 && y2 >= 2000 && y2 <= 2100;
  }), [filteredRows]);

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
    const endIdx = Math.min(filteredRows.length - 1, startIdx + count);
    return { startIdx, endIdx };
  }, [verticalOffset, rightPanelHeight, filteredRows.length]);

  const onRightTimelineScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop !== 0) el.scrollTop = 0;
  }, []);

  const onRightTimelineWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
    }
  }, []);

  const indexByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    filteredRows.forEach((r, idx) => {
      const rid = normalizeTaskId(r.id);
      if (rid && !map.has(rid)) map.set(rid, idx);
      if (r.taskId && !map.has(r.taskId)) map.set(r.taskId, idx);
    });
    return map;
  }, [filteredRows]);

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

  const axisTicks = useMemo(() => {
    const ticks: Date[] = [];
    const min = timelineRange.min;
    const max = timelineRange.max;

    if (timelineInterval === 'day') {
      const start = new Date(min.getFullYear(), min.getMonth(), min.getDate());
      const end = new Date(max.getFullYear(), max.getMonth(), max.getDate());
      const cursor = new Date(start);
      while (cursor <= end) {
        ticks.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return ticks;
    }

    if (timelineInterval === 'month') {
      const start = new Date(min.getFullYear(), min.getMonth(), 1);
      const end = new Date(max.getFullYear(), max.getMonth(), 1);
      const cursor = new Date(start);
      while (cursor <= end) {
        ticks.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return ticks;
    }

    if (timelineInterval === 'quarter') {
      const startQuarter = Math.floor(min.getMonth() / 3) * 3;
      const start = new Date(min.getFullYear(), startQuarter, 1);
      const end = new Date(max.getFullYear(), max.getMonth(), 1);
      const cursor = new Date(start);
      while (cursor <= end) {
        ticks.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 3);
      }
      return ticks;
    }

    const start = new Date(min.getFullYear(), 0, 1);
    const end = new Date(max.getFullYear(), 0, 1);
    const cursor = new Date(start);
    while (cursor <= end) {
      ticks.push(new Date(cursor));
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
    return ticks;
  }, [timelineRange, timelineInterval]);

  const tickLabel = useCallback((tick: Date): string => {
    if (timelineInterval === 'day') {
      return tick.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
    }
    if (timelineInterval === 'month') {
      return tick.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    if (timelineInterval === 'quarter') {
      const q = Math.floor(tick.getMonth() / 3) + 1;
      return `Q${q} ${String(tick.getFullYear()).slice(-2)}`;
    }
    return String(tick.getFullYear());
  }, [timelineInterval]);

  const activeHeaderFilter = useMemo(() => {
    if (!headerFilterColumnId) return null;
    return visibleDefs.find((d) => d.id === headerFilterColumnId) || null;
  }, [headerFilterColumnId, visibleDefs]);

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

  const hoursBreakdown = useMemo(() => {
    if (!hoursBreakdownRow) return null;
    const allTasks = (fullData.tasks || []) as unknown[];
    const allHours = (fullData.hours || []) as unknown[];
    const allPhases = (fullData.phases || []) as unknown[];
    const allUnits = (fullData.units || []) as unknown[];
    const taskId = normalizeTaskId(hoursBreakdownRow.taskId || hoursBreakdownRow.id);
    const rowType = hoursBreakdownRow.type;

    const taskRec = allTasks.find((t) => normalizeTaskId(readString(t, 'id', 'taskId', 'task_id')) === taskId);
    const phaseId = rowType === 'phase'
      ? readString({ id: hoursBreakdownRow.id }, 'id').replace(/^wbs-phase-/i, '')
      : readString(taskRec, 'phaseId', 'phase_id');
    const unitId = rowType === 'unit'
      ? readString({ id: hoursBreakdownRow.id }, 'id').replace(/^wbs-unit-/i, '')
      : readString(taskRec, 'unitId', 'unit_id');

    const taskIdsInPhase = allTasks
      .filter((t) => readString(t, 'phaseId', 'phase_id') === phaseId)
      .map((t) => normalizeTaskId(readString(t, 'id', 'taskId', 'task_id')))
      .filter(Boolean);
    const taskIdsInUnit = allTasks
      .filter((t) => readString(t, 'unitId', 'unit_id') === unitId)
      .map((t) => normalizeTaskId(readString(t, 'id', 'taskId', 'task_id')))
      .filter(Boolean);

    const taskEntries = allHours.filter((h) => normalizeTaskId(readString(h, 'taskId', 'task_id')) === taskId);
    const phaseEntries = allHours.filter((h) => taskIdsInPhase.includes(normalizeTaskId(readString(h, 'taskId', 'task_id'))));
    const unitEntries = allHours.filter((h) => taskIdsInUnit.includes(normalizeTaskId(readString(h, 'taskId', 'task_id'))));

    const sumHours = (arr: unknown[]) => arr.reduce((s, h) => s + readNumber(h, 'hours', 'actualHours', 'totalHoursWorked'), 0);
    const phaseName = phaseId ? (allPhases.find((p) => readString(p, 'id', 'phaseId') === phaseId) ? readString(allPhases.find((p) => readString(p, 'id', 'phaseId') === phaseId), 'name') : phaseId) : '-';
    const unitName = unitId ? (allUnits.find((u) => readString(u, 'id', 'unitId') === unitId) ? readString(allUnits.find((u) => readString(u, 'id', 'unitId') === unitId), 'name') : unitId) : '-';

    return {
      taskHours: sumHours(taskEntries),
      phaseHours: sumHours(phaseEntries),
      unitHours: sumHours(unitEntries),
      phaseName,
      unitName,
      entries: taskEntries.slice(0, 200),
    };
  }, [hoursBreakdownRow, fullData.tasks, fullData.hours, fullData.phases, fullData.units]);

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
            {(['day', 'month', 'quarter', 'year'] as TimelineInterval[]).map((iv) => (
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
          <button
            type="button"
            disabled={!hasComparison}
            onClick={() => setShowVariance((v) => !v)}
            style={{
              padding: '0.28rem 0.52rem',
              fontSize: '0.64rem',
              fontWeight: 700,
              borderRadius: 5,
              border: `1px solid ${showVariance ? 'rgba(34,197,94,0.5)' : 'var(--border-color)'}`,
              background: showVariance ? 'rgba(34,197,94,0.18)' : 'transparent',
              color: hasComparison ? (showVariance ? '#22c55e' : 'var(--text-secondary)') : '#6b7280',
              cursor: hasComparison ? 'pointer' : 'not-allowed',
            }}
          >
            Variance
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', color: '#f59e0b' }}>
            <input type="checkbox" checked={runCpm} onChange={(e) => setRunCpm(e.target.checked)} style={{ accentColor: '#f59e0b' }} />
            <span>CPM</span>
          </label>

          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{filteredRows.length} rows</div>
          <div style={{ color: '#f59e0b', fontSize: '0.7rem', fontWeight: 600 }}>CP: {cpmStats.critical}/{cpmStats.total}</div>
        </div>
      </div>

      {activeHeaderFilter && (
        <div
          data-header-filter-popup
          style={{
            width: 320,
            maxWidth: '100%',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            padding: 8,
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700 }}>
            Filter: {activeHeaderFilter.title}
          </div>
          <input
            type="text"
            value={columnFilters[activeHeaderFilter.id] || ''}
            onChange={(e) => setColumnFilters((prev) => ({ ...prev, [activeHeaderFilter.id]: e.target.value }))}
            placeholder={`Search ${activeHeaderFilter.title.toLowerCase()}...`}
            style={{
              width: '100%',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontSize: '0.68rem',
              padding: '6px 8px',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setColumnFilters((prev) => ({ ...prev, [activeHeaderFilter.id]: '' }))}
              style={{ padding: '4px 8px', fontSize: '0.62rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setHeaderFilterColumnId(null)}
              style={{ padding: '4px 8px', fontSize: '0.62rem', background: 'var(--pinnacle-teal)', border: 'none', borderRadius: 4, color: '#041717', cursor: 'pointer', fontWeight: 700 }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div ref={splitHostRef} style={{ flex: 1, minHeight: 0, display: 'flex', gap: 0, border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'rgba(0,0,0,0.46)' }}>
        <div
          ref={leftPanel.ref}
          style={{ width: `${leftPanePct}%`, minHeight: 0, minWidth: 0, overflow: 'hidden', background: 'rgba(0,0,0,0.26)', position: 'relative' }}
        >
          {leftPanel.size.width > 20 && leftPanel.size.height > 20 ? (
            <DataEditor
              ref={dataEditorRef}
              columns={columns}
              rows={filteredRows.length}
              rowHeight={ROW_HEIGHT}
              headerHeight={HEADER_HEIGHT}
              getCellContent={getCellContent}
              onVisibleRegionChanged={onVisibleRegionChanged}
              onCellClicked={onCellClicked}
              onHeaderClicked={onHeaderClicked}
              onMouseMove={onHeaderMouseMove}
              onColumnResize={(column, newSize) => {
                const id = String((column as any).id || '');
                if (!id) return;
                setColumnWidths((prev) => ({ ...prev, [id]: Math.max(56, Math.round(newSize)) }));
              }}
              drawCell={drawCell}
              drawHeader={drawHeader}
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
          style={{ width: 8, cursor: 'col-resize', background: 'rgba(7,13,19,0.92)', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', display: 'grid', placeItems: 'center', userSelect: 'none' }}
          onMouseDown={() => setDraggingSplit(true)}
          title="Resize panels"
        >
          <div style={{ width: 2, height: 30, borderRadius: 2, background: 'var(--text-muted)', opacity: 0.55 }} />
        </div>

        <div
          ref={rightPanel.ref}
          style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', background: 'rgba(0,0,0,0.26)', position: 'relative' }}
        >
          {rightPanelWidth > 20 && rightPanelHeight > 20 ? (
            <div
              ref={rightScrollRef}
              style={{ width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}
              onScroll={onRightTimelineScroll}
              onWheel={onRightTimelineWheel}
            >
              <div ref={rightVirtualScrollRef} style={{ width: timelineInnerWidth, height: rightPanelHeight, position: 'relative' }}>
                <div style={{ position: 'sticky', top: 0 }}>
              <Stage width={timelineInnerWidth} height={rightPanelHeight}>
                <Layer>
                  <Rect x={0} y={0} width={timelineInnerWidth} height={HEADER_HEIGHT} fill={timelineColors.header} />

                  {axisTicks.map((tick) => {
                    const x = toX(tick);
                    const isMajor =
                      timelineInterval === 'year' ||
                      (timelineInterval === 'quarter' && tick.getMonth() === 0) ||
                      (timelineInterval === 'month' && tick.getMonth() === 0) ||
                      (timelineInterval === 'day' && tick.getDate() === 1);
                    const showLabel = timelineInterval === 'day' ? (tick.getDate() === 1 || tick.getDate() === 15) : true;
                    return (
                      <React.Fragment key={`axis-${tick.toISOString()}`}>
                        <Line
                          points={[x, HEADER_HEIGHT, x, rightPanelHeight]}
                          stroke={isMajor ? timelineColors.gridMajor : timelineColors.gridMinor}
                          strokeWidth={isMajor ? 1.25 : 0.8}
                        />
                        {showLabel && (
                          <Text
                            x={x + 3}
                            y={timelineInterval === 'day' ? 16 : 10}
                            text={tickLabel(tick)}
                            fill={isMajor ? timelineColors.text : timelineColors.quarter}
                            fontSize={timelineInterval === 'day' ? 9 : 10}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {(timelineInterval === 'day' || timelineInterval === 'month' || timelineInterval === 'quarter') &&
                    yearTicks.map((tick) => {
                      const x = toX(tick);
                      return (
                        <Line key={`year-line-${tick.toISOString()}`} points={[x, 0, x, rightPanelHeight]} stroke={timelineColors.gridMajor} strokeWidth={1.4} />
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

                  {filteredRows.slice(visibleWindow.startIdx, visibleWindow.endIdx + 1).map((row, localIdx) => {
                    const idx = visibleWindow.startIdx + localIdx;
                    const y = HEADER_HEIGHT + idx * ROW_HEIGHT - verticalOffset;

                    if (y + ROW_HEIGHT < HEADER_HEIGHT || y > rightPanelHeight) return null;

                    const barStart = row.startDate ? toX(row.startDate) : null;
                    const barEnd = row.endDate ? toX(row.endDate) : null;

                    return (
                      <React.Fragment key={row.id}>
                        <Rect x={0} y={y} width={timelineInnerWidth} height={ROW_HEIGHT} fill={row.isCritical ? 'rgba(239,68,68,0.05)' : 'transparent'} />
                        <Line points={[0, y + ROW_HEIGHT - 1, timelineInnerWidth, y + ROW_HEIGHT - 1]} stroke={timelineColors.rowLine} strokeWidth={1} />

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
                            onMouseEnter={(evt) => setBarTip({ row, x: evt.evt.clientX + 14, y: evt.evt.clientY - 18 })}
                            onMouseMove={(evt) => setBarTip({ row, x: evt.evt.clientX + 14, y: evt.evt.clientY - 18 })}
                            onMouseLeave={() => setBarTip(null)}
                          />
                        )}

                        {barStart !== null && barEnd !== null && (
                          <>
                            {(() => {
                              const slipped = row.baselineEnd && row.endDate && row.baselineEnd.getTime() < row.endDate.getTime();
                              if (!slipped) return null;
                              return (
                                <Rect
                                  x={Math.max(barStart, toX(row.baselineEnd))}
                                  y={y + 7}
                                  width={Math.max(2, barEnd - Math.max(barStart, toX(row.baselineEnd)))}
                                  height={ROW_HEIGHT - 14}
                                  fill={'rgba(245,158,11,0.25)'}
                                  stroke={'#f59e0b'}
                                  strokeWidth={1}
                                  dash={[4, 2]}
                                  cornerRadius={4}
                                />
                              );
                            })()}
                            <Rect
                              x={barStart}
                              y={row.hasChildren ? y + 9 : y + 7}
                              width={Math.max(6, barEnd - barStart)}
                              height={row.hasChildren ? ROW_HEIGHT - 18 : ROW_HEIGHT - 14}
                              fill={TYPE_COLOR[row.type] || '#2ed3c6'}
                              opacity={0.22}
                              cornerRadius={4}
                              onMouseEnter={(evt) => setBarTip({ row, x: evt.evt.clientX + 14, y: evt.evt.clientY - 18 })}
                              onMouseMove={(evt) => setBarTip({ row, x: evt.evt.clientX + 14, y: evt.evt.clientY - 18 })}
                              onMouseLeave={() => setBarTip(null)}
                            />
                            <Rect
                              x={barStart}
                              y={row.hasChildren ? y + 9 : y + 7}
                              width={Math.max(3, (Math.max(6, barEnd - barStart) * row.percentComplete) / 100)}
                              height={row.hasChildren ? ROW_HEIGHT - 18 : ROW_HEIGHT - 14}
                              fill={getProgressColor(row.percentComplete, row.isCritical)}
                              cornerRadius={4}
                              onMouseEnter={(evt) => setBarTip({ row, x: evt.evt.clientX + 14, y: evt.evt.clientY - 18 })}
                              onMouseMove={(evt) => setBarTip({ row, x: evt.evt.clientX + 14, y: evt.evt.clientY - 18 })}
                              onMouseLeave={() => setBarTip(null)}
                            />
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {showDependencies && (() => {
                    const drawn = new Set<string>();
                    return filteredRows.slice(visibleWindow.startIdx, visibleWindow.endIdx + 1).flatMap((targetRow, localIdx) => {
                      const targetIdx = visibleWindow.startIdx + localIdx;
                      if (!targetRow.startDate) return [];

                      const targetY = HEADER_HEIGHT + targetIdx * ROW_HEIGHT - verticalOffset + ROW_HEIGHT / 2;
                      const targetX = toX(targetRow.startDate);
                      if (!Number.isFinite(targetX)) return [];

                      return targetRow.predecessorIds.flatMap((pred) => {
                        const sourceIdx = indexByTaskId.get(normalizeTaskId(pred));
                        if (sourceIdx === undefined || sourceIdx === targetIdx) return [];
                        if (sourceIdx < visibleWindow.startIdx || sourceIdx > visibleWindow.endIdx) return [];

                        const source = filteredRows[sourceIdx];
                        if (!source?.endDate) return [];

                        const sourceY = HEADER_HEIGHT + sourceIdx * ROW_HEIGHT - verticalOffset + ROW_HEIGHT / 2;
                        if (sourceY < HEADER_HEIGHT - ROW_HEIGHT || sourceY > rightPanelHeight + ROW_HEIGHT) return [];

                        const sourceX = toX(source.endDate);
                        if (!Number.isFinite(sourceX)) return [];

                        const key = `${source.id}->${targetRow.id}`;
                        if (drawn.has(key)) return [];
                        drawn.add(key);

                        const routeX = targetX >= sourceX ? Math.max(sourceX + 16, targetX - 16) : sourceX + 16;
                        const leftDetourX = targetX >= sourceX ? routeX : Math.max(10, targetX - 18);
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
                            points={[targetX - 14, targetY, targetX, targetY]}
                            stroke={stroke}
                            fill={stroke}
                            strokeWidth={source.isCritical || targetRow.isCritical ? 1.9 : 1.45}
                            pointerLength={5}
                            pointerWidth={5}
                          />,
                        ];
                      });
                    });
                  })()}
                </Layer>
              </Stage>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Preparing timeline...</div>
          )}
        </div>
      </div>

      {barTip && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(barTip.x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 360),
            top: Math.max(10, Math.min(barTip.y, (typeof window !== 'undefined' ? window.innerHeight : 720) - 310)),
            zIndex: 10000,
            width: 320,
            maxWidth: 'calc(100vw - 24px)',
            background: 'rgba(18, 18, 22, 0.97)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            padding: '12px 14px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
            pointerEvents: 'none',
            backdropFilter: 'blur(20px)',
            color: '#d0d0d0',
            fontSize: '0.72rem',
            lineHeight: 1.45,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fff', flex: 1, marginRight: 8 }}>{barTip.row.name}</div>
            <span style={{ fontSize: '0.52rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: `${TYPE_COLOR[barTip.row.type] || '#666'}33`, color: TYPE_COLOR[barTip.row.type] || '#999', whiteSpace: 'nowrap' }}>
              {barTip.row.type.replace('_', ' ')}
            </span>
          </div>
          <div style={{ fontSize: '0.62rem', color: '#777', marginBottom: 8 }}>WBS {barTip.row.wbsCode}</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem' }}>
            <span>{barTip.row.startDate ? new Date(barTip.row.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</span>
            <span style={{ color: '#555' }}>→</span>
            <span>{barTip.row.endDate ? new Date(barTip.row.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</span>
          </div>
          <div style={{ fontSize: '0.62rem', color: '#777', marginBottom: 8 }}>{barTip.row.daysRequired} working days</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: 6 }}>
            <span style={{ color: '#8d96a6' }}>Baseline</span>
            <span>{barTip.row.baselineStart ? new Date(barTip.row.baselineStart).toLocaleDateString() : '-'} → {barTip.row.baselineEnd ? new Date(barTip.row.baselineEnd).toLocaleDateString() : '-'}</span>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 7, background: '#333', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${barTip.row.percentComplete || 0}%`, height: '100%', background: getProgressColor(barTip.row.percentComplete || 0, barTip.row.isCritical), borderRadius: 4 }} />
            </div>
            <span style={{ fontWeight: 700, color: getProgressColor(barTip.row.percentComplete || 0, barTip.row.isCritical), fontSize: '0.78rem', minWidth: 36, textAlign: 'right' }}>{Math.round(barTip.row.percentComplete || 0)}%</span>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: '0.65rem' }}>
            <div><span style={{ color: '#777' }}>BL Hours: </span>{barTip.row.baselineHours.toLocaleString()}</div>
            <div><span style={{ color: '#777' }}>Act Hours: </span><span style={{ color: uiColors.teal }}>{barTip.row.actualHours.toLocaleString()}</span></div>
            <div><span style={{ color: '#777' }}>BL Cost: </span>{formatCurrency(barTip.row.baselineCost)}</div>
            <div><span style={{ color: '#777' }}>Act Cost: </span><span style={{ color: uiColors.teal }}>{formatCurrency(barTip.row.actualCost)}</span></div>
            {showVariance && hasComparison && (
              <>
                <div>
                  <span style={{ color: '#777' }}>Var Hrs: </span>
                  <span style={{ color: (barTip.row.varianceHours || 0) > 0 ? '#ef4444' : '#22c55e' }}>
                    {barTip.row.varianceHours == null ? '-' : `${barTip.row.varianceHours > 0 ? '+' : ''}${Math.round(barTip.row.varianceHours)}`}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#777' }}>Var Cost: </span>
                  <span style={{ color: (barTip.row.varianceCost || 0) > 0 ? '#ef4444' : '#22c55e' }}>
                    {barTip.row.varianceCost == null ? '-' : `${barTip.row.varianceCost > 0 ? '+' : ''}${formatCurrency(barTip.row.varianceCost)}`}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {hoursBreakdownRow && hoursBreakdown && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10020,
            background: 'rgba(0,0,0,0.62)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setHoursBreakdownRow(null)}
        >
          <div
            style={{
              width: 'min(920px, 100%)',
              maxHeight: '88vh',
              overflow: 'auto',
              background: 'rgba(12,15,19,0.97)',
              border: '1px solid rgba(100,131,167,0.35)',
              borderRadius: 12,
              boxShadow: '0 18px 48px rgba(0,0,0,0.56)',
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <div style={{ color: '#f4f4f5', fontWeight: 700, fontSize: '0.92rem' }}>Actual Hours Breakdown</div>
                <div style={{ color: '#9ca3af', fontSize: '0.68rem' }}>{hoursBreakdownRow.name} ({hoursBreakdownRow.wbsCode})</div>
              </div>
              <button
                type="button"
                onClick={() => setHoursBreakdownRow(null)}
                style={{ background: 'transparent', border: '1px solid rgba(148,163,184,0.35)', color: '#cbd5e1', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
              <div style={{ border: '1px solid rgba(100,131,167,0.28)', borderRadius: 8, padding: 8 }}>
                <div style={{ color: '#9ca3af', fontSize: '0.62rem' }}>Task Actual Hours</div>
                <div style={{ color: '#f4f4f5', fontSize: '0.95rem', fontWeight: 700 }}>{Math.round(hoursBreakdown.taskHours).toLocaleString()}h</div>
              </div>
              <div style={{ border: '1px solid rgba(100,131,167,0.28)', borderRadius: 8, padding: 8 }}>
                <div style={{ color: '#9ca3af', fontSize: '0.62rem' }}>Phase ({hoursBreakdown.phaseName})</div>
                <div style={{ color: '#f4f4f5', fontSize: '0.95rem', fontWeight: 700 }}>{Math.round(hoursBreakdown.phaseHours).toLocaleString()}h</div>
              </div>
              <div style={{ border: '1px solid rgba(100,131,167,0.28)', borderRadius: 8, padding: 8 }}>
                <div style={{ color: '#9ca3af', fontSize: '0.62rem' }}>Unit ({hoursBreakdown.unitName})</div>
                <div style={{ color: '#f4f4f5', fontSize: '0.95rem', fontWeight: 700 }}>{Math.round(hoursBreakdown.unitHours).toLocaleString()}h</div>
              </div>
            </div>

            <div style={{ border: '1px solid rgba(100,131,167,0.28)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 110px 100px', background: 'rgba(17,24,39,0.82)', color: '#a1a1aa', fontSize: '0.63rem', fontWeight: 700, padding: '7px 8px' }}>
                <span>Date</span><span>Employee</span><span>Charge Type</span><span style={{ textAlign: 'right' }}>Hours</span>
              </div>
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                {hoursBreakdown.entries.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', padding: 10 }}>No timecard entries mapped to this task.</div>
                ) : hoursBreakdown.entries.map((entry, idx) => (
                  <div key={`hb-${idx}`} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 110px 100px', color: '#e2e8f0', fontSize: '0.68rem', padding: '6px 8px', borderTop: '1px solid rgba(100,131,167,0.18)' }}>
                    <span>{formatDate(readDate(entry, 'date', 'entryDate', 'createdAt'))}</span>
                    <span>{readString(entry, 'employeeName', 'employeeId', 'employee_id') || '-'}</span>
                    <span>{readString(entry, 'chargeType', 'charge_type') || '-'}</span>
                    <span style={{ textAlign: 'right' }}>{readNumber(entry, 'hours', 'actualHours', 'totalHoursWorked').toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {headerMenu && (
        <div
          data-header-menu-popup
          style={{
            position: 'fixed',
            left: Math.max(10, Math.min(headerMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 260)),
            top: Math.max(70, Math.min(headerMenu.y + 4, (typeof window !== 'undefined' ? window.innerHeight : 720) - 210)),
            zIndex: 11000,
            width: 240,
            maxWidth: 'calc(100vw - 20px)',
            background: 'rgba(8,12,18,0.96)',
            border: '1px solid rgba(64,224,208,0.22)',
            borderRadius: 8,
            boxShadow: '0 10px 24px rgba(0,0,0,0.42)',
            padding: 8,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#e6f7ff', marginBottom: 6 }}>Column Options</div>
          <div style={{ fontSize: '0.62rem', color: '#9fb1c9', marginBottom: 8 }}>
            {ALL_COLUMNS.find((c) => c.id === headerMenu.columnId)?.title}
          </div>
          <button
            type="button"
            onClick={() => setHeaderFilterColumnId(headerMenu.columnId)}
            style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(64,224,208,0.24)', background: 'rgba(64,224,208,0.08)', borderRadius: 6, color: '#b8f6ef', padding: '6px 8px', fontSize: '0.64rem', cursor: 'pointer', marginBottom: 6 }}
          >
            Filter Column
          </button>
          <button
            type="button"
            onClick={() => {
              setVisibleColumnIds((prev) => {
                if (prev.size <= 3) return prev;
                const next = new Set(prev);
                next.delete(headerMenu.columnId);
                return next;
              });
              setHeaderMenu(null);
            }}
            style={{ width: '100%', textAlign: 'left', border: '1px solid rgba(239,68,68,0.24)', background: 'rgba(239,68,68,0.09)', borderRadius: 6, color: '#fecaca', padding: '6px 8px', fontSize: '0.64rem', cursor: 'pointer' }}
          >
            Hide Column
          </button>
        </div>
      )}
    </div>
  );
}
