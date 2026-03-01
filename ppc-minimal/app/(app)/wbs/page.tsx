'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import type { BodyScrollEvent, ColDef } from 'ag-grid-community';
import { Arrow, Layer, Line, Rect, Stage, Text } from 'react-konva';
import Skeleton from '@/components/ui/Skeleton';

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
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HEADER_H = 48;
const ROW_H = 34;
const TYPE_COLOR: Record<string, string> = {
  unit: '#22c55e',
  phase: '#3b82f6',
  task: '#14b8a6',
  sub_task: '#9ca3af',
};

function asNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtDate(v: string | null) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US');
}
function fmtInt(v: number) { return Math.round(asNum(v)).toLocaleString(); }
function fmtPct(v: number) { return `${Math.round(asNum(v))}%`; }
function fmtCurr(v: number) { return `$${Math.round(asNum(v)).toLocaleString()}`; }

export default function WbsPage() {
  const [items, setItems] = useState<WbsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [interval, setInterval] = useState<Interval>('month');
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDependencies, setShowDependencies] = useState(true);
  const [pxPerDay, setPxPerDay] = useState(2.2);
  const [typeFilter, setTypeFilter] = useState<'all' | 'critical' | 'task' | 'phase'>('all');
  const [progressFilter, setProgressFilter] = useState<'all' | 'not_started' | 'in_progress' | 'done'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [split, setSplit] = useState(52);
  const [dragSplit, setDragSplit] = useState(false);
  const [vScroll, setVScroll] = useState(0);
  const [timelineHeight, setTimelineHeight] = useState(420);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(600);
  const [isPanning, setIsPanning] = useState(false);
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
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const panStartXRef = useRef(0);
  const panStartLeftRef = useRef(0);

  React.useEffect(() => {
    fetch('/api/pca/wbs', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        const rows = (d.items || []) as WbsRow[];
        setItems(rows);
        const defaultExpanded = new Set<string>();
        rows.forEach((r) => {
          if (r.has_children && r.level <= 3) defaultExpanded.add(r.id);
        });
        setExpandedIds(defaultExpanded);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
    const walk = (parentId: string) => {
      const kids = sortRows(byParent.get(parentId) || []);
      kids.forEach((row) => {
        out.push(row);
        if (row.has_children && expandedIds.has(row.id)) {
          walk(row.id);
        }
      });
    };
    walk('__root__');
    return out;
  }, [filteredRows, expandedIds]);

  const range = useMemo(() => {
    const dates = rows.flatMap((r) => [r.start_date, r.end_date]).filter(Boolean).map((d) => new Date(d as string).getTime()).filter(Number.isFinite);
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

  const rowIndexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const visibleWindow = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(vScroll / ROW_H) - 5);
    const visibleRows = Math.ceil(Math.max(0, timelineHeight - HEADER_H) / ROW_H) + 10;
    const endIdx = Math.min(rows.length - 1, startIdx + visibleRows);
    return { startIdx, endIdx };
  }, [vScroll, rows.length, timelineHeight]);
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
    { field: 'wbs_code', headerName: 'WBS', minWidth: 120, width: 120 },
    { field: 'type', headerName: 'Type', minWidth: 110, width: 110 },
    { field: 'resource_name', headerName: 'Resource', minWidth: 150, width: 150 },
    { headerName: 'FTE Load', minWidth: 100, width: 110, valueGetter: (p) => asNum(p.data?.baseline_hours) / Math.max(1, asNum(p.data?.days_required) * 8), valueFormatter: (p) => asNum(p.value).toFixed(2) },
    { field: 'start_date', headerName: 'Start', minWidth: 110, width: 110, valueFormatter: (p) => fmtDate(p.value || null) },
    { field: 'end_date', headerName: 'End', minWidth: 110, width: 110, valueFormatter: (p) => fmtDate(p.value || null) },
    { field: 'days_required', headerName: 'Days', minWidth: 70, width: 70, valueFormatter: (p) => fmtInt(asNum(p.value)) },
    { field: 'baseline_hours', headerName: 'BL Hrs', minWidth: 90, width: 90, valueFormatter: (p) => fmtInt(asNum(p.value)) },
    { field: 'actual_hours', headerName: 'Act Hrs', minWidth: 90, width: 90, valueFormatter: (p) => fmtInt(asNum(p.value)) },
    { field: 'remaining_hours', headerName: 'Rem Hrs', minWidth: 95, width: 95, valueFormatter: (p) => fmtInt(asNum(p.value)) },
    { field: 'work', headerName: 'Total Hrs', minWidth: 95, width: 95, valueFormatter: (p) => fmtInt(asNum(p.value)) },
    { field: 'baseline_cost', headerName: 'BL Cost', minWidth: 110, width: 110, valueFormatter: (p) => fmtCurr(asNum(p.value)) },
    { field: 'actual_cost', headerName: 'Act Cost', minWidth: 110, width: 110, valueFormatter: (p) => fmtCurr(asNum(p.value)) },
    { field: 'remaining_cost', headerName: 'Rem Cost', minWidth: 110, width: 110, valueFormatter: (p) => fmtCurr(asNum(p.value)) },
    { field: 'schedule_cost', headerName: 'Sched Cost', minWidth: 120, width: 120, valueFormatter: (p) => fmtCurr(asNum(p.value)) },
    { field: 'cpi', headerName: 'CPI', minWidth: 70, width: 70, valueFormatter: (p) => (asNum(p.value) ? asNum(p.value).toFixed(2) : '-') },
    { field: 'efficiency', headerName: 'Eff%', minWidth: 75, width: 75, valueFormatter: (p) => fmtPct(asNum(p.value)) },
    { field: 'percent_complete', headerName: 'Progress', minWidth: 90, width: 90, valueFormatter: (p) => fmtPct(asNum(p.value)) },
    { field: 'predecessor_ids', headerName: 'Predecessors', minWidth: 150, width: 160, valueFormatter: (p) => (Array.isArray(p.value) ? p.value.join(', ') : '-') },
    { field: 'total_float', headerName: 'TF', minWidth: 65, width: 65, valueFormatter: (p) => fmtInt(asNum(p.value)) },
    { headerName: 'CP', minWidth: 60, width: 60, valueGetter: (p) => (p.data?.is_critical ? 'CP' : '-') },
  ]), [expandedIds]);

  const todayX = toX(new Date());
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
              style={{ minWidth: 220, background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
            />
            <div style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 2 }}>
              {(['week', 'month', 'quarter', 'year'] as Interval[]).map((iv) => (
                <button
                  key={iv}
                  type="button"
                  className="btn"
                  onClick={() => setInterval(iv)}
                  style={{
                    padding: '0.2rem 0.45rem',
                    minHeight: 26,
                    background: interval === iv ? 'var(--accent)' : 'transparent',
                    color: interval === iv ? '#06100d' : 'var(--text-secondary)',
                    fontWeight: 700,
                    minWidth: 52,
                    textTransform: 'capitalize',
                  }}
                >
                  {iv}
                </button>
              ))}
            </div>
            <button className="btn" type="button" onClick={() => setPxPerDay((v) => Math.max(0.25, v - 0.5))}>-</button>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', minWidth: 44, textAlign: 'center' }}>{pxPerDay.toFixed(2)}</span>
            <button className="btn" type="button" onClick={() => setPxPerDay((v) => Math.min(12, v + 0.5))}>+</button>
            <button className="btn" type="button" onClick={fitTimeline}>Fit</button>
            <button className="btn" type="button" onClick={() => timelineRef.current?.scrollTo({ left: Math.max(0, todayX - (timelineRef.current?.clientWidth || 0) / 2), behavior: 'smooth' })}>Today</button>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | 'critical' | 'task' | 'phase')} style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.28rem 0.45rem', fontSize: '0.68rem' }}>
              <option value="all">All Types</option>
              <option value="critical">Critical Only</option>
              <option value="task">Tasks Only</option>
              <option value="phase">Phases Only</option>
            </select>
            <select value={progressFilter} onChange={(e) => setProgressFilter(e.target.value as 'all' | 'not_started' | 'in_progress' | 'done')} style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.28rem 0.45rem', fontSize: '0.68rem' }}>
              <option value="all">All Progress</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
            <label style={{ display: 'flex', gap: 4, fontSize: '0.68rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={showBaseline} onChange={(e) => setShowBaseline(e.target.checked)} />Baseline</label>
            <label style={{ display: 'flex', gap: 4, fontSize: '0.68rem', color: 'var(--text-secondary)' }}><input type="checkbox" checked={showDependencies} onChange={(e) => setShowDependencies(e.target.checked)} />Dependencies</label>
            <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{rows.length.toLocaleString()} rows</span>
          </div>

          <div ref={hostRef} style={{ flex: 1, minHeight: 0, display: 'flex', border: '1px solid var(--glass-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ width: `${split}%`, minWidth: 0 }}>
              <div className="ag-theme-quartz wbs-grid-theme" style={{ width: '100%', height: '100%' }}>
                <AgGridReact<WbsRow>
                  theme="legacy"
                  rowData={rows}
                  columnDefs={gridColumns}
                  animateRows={false}
                  rowHeight={ROW_H}
                  headerHeight={HEADER_H}
                  suppressRowClickSelection
                  onBodyScroll={(e: BodyScrollEvent) => {
                    if (e.direction === 'vertical') {
                      setVScroll(Math.max(0, e.top || 0));
                    }
                  }}
                  defaultColDef={{ sortable: true, resizable: true, filter: true }}
                />
              </div>
            </div>

            <div style={{ width: 8, cursor: 'col-resize', borderLeft: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.25)' }} onMouseDown={() => setDragSplit(true)} />

            <div ref={rightPaneRef} style={{ position: 'relative', display: 'flex', flex: 1, minWidth: 0, minHeight: 0, height: '100%', background: 'rgba(8,10,13,0.35)' }}>
              <div
                ref={timelineRef}
                onMouseDown={onTimelineMouseDown}
                onMouseMove={onTimelineMouseMove}
                onMouseUp={onTimelineMouseUp}
                onMouseLeave={onTimelineMouseUp}
                style={{ position: 'relative', flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden', cursor: isPanning ? 'grabbing' : 'grab' }}
              >
                <Stage width={timelineWidth} height={timelineHeight}>
                  <Layer clipX={0} clipY={HEADER_H} clipWidth={timelineWidth} clipHeight={Math.max(0, timelineHeight - HEADER_H)}>
                    <Rect x={0} y={HEADER_H} width={timelineWidth} height={Math.max(0, timelineHeight - HEADER_H)} fill="rgba(8,10,13,0.35)" />
                    {axisTicks.map((tick) => {
                      const x = toX(tick);
                      return (
                        <Line key={`grid-${tick.toISOString()}`} points={[x, HEADER_H, x, timelineHeight]} stroke="rgba(148,163,184,0.2)" strokeWidth={1} />
                      );
                    })}
                    <Line points={[todayX, HEADER_H, todayX, timelineHeight]} stroke="#ef4444" strokeWidth={1.2} dash={[6, 4]} />

                    {rows.slice(visibleWindow.startIdx, visibleWindow.endIdx + 1).map((r, localIdx) => {
                      const i = visibleWindow.startIdx + localIdx;
                      const y = HEADER_H + i * ROW_H - vScroll;
                      const s = r.start_date ? new Date(r.start_date) : null;
                      const e = r.end_date ? new Date(r.end_date) : null;
                      if (!s || !e) return null;
                      const x1 = toX(s);
                      const x2 = toX(e);
                      const color = r.is_critical ? '#ef4444' : (TYPE_COLOR[r.type] || '#22c55e');
                      const fillW = Math.max(3, (Math.max(6, x2 - x1) * Math.max(0, Math.min(100, asNum(r.percent_complete)))) / 100);
                      return (
                        <React.Fragment key={r.id}>
                          <Line points={[0, y + ROW_H - 1, timelineWidth, y + ROW_H - 1]} stroke="rgba(148,163,184,0.16)" strokeWidth={1} />
                          {showBaseline && r.baseline_start && r.baseline_end && (
                            <Rect x={toX(new Date(r.baseline_start))} y={y + 10} width={Math.max(3, toX(new Date(r.baseline_end)) - toX(new Date(r.baseline_start)))} height={6} cornerRadius={3} fill="rgba(148,163,184,0.45)" />
                          )}
                          <Rect
                            x={x1}
                            y={y + 8}
                            width={Math.max(6, x2 - x1)}
                            height={ROW_H - 16}
                            cornerRadius={4}
                            fill={color}
                            opacity={0.22}
                            onMouseEnter={(evt) => showBarTip(evt, r)}
                            onMouseLeave={hideBarTip}
                          />
                          <Rect
                            x={x1}
                            y={y + 8}
                            width={fillW}
                            height={ROW_H - 16}
                            cornerRadius={4}
                            fill={color}
                            onMouseEnter={(evt) => showBarTip(evt, r)}
                            onMouseLeave={hideBarTip}
                          />
                        </React.Fragment>
                      );
                    })}
                  </Layer>

                  <Layer clipX={0} clipY={HEADER_H} clipWidth={timelineWidth} clipHeight={Math.max(0, timelineHeight - HEADER_H)}>
                    {showDependencies && rows.flatMap((r, idx) => {
                      if (idx < visibleWindow.startIdx || idx > visibleWindow.endIdx) return [];
                      if (!Array.isArray(r.predecessor_ids) || !r.predecessor_ids.length || !r.start_date) return [];
                      const ty = HEADER_H + idx * ROW_H - vScroll + ROW_H / 2;
                      const tx = toX(new Date(r.start_date));
                      return r.predecessor_ids.flatMap((pred) => {
                        const sourceIdx = rowIndexById.get(pred);
                        if (sourceIdx == null) return [];
                        if (sourceIdx < visibleWindow.startIdx || sourceIdx > visibleWindow.endIdx) return [];
                        const source = rows[sourceIdx];
                        if (!source?.end_date) return [];
                        const sy = HEADER_H + sourceIdx * ROW_H - vScroll + ROW_H / 2;
                        const sx = toX(new Date(source.end_date));
                        const isReverse = tx < sx;
                        const routeX = isReverse ? Math.max(12, tx - 24) : Math.max(sx + 14, tx - 10);
                        const points = isReverse
                          ? [sx, sy, sx + 12, sy, sx + 12, ty, routeX, ty, tx - 8, ty]
                          : [sx, sy, routeX, sy, routeX, ty, tx - 8, ty];
                        const stroke = source.is_critical || r.is_critical ? '#ef4444' : '#2ed3c6';
                        const key = `${pred}-${r.id}`;
                        return [
                          <Line key={`line-${key}`} points={points} stroke={stroke} strokeWidth={1.25} lineCap="round" lineJoin="round" />,
                          <Arrow key={`arr-${key}`} points={[tx - 12, ty, tx, ty]} stroke={stroke} fill={stroke} strokeWidth={1.25} pointerLength={4} pointerWidth={4} />,
                        ];
                      });
                    })}
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
              </div>
              {barTip && (
                <div
                  style={{
                    position: 'absolute',
                    left: Math.max(8, Math.min(barTip.x, (rightPaneRef.current?.clientWidth || 400) - 230)),
                    top: Math.max(8, Math.min(barTip.y, (rightPaneRef.current?.clientHeight || 300) - 92)),
                    pointerEvents: 'none',
                    zIndex: 20,
                    minWidth: 210,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: 'rgba(12,16,20,0.52)',
                    border: '1px solid rgba(255,255,255,0.16)',
                    backdropFilter: 'blur(14px) saturate(130%)',
                    WebkitBackdropFilter: 'blur(14px) saturate(130%)',
                    color: '#dbe7f6',
                    fontSize: 11,
                    lineHeight: 1.35,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{barTip.name}</div>
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
