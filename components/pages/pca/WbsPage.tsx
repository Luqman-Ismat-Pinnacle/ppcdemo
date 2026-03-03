'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import type { BodyScrollEvent, CellValueChangedEvent, ColDef, GridReadyEvent } from 'ag-grid-community';
import { Arrow, Layer, Line, Rect, Stage, Text } from 'react-konva';
import Skeleton from '@/components/ui/Skeleton';
import { parseFlexibleDate } from '@/lib/date-utils';

ModuleRegistry.registerModules([AllCommunityModule]);

type Interval = 'week' | 'month' | 'quarter' | 'year';

type WbsRow = {
  id: string;
  parent_id: string | null;
  type: string;
  level: number;
  has_children: boolean;
  project_id: string;
  unit_id: string;
  phase_id: string;
  task_id: string;
  wbs_code: string;
  name: string;
  resource_name: string;
  start_date: string | null;
  end_date: string | null;
  baseline_start: string | null;
  baseline_end: string | null;
  days_required: number;
  baseline_hours: number;
  actual_hours: number;
  remaining_hours: number;
  work: number;
  baseline_cost: number;
  actual_cost: number;
  remaining_cost: number;
  schedule_cost: number;
  cpi: number;
  efficiency: number;
  percent_complete: number;
  predecessor_ids: string[];
  predecessor_name?: string;
  predecessor_task_id?: string;
  relationship?: string;
  lag_days?: number;
  total_float: number;
  is_critical: boolean;
  is_milestone?: boolean;
  comments?: string;
  source_table?: string;
  baseline_count?: number;
  baseline_metric?: string;
  baseline_uom?: string;
  actual_hours_tooltip?: {
    summary: string;
    rows: string[];
  } | null;
};

type VarianceValue = { delta?: number; previous?: string; current?: string };

