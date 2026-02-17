'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DataEditor, { GridCell, GridCellKind, GridColumn, Item, Rectangle } from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { Arrow, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { useData } from '@/lib/data-context';
import PageLoader from '@/components/ui/PageLoader';

type FlatWbsRow = {
  id: string;
  taskId: string;
  wbsCode: string;
  name: string;
  type: string;
  resourceName: string;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
  startDate: Date | null;
  endDate: Date | null;
  daysRequired: number;
  baselineHours: number;
  actualHours: number;
  remainingHours: number;
  baselineCost: number;
  actualCost: number;
  remainingCost: number;
  percentComplete: number;
  predecessorIds: string[];
  totalFloat: number;
  isCritical: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 40;

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
const formatCurrency = (n: number): string => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : '-');

export default function WBSGanttV2Page() {
  const { filteredData, data: fullData, isLoading } = useData();
  const leftPanel = useElementSize<HTMLDivElement>();
  const rightPanel = useElementSize<HTMLDivElement>();
  const rightScrollRef = useRef<HTMLDivElement>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [verticalOffset, setVerticalOffset] = useState(0);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const [pxPerDay, setPxPerDay] = useState(2.5);

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

  useEffect(() => {
    if (!wbsRootItems.length) return;

    const next = new Set<string>();
    const walk = (items: unknown[], level: number) => {
      items.forEach((item) => {
        const rec = toRecord(item);
        const id = readString(rec, 'id');
        const children = Array.isArray(rec.children) ? rec.children : [];
        if (id && children.length && level <= 2) next.add(id);
        if (children.length) walk(children, level + 1);
      });
    };

    walk(wbsRootItems, 1);
    setExpandedIds(next);
  }, [wbsRootItems]);

  const flatRows = useMemo(() => {
    const rows: FlatWbsRow[] = [];

    const walk = (items: unknown[], level: number, parentVisible: boolean) => {
      items.forEach((item) => {
        const rec = toRecord(item);
        const id = readString(rec, 'id');
        if (!id) return;

        const children = Array.isArray(rec.children) ? rec.children : [];
        const hasChildren = children.length > 0;
        const isExpanded = expandedIds.has(id);

        if (!parentVisible) return;

        const startDate = readDate(rec, 'startDate', 'baselineStart', 'baselineStartDate', 'actualStartDate');
        const endDateRaw = readDate(rec, 'endDate', 'baselineEnd', 'baselineEndDate', 'actualEndDate');
        const daysRequiredRaw = Math.max(0, readNumber(rec, 'daysRequired', 'duration'));
        const fallbackEnd = startDate ? new Date(startDate.getTime() + Math.max(1, daysRequiredRaw || 1) * DAY_MS) : null;
        const endDate = endDateRaw && startDate && endDateRaw < startDate ? startDate : (endDateRaw || fallbackEnd);
        const daysRequired = daysRequiredRaw || (startDate && endDate ? Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / DAY_MS)) : 0);

        const taskId = normalizeTaskId(readString(rec, 'taskId', 'task_id', 'id'));
        const assignedResourceId = readString(rec, 'assignedResourceId', 'assigned_resource_id', 'employeeId', 'employee_id');

        rows.push({
          id,
          taskId,
          wbsCode: readString(rec, 'wbsCode', 'wbs_code') || '-',
          name: readString(rec, 'name', 'taskName') || '-',
          type: inferType(rec),
          resourceName: employeeNameById.get(assignedResourceId) || '-',
          level,
          hasChildren,
          isExpanded,
          startDate,
          endDate,
          daysRequired,
          baselineHours: readNumber(rec, 'baselineHours', 'baseline_hours'),
          actualHours: readNumber(rec, 'actualHours', 'actual_hours'),
          remainingHours: readNumber(rec, 'remainingHours', 'remaining_hours'),
          baselineCost: readNumber(rec, 'baselineCost', 'baseline_cost'),
          actualCost: readNumber(rec, 'actualCost', 'actual_cost'),
          remainingCost: readNumber(rec, 'remainingCost', 'remaining_cost'),
          percentComplete: Math.max(0, Math.min(100, Math.round(readNumber(rec, 'percentComplete', 'percent_complete')))),
          predecessorIds: getPredecessorIds(rec),
          totalFloat: readNumber(rec, 'totalFloat', 'total_float'),
          isCritical: Boolean(rec.isCritical),
        });

        if (hasChildren) {
          walk(children, level + 1, isExpanded);
        }
      });
    };

    walk(wbsRootItems, 1, true);
    return rows;
  }, [expandedIds, wbsRootItems, employeeNameById]);

  const columns = useMemo<GridColumn[]>(() => ([
    { id: 'wbs', title: 'WBS', width: 120 },
    { id: 'name', title: 'Task', width: 260 },
    { id: 'type', title: 'Type', width: 110 },
    { id: 'resource', title: 'Resource', width: 160 },
    { id: 'start', title: 'Start', width: 105 },
    { id: 'end', title: 'End', width: 105 },
    { id: 'days', title: 'Days', width: 70 },
    { id: 'blh', title: 'BL Hrs', width: 90 },
    { id: 'acth', title: 'Act Hrs', width: 90 },
    { id: 'remh', title: 'Rem Hrs', width: 90 },
    { id: 'blc', title: 'BL Cost', width: 110 },
    { id: 'actc', title: 'Act Cost', width: 110 },
    { id: 'remc', title: 'Rem Cost', width: 110 },
    { id: 'pct', title: '%', width: 60 },
    { id: 'pred', title: 'Predecessors', width: 140 },
    { id: 'tf', title: 'TF', width: 60 },
    { id: 'cp', title: 'CP', width: 60 },
  ]), []);

  const getCellContent = useCallback((cell: Item): GridCell => {
    const [col, row] = cell;
    const r = flatRows[row];
    if (!r) {
      return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
    }

    const indent = '\u00A0\u00A0'.repeat(Math.max(0, r.level - 1));
    const expander = r.hasChildren ? (r.isExpanded ? '▾ ' : '▸ ') : '';
    const values = [
      `${indent}${r.wbsCode}`,
      `${indent}${expander}${r.name}`,
      r.type,
      r.resourceName,
      formatDate(r.startDate),
      formatDate(r.endDate),
      formatInt(r.daysRequired),
      formatInt(r.baselineHours),
      formatInt(r.actualHours),
      formatInt(r.remainingHours),
      formatCurrency(r.baselineCost),
      formatCurrency(r.actualCost),
      formatCurrency(r.remainingCost),
      `${r.percentComplete}%`,
      r.predecessorIds.join(', '),
      formatInt(r.totalFloat),
      r.isCritical ? 'Yes' : '-',
    ];

    return {
      kind: GridCellKind.Text,
      data: values[col] ?? '',
      displayData: values[col] ?? '',
      allowOverlay: false,
    };
  }, [flatRows]);

  const onCellClicked = useCallback((cell: Item) => {
    const [col, row] = cell;
    if (col !== 0 && col !== 1) return;
    const target = flatRows[row];
    if (!target?.hasChildren) return;

    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(target.id)) next.delete(target.id);
      else next.add(target.id);
      return next;
    });
  }, [flatRows]);

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

    // Trim outlier dates so one bad record does not collapse the full chart.
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

  if (isLoading) return <PageLoader message="Loading WBS Gantt V2..." />;

  return (
    <div className="page-panel" style={{ height: 'calc(100vh - 62px)', display: 'flex', flexDirection: 'column', gap: 8, padding: '0.5rem 0.75rem 0.5rem' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>WBS Gantt V2</h1>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
            Hierarchical WBS + aligned timeline (Glide Data Grid + React Konva)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={() => setPxPerDay((v) => Math.max(0.5, v - 0.5))}>-</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 62, textAlign: 'center' }}>{pxPerDay.toFixed(1)} px/day</span>
          <button className="btn btn-sm" onClick={() => setPxPerDay((v) => Math.min(12, v + 0.5))}>+</button>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: 10 }}>{flatRows.length} rows</div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '50% 50%', gap: 8 }}>
        <div
          ref={leftPanel.ref}
          style={{ minHeight: 0, minWidth: 0, borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden', background: 'var(--bg-card)', position: 'relative' }}
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
            />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Preparing WBS grid...</div>
          )}
        </div>

        <div
          ref={rightPanel.ref}
          style={{ minHeight: 0, minWidth: 0, borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden', background: 'var(--bg-card)', position: 'relative' }}
        >
          {rightPanelWidth > 20 && rightPanelHeight > 20 ? (
            <div
              ref={rightScrollRef}
              style={{ width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden' }}
              onScroll={(e) => setHorizontalOffset((e.currentTarget as HTMLDivElement).scrollLeft)}
            >
              <Stage width={timelineInnerWidth} height={rightPanelHeight}>
                <Layer>
                  <Rect x={0} y={0} width={timelineInnerWidth} height={HEADER_HEIGHT} fill="#0b1320" />

                  {monthTicks.map((tick) => {
                    const x = toX(tick);
                    return <Line key={`m-${tick.toISOString()}`} points={[x, HEADER_HEIGHT, x, rightPanelHeight]} stroke="#1b2a3d" strokeWidth={1} />;
                  })}

                  {yearTicks.map((tick) => {
                    const x = toX(tick);
                    return (
                      <React.Fragment key={`y-${tick.toISOString()}`}>
                        <Line points={[x, 0, x, rightPanelHeight]} stroke="#3d4f68" strokeWidth={1.2} />
                        <Text x={x + 4} y={12} text={String(tick.getFullYear())} fill="#c2ccda" fontSize={11} />
                      </React.Fragment>
                    );
                  })}

                  {flatRows.slice(visibleWindow.startIdx, visibleWindow.endIdx + 1).map((row, localIdx) => {
                    const idx = visibleWindow.startIdx + localIdx;
                    const y = HEADER_HEIGHT + idx * ROW_HEIGHT - verticalOffset;
                    const centerY = y + ROW_HEIGHT / 2;

                    if (y + ROW_HEIGHT < HEADER_HEIGHT || y > rightPanelHeight) return null;

                    const barStart = row.startDate ? toX(row.startDate) : null;
                    const barEnd = row.endDate ? toX(row.endDate) : null;

                    return (
                      <React.Fragment key={row.id}>
                        <Line points={[0, y + ROW_HEIGHT - 1, timelineInnerWidth, y + ROW_HEIGHT - 1]} stroke="#1e2939" strokeWidth={1} />
                        {barStart !== null && barEnd !== null && (
                          <>
                            <Rect
                              x={barStart}
                              y={y + 7}
                              width={Math.max(6, barEnd - barStart)}
                              height={ROW_HEIGHT - 14}
                              fill={row.isCritical ? '#ff8f66' : '#2ed3c6'}
                              cornerRadius={4}
                            />
                            <Rect
                              x={barStart}
                              y={y + 7}
                              width={Math.max(3, (Math.max(6, barEnd - barStart) * row.percentComplete) / 100)}
                              height={ROW_HEIGHT - 14}
                              fill={row.isCritical ? '#ff6f3d' : '#17a59a'}
                              cornerRadius={4}
                            />
                            <Text
                              x={barStart + 6}
                              y={y + 10}
                              width={Math.max(45, barEnd - barStart - 10)}
                              text={row.name}
                              fill="#032320"
                              fontSize={11}
                              ellipsis
                            />
                          </>
                        )}
                        <Rect x={0} y={centerY - 0.5} width={timelineInnerWidth} height={1} fill="#122030" opacity={0.4} />
                      </React.Fragment>
                    );
                  })}

                  {flatRows.slice(visibleWindow.startIdx, visibleWindow.endIdx + 1).flatMap((targetRow, localIdx) => {
                    const targetIdx = visibleWindow.startIdx + localIdx;
                    const targetY = HEADER_HEIGHT + targetIdx * ROW_HEIGHT - verticalOffset + ROW_HEIGHT / 2;
                    if (!targetRow.startDate) return [];

                    const toBarX = toX(targetRow.startDate);

                    return targetRow.predecessorIds.flatMap((pred) => {
                      const sourceIdx = indexByTaskId.get(normalizeTaskId(pred));
                      if (sourceIdx === undefined) return [];

                      const source = flatRows[sourceIdx];
                      if (!source?.endDate) return [];

                      const sourceY = HEADER_HEIGHT + sourceIdx * ROW_HEIGHT - verticalOffset + ROW_HEIGHT / 2;
                      if (sourceY < HEADER_HEIGHT || sourceY > rightPanelHeight + ROW_HEIGHT) return [];

                      const fromX = toX(source.endDate);
                      const elbowX = Math.max(fromX + 14, toBarX - 14);
                      const key = `${source.id}->${targetRow.id}`;

                      return [
                        <Line
                          key={`dep-line-${key}`}
                          points={[fromX, sourceY, elbowX, sourceY, elbowX, targetY, toBarX - 10, targetY]}
                          stroke="#ffb84d"
                          strokeWidth={1.4}
                          lineJoin="round"
                          lineCap="round"
                        />,
                        <Arrow
                          key={`dep-arrow-${key}`}
                          points={[toBarX - 15, targetY, toBarX - 2, targetY]}
                          stroke="#ffb84d"
                          fill="#ffb84d"
                          strokeWidth={1.4}
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
