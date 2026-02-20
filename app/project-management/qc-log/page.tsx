'use client';

/**
 * QC Log — Quality Control log and analytics.
 * Rewritten from scratch: Dashboard, Quality Orders table, Non-conformance, CAPA.
 * Data: useData() → filteredData.qctasks; edits via updateData().
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { QCTask } from '@/types/data';
import type { EChartsOption } from 'echarts';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'orders', label: 'Quality Orders' },
  { id: 'nonconformance', label: 'Non-conformance' },
  { id: 'capa', label: 'CAPA' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Complete: { bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
  'In Progress': { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  'Not Started': { bg: 'rgba(107,114,128,0.15)', color: '#9CA3AF' },
  'On Hold': { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  Failed: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
};

const SCORE_COLOR = (score: number) =>
  score >= 90 ? '#10B981' : score >= 80 ? '#F59E0B' : '#EF4444';

const TEAL = 'var(--pinnacle-teal)';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// -----------------------------------------------------------------------------
// UI primitives
// -----------------------------------------------------------------------------

function Card({
  title,
  subtitle,
  children,
  noPadding,
  accent,
  headerRight,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  noPadding?: boolean;
  accent?: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderRadius: 12,
        border: `1px solid ${accent ? `${accent}40` : 'var(--border-color)'}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: accent ? `${accent}08` : undefined,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 600,
              color: accent || 'var(--text-primary)',
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {subtitle}
            </span>
          )}
        </div>
        {headerRight}
      </div>
      <div
        style={{
          padding: noPadding ? 0 : '1rem',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLE[status] || STATUS_STYLE['Not Started'];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 12,
        fontSize: '0.85rem',
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.color}`,
      }}
    >
      {status}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = SCORE_COLOR(score);
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 12,
        background: `${color}20`,
        color,
        fontWeight: 600,
      }}
    >
      {score}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Dashboard: Stats ring + grid
// -----------------------------------------------------------------------------

function QualitySummary({ stats }: { stats: QCStats }) {
  const ringColor =
    stats.passRate >= 95 ? '#10B981' : stats.passRate >= 85 ? '#F59E0B' : '#EF4444';
  const items = [
    { label: 'Total Orders', value: stats.totalOrders, color: 'var(--pinnacle-lime)' },
    { label: 'Completed', value: stats.completed, color: '#10B981' },
    { label: 'In Progress', value: stats.inProgress, color: '#F59E0B' },
    { label: 'Pending', value: stats.pending, color: '#6B7280' },
    { label: 'Critical Errors', value: stats.criticalNC, color: '#EF4444' },
    { label: 'Non-Critical', value: stats.minorNC, color: '#F59E0B' },
    { label: 'Avg Score', value: stats.avgScore.toFixed(1), color: TEAL },
    { label: 'Total Hours', value: (stats.totalHours || 0).toFixed(0), color: 'var(--pinnacle-lime)' },
  ];

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%)',
        borderRadius: 20,
        padding: '1.25rem',
        border: '1px solid var(--border-color)',
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        alignItems: 'center',
        gap: '1.5rem',
      }}
    >
      <div style={{ position: 'relative', width: 160, height: 160 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
          <circle
            cx={50}
            cy={50}
            r={42}
            fill="none"
            stroke="var(--bg-tertiary)"
            strokeWidth={8}
          />
          <circle
            cx={50}
            cy={50}
            r={42}
            fill="none"
            stroke={ringColor}
            strokeWidth={8}
            strokeDasharray={`${stats.passRate * 2.64} 264`}
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            style={{ filter: `drop-shadow(0 0 8px ${ringColor})` }}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '2rem', fontWeight: 900, color: ringColor }}>
            {stats.passRate.toFixed(0)}%
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
            }}
          >
            Pass Rate
          </span>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.75rem',
        }}
      >
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              background: `${item.color}10`,
              borderRadius: 12,
              padding: '0.75rem 1rem',
              border: `1px solid ${item.color}30`,
            }}
          >
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              {item.label}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Charts
// -----------------------------------------------------------------------------

interface QCStats {
  totalOrders: number;
  completed: number;
  inProgress: number;
  pending: number;
  passRate: number;
  avgScore: number;
  totalHours: number;
  criticalNC: number;
  minorNC: number;
}

function ScoreDistributionChart({ qcTasks }: { qcTasks: QCTask[] }) {
  const option: EChartsOption = useMemo(() => {
    const ranges = [
      { range: '0-59', count: 0, color: '#EF4444' },
      { range: '60-79', count: 0, color: '#F59E0B' },
      { range: '80-89', count: 0, color: 'var(--pinnacle-lime)' },
      { range: '90-100', count: 0, color: '#10B981' },
    ];
    qcTasks.forEach((qc) => {
      const s = qc.qcScore ?? 0;
      if (s < 60) ranges[0].count++;
      else if (s < 80) ranges[1].count++;
      else if (s < 90) ranges[2].count++;
      else ranges[3].count++;
    });
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 50, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category',
        data: ranges.map((r) => r.range),
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      series: [
        {
          name: 'Tasks',
          type: 'bar',
          data: ranges.map((r) => ({ value: r.count, itemStyle: { color: r.color } })),
          barWidth: '60%',
          label: { show: true, position: 'top', formatter: '{c}', color: 'var(--text-muted)', fontSize: 11 },
        },
      ],
    };
  }, [qcTasks]);
  return <ChartWrapper option={option} height="240px" />;
}

function DefectPieChart({ qcTasks }: { qcTasks: QCTask[] }) {
  const option: EChartsOption = useMemo(() => {
    const critical = qcTasks.reduce((s, t) => s + (t.qcCriticalErrors ?? 0), 0);
    const nonCrit = qcTasks.reduce((s, t) => s + (t.qcNonCriticalErrors ?? 0), 0);
    const major = Math.floor(nonCrit * 0.6);
    const minor = nonCrit - major;
    const obs = Math.max(0, Math.floor(minor * 0.3));
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: 'var(--text-muted)', fontSize: 11 } },
      series: [
        {
          type: 'pie',
          radius: ['45%', '75%'],
          center: ['50%', '45%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: [
            { value: critical || 1, name: 'Critical', itemStyle: { color: '#EF4444' } },
            { value: major || 2, name: 'Major', itemStyle: { color: '#F59E0B' } },
            { value: minor || 3, name: 'Minor', itemStyle: { color: 'var(--pinnacle-lime)' } },
            { value: obs || 1, name: 'Observation', itemStyle: { color: '#6B7280' } },
          ],
        },
      ],
    };
  }, [qcTasks]);
  return <ChartWrapper option={option} height="200px" />;
}

function StatusBarChart({ qcTasks }: { qcTasks: QCTask[] }) {
  const option: EChartsOption = useMemo(() => {
    const map = new Map<string, number>();
    qcTasks.forEach((qc) => {
      const st = qc.qcStatus || 'Unknown';
      map.set(st, (map.get(st) ?? 0) + 1);
    });
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const colors: Record<string, string> = {
      Complete: '#10B981',
      'In Progress': '#F59E0B',
      'Not Started': '#6B7280',
      'On Hold': '#EF4444',
      Failed: '#EF4444',
    };
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 100, right: 30, top: 20, bottom: 30 },
      xAxis: {
        type: 'value',
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
        splitLine: { lineStyle: { color: 'var(--border-color)', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: entries.map((e) => e[0]),
        axisLabel: { color: 'var(--text-muted)', fontSize: 11 },
        axisLine: { lineStyle: { color: 'var(--border-color)' } },
      },
      series: [
        {
          name: 'Tasks',
          type: 'bar',
          data: entries.map((e) => ({
            value: e[1],
            itemStyle: { color: colors[e[0]] ?? '#6B7280' },
          })),
          barMaxWidth: 24,
          label: { show: true, position: 'right', formatter: '{c}', color: 'var(--text-muted)', fontSize: 11 },
        },
      ],
    };
  }, [qcTasks]);
  return <ChartWrapper option={option} height="200px" />;
}

// -----------------------------------------------------------------------------
// Data hook: filtered + sorted QC tasks, stats, getTaskName
// -----------------------------------------------------------------------------

function useQCLogData() {
  const { data, filteredData, updateData } = useData();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);

  const getTaskName = useCallback(
    (taskId: string) => data.tasks?.find((t) => t.taskId === taskId)?.taskName ?? taskId,
    [data.tasks]
  );

  const source = useMemo(() => filteredData.qctasks ?? [], [filteredData.qctasks]);

  const filtered = useMemo(() => {
    return source.filter((qc) => {
      if (statusFilter !== 'all' && qc.qcStatus !== statusFilter) return false;
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      const title = (qc.title ?? getTaskName(qc.parentTaskId ?? '')).toLowerCase();
      const worker = (qc.taskWorker ?? '').toLowerCase();
      const resource = (qc.qcResource ?? '').toLowerCase();
      const charge = (qc.chargeCodeV2 ?? '').toLowerCase();
      return (
        (qc.qcTaskId ?? '').toLowerCase().includes(term) ||
        title.includes(term) ||
        worker.includes(term) ||
        resource.includes(term) ||
        charge.includes(term)
      );
    });
  }, [source, statusFilter, search, getTaskName]);

  const valueGetter = useCallback(
    (qc: QCTask, key: string) => {
      switch (key) {
        case 'qcTaskId':
          return qc.qcTaskId ?? '';
        case 'parentTask':
          return getTaskName(qc.parentTaskId ?? '');
        case 'title':
          return qc.title ?? getTaskName(qc.parentTaskId ?? '') ?? '';
        case 'chargeCodeV2':
          return qc.chargeCodeV2 ?? '';
        case 'taskWorker':
          return qc.taskWorker ?? '';
        case 'qcResource':
          return qc.qcResource ?? '';
        case 'clientReady':
          return qc.clientReady ?? '';
        case 'pctItemsCorrect':
          return qc.pctItemsCorrect ?? qc.qcScore ?? 0;
        case 'itemsSubmitted':
          return qc.itemsSubmitted ?? qc.qcCount ?? 0;
        case 'itemsCorrect':
          return qc.itemsCorrect ?? 0;
        case 'qcUom':
          return qc.qcUOM ?? '';
        case 'qcHours':
          return qc.qcHours ?? 0;
        case 'qcScore':
          return qc.qcScore ?? 0;
        case 'qcCount':
          return qc.qcCount ?? 0;
        case 'qcStatus':
          return qc.qcStatus ?? '';
        case 'notes':
          return qc.notes ?? qc.qcComments ?? '';
        case 'qcGate':
          return qc.qcGate ?? '';
        case 'qcRequestedDate':
          return qc.qcRequestedDate ?? qc.qcStartDate ?? '';
        case 'qcCompleteDate':
          return qc.qcCompleteDate ?? qc.qcEndDate ?? '';
        case 'createdBy':
          return qc.createdBy ?? '';
        case 'modifiedBy':
          return qc.modifiedBy ?? '';
        case 'qcCriticalErrors':
          return qc.qcCriticalErrors ?? 0;
        case 'qcNonCriticalErrors':
          return qc.qcNonCriticalErrors ?? 0;
        default:
          return null;
      }
    },
    [getTaskName]
  );

  const sorted = useMemo(
    () => sortByState(filtered, sort, valueGetter),
    [filtered, sort, valueGetter]
  );

  const statuses = useMemo(
    () => Array.from(new Set(source.map((qc) => qc.qcStatus).filter(Boolean))),
    [source]
  );

  const stats: QCStats = useMemo(() => {
    const tasks = filtered;
    const completed = tasks.filter((t) => t.qcStatus === 'Complete');
    const passed = completed.filter((t) => (t.qcScore ?? 0) >= 80);
    return {
      totalOrders: tasks.length,
      completed: completed.length,
      inProgress: tasks.filter((t) => t.qcStatus === 'In Progress').length,
      pending: tasks.filter((t) => t.qcStatus === 'Not Started').length,
      passRate: completed.length > 0 ? (passed.length / completed.length) * 100 : 100,
      avgScore: tasks.length > 0 ? tasks.reduce((s, t) => s + (t.qcScore ?? 0), 0) / tasks.length : 0,
      totalHours: tasks.reduce((s, t) => s + (t.qcHours ?? 0), 0),
      criticalNC: tasks.reduce((s, t) => s + (t.qcCriticalErrors ?? 0), 0),
      minorNC: tasks.reduce((s, t) => s + (t.qcNonCriticalErrors ?? 0), 0),
    };
  }, [filtered]);

  const saveEdit = useCallback(
    (qcTask: QCTask, field: string, value: string | number) => {
      let parsed: unknown = value;
      if (
        [
          'qcHours',
          'qcScore',
          'qcCount',
          'qcCriticalErrors',
          'qcNonCriticalErrors',
          'itemsSubmitted',
          'itemsCorrect',
          'pctItemsCorrect',
        ].includes(field)
      ) {
        parsed =
          field === 'qcScore' || field === 'pctItemsCorrect' || field === 'qcHours'
            ? Number(value) || 0
            : parseInt(String(value), 10) || 0;
      }
      const updated = (data.qctasks ?? []).map((t) =>
        t.qcTaskId === qcTask.qcTaskId ? { ...t, [field]: parsed } : t
      );
      if (field === 'qcComments') {
        const idx = updated.findIndex((t) => t.qcTaskId === qcTask.qcTaskId);
        if (idx >= 0) (updated[idx] as QCTask & { notes?: string }).notes = String(value);
      }
      updateData({ qctasks: updated });
    },
    [data.qctasks, updateData]
  );

  return {
    sorted,
    filtered,
    source,
    stats,
    statuses,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    sort,
    setSort,
    getTaskName,
    saveEdit,
  };
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

const ORDERS_COLUMNS: { key: string; label: string; align: 'left' | 'center' }[] = [
  { key: 'qcTaskId', label: 'QC Transaction', align: 'left' },
  { key: 'title', label: 'Title', align: 'left' },
  { key: 'chargeCodeV2', label: 'Charge Code V2', align: 'left' },
  { key: 'taskWorker', label: 'Task Worker', align: 'left' },
  { key: 'qcResource', label: 'QC Resource', align: 'left' },
  { key: 'qcStatus', label: 'QC Status', align: 'center' },
  { key: 'clientReady', label: 'Client Ready?', align: 'center' },
  { key: 'pctItemsCorrect', label: 'Pct Items Correct', align: 'center' },
  { key: 'itemsSubmitted', label: 'Items Submitted', align: 'center' },
  { key: 'itemsCorrect', label: 'Items Correct', align: 'center' },
  { key: 'qcUom', label: 'UOM', align: 'center' },
  { key: 'qcScore', label: 'QC Score', align: 'center' },
  { key: 'qcCount', label: 'Count', align: 'center' },
  { key: 'notes', label: 'Notes', align: 'left' },
  { key: 'qcGate', label: 'QC Gate', align: 'left' },
  { key: 'qcRequestedDate', label: 'QC Requested Date', align: 'left' },
  { key: 'qcCompleteDate', label: 'QC Complete Date', align: 'left' },
  { key: 'createdBy', label: 'Created By', align: 'left' },
  { key: 'modifiedBy', label: 'Modified By', align: 'left' },
  { key: 'qcCriticalErrors', label: 'Critical', align: 'center' },
  { key: 'qcNonCriticalErrors', label: 'Non-Critical', align: 'center' },
];

export default function QCLogPage() {
  const [view, setView] = useState<ViewId>('dashboard');
  const [editing, setEditing] = useState<{ taskId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const {
    sorted,
    filtered,
    source,
    stats,
    statuses,
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    sort,
    setSort,
    getTaskName,
    saveEdit,
  } = useQCLogData();

  const startEdit = (taskId: string, field: string, current: unknown) => {
    setEditing({ taskId, field });
    setEditValue(String(current ?? ''));
  };

  const commitEdit = (qc: QCTask) => {
    if (!editing) return;
    const raw = (qc as Record<string, unknown>)[editing.field];
    if (String(raw ?? '') !== editValue) {
      const numFields = [
        'qcHours',
        'qcScore',
        'qcCount',
        'qcCriticalErrors',
        'qcNonCriticalErrors',
        'itemsSubmitted',
        'itemsCorrect',
        'pctItemsCorrect',
      ];
      const final =
        numFields.includes(editing.field) && editing.field !== 'qcComments'
          ? editing.field === 'qcScore' || editing.field === 'pctItemsCorrect' || editing.field === 'qcHours'
            ? parseFloat(editValue) || 0
            : parseInt(editValue, 10) || 0
          : editValue;
      saveEdit(qc, editing.field, final as string | number);
    }
    setEditing(null);
  };

  const tableCellStyle = {
    padding: '8px',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-color)',
  } as const;

  return (
    <div
      className="page-panel full-height-page"
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <header
        style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          flexShrink: 0,
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          QC Log
        </h1>
      </header>

      <div style={{ padding: '1rem 1.5rem', flexShrink: 0 }}>
        <QualitySummary stats={stats} />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '0.5rem 1.5rem',
          background: 'rgba(0,0,0,0.2)',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
        }}
      >
        {VIEWS.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: active ? TEAL : 'transparent',
                color: active ? '#041717' : 'var(--text-primary)',
                fontSize: '0.85rem',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <main
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '1rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          color: 'var(--text-primary)',
        }}
      >
        {/* Dashboard */}
        {view === 'dashboard' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
              <Card title="Score Distribution" subtitle="Tasks by QC score range">
                <ScoreDistributionChart qcTasks={filtered} />
              </Card>
              <Card title="Defect Distribution" subtitle="By severity">
                <DefectPieChart qcTasks={filtered} />
              </Card>
              <Card title="Status Breakdown" subtitle="Tasks by status">
                <StatusBarChart qcTasks={filtered} />
              </Card>
            </div>
            <Card title="Recent Quality Orders" subtitle="Latest inspection results" noPadding>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
                        QC Transaction
                      </th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)' }}>
                        Title
                      </th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                        Score
                      </th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                        Status
                      </th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                        Critical
                      </th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                        Minor
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, 10).map((qc, idx) => (
                      <tr
                        key={qc.qcTaskId}
                        style={{
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <td style={{ ...tableCellStyle, fontFamily: 'monospace', color: TEAL, fontWeight: 500 }}>
                          {qc.qcTaskId}
                        </td>
                        <td
                          style={{
                            ...tableCellStyle,
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {qc.title ?? getTaskName(qc.parentTaskId ?? '')}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                          <ScoreBadge score={qc.qcScore ?? 0} />
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                          <StatusPill status={qc.qcStatus} />
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 600, color: (qc.qcCriticalErrors ?? 0) > 0 ? '#EF4444' : 'var(--text-muted)' }}>
                          {qc.qcCriticalErrors ?? 0}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 600, color: (qc.qcNonCriticalErrors ?? 0) > 0 ? '#F59E0B' : 'var(--text-muted)' }}>
                          {qc.qcNonCriticalErrors ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* Quality Orders */}
        {view === 'orders' && (
          <>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'center',
                flexWrap: 'wrap',
                padding: '0.75rem 1rem',
                background: 'var(--bg-secondary)',
                borderRadius: 10,
                border: '1px solid var(--border-color)',
              }}
            >
              <input
                type="text"
                placeholder="Search QC Transaction, Title, Task Worker..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: '1 1 200px',
                  maxWidth: 280,
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.9rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                }}
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.9rem',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  minWidth: 140,
                }}
              >
                <option value="all">All Status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary)',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 6,
                }}
              >
                {filtered.length} of {source.length} orders
              </span>
            </div>

            <Card title="Quality Orders (QC Log)" headerRight={<span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Click cells to edit</span>} noPadding>
              <div style={{ overflow: 'auto', flex: 1 }}>
                <table style={{ width: '100%', minWidth: 1600, borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      {ORDERS_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          style={{
                            ...tableCellStyle,
                            textAlign: col.align,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            position: 'sticky',
                            top: 0,
                            background: 'var(--bg-secondary)',
                            zIndex: 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSort((prev) => getNextSortState(prev, col.key))}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              color: 'inherit',
                              cursor: 'pointer',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {col.label}
                            {formatSortIndicator(sort, col.key) && (
                              <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                                {formatSortIndicator(sort, col.key)}
                              </span>
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((qc, idx) => (
                      <tr
                        key={qc.qcTaskId}
                        style={{
                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <td style={{ ...tableCellStyle, fontFamily: 'monospace', color: TEAL, fontWeight: 500 }}>
                          {qc.qcTaskId}
                        </td>
                        <td
                          style={{
                            ...tableCellStyle,
                            maxWidth: 180,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={qc.title ?? ''}
                        >
                          {qc.title ?? getTaskName(qc.parentTaskId ?? '') ?? '—'}
                        </td>
                        <td style={{ ...tableCellStyle, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {qc.chargeCodeV2 ?? '—'}
                        </td>
                        <td style={tableCellStyle}>{qc.taskWorker ?? '—'}</td>
                        <td style={tableCellStyle}>{qc.qcResource ?? '—'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'center', cursor: 'pointer' }}>
                          {editing?.taskId === qc.qcTaskId && editing?.field === 'qcStatus' ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(qc)}
                              autoFocus
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.85rem',
                                background: 'var(--bg-tertiary)',
                                border: '2px solid var(--pinnacle-teal)',
                                borderRadius: 4,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {statuses.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span onClick={() => startEdit(qc.qcTaskId, 'qcStatus', qc.qcStatus)}>
                              <StatusPill status={qc.qcStatus} />
                            </span>
                          )}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'center' }}>{qc.clientReady ?? '—'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'center' }}>{qc.pctItemsCorrect ?? '—'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'center' }}>{qc.itemsSubmitted ?? qc.qcCount ?? '—'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'center' }}>{qc.itemsCorrect ?? '—'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'center' }}>{qc.qcUOM ?? 'Item'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'center', cursor: 'pointer' }}>
                          {editing?.taskId === qc.qcTaskId && editing?.field === 'qcScore' ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(qc)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit(qc);
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              autoFocus
                              style={{
                                width: 52,
                                padding: 4,
                                fontSize: '0.85rem',
                                background: 'var(--bg-tertiary)',
                                border: '2px solid var(--pinnacle-teal)',
                                borderRadius: 4,
                                color: 'var(--text-primary)',
                                textAlign: 'center',
                              }}
                            />
                          ) : (
                            <span onClick={() => startEdit(qc.qcTaskId, 'qcScore', qc.qcScore)}>
                              <ScoreBadge score={qc.qcScore ?? 0} />
                            </span>
                          )}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'center' }}>{qc.qcCount ?? '—'}</td>
                        <td
                          style={{
                            ...tableCellStyle,
                            cursor: 'pointer',
                            maxWidth: 140,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={qc.notes ?? qc.qcComments ?? ''}
                        >
                          {editing?.taskId === qc.qcTaskId && editing?.field === 'qcComments' ? (
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(qc)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit(qc);
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              autoFocus
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                fontSize: '0.85rem',
                                background: 'var(--bg-tertiary)',
                                border: '2px solid var(--pinnacle-teal)',
                                borderRadius: 4,
                                color: 'var(--text-primary)',
                              }}
                            />
                          ) : (
                            <span onClick={() => startEdit(qc.qcTaskId, 'qcComments', qc.notes ?? qc.qcComments)}>
                              {qc.notes ?? qc.qcComments ?? '—'}
                            </span>
                          )}
                        </td>
                        <td style={tableCellStyle}>{qc.qcGate ?? '—'}</td>
                        <td style={{ ...tableCellStyle, color: 'var(--text-muted)' }}>
                          {fmtDate(qc.qcRequestedDate ?? undefined)}
                        </td>
                        <td style={{ ...tableCellStyle, color: 'var(--text-muted)' }}>
                          {fmtDate(qc.qcCompleteDate ?? qc.qcEndDate ?? undefined)}
                        </td>
                        <td style={{ ...tableCellStyle, color: 'var(--text-muted)' }}>{qc.createdBy ?? '—'}</td>
                        <td style={{ ...tableCellStyle, color: 'var(--text-muted)' }}>{qc.modifiedBy ?? '—'}</td>
                        <td style={{ ...tableCellStyle, textAlign: 'center', cursor: 'pointer', fontWeight: 600, color: (qc.qcCriticalErrors ?? 0) > 0 ? '#EF4444' : 'var(--text-muted)' }}>
                          {editing?.taskId === qc.qcTaskId && editing?.field === 'qcCriticalErrors' ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(qc)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit(qc);
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              autoFocus
                              style={{
                                width: 44,
                                padding: 4,
                                fontSize: '0.85rem',
                                background: 'var(--bg-tertiary)',
                                border: '2px solid var(--pinnacle-teal)',
                                borderRadius: 4,
                                color: 'var(--text-primary)',
                                textAlign: 'center',
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(qc.qcTaskId, 'qcCriticalErrors', qc.qcCriticalErrors)}
                              style={{
                                background: (qc.qcCriticalErrors ?? 0) > 0 ? 'rgba(239,68,68,0.15)' : 'transparent',
                                padding: '2px 8px',
                                borderRadius: 8,
                              }}
                            >
                              {qc.qcCriticalErrors ?? 0}
                            </span>
                          )}
                        </td>
                        <td style={{ ...tableCellStyle, textAlign: 'center', cursor: 'pointer', fontWeight: 600, color: (qc.qcNonCriticalErrors ?? 0) > 0 ? '#F59E0B' : 'var(--text-muted)' }}>
                          {editing?.taskId === qc.qcTaskId && editing?.field === 'qcNonCriticalErrors' ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit(qc)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit(qc);
                                if (e.key === 'Escape') setEditing(null);
                              }}
                              autoFocus
                              style={{
                                width: 44,
                                padding: 4,
                                fontSize: '0.85rem',
                                background: 'var(--bg-tertiary)',
                                border: '2px solid var(--pinnacle-teal)',
                                borderRadius: 4,
                                color: 'var(--text-primary)',
                                textAlign: 'center',
                              }}
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(qc.qcTaskId, 'qcNonCriticalErrors', qc.qcNonCriticalErrors)}
                              style={{
                                background: (qc.qcNonCriticalErrors ?? 0) > 0 ? 'rgba(245,158,11,0.15)' : 'transparent',
                                padding: '2px 8px',
                                borderRadius: 8,
                              }}
                            >
                              {qc.qcNonCriticalErrors ?? 0}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {sorted.length === 0 && (
                      <tr>
                        <td
                          colSpan={ORDERS_COLUMNS.length}
                          style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}
                        >
                          No quality orders found. Data is loaded from the backend.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* Non-conformance */}
        {view === 'nonconformance' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {[
                { label: 'Critical Errors', value: stats.criticalNC, color: '#EF4444' },
                { label: 'Non-Critical Errors', value: stats.minorNC, color: '#F59E0B' },
                { label: 'Total Issues', value: stats.criticalNC + stats.minorNC, color: '#8B5CF6' },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: `${item.color}10`,
                    borderRadius: 12,
                    padding: '1.25rem',
                    border: `1px solid ${item.color}30`,
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            <Card title="Tasks with Errors" subtitle="Quality issues by task" noPadding>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)' }}>QC Transaction</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)' }}>Title</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>Critical</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>Non-Critical</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>Score</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted
                      .filter((q) => (q.qcCriticalErrors ?? 0) > 0 || (q.qcNonCriticalErrors ?? 0) > 0)
                      .map((qc, idx) => (
                        <tr
                          key={qc.qcTaskId}
                          style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                        >
                          <td
                            style={{
                              ...tableCellStyle,
                              fontFamily: 'monospace',
                              fontWeight: 500,
                              color: (qc.qcCriticalErrors ?? 0) > 0 ? '#EF4444' : '#F59E0B',
                            }}
                          >
                            {qc.qcTaskId}
                          </td>
                          <td style={{ ...tableCellStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {qc.title ?? getTaskName(qc.parentTaskId ?? '')}
                          </td>
                          <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 600 }}>{qc.qcCriticalErrors ?? 0}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 600 }}>{qc.qcNonCriticalErrors ?? 0}</td>
                          <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                            <ScoreBadge score={qc.qcScore ?? 0} />
                          </td>
                          <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                            <StatusPill status={qc.qcStatus} />
                          </td>
                        </tr>
                      ))}
                    {sorted.filter((q) => (q.qcCriticalErrors ?? 0) > 0 || (q.qcNonCriticalErrors ?? 0) > 0).length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          No tasks with errors
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* CAPA */}
        {view === 'capa' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {[
                {
                  label: 'Tasks Needing Action',
                  value: sorted.filter((q) => (q.qcCriticalErrors ?? 0) > 0 || (q.qcScore ?? 0) < 80).length,
                  color: '#EF4444',
                },
                {
                  label: 'Tasks with Low Score',
                  value: sorted.filter((q) => (q.qcScore ?? 0) < 80 && (q.qcScore ?? 0) > 0).length,
                  color: '#F59E0B',
                },
                {
                  label: 'Pending QC',
                  value: sorted.filter((q) => q.qcStatus === 'Not Started').length,
                  color: '#6B7280',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: `${item.color}10`,
                    borderRadius: 12,
                    padding: '1.25rem',
                    border: `1px solid ${item.color}30`,
                  }}
                >
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
            <Card title="Tasks Requiring Corrective Action" subtitle="Critical errors or score below 80%" noPadding>
              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)' }}>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)' }}>QC Transaction</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)' }}>Title</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>Score</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>Critical Errors</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>Status</th>
                      <th style={{ ...tableCellStyle, fontWeight: 600, color: 'var(--text-primary)' }}>Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted
                      .filter((q) => (q.qcCriticalErrors ?? 0) > 0 || ((q.qcScore ?? 0) < 80 && (q.qcScore ?? 0) > 0))
                      .map((qc, idx) => {
                        const hasCritical = (qc.qcCriticalErrors ?? 0) > 0;
                        const issue = hasCritical ? 'Critical errors found' : 'Score below 80%';
                        return (
                          <tr
                            key={qc.qcTaskId}
                            style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
                          >
                            <td style={{ ...tableCellStyle, fontFamily: 'monospace', color: '#8B5CF6', fontWeight: 500 }}>
                              {qc.qcTaskId}
                            </td>
                            <td style={{ ...tableCellStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {qc.title ?? getTaskName(qc.parentTaskId ?? '')}
                            </td>
                            <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                              <ScoreBadge score={qc.qcScore ?? 0} />
                            </td>
                            <td style={{ ...tableCellStyle, textAlign: 'center', fontWeight: 600, color: hasCritical ? '#EF4444' : 'var(--text-muted)' }}>
                              {qc.qcCriticalErrors ?? 0}
                            </td>
                            <td style={{ ...tableCellStyle, textAlign: 'center' }}>
                              <StatusPill status={qc.qcStatus} />
                            </td>
                            <td style={{ ...tableCellStyle, color: hasCritical ? '#EF4444' : '#F59E0B', fontSize: '0.85rem' }}>
                              {issue}
                            </td>
                          </tr>
                        );
                      })}
                    {sorted.filter((q) => (q.qcCriticalErrors ?? 0) > 0 || ((q.qcScore ?? 0) < 80 && (q.qcScore ?? 0) > 0)).length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                          No tasks requiring corrective action
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
