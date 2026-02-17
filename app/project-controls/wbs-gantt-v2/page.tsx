'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import './frappe-gantt.local.css';
import { useData } from '@/lib/data-context';
import PageLoader from '@/components/ui/PageLoader';

type ViewMode = 'Day' | 'Week' | 'Month' | 'Year';

type FrappeTask = {
  id: string;
  name: string;
  start: string;
  end: string;
  progress: number;
  dependencies?: string;
  custom_class?: string;
};

type FrappeGanttInstance = {
  change_view_mode: (mode: ViewMode) => void;
  refresh: (tasks: FrappeTask[]) => void;
};

type FrappeGanttCtor = new (
  element: Element,
  tasks: FrappeTask[],
  options: {
    view_mode?: ViewMode;
    language?: string;
    readonly?: boolean;
    popup_on?: 'click' | 'hover';
    date_format?: string;
    bar_height?: number;
    column_width?: number;
    container_height?: string;
    header_height?: number;
    today_button?: boolean;
  },
) => FrappeGanttInstance;

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
    const parsed = new Date(String(raw));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const normalizeTaskId = (value: string): string => value.replace(/^wbs-(task|sub_task)-/, '').trim();

const normalizeDepId = (token: string): string => {
  const t = token.trim();
  if (!t) return '';
  // Strip relation suffixes like "12FS", "TSK-1 SS"
  const relMatch = t.match(/(FS|SS|FF|SF)(?:\s*[+-].*)?$/i);
  const idPart = relMatch && typeof relMatch.index === 'number' ? t.slice(0, relMatch.index).trim() : t;
  return normalizeTaskId(idPart);
};

const toYmd = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

function buildFrappeTasks(source: Record<string, unknown>): FrappeTask[] {
  const tasksRaw = (source.tasks as unknown[] | undefined) ?? [];
  const projectDocs = (source.projectDocuments as unknown[] | undefined) ?? [];
  const projectsRaw = (source.projects as unknown[] | undefined) ?? [];

  const projectsWithPlans = new Set<string>();
  projectsRaw.forEach((project) => {
    const id = readString(project, 'id', 'projectId');
    const hasScheduleRaw = readString(project, 'has_schedule', 'hasSchedule');
    const hasScheduleBool = hasScheduleRaw.toLowerCase() === 'true' || hasScheduleRaw === '1';
    if (id && hasScheduleBool) projectsWithPlans.add(id);
  });
  projectDocs.forEach((doc) => {
    const pid = readString(doc, 'projectId', 'project_id');
    if (pid) projectsWithPlans.add(pid);
  });

  const validTasks = tasksRaw.filter((task) => {
    const projectId = readString(task, 'projectId', 'project_id');
    return projectsWithPlans.size === 0 || !projectId || projectsWithPlans.has(projectId);
  });

  const rows = validTasks.map((task, idx) => {
    const rawId = readString(task, 'id', 'taskId') || `task-${idx + 1}`;
    const id = normalizeTaskId(rawId) || `task-${idx + 1}`;
    const name = readString(task, 'name', 'taskName') || `Task ${idx + 1}`;

    const start = readDate(task, 'startDate', 'baselineStartDate', 'plannedStartDate');
    const end = readDate(task, 'endDate', 'baselineEndDate', 'plannedEndDate');

    const fallbackStart = start ?? new Date();
    const fallbackEnd = end ?? (() => {
      const d = new Date(fallbackStart);
      d.setDate(d.getDate() + Math.max(1, Math.round(readNumber(task, 'daysRequired', 'duration') || 7)));
      return d;
    })();

    const percent = Math.max(0, Math.min(100, Math.round(readNumber(task, 'percentComplete', 'percent_complete'))));

    const deps = new Set<string>();
    const predecessorRaw = readString(task, 'predecessorId', 'predecessor_id');
    if (predecessorRaw) {
      predecessorRaw
        .split(/[;,]+/)
        .map(normalizeDepId)
        .filter(Boolean)
        .forEach((d) => deps.add(d));
    }

    const predecessors = toRecord(task).predecessors;
    if (Array.isArray(predecessors)) {
      predecessors.forEach((pred) => {
        const depId = normalizeDepId(readString(pred, 'predecessorTaskId', 'predecessor_task_id', 'taskId'));
        if (depId) deps.add(depId);
      });
    }

    return {
      id,
      name,
      start: toYmd(fallbackStart),
      end: toYmd(fallbackEnd < fallbackStart ? fallbackStart : fallbackEnd),
      progress: percent,
      dependencies: Array.from(deps).join(','),
      custom_class: 'ppc-v2-task',
    } satisfies FrappeTask;
  });

  const idSet = new Set(rows.map((r) => r.id));
  // keep only dependencies that exist in this dataset (frappe drops broken ones, but this avoids warning noise)
  rows.forEach((row) => {
    if (!row.dependencies) return;
    row.dependencies = row.dependencies
      .split(',')
      .map((d) => d.trim())
      .filter((d) => idSet.has(d))
      .join(',');
  });

  return rows;
}

export default function WBSGanttV2Page() {
  const { filteredData, isLoading } = useData();
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<FrappeGanttInstance | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('Week');

  const frappeTasks = useMemo(() => {
    return buildFrappeTasks(filteredData as unknown as Record<string, unknown>);
  }, [filteredData]);

  useEffect(() => {
    let active = true;

    const mount = async () => {
      if (!containerRef.current) return;

      const mod = await import('frappe-gantt');
      const Gantt = (mod.default || (mod as unknown)) as FrappeGanttCtor;

      if (!active || !containerRef.current) return;

      containerRef.current.innerHTML = '';
      if (!frappeTasks.length) return;

      ganttRef.current = new Gantt(containerRef.current, frappeTasks, {
        view_mode: viewMode,
        language: 'en',
        readonly: true,
        popup_on: 'hover',
        date_format: 'YYYY-MM-DD',
        bar_height: 20,
        column_width: viewMode === 'Day' ? 42 : viewMode === 'Week' ? 64 : viewMode === 'Month' ? 120 : 220,
        container_height: '100%',
        header_height: 56,
        today_button: true,
      });
    };

    mount();

    return () => {
      active = false;
    };
  }, [frappeTasks, viewMode]);

  if (isLoading) return <PageLoader message="Loading WBS Gantt V2..." />;

  return (
    <div className="page-panel" style={{ height: 'calc(100vh - 62px)', display: 'flex', flexDirection: 'column', gap: 8, padding: '0.5rem 0.75rem 0.5rem' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>WBS Gantt V2</h1>
          <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
            Powered by Frappe Gantt with Data Management tasks and dependencies
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '4px 6px' }}>
          {(['Day', 'Week', 'Month', 'Year'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setViewMode(mode);
                ganttRef.current?.change_view_mode(mode);
              }}
              className="btn btn-sm"
              style={{
                background: viewMode === mode ? 'var(--pinnacle-teal)' : 'transparent',
                color: viewMode === mode ? '#000' : 'var(--text-secondary)',
                border: 'none',
                fontWeight: 700,
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card)', position: 'relative' }}>
        {frappeTasks.length === 0 ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No task rows found in Data Management for current filters.
          </div>
        ) : null}
        <div ref={containerRef} style={{ height: '100%', width: '100%', overflow: 'auto' }} />
      </div>
    </div>
  );
}
