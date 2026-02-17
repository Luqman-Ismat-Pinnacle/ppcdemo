'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DataEditor, {
  GridCell,
  GridCellKind,
  GridColumn,
  Item,
  Rectangle,
  VisibleRegionChangedEventArgs,
} from '@glideapps/glide-data-grid';
import '@glideapps/glide-data-grid/dist/index.css';
import { Arrow, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { useData } from '@/lib/data-context';
import PageLoader from '@/components/ui/PageLoader';

type GanttTask = {
  id: string;
  wbsCode: string;
  name: string;
  projectName: string;
  unitName: string;
  phaseName: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  predecessors: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 52;

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
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
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

const normalizeTaskId = (input: string): string => input.replace(/^wbs-(task|sub_task)-/i, '').trim();

const parsePredecessorTokens = (raw: string): string[] => {
  if (!raw.trim()) return [];
  return raw
    .split(/[;,]+/)
    .map((token) => token.trim())
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
    const next = {
      width: Math.max(0, Math.floor(rect.width)),
      height: Math.max(0, Math.floor(rect.height)),
    };
    setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
  }, []);

  useLayoutEffect(() => {
    let rafId = requestAnimationFrame(measure);
    measure();

    const onWindowResize = () => measure();
    window.addEventListener('resize', onWindowResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      observer = new ResizeObserver(() => measure());
      observer.observe(ref.current);
    }

    // Fallback for environments where observer misses first paint/layout changes.
    const intervalId = window.setInterval(measure, 300);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onWindowResize);
      if (observer) observer.disconnect();
      window.clearInterval(intervalId);
    };
  }, [measure]);

  return { ref, size };
};

function buildTasks(source: Record<string, unknown>): GanttTask[] {
  const tasksRaw = (source.tasks as unknown[] | undefined) ?? [];
  const unitsRaw = (source.units as unknown[] | undefined) ?? [];
  const phasesRaw = (source.phases as unknown[] | undefined) ?? [];
  const projectsRaw = (source.projects as unknown[] | undefined) ?? [];
  const docsRaw = (source.projectDocuments as unknown[] | undefined) ?? [];

  const projectsById = new Map<string, string>();
  const unitsById = new Map<string, string>();
  const phasesById = new Map<string, string>();

  projectsRaw.forEach((p) => {
    const id = readString(p, 'id', 'projectId', 'project_id');
    const name = readString(p, 'name', 'projectName', 'project_name');
    if (id) projectsById.set(id, name || id);
  });

  unitsRaw.forEach((u) => {
    const id = readString(u, 'id', 'unitId', 'unit_id');
    const name = readString(u, 'name', 'unitName', 'unit_name');
    if (id) unitsById.set(id, name || id);
  });

  phasesRaw.forEach((p) => {
    const id = readString(p, 'id', 'phaseId', 'phase_id');
    const name = readString(p, 'name', 'phaseName', 'phase_name');
    if (id) phasesById.set(id, name || id);
  });

  const projectsWithPlan = new Set<string>();
  projectsRaw.forEach((project) => {
    const id = readString(project, 'id', 'projectId', 'project_id');
    const hasSchedule = readString(project, 'has_schedule', 'hasSchedule');
    if (id && ['1', 'true', 'yes'].includes(hasSchedule.toLowerCase())) {
      projectsWithPlan.add(id);
    }
  });

  docsRaw.forEach((doc) => {
    const pid = readString(doc, 'projectId', 'project_id');
    if (pid) projectsWithPlan.add(pid);
  });

  const rows = tasksRaw
    .map((task, index) => {
      const rawId = readString(task, 'id', 'taskId', 'task_id') || `task-${index + 1}`;
      const id = normalizeTaskId(rawId) || `task-${index + 1}`;

      const projectId = readString(task, 'projectId', 'project_id');
      if (projectsWithPlan.size > 0 && projectId && !projectsWithPlan.has(projectId)) return null;

      const unitId = readString(task, 'unitId', 'unit_id');
      const phaseId = readString(task, 'phaseId', 'phase_id');

      const start = readDate(task, 'baselineStartDate', 'plannedStartDate', 'startDate', 'actualStartDate') ?? new Date();
      const directEnd = readDate(task, 'baselineEndDate', 'plannedEndDate', 'endDate', 'actualEndDate');
      const durationDays = Math.max(1, Math.round(readNumber(task, 'daysRequired', 'duration', 'durationDays') || 7));
      const fallbackEnd = new Date(start.getTime() + durationDays * DAY_MS);
      const end = directEnd && directEnd >= start ? directEnd : fallbackEnd;

      return {
        id,
        wbsCode: readString(task, 'wbsCode', 'wbs_code') || `${index + 1}`,
        name: readString(task, 'taskName', 'name') || `Task ${index + 1}`,
        projectName: projectsById.get(projectId) || readString(task, 'projectName', 'project_name') || '-',
        unitName: unitsById.get(unitId) || readString(task, 'unitName', 'unit_name') || '-',
        phaseName: phasesById.get(phaseId) || readString(task, 'phaseName', 'phase_name') || '-',
        startDate: start,
        endDate: end,
        progress: Math.max(0, Math.min(100, Math.round(readNumber(task, 'percentComplete', 'percent_complete')))),
        predecessors: parsePredecessorTokens(readString(task, 'predecessorId', 'predecessor_id')),
      } satisfies GanttTask;
    })
    .filter((task): task is GanttTask => task !== null);

  const idSet = new Set(rows.map((t) => t.id));
  rows.forEach((task) => {
    task.predecessors = task.predecessors.filter((dep) => idSet.has(dep));
  });

  return rows;
}