type RowGeom = {
  id: string;
  rowIndex: number;
  top: number;
  height: number;
  center: number;
  bottom: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HEADER_H = 48;
const ROW_H = 34;
const BASE_DEPENDENCY_EDGES = 2400;
const PROGRESS_BANDS = [
  { label: '0-24%', color: '#ef4444' },
  { label: '25-49%', color: '#f59e0b' },
  { label: '50-74%', color: '#eab308' },
  { label: '75-100%', color: '#22c55e' },
] as const;
const NUMERIC_VARIANCE_METRICS = new Set([
  'start_date', 'end_date', 'days', 'baseline_hours', 'actual_hours', 'remaining_hours',
  'total_hours', 'baseline_cost', 'actual_cost', 'remaining_cost', 'scheduled_cost',
  'cpi', 'efficiency', 'percent_complete',
]);
const FIELD_TO_METRIC: Record<string, string> = {
  days_required: 'days',
  work: 'total_hours',
  schedule_cost: 'scheduled_cost',
};

function asNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtDate(v: string | null) {
  if (!v) return '-';
  const d = parseFlexibleDate(v);
  return !d ? '-' : d.toLocaleDateString('en-US');
}
function parseDate(v: string | null | undefined): Date | null {
  return parseFlexibleDate(v);
}
function fmtInt(v: number) { return Math.round(asNum(v)).toLocaleString(); }
function fmtPct(v: number) { return `${Math.round(asNum(v))}%`; }
function fmtCurr(v: number) { return `$${Math.round(asNum(v)).toLocaleString()}`; }
function progressColor(pct: number) {
  const p = asNum(pct);
  if (p >= 75) return '#22c55e';
  if (p >= 50) return '#eab308';
  if (p >= 25) return '#f59e0b';
  return '#ef4444';
}

export default function WbsPage() {
  const [items, setItems] = useState<WbsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [interval, setInterval] = useState<Interval>('month');
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showVariance, setShowVariance] = useState(false);
  const [variancePeriod, setVariancePeriod] = useState<'7d' | '30d' | '90d' | '180d'>('30d');
  const [varianceMap, setVarianceMap] = useState<Record<string, Record<string, VarianceValue>>>({});
  const [pxPerDay, setPxPerDay] = useState(2.2);
  const [typeFilter, setTypeFilter] = useState<'all' | 'critical' | 'task' | 'phase'>('all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'not_started' | 'in_progress' | 'done'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [split, setSplit] = useState(52);
  const [dragSplit, setDragSplit] = useState(false);
  const [vScroll, setVScroll] = useState(0);
  const [timelineHeight, setTimelineHeight] = useState(420);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(600);
  const [rowGeom, setRowGeom] = useState<RowGeom[]>([]);
  const [isPanning, setIsPanning] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [barTip, setBarTip] = useState<{
    x: number;
    y: number;
    name: string;
    type: string;
    start: string;
    end: string;
    baseline: string;
    progress: number;
    predecessor: string;
    rel: string;
    lag: number;
    meta: string;
  } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const gridApiRef = useRef<GridReadyEvent<WbsRow>['api'] | null>(null);
  const gridBodyViewportRef = useRef<HTMLDivElement | null>(null);
  const syncRafRef = useRef<number | null>(null);
  const lastVScrollRef = useRef(0);
  const panStartXRef = useRef(0);
  const panStartLeftRef = useRef(0);
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const deviceMemoryGb = useMemo(() => {
    if (!isClient || typeof navigator === 'undefined') return 4;
    const nav = navigator as Navigator & { deviceMemory?: number };
    return Number.isFinite(nav.deviceMemory) ? Number(nav.deviceMemory) : 4;
  }, [isClient]);
  const autoDisableDependencyThreshold = useMemo(() => {
    if (deviceMemoryGb >= 16) return 18000;
    if (deviceMemoryGb >= 8) return 12000;
    if (deviceMemoryGb >= 4) return 8000;
    return 5500;
  }, [deviceMemoryGb]);
  const maxDependencyEdges = useMemo(() => {
    const datasetSize = items.length;
    const memBoost = deviceMemoryGb >= 16 ? 2600 : deviceMemoryGb >= 8 ? 1800 : deviceMemoryGb >= 4 ? 800 : 0;
    const rowBoost = datasetSize <= 1500 ? 1000 : datasetSize <= 3500 ? 600 : 0;
    const rowPenalty = datasetSize >= 12000 ? 900 : datasetSize >= 8000 ? 500 : 0;
    return Math.max(1600, BASE_DEPENDENCY_EDGES + memBoost + rowBoost - rowPenalty);
  }, [deviceMemoryGb, items.length]);

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (showVariance) {
      params.set('variance', '1');
      params.set('period', variancePeriod);
    }
    const url = params.toString() ? `/api/pca/wbs?${params.toString()}` : '/api/pca/wbs';
    fetch(url, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        const rows = (d.items || []) as WbsRow[];
        setItems(rows);
        setVarianceMap((d.variance_map || {}) as Record<string, Record<string, VarianceValue>>);
        const defaultExpanded = new Set<string>();
        rows.forEach((r) => {
          if (r.has_children && r.level <= 3) defaultExpanded.add(r.id);
        });
        setExpandedIds(defaultExpanded);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [showVariance, variancePeriod]);

  React.useEffect(() => {
    if (!dragSplit) return;
    const onMove = (e: MouseEvent) => {
      const host = hostRef.current;
      if (!host) return;
      const rect = host.getBoundingClientRect();
      if (!rect.width) return;
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.max(30, Math.min(70, pct)));
    };
    const onUp = () => setDragSplit(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragSplit]);

  React.useEffect(() => {
    const defaults: Record<Interval, number> = { week: 16, month: 2.2, quarter: 1, year: 0.55 };
    setPxPerDay(defaults[interval]);
  }, [interval]);

  React.useEffect(() => {
    const el = rightPaneRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      setTimelineHeight(Math.max(260, el.clientHeight));
      setTimelineViewportWidth(Math.max(320, el.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const syncVScrollFromGrid = useCallback(() => {
    const apiTop = gridApiRef.current?.getVerticalPixelRange()?.top;
    const domTop = gridBodyViewportRef.current?.scrollTop;
    const top = Math.max(0, Number.isFinite(apiTop as number) ? Number(apiTop) : Number(domTop || 0));
    if (Math.abs(lastVScrollRef.current - top) <= 0.5) return;
    lastVScrollRef.current = top;
    setVScroll(top);
  }, []);

  const captureRowGeometry = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;
    const displayed = api.getDisplayedRowCount();
    const next: RowGeom[] = [];
    for (let i = 0; i < displayed; i += 1) {
      const rn = api.getDisplayedRowAtIndex(i);
      const data = rn?.data as WbsRow | undefined;
      if (!rn || !data) continue;
      const height = Math.max(1, Number(rn.rowHeight) || ROW_H);
      const top = HEADER_H + Math.max(0, Number(rn.rowTop) || i * ROW_H);
      next.push({
        id: data.id,
        rowIndex: i,
        top,
        height,
        center: top + height / 2,
        bottom: top + height,
      });
    }
    setRowGeom((prev) => {
      if (prev.length === next.length) {
        let same = true;
        for (let i = 0; i < next.length; i += 1) {
          const a = prev[i];
          const b = next[i];
          if (!a || !b || a.id !== b.id || a.top !== b.top || a.height !== b.height) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return next;
    });
  }, []);

  const scheduleGridSync = useCallback(() => {
    if (syncRafRef.current != null) return;
    syncRafRef.current = requestAnimationFrame(() => {
      syncRafRef.current = null;
      syncVScrollFromGrid();
      captureRowGeometry();
    });
  }, [syncVScrollFromGrid, captureRowGeometry]);

  React.useEffect(() => {
    const root = gridWrapRef.current;
    if (!root) return;
    const viewport = root.querySelector('.ag-body-viewport') as HTMLDivElement | null;
    if (!viewport) return;
    gridBodyViewportRef.current = viewport;
    const onScroll = () => scheduleGridSync();
    viewport.addEventListener('scroll', onScroll, { passive: true });
    scheduleGridSync();
    return () => {
      viewport.removeEventListener('scroll', onScroll);
      if (gridBodyViewportRef.current === viewport) gridBodyViewportRef.current = null;
    };
  }, [scheduleGridSync, items.length]);

  React.useEffect(() => {
    scheduleGridSync();
  }, [expandedIds, scheduleGridSync]);

  React.useEffect(() => {
    captureRowGeometry();
  }, [items.length, expandedIds, captureRowGeometry]);

  React.useEffect(() => {
    return () => {
      if (syncRafRef.current != null) cancelAnimationFrame(syncRafRef.current);
    };
  }, []);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((r) => {
      if (typeFilter === 'critical' && !r.is_critical) return false;
      if (typeFilter === 'task' && !(r.type === 'task' || r.type === 'sub_task')) return false;
      if (typeFilter === 'phase' && r.type !== 'phase') return false;

      const pct = asNum(r.percent_complete);
      if (progressFilter === 'not_started' && pct > 0) return false;
      if (progressFilter === 'in_progress' && (pct <= 0 || pct >= 100)) return false;
      if (progressFilter === 'done' && pct < 100) return false;

      if (!q) return true;
      return [
      r.wbs_code, r.name, r.type, r.resource_name, String(r.predecessor_ids?.join(',') || ''),
      ].join(' ').toLowerCase().includes(q);
    });
  }, [items, query, typeFilter, progressFilter]);

  const rows = useMemo(() => {
    const byParent = new Map<string, WbsRow[]>();
    const byId = new Map(filteredRows.map((r) => [r.id, r]));
    const parentKey = (v: string | null) => (v && byId.has(v) ? v : '__root__');

    filteredRows.forEach((r) => {
      const key = parentKey(r.parent_id);
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(r);
    });

    const sortRows = (arr: WbsRow[]) => [...arr].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    const out: WbsRow[] = [];
    const visited = new Set<string>();
    const walk = (parentId: string) => {
      const kids = sortRows(byParent.get(parentId) || []);
      kids.forEach((row) => {
        if (visited.has(row.id)) return;
        visited.add(row.id);
        out.push(row);
        if (row.has_children && expandedIds.has(row.id)) {
          walk(row.id);
        }
      });
    };
    walk('__root__');
    return out;
  }, [filteredRows, expandedIds]);
  const wbsPathById = useMemo(() => {
    const byId = new Map(items.map((r) => [r.id, r]));
    const children = new Map<string, WbsRow[]>();
    const keyForParent = (pid: string | null) => (pid && byId.has(pid) ? pid : '__root__');
    items.forEach((r) => {
      const k = keyForParent(r.parent_id);
      if (!children.has(k)) children.set(k, []);
      children.get(k)!.push(r);
    });
    children.forEach((arr) => {
      arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    });
    const indexPath = new Map<string, string>();
    const visited = new Set<string>();
    const walk = (pid: string, prefix: string) => {
      const kids = children.get(pid) || [];
      kids.forEach((r, idx) => {
        if (visited.has(r.id)) return;
        visited.add(r.id);
        const cur = prefix ? `${prefix}.${idx + 1}` : String(idx + 1);
        indexPath.set(r.id, cur);
        walk(r.id, cur);
      });
    };
    walk('__root__', '');
    const full = new Map<string, string>();
    items.forEach((r) => {
      const numPath = indexPath.get(r.id) || '';
      const raw = String(r.wbs_code || '').trim();
      full.set(r.id, raw ? `${numPath} · ${raw}` : numPath);
    });
    return full;
  }, [items]);
  const resetVerticalScroll = useCallback(() => {
    lastVScrollRef.current = 0;
    setVScroll(0);
    if (gridBodyViewportRef.current) gridBodyViewportRef.current.scrollTop = 0;
    if (gridApiRef.current) gridApiRef.current.ensureIndexVisible(0, 'top');
  }, []);

  const expandAllVisible = useCallback(() => {
    setExpandedIds(new Set(filteredRows.filter((r) => r.has_children).map((r) => r.id)));
    if (filteredRows.length > autoDisableDependencyThreshold) setShowDependencies(false);
  }, [filteredRows, autoDisableDependencyThreshold]);
  const collapseAllVisible = useCallback(() => {
    setExpandedIds(new Set());
    resetVerticalScroll();
  }, [resetVerticalScroll]);
  const expandLevel3 = useCallback(() => {
    setExpandedIds(new Set(filteredRows.filter((r) => r.has_children && r.level <= 3).map((r) => r.id)));
  }, [filteredRows]);

  React.useEffect(() => {
    const bodyHeight = Math.max(0, timelineHeight - HEADER_H);
    const maxV = Math.max(0, rows.length * ROW_H - bodyHeight);
    if (vScroll <= maxV) return;
    lastVScrollRef.current = maxV;
    setVScroll(maxV);
    if (gridBodyViewportRef.current) gridBodyViewportRef.current.scrollTop = maxV;
  }, [rows.length, timelineHeight, vScroll]);

  const range = useMemo(() => {
    const dates = rows
      .flatMap((r) => [r.start_date, r.end_date])
      .map((d) => parseDate(d))
      .filter((d): d is Date => Boolean(d))
      .map((d) => d.getTime())
      .filter(Number.isFinite);
    if (!dates.length) {
      const now = new Date();
      return { min: new Date(now.getFullYear(), now.getMonth() - 6, 1), max: new Date(now.getFullYear(), now.getMonth() + 6, 1) };
    }
    const min = new Date(Math.min(...dates) - 28 * DAY_MS);
    const max = new Date(Math.max(...dates) + 28 * DAY_MS);
    return { min, max };
  }, [rows]);

  const totalDays = Math.max(1, Math.ceil((range.max.getTime() - range.min.getTime()) / DAY_MS));
  const timelineWidth = Math.max(timelineViewportWidth, Math.round(totalDays * pxPerDay) + 140);
  const toX = useCallback((d: Date) => 70 + ((d.getTime() - range.min.getTime()) / DAY_MS) * pxPerDay, [range.min, pxPerDay]);
  const axisTicks = useMemo(() => {
    const ticks: Date[] = [];
    const min = range.min;
    const max = range.max;

    if (interval === 'week') {
      const cursor = new Date(min.getFullYear(), min.getMonth(), min.getDate());
      while (cursor <= max) {
        ticks.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 7);
      }
      return ticks;
    }
    if (interval === 'month') {
      const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
      while (cursor <= max) {
        ticks.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return ticks;
    }
    if (interval === 'quarter') {
      const startQuarter = Math.floor(min.getMonth() / 3) * 3;
      const cursor = new Date(min.getFullYear(), startQuarter, 1);
      while (cursor <= max) {
        ticks.push(new Date(cursor));
        cursor.setMonth(cursor.getMonth() + 3);
      }
      return ticks;
    }
    const cursor = new Date(min.getFullYear(), 0, 1);
    while (cursor <= max) {
      ticks.push(new Date(cursor));
      cursor.setFullYear(cursor.getFullYear() + 1);
    }
    return ticks;
  }, [range.min, range.max, interval]);
  const formatTick = useCallback((d: Date) => {
    if (interval === 'week') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (interval === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (interval === 'quarter') return `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(-2)}`;
    return String(d.getFullYear());
  }, [interval]);

  const rowGeomById = useMemo(() => new Map(rowGeom.map((g) => [g.id, g])), [rowGeom]);
  const withDelta = useCallback((row: WbsRow | undefined, metric: string, display: string) => {
    if (!showVariance || !row?.id) return display;
    const sourceTable = row.source_table || '';
    if (!sourceTable) return display;
    const variance = varianceMap[`${sourceTable}:${row.id}`]?.[metric];
    if (!variance) return display;
    if (Number.isFinite(variance.delta)) {
      const d = Number(variance.delta);
      return `${display} (${d >= 0 ? '+' : ''}${Math.round(d * 100) / 100})`;
    }
    const previous = variance.previous ?? '';
    const current = variance.current ?? '';
    if (metric === 'comments') {
      if (!previous && !current) return display;
      if (previous === current) return `${display} (no change)`;
      return `${current || '-'} (was: ${previous || '-'})`;
    }
    if (!previous && !current) return display;
    if (previous === current) return `${display} (no change)`;
    return `${display} (${previous || '-'} -> ${current || '-'})`;
  }, [showVariance, varianceMap]);
  const varianceFor = useCallback((row: WbsRow | undefined, metric: string) => {
    if (!showVariance || !row?.id || !row.source_table) return undefined;
    const existing = varianceMap[`${row.source_table}:${row.id}`]?.[metric];
    if (existing) return existing;
    if (metric === 'comments') {
      const cur = String(row.comments || '');
      return { previous: cur, current: cur };
    }
    if (NUMERIC_VARIANCE_METRICS.has(metric)) return { delta: 0 };
    return { previous: '', current: '' };
  }, [showVariance, varianceMap]);
  const rowHasVariance = useCallback((row: WbsRow | undefined) => {
    if (!showVariance || !row?.source_table) return false;
    return true;
  }, [showVariance]);
  const saveInlineComment = useCallback(async (e: CellValueChangedEvent<WbsRow>) => {
    const row = e.data;
    const oldValue = String(e.oldValue ?? '');
    const nextValue = String(e.newValue ?? '');
    if (!row || oldValue === nextValue) return;
    if (!row.source_table || !row.id) return;
    try {
      setSavingCommentId(row.id);
      const res = await fetch(`/api/tables/${row.source_table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-role': 'PCA' },
        body: JSON.stringify({ id: row.id, comments: nextValue }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.error) throw new Error(payload?.error || `Failed to update ${row.source_table}.comments`);
    } catch (err) {
      e.node.setDataValue('comments', oldValue);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCommentId(null);
    }
  }, []);
  const headerWithDelta = useCallback((label: string, _metric: string) => (
    showVariance ? `${label} Δ` : label
  ), [showVariance]);
  const varianceTextStyle = useCallback((row: WbsRow | undefined, metric: string, extra?: Record<string, string | number>) => {
    if (!showVariance) return extra;
    const v = varianceFor(row, metric);
    if (!v) return extra;
    let color = '#a78bfa';
    if (Number.isFinite(v.delta)) {
      const d = Number(v.delta);
      color = d > 0 ? '#22c55e' : d < 0 ? '#ef4444' : '#a78bfa';
    } else if ((v.previous ?? '') !== (v.current ?? '')) {
      color = '#6366f1';
    }
    return {
      color,
      fontWeight: 700,
      ...extra,
    } as Record<string, string | number>;
  }, [showVariance, varianceFor]);
  const varianceTooltip = useCallback((row: WbsRow | undefined, field?: string, value?: unknown) => {
    if (!row || !field) return undefined;
    if (field === 'actual_hours') {
      const details = row.actual_hours_tooltip;
      const lines: string[] = [`Hours: ${fmtInt(asNum(row.actual_hours))}`];
      if (details?.summary) lines.push(details.summary);
      if (details?.rows?.length) {
        lines.push('Entries');
        lines.push(...details.rows.map((r, i) => `${i + 1}. ${r}`));
      }
      if (!details?.rows?.length) {
        lines.push('No entries');
      }
      return lines.join('\n');
    }
    if (!showVariance) {
      const label = field.replace(/_/g, ' ');
      const cur = value == null || String(value).trim() === '' ? '-' : String(value);
      return `${label}: ${cur}`;
    }
    const metric = FIELD_TO_METRIC[field] || field;
    const v = varianceFor(row, metric);
    if (!v) return undefined;
    if (metric === 'comments') {
      const prev = v.previous ?? '';
      const cur = v.current ?? String(row.comments || '');
      return `Variance period: ${variancePeriod}\nCurrent comments: ${cur || '-'}\nSelected-period comments: ${prev || '-'}\nRecord: ${row.source_table}:${row.id}`;
    }
    const cur = value == null ? '-' : String(value);
    const delta = Number(v.delta ?? 0);
    const prevNum = Number(cur) - delta;
    const prev = Number.isFinite(prevNum) ? String(Math.round(prevNum * 100) / 100) : '-';
    return `Variance period: ${variancePeriod}\nCurrent: ${cur}\nSelected period: ${prev}\nDelta: ${delta >= 0 ? '+' : ''}${Math.round(delta * 100) / 100}\nRecord: ${row.source_table}:${row.id}`;
  }, [showVariance, varianceFor, variancePeriod]);
  const taskIndexById = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => {
      if (r.type === 'task' || r.type === 'sub_task') {
        if (r.task_id) m.set(String(r.task_id), i);
        if (r.id) m.set(String(r.id), i);
      }
    });
    return m;
  }, [rows]);
  const hasRenderableTimelineRows = useMemo(
    () => rows.some((r) => {
      const s = parseDate(r.start_date);
      const e = parseDate(r.end_date);
      return Boolean(s && e && !Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()));
    }),
    [rows],
  );
  const timelineRows = useMemo<RowGeom[]>(
    () => rows.map((r, i) => {
      const fallbackTop = HEADER_H + i * ROW_H;
      const geom = rowGeomById.get(r.id);
      const top = geom && Number.isFinite(geom.top) ? geom.top : fallbackTop;
      const height = Math.max(1, Number(geom?.height) || ROW_H);
      return {
        id: r.id,
        rowIndex: i,
        top,
        height,
        center: top + height / 2,
        bottom: top + height,
      };
    }),
    [rows, rowGeomById],
  );
  const rowGeomByIndex = useMemo(() => new Map(timelineRows.map((g) => [g.rowIndex, g])), [timelineRows]);
  // Keep the canvas bounded to viewport height; very tall canvases (100k+ px)
  // can fail to render in Konva/Canvas and show a blank pane.
  const stageHeight = Math.max(timelineHeight, HEADER_H + ROW_H * 4);
  const visibleWindow = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(vScroll / ROW_H) - 5);
    const visibleRows = Math.ceil(Math.max(0, timelineHeight - HEADER_H) / ROW_H) + 10;
    const endIdx = Math.min(rows.length - 1, startIdx + visibleRows);
    return { startIdx, endIdx };
  }, [vScroll, rows.length, timelineHeight]);
  const visibleTimelineRows = useMemo(
    () => timelineRows.filter((g) => g.rowIndex >= visibleWindow.startIdx && g.rowIndex <= visibleWindow.endIdx),
    [timelineRows, visibleWindow.startIdx, visibleWindow.endIdx],
  );
  const dependencySegments = useMemo(() => {
    if (!showDependencies) return [];
    const segments: Array<{ key: string; points: number[]; arrow: [number, number, number, number]; stroke: string }> = [];
    outer: for (const g of visibleTimelineRows) {
      const idx = g.rowIndex;
      const r = rows[idx];
      if (!r || !Array.isArray(r.predecessor_ids) || !r.predecessor_ids.length || !r.start_date) continue;
      const tg = rowGeomByIndex.get(idx);
      if (!tg) continue;
      const ty = tg.center - vScroll;
      if (ty < HEADER_H - ROW_H || ty > timelineHeight + ROW_H) continue;
      const targetStart = parseDate(r.start_date);
      if (!targetStart) continue;
      const tx = toX(targetStart);
      if (!Number.isFinite(tx)) continue;
      for (const pred of r.predecessor_ids) {
        const sourceIdx = taskIndexById.get(String(pred));
        if (sourceIdx == null) continue;
        if (sourceIdx < visibleWindow.startIdx || sourceIdx > visibleWindow.endIdx) continue;
        const source = rows[sourceIdx];
        const sg = rowGeomByIndex.get(sourceIdx);
        if (!sg) continue;
        const sourceEnd = parseDate(source?.end_date);
        if (!sourceEnd) continue;
        const sy = sg.center - vScroll;
        if (sy < HEADER_H - ROW_H || sy > timelineHeight + ROW_H) continue;
        const sx = toX(sourceEnd);
        if (!Number.isFinite(sx)) continue;
        const isReverse = tx < sx;
        const routeX = isReverse ? Math.max(12, tx - 24) : Math.max(sx + 14, tx - 10);
        const points = isReverse
          ? [sx, sy, sx + 12, sy, sx + 12, ty, routeX, ty, tx - 8, ty]
          : [sx, sy, routeX, sy, routeX, ty, tx - 8, ty];
        const stroke = source?.is_critical || r.is_critical ? '#ef4444' : '#6366f1';
        const key = `${pred}-${r.id}-${idx}-${sourceIdx}`;
        segments.push({ key, points, arrow: [tx - 12, ty, tx, ty], stroke });
        if (segments.length >= maxDependencyEdges) break outer;
      }
    }
    return segments;
  }, [showDependencies, visibleTimelineRows, rows, rowGeomByIndex, vScroll, timelineHeight, toX, taskIndexById, visibleWindow.startIdx, visibleWindow.endIdx, maxDependencyEdges]);
  const dependencyCapHit = showDependencies && dependencySegments.length >= maxDependencyEdges;
  const gridColumns = useMemo<ColDef<WbsRow>[]>(() => ([
    {
      field: 'name',
      headerName: 'Name',
      minWidth: 300,
      width: 340,
      cellRenderer: (p: { data?: WbsRow; value?: unknown }) => {
        const row = p.data;
        if (!row) return null;
        const canExpand = row.has_children;
        const expanded = expandedIds.has(row.id);
        const indent = Math.max(0, row.level * 14);
        return (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: indent, minWidth: 0, cursor: canExpand ? 'pointer' : 'default' }}
            onClick={() => {
              if (!canExpand) return;
              setExpandedIds((prev) => {
                const next = new Set(prev);
                if (next.has(row.id)) next.delete(row.id);
                else next.add(row.id);
                return next;
              });
            }}
          >
            <span style={{ width: 12, opacity: 0.75 }}>{canExpand ? (expanded ? '▾' : '▸') : ''}</span>
            <span style={{ opacity: 0.75 }}>
              {row.type === 'portfolio' ? '◉' : row.type === 'customer' ? '◎' : row.type === 'site' ? '◇' : row.type === 'project' ? '⬢' : row.type === 'unit' ? '▣' : row.type === 'phase' ? '▤' : row.type === 'task' ? '▪' : '▫'}
            </span>
            <span style={{ fontWeight: 600, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(p.value || '')}
            </span>
          </div>
        );
      },
    },
    { field: 'wbs_code', headerName: 'WBS', minWidth: 220, width: 250, valueGetter: (p) => wbsPathById.get(String(p.data?.id || '')) || String(p.data?.wbs_code || '') },
    { field: 'type', headerName: 'Type', minWidth: 110, width: 110 },
    { field: 'resource_name', headerName: 'Resource', minWidth: 150, width: 150 },
    { headerName: 'FTE Load', minWidth: 100, width: 110, valueGetter: (p) => asNum(p.data?.baseline_hours) / Math.max(1, asNum(p.data?.days_required) * 8), valueFormatter: (p) => asNum(p.value).toFixed(2) },
    { field: 'start_date', headerName: headerWithDelta('Start', 'start_date'), minWidth: 110, width: 110, valueFormatter: (p) => withDelta(p.data, 'start_date', fmtDate((p.value as string | null) || null)), cellStyle: (p) => varianceTextStyle(p.data, 'start_date') },
    { field: 'end_date', headerName: headerWithDelta('End', 'end_date'), minWidth: 110, width: 110, valueFormatter: (p) => withDelta(p.data, 'end_date', fmtDate((p.value as string | null) || null)), cellStyle: (p) => varianceTextStyle(p.data, 'end_date') },
    { field: 'days_required', headerName: headerWithDelta('Days', 'days'), minWidth: 70, width: 70, valueFormatter: (p) => withDelta(p.data, 'days', fmtInt(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'days') },
    { field: 'baseline_hours', headerName: headerWithDelta('BL Hrs', 'baseline_hours'), minWidth: 90, width: 90, valueFormatter: (p) => withDelta(p.data, 'baseline_hours', fmtInt(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'baseline_hours') },
    { field: 'actual_hours', headerName: headerWithDelta('Act Hrs', 'actual_hours'), minWidth: 90, width: 90, valueFormatter: (p) => withDelta(p.data, 'actual_hours', fmtInt(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'actual_hours') },
    { field: 'remaining_hours', headerName: headerWithDelta('Rem Hrs', 'remaining_hours'), minWidth: 95, width: 95, valueFormatter: (p) => withDelta(p.data, 'remaining_hours', fmtInt(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'remaining_hours') },
    { field: 'work', headerName: headerWithDelta('Total Hrs', 'total_hours'), minWidth: 95, width: 95, valueFormatter: (p) => withDelta(p.data, 'total_hours', fmtInt(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'total_hours') },
    { field: 'baseline_cost', headerName: headerWithDelta('BL Cost', 'baseline_cost'), minWidth: 110, width: 110, valueFormatter: (p) => withDelta(p.data, 'baseline_cost', fmtCurr(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'baseline_cost') },
    { field: 'actual_cost', headerName: headerWithDelta('Act Cost', 'actual_cost'), minWidth: 110, width: 110, valueFormatter: (p) => withDelta(p.data, 'actual_cost', fmtCurr(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'actual_cost') },
    { field: 'remaining_cost', headerName: headerWithDelta('Rem Cost', 'remaining_cost'), minWidth: 110, width: 110, valueFormatter: (p) => withDelta(p.data, 'remaining_cost', fmtCurr(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'remaining_cost') },
    { field: 'schedule_cost', headerName: headerWithDelta('Sched Cost', 'scheduled_cost'), minWidth: 120, width: 120, valueFormatter: (p) => withDelta(p.data, 'scheduled_cost', fmtCurr(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'scheduled_cost') },
    { field: 'cpi', headerName: headerWithDelta('CPI', 'cpi'), minWidth: 70, width: 70, valueFormatter: (p) => withDelta(p.data, 'cpi', (asNum(p.value) ? asNum(p.value).toFixed(2) : '-')), cellStyle: (p) => varianceTextStyle(p.data, 'cpi') },
    { field: 'efficiency', headerName: headerWithDelta('Eff%', 'efficiency'), minWidth: 75, width: 75, valueFormatter: (p) => withDelta(p.data, 'efficiency', fmtPct(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'efficiency') },
    { field: 'percent_complete', headerName: headerWithDelta('Progress', 'percent_complete'), minWidth: 90, width: 90, valueFormatter: (p) => withDelta(p.data, 'percent_complete', fmtPct(asNum(p.value))), cellStyle: (p) => varianceTextStyle(p.data, 'percent_complete') },
    { field: 'comments', headerName: headerWithDelta('Comments', 'comments'), minWidth: 220, width: 280, editable: true, valueFormatter: (p) => withDelta(p.data, 'comments', String(p.value || '')), cellStyle: (p) => varianceTextStyle(p.data, 'comments', { whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }) },
    { field: 'predecessor_name', headerName: 'Predecessor', minWidth: 220, width: 240, valueGetter: (p) => {
      const d = p.data;
      if (!d) return '-';
      const base = String(d.predecessor_name || d.predecessor_task_id || '').trim() || '-';
      const rel = String(d.relationship || '').trim();
      const lag = asNum(d.lag_days);
      if (base === '-') return '-';
      return rel ? `${base} (${rel}${lag ? `, ${lag}d` : ''})` : base;
    } },
    { field: 'total_float', headerName: 'TF', minWidth: 65, width: 65, valueFormatter: (p) => fmtInt(asNum(p.value)) },
    { field: 'baseline_count', headerName: 'Baseline Count', minWidth: 110, width: 110, valueFormatter: (p) => fmtInt(asNum(p.value)) },
    { field: 'baseline_metric', headerName: 'Baseline Metric', minWidth: 130, width: 130 },
    { field: 'baseline_uom', headerName: 'Baseline UOM', minWidth: 110, width: 110 },
    { headerName: 'CP', minWidth: 60, width: 60, valueGetter: (p) => (p.data?.is_critical ? 'CP' : '-') },
  ]), [expandedIds, headerWithDelta, varianceTextStyle, withDelta, wbsPathById]);

  const todayX = toX(new Date());
  const controlBtnStyle: React.CSSProperties = {
    padding: '0.36rem 0.62rem',
    minHeight: 30,
    fontSize: '0.72rem',
  };
  const fitTimeline = () => {
    const host = timelineRef.current;
    if (!host) return;
    const fit = (host.clientWidth - 120) / Math.max(1, totalDays);
    setPxPerDay(Math.max(0.25, Math.min(12, fit)));
  };

  const onTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = timelineRef.current;
    if (!el) return;
    setIsPanning(true);
    panStartXRef.current = e.clientX;
    panStartLeftRef.current = el.scrollLeft;
  };
  const onTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const el = timelineRef.current;
    if (!el) return;
    const dx = e.clientX - panStartXRef.current;
    el.scrollLeft = Math.max(0, panStartLeftRef.current - dx);
  };
  const onTimelineMouseUp = () => setIsPanning(false);
  const showBarTip = (evt: { evt: MouseEvent }, row: WbsRow) => {
    const pane = rightPaneRef.current;
    if (!pane) return;
    const rect = pane.getBoundingClientRect();
    setBarTip({
      x: evt.evt.clientX - rect.left + 12,
      y: evt.evt.clientY - rect.top - 12,
      name: row.name || row.wbs_code || row.id,
      type: row.type,
      start: fmtDate(row.start_date),
      end: fmtDate(row.end_date),
      baseline: `${fmtDate(row.baseline_start)} -> ${fmtDate(row.baseline_end)}`,
      progress: asNum(row.percent_complete),
      predecessor: row.predecessor_name || row.predecessor_task_id || '-',
      rel: row.relationship || '-',
      lag: asNum(row.lag_days),
      meta: [row.project_id, row.unit_id, row.phase_id, row.task_id].filter(Boolean).join(' / '),
    });
  };
  const hideBarTip = () => setBarTip(null);

  return (
    <div>
      <h1 className="page-title">WBS Gantt</h1>
      <p className="page-subtitle">Bottom-up rebuild with hierarchical WBS grid, Konva timeline, dependencies, and full planning columns.</p>

      {error && <div style={{ color: 'var(--color-error)', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{error}</div>}

      {loading && <Skeleton height={500} />}

      {!loading && items.length > 0 && (
        <div className="glass-solid" style={{ padding: '0.5rem', overflow: 'hidden', height: 'calc(100vh - 170px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search WBS..."
              style={{ minWidth: 170, maxWidth: 240, background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.4rem 0.55rem', fontSize: '0.74rem' }}
            />
            <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 2 }}>
              {(['week', 'month', 'quarter', 'year'] as Interval[]).map((iv) => (
                <button
                  key={iv}
                  type="button"
                  className="btn"
                  onClick={() => setInterval(iv)}
                  style={{ ...controlBtnStyle, background: interval === iv ? 'rgba(99,102,241,0.26)' : undefined, color: interval === iv ? '#eef2ff' : undefined, minWidth: 58, textTransform: 'capitalize' }}
                >
                  {iv}
                </button>
              ))}
            </div>
            <button className="btn" type="button" style={controlBtnStyle} onClick={() => setPxPerDay((v) => Math.max(0.25, v - 0.5))}>-</button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: 50, textAlign: 'center' }}>{pxPerDay.toFixed(2)}</span>
            <button className="btn" type="button" style={controlBtnStyle} onClick={() => setPxPerDay((v) => Math.min(12, v + 0.5))}>+</button>
            <button className="btn" type="button" style={controlBtnStyle} onClick={fitTimeline}>Fit</button>
            <button className="btn" type="button" style={controlBtnStyle} onClick={() => timelineRef.current?.scrollTo({ left: Math.max(0, todayX - (timelineRef.current?.clientWidth || 0) / 2), behavior: 'smooth' })}>Today</button>
            <button className="btn" type="button" style={controlBtnStyle} onClick={expandAllVisible}>Expand All</button>
            <button className="btn" type="button" style={controlBtnStyle} onClick={collapseAllVisible}>Collapse All</button>
            <button className="btn" type="button" style={controlBtnStyle} onClick={expandLevel3}>Expand L3</button>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | 'critical' | 'task' | 'phase')} style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.38rem 0.55rem', fontSize: '0.74rem' }}>
              <option value="all">All Types</option>
              <option value="critical">Critical Only</option>
              <option value="task">Tasks Only</option>
              <option value="phase">Phases Only</option>
            </select>
            <select value={progressFilter} onChange={(e) => setProgressFilter(e.target.value as 'all' | 'not_started' | 'in_progress' | 'done')} style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.38rem 0.55rem', fontSize: '0.74rem' }}>
              <option value="all">All Progress</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <label style={{ display: 'flex', gap: 4, fontSize: '0.68rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} />Baseline</label>
            <label style={{ display: 'flex', gap: 4, fontSize: '0.68rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={showDependencies} onChange={(e) => setShowDependencies(e.target.checked)} />Dependencies</label>
            {dependencyCapHit && <span style={{ fontSize: '0.62rem', color: '#f59e0b' }}>Dependency draw capped</span>}
            <label style={{ display: 'flex', gap: 4, fontSize: '0.68rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={showVariance} onChange={(e) => setShowVariance(e.target.checked)} />Variance</label>
            {showVariance && (
              <select value={variancePeriod} onChange={(e) => setVariancePeriod(e.target.value as '7d' | '30d' | '90d' | '180d')} style={{ background: 'rgba(255, 255, 255, 0.04)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.38rem 0.55rem', fontSize: '0.74rem' }}>
                <option value="7d">7d</option>
                <option value="30d">30d</option>
                <option value="90d">90d</option>
                <option value="180d">180d</option>
              </select>
            )}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 4, padding: '0.15rem 0.4rem', border: '1px solid var(--glass-border)', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginRight: 4 }}>Progress</span>
              {PROGRESS_BANDS.map((b) => (
                <span key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.64rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color }} />
                  {b.label}
                </span>
              ))}
            </div>
            <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{rows.length.toLocaleString()} rows</span>
            {savingCommentId && <span style={{ fontSize: '0.68rem', color: '#a78bfa' }}>Saving comment...</span>}
          </div>

          <div ref={hostRef} style={{ flex: 1, minHeight: 420, height: '100%', display: 'flex', border: '1px solid var(--glass-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ width: `${split}%`, minWidth: 0 }}>
              <div ref={gridWrapRef} className="ag-theme-quartz wbs-grid-theme" style={{ width: '100%', height: '100%' }}>
                <AgGridReact<WbsRow>
                  theme="legacy"
                  rowData={rows}
                  columnDefs={gridColumns}
                  getRowId={(p) => p.data.id}
                  animateRows={false}
                  suppressScrollOnNewData
                  rowHeight={ROW_H}
                  headerHeight={HEADER_H}
                  suppressRowClickSelection
                  onGridReady={(e: GridReadyEvent<WbsRow>) => {
                    gridApiRef.current = e.api;
                    scheduleGridSync();
                  }}
                  onBodyScroll={(e: BodyScrollEvent) => {
                    if (e.direction === 'vertical') {
                      if (e.top != null) {
                        const top = Math.max(0, e.top);
                        if (Math.abs(lastVScrollRef.current - top) > 0.5) {
                          lastVScrollRef.current = top;
                          setVScroll(top);
                        }
                      } else {
                        scheduleGridSync();
                      }
                    }
                  }}
                  onModelUpdated={scheduleGridSync}
                  onSortChanged={scheduleGridSync}
                  onFilterChanged={scheduleGridSync}
                  onCellValueChanged={saveInlineComment}
                  tooltipShowDelay={0}
                  tooltipHideDelay={15000}
                  defaultColDef={{
                    sortable: true,
                    resizable: true,
                    filter: true,
                    tooltipValueGetter: (p) => varianceTooltip(p.data as WbsRow | undefined, String((p.colDef as { field?: string })?.field ?? ''), p.value),
                  }}
                />
              </div>
            </div>

            <div style={{ width: 8, cursor: 'col-resize', borderLeft: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.25)' }} onMouseDown={() => setDragSplit(true)} />

            <div ref={rightPaneRef} style={{ position: 'relative', display: 'flex', alignItems: 'stretch', flex: 1, minWidth: 0, minHeight: 0, height: '100%', background: 'linear-gradient(180deg, rgba(10,12,16,0.56) 0%, rgba(8,10,13,0.44) 100%), repeating-linear-gradient(0deg, rgba(148,163,184,0.04) 0 1px, rgba(0,0,0,0) 1px 34px)' }}>
              {!hasRenderableTimelineRows && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.76rem', textAlign: 'center', padding: '0 1rem' }}>
                  Timeline cannot render yet: no valid start/end schedule dates are available.
                </div>
              )}
              <div
                ref={timelineRef}
                onMouseDown={onTimelineMouseDown}
                onMouseMove={onTimelineMouseMove}
                onMouseUp={onTimelineMouseUp}
                onMouseLeave={onTimelineMouseUp}
                style={{ position: 'relative', flex: 1, height: '100%', minHeight: 0, overflowX: 'auto', overflowY: 'hidden', cursor: isPanning ? 'grabbing' : 'grab', visibility: hasRenderableTimelineRows ? 'visible' : 'hidden' }}
              >
                {isClient && (
                <Stage width={timelineWidth} height={stageHeight}>
                  <Layer clipX={0} clipY={HEADER_H} clipWidth={timelineWidth} clipHeight={Math.max(0, stageHeight - HEADER_H)}>
                    <Rect x={0} y={HEADER_H} width={timelineWidth} height={Math.max(0, stageHeight - HEADER_H)} fill="rgba(8,10,13,0.35)" />
                    {axisTicks.map((tick) => {
                      const x = toX(tick);
                      return (
                        <Line key={`grid-${tick.toISOString()}`} points={[x, HEADER_H, x, stageHeight]} stroke="rgba(148,163,184,0.2)" strokeWidth={1} />
                      );
                    })}
                    <Line points={[todayX, HEADER_H, todayX, stageHeight]} stroke="#ef4444" strokeWidth={1.2} dash={[6, 4]} />

                    {visibleTimelineRows.map((g) => {
                      const r = rows[g.rowIndex];
                      if (!r) return null;
                      const y = g.top - vScroll;
                      const laneH = g.height;
                      if (y > timelineHeight + ROW_H * 4 || y + laneH < HEADER_H - ROW_H * 2) return null;
                      const s = parseDate(r.start_date);
                      const e = parseDate(r.end_date);
                      const hasDates = Boolean(s && e && !Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()));
                      const x1 = hasDates ? toX(s as Date) : 0;
                      const x2 = hasDates ? toX(e as Date) : 0;
                      const color = progressColor(r.percent_complete);
                      const fillW = Math.max(3, (Math.max(6, x2 - x1) * Math.max(0, Math.min(100, asNum(r.percent_complete)))) / 100);
                      return (
                        <React.Fragment key={`row-${g.rowIndex}-${g.id}`}>
                          <Line points={[0, y + laneH - 1, timelineWidth, y + laneH - 1]} stroke="rgba(148,163,184,0.16)" strokeWidth={1} />
                          {showBaseline && r.baseline_start && r.baseline_end && (
                            (() => {
                              const bs = parseDate(r.baseline_start);
                              const be = parseDate(r.baseline_end);
                              if (!bs || !be) return null;
                              const bx1 = toX(bs);
                              const bx2 = toX(be);
                              if (!Number.isFinite(bx1) || !Number.isFinite(bx2)) return null;
                              const barY = y + Math.max(6, Math.floor((laneH - (ROW_H - 16)) / 2));
                              const barH = Math.max(8, laneH - 16);
                              return <Rect x={bx1} y={barY + Math.floor((barH - 6) / 2)} width={Math.max(3, bx2 - bx1)} height={6} cornerRadius={3} fill="rgba(148,163,184,0.58)" />;
                            })()
                          )}
                          {hasDates && (
                            <>
                              {(() => {
                                const barY = y + Math.max(6, Math.floor((laneH - (ROW_H - 16)) / 2));
                                const barH = Math.max(8, laneH - 16);
                                const delta = Number(varianceFor(r, 'percent_complete')?.delta || 0);
                                const hasVar = rowHasVariance(r);
                                const varianceColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#a78bfa';
                                const finalColor = showVariance && hasVar ? varianceColor : color;
                                return (
                                  <>
                                    <Rect
                                      x={x1}
                                      y={barY}
                                      width={Math.max(6, x2 - x1)}
                                      height={barH}
                                      cornerRadius={4}
                                      fill={finalColor}
                                      opacity={showVariance && hasVar ? 0.4 : 0.22}
                                      stroke={showVariance && hasVar ? '#e2e8f0' : undefined}
                                      strokeWidth={showVariance && hasVar ? 1.2 : 0}
                                      onMouseEnter={(evt) => showBarTip(evt, r)}
                                      onMouseLeave={hideBarTip}
                                    />
                                    <Rect
                                      x={x1}
                                      y={barY}
                                      width={fillW}
                                      height={barH}
                                      cornerRadius={4}
                                      fill={finalColor}
                                      shadowBlur={showVariance && hasVar ? 10 : 0}
                                      shadowColor={showVariance && hasVar ? finalColor : undefined}
                                      onMouseEnter={(evt) => showBarTip(evt, r)}
                                      onMouseLeave={hideBarTip}
                                    />
                                  </>
                                );
                              })()}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {(() => {
                      const lastVisibleY = visibleTimelineRows.length ? (visibleTimelineRows[visibleTimelineRows.length - 1].bottom - vScroll) : HEADER_H;
                      const fillerStart = Math.max(HEADER_H, lastVisibleY);
                      const lines: React.ReactNode[] = [];
                      for (let y = fillerStart; y <= timelineHeight + ROW_H; y += ROW_H) {
                        lines.push(<Line key={`filler-${y}`} points={[0, y, timelineWidth, y]} stroke="rgba(148,163,184,0.10)" strokeWidth={1} />);
                      }
                      return lines;
                    })()}
                  </Layer>

                  <Layer clipX={0} clipY={HEADER_H} clipWidth={timelineWidth} clipHeight={Math.max(0, stageHeight - HEADER_H)}>
                    {showDependencies && dependencySegments.flatMap((seg) => ([
                      <Line key={`line-${seg.key}`} points={seg.points} stroke={seg.stroke} strokeWidth={1.25} lineCap="round" lineJoin="round" />,
                      <Arrow key={`arr-${seg.key}`} points={seg.arrow} stroke={seg.stroke} fill={seg.stroke} strokeWidth={1.25} pointerLength={4} pointerWidth={4} />,
                    ]))}
                  </Layer>

                  <Layer listening={false}>
                    <Rect x={0} y={0} width={timelineWidth} height={HEADER_H} fill="rgba(12,14,18,0.82)" />
                    {axisTicks.map((tick) => {
                      const x = toX(tick);
                      return (
                        <React.Fragment key={`tick-${tick.toISOString()}`}>
                          <Line points={[x, 0, x, HEADER_H]} stroke="rgba(148,163,184,0.28)" strokeWidth={1} />
                          <Text x={x + 3} y={12} text={formatTick(tick)} fill="#cbd5e1" fontSize={11} />
                        </React.Fragment>
                      );
                    })}
                    <Line points={[todayX, 0, todayX, HEADER_H]} stroke="#ef4444" strokeWidth={1.2} dash={[6, 4]} />
                    <Text x={todayX + 4} y={28} text="Today" fill="#ef4444" fontSize={12} />
                  </Layer>
                </Stage>
                )}
              </div>
              {barTip && (
                <div
                  className="wbs-tooltip"
                  style={{
                    position: 'absolute',
                    left: Math.max(8, Math.min(barTip.x, (rightPaneRef.current?.clientWidth || 400) - 230)),
                    top: Math.max(8, Math.min(barTip.y, (rightPaneRef.current?.clientHeight || 300) - 92)),
                    pointerEvents: 'none',
                    zIndex: 20,
                    minWidth: 210,
                    fontSize: 11,
                    lineHeight: 1.35,
                  }}
                >
                  <div className="wbs-tooltip-title" style={{ fontWeight: 700, fontSize: 12, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{barTip.name}</div>
                  <div style={{ opacity: 0.85, marginBottom: 2 }}>{barTip.type} · {Math.round(barTip.progress)}%</div>
                  <div style={{ opacity: 0.8, marginBottom: 2 }}>{barTip.start} → {barTip.end}</div>
                  <div style={{ opacity: 0.72, marginBottom: 2 }}>BL: {barTip.baseline}</div>
                  <div style={{ opacity: 0.72, marginBottom: 2 }}>Pred: {barTip.predecessor} ({barTip.rel}, lag {barTip.lag}d)</div>
                  <div style={{ opacity: 0.62, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{barTip.meta}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="glass-raised" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          No schedule data found. Upload and process MPP files from Project Plans.
        </div>
      )}
    </div>
  );
}