function monthTicks(minDate: Date, maxDate: Date): Date[] {
  const ticks: Date[] = [];
  const start = new Date(minDate);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(maxDate);
  end.setDate(1);
  end.setHours(0, 0, 0, 0);

  const cursor = new Date(start);
  while (cursor <= end) {
    ticks.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return ticks;
}

export default function WBSGanttV2Page() {
  const { filteredData, isLoading } = useData();
  const leftPanel = useElementSize<HTMLDivElement>();
  const rightPanel = useElementSize<HTMLDivElement>();
  const [gridScrollY, setGridScrollY] = useState(0);

  const tasks = useMemo(() => buildTasks(filteredData as unknown as Record<string, unknown>), [filteredData]);
  const taskById = useMemo(() => new Map(tasks.map((task, i) => [task.id, { task, index: i }])), [tasks]);

  const columns = useMemo<GridColumn[]>(() => {
    return [
      { id: 'wbs', title: 'WBS', width: 90 },
      { id: 'name', title: 'Task', width: 260 },
      { id: 'project', title: 'Project', width: 180 },
      { id: 'unit', title: 'Unit', width: 140 },
      { id: 'phase', title: 'Phase', width: 140 },
      { id: 'start', title: 'Start', width: 110 },
      { id: 'end', title: 'End', width: 110 },
      { id: 'progress', title: '%', width: 60 },
    ];
  }, []);

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const task = tasks[row];
      if (!task) {
        return { kind: GridCellKind.Text, allowOverlay: false, data: '', displayData: '' };
      }

      const startText = task.startDate.toLocaleDateString('en-US');
      const endText = task.endDate.toLocaleDateString('en-US');
      const values = [
        task.wbsCode,
        task.name,
        task.projectName,
        task.unitName,
        task.phaseName,
        startText,
        endText,
        `${task.progress}%`,
      ];

      return {
        kind: GridCellKind.Text,
        data: values[col] ?? '',
        displayData: values[col] ?? '',
        allowOverlay: false,
      };
    },
    [tasks],
  );

  const onVisibleRegionChanged = useCallback(
    (_range: Rectangle, _tx: number, ty: number, _extras: VisibleRegionChangedEventArgs) => {
      setGridScrollY(Math.max(0, ty));
    },
    [],
  );

  const dateBounds = useMemo(() => {
    if (!tasks.length) return null;
    const min = tasks.reduce((d, t) => (t.startDate < d ? t.startDate : d), tasks[0].startDate);
    const max = tasks.reduce((d, t) => (t.endDate > d ? t.endDate : d), tasks[0].endDate);
    const paddedMin = new Date(min.getTime() - 14 * DAY_MS);
    const paddedMax = new Date(max.getTime() + 14 * DAY_MS);
    return { min: paddedMin, max: paddedMax };
  }, [tasks]);

  const stageWidth = Math.max(320, rightPanel.size.width || 0);
  const stageHeight = Math.max(220, rightPanel.size.height || 0);

  const chartRange = useMemo(() => {
    if (!dateBounds) return null;
    const totalMs = Math.max(DAY_MS, dateBounds.max.getTime() - dateBounds.min.getTime());
    return {
      min: dateBounds.min,
      max: dateBounds.max,
      totalMs,
      plotLeft: 14,
      plotRight: Math.max(120, stageWidth - 20),
    };
  }, [dateBounds, stageWidth]);

  const toX = useCallback(
    (date: Date) => {
      if (!chartRange) return 0;
      const pct = (date.getTime() - chartRange.min.getTime()) / chartRange.totalMs;
      return chartRange.plotLeft + pct * (chartRange.plotRight - chartRange.plotLeft);
    },
    [chartRange],
  );

  const ticks = useMemo(() => {
    if (!chartRange) return [];
    return monthTicks(chartRange.min, chartRange.max);
  }, [chartRange]);

  if (isLoading) return <PageLoader message="Loading WBS Gantt V2..." />;

  return (
    <div
      className="page-panel"
      style={{
        height: 'calc(100vh - 62px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '0.5rem 0.75rem 0.5rem',
      }}
    >
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>WBS Gantt V2</h1>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
            Glide Data Grid + React Konva (from Data Management)
          </div>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{tasks.length} tasks</div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '50% 50%',
          gap: 8,
        }}
      >
        <div
          ref={leftPanel.ref}
          style={{
            minHeight: 0,
            minWidth: 0,
            borderRadius: 10,
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            background: 'var(--bg-card)',
            position: 'relative',
          }}
        >
          {leftPanel.size.width > 20 && leftPanel.size.height > 20 && (
            <DataEditor
              columns={columns}
              rows={tasks.length}
              rowHeight={ROW_HEIGHT}
              headerHeight={40}
              getCellContent={getCellContent}
              onVisibleRegionChanged={onVisibleRegionChanged}
              smoothScrollX
              smoothScrollY
              width={leftPanel.size.width}
              height={leftPanel.size.height}
            />
          )}
          {(leftPanel.size.width <= 20 || leftPanel.size.height <= 20) && (
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Preparing WBS grid...
            </div>
          )}
        </div>

        <div
          ref={rightPanel.ref}
          style={{
            minHeight: 0,
            minWidth: 0,
            borderRadius: 10,
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            background: 'var(--bg-card)',
            position: 'relative',
          }}
        >
          {tasks.length === 0 ? (
            <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No task data found for current filters.
            </div>
          ) : (
            <Stage width={stageWidth} height={stageHeight}>
              <Layer>
                <Rect x={0} y={0} width={stageWidth} height={HEADER_HEIGHT} fill="#0b1320" />
                {ticks.map((tick) => {
                  const x = toX(tick);
                  return (
                    <React.Fragment key={tick.toISOString()}>
                      <Line points={[x, 0, x, stageHeight]} stroke="#263243" strokeWidth={1} />
                      <Text
                        x={x + 4}
                        y={14}
                        text={tick.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        fill="#b7c2d1"
                        fontSize={11}
                      />
                    </React.Fragment>
                  );
                })}

                {tasks.map((task, rowIndex) => {
                  const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT - gridScrollY;
                  if (y + ROW_HEIGHT < HEADER_HEIGHT || y > stageHeight) return null;

                  const startX = toX(task.startDate);
                  const endX = Math.max(startX + 4, toX(task.endDate));
                  const barY = y + 7;
                  const barH = ROW_HEIGHT - 14;

                  return (
                    <React.Fragment key={task.id}>
                      <Rect
                        x={0}
                        y={y + ROW_HEIGHT - 1}
                        width={stageWidth}
                        height={1}
                        fill="#1e2939"
                        opacity={0.55}
                      />
                      <Rect
                        x={startX}
                        y={barY}
                        width={endX - startX}
                        height={barH}
                        fill="#2ed3c6"
                        cornerRadius={4}
                      />
                      <Rect
                        x={startX}
                        y={barY}
                        width={(endX - startX) * (task.progress / 100)}
                        height={barH}
                        fill="#17a59a"
                        cornerRadius={4}
                      />
                      <Text
                        x={startX + 6}
                        y={barY + 4}
                        width={Math.max(50, endX - startX - 10)}
                        text={task.name}
                        fill="#032320"
                        fontSize={11}
                        ellipsis
                      />
                    </React.Fragment>
                  );
                })}

                {tasks.flatMap((task, rowIndex) => {
                  const toY = HEADER_HEIGHT + rowIndex * ROW_HEIGHT - gridScrollY + ROW_HEIGHT / 2;
                  if (toY < HEADER_HEIGHT || toY > stageHeight) return [];

                  return task.predecessors.flatMap((predId) => {
                    const pred = taskById.get(predId);
                    if (!pred) return [];

                    const fromY = HEADER_HEIGHT + pred.index * ROW_HEIGHT - gridScrollY + ROW_HEIGHT / 2;
                    if (fromY < HEADER_HEIGHT || fromY > stageHeight) return [];

                    const fromX = Math.max(toX(pred.task.startDate) + 4, toX(pred.task.endDate));
                    const toBarX = toX(task.startDate);
                    const elbowX = Math.max(fromX + 14, toBarX - 14);

                    const key = `${predId}->${task.id}`;
                    return [
                      <Line
                        key={`line-${key}`}
                        points={[fromX, fromY, elbowX, fromY, elbowX, toY, toBarX - 9, toY]}
                        stroke="#ffb84d"
                        strokeWidth={1.5}
                        lineJoin="round"
                        lineCap="round"
                      />,
                      <Arrow
                        key={`arrow-${key}`}
                        points={[toBarX - 14, toY, toBarX - 2, toY]}
                        stroke="#ffb84d"
                        fill="#ffb84d"
                        strokeWidth={1.5}
                        pointerLength={5}
                        pointerWidth={5}
                      />, 
                    ];
                  });
                })}
              </Layer>
            </Stage>
          )}
        </div>
      </div>
    </div>
  );
}
