'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from '@/components/charts/ChartWrapper';
import ContainerLoader from '@/components/ui/ContainerLoader';
import { useData } from '@/lib/data-context';
import MosGlideTable from './components/MosGlideTable';
import type { MoPeriodNote, MoPeriodGranularity, MoPeriodNoteType } from '@/types/data';

const C = {
  text: '#f4f4f5',
  muted: '#a1a1aa',
  panel: '#18181b',
  border: '#3f3f46',
  teal: '#10B981',
  blue: '#3B82F6',
  amber: '#F59E0B',
  red: '#EF4444',
  green: '#22C55E',
  slate: '#64748B',
};

const TT = {
  trigger: 'axis' as const,
  axisPointer: { type: 'shadow' as const },
  backgroundColor: 'rgba(15,15,18,0.96)',
  borderColor: 'rgba(63,63,70,0.9)',
  borderWidth: 1,
  textStyle: { color: '#f4f4f5', fontSize: 12 },
  extraCssText: 'z-index:99999!important;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);',
  appendToBody: true,
  confine: false,
};

type Tab = 'dashboard' | 'qa';
type CommentEntity = 'tasks' | 'units' | 'phases' | 'subTasks';

type MilestoneBucket =
  | 'Completed On Time'
  | 'Completed Delayed'
  | 'In Progress Forecasted On Time'
  | 'In Progress Forecasted Delayed'
  | 'Not Started Forecasted On Time'
  | 'Not Started Forecasted Delayed';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const parseDate = (v: unknown): Date | null => {
  const dt = new Date(String(v || ''));
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const normalizeTaskId = (v: unknown): string => String(v || '').trim().replace(/^wbs-(task|sub_task)-/i, '');
const toISODate = (d: Date) => d.toISOString().slice(0, 10);
const fmtDate = (v: unknown) => {
  const d = parseDate(v);
  return d ? d.toLocaleDateString() : '-';
};

function firstDayOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastDayOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function firstDayOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}
function lastDayOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3 + 3, 0);
}

function derivePeriods(dateFilter: any): {
  granularity: MoPeriodGranularity;
  currentStart: string;
  currentEnd: string;
  lastStart: string;
  lastEnd: string;
} {
  const now = new Date();
  let granularity: MoPeriodGranularity = 'month';
  let currentStart: Date;
  let currentEnd: Date;

  if (dateFilter?.type === 'quarter') {
    granularity = 'quarter';
    currentStart = firstDayOfQuarter(now);
    currentEnd = lastDayOfQuarter(now);
  } else if (dateFilter?.type === 'custom' && dateFilter?.from && dateFilter?.to) {
    granularity = 'month';
    currentStart = parseDate(dateFilter.from) || firstDayOfMonth(now);
    currentEnd = parseDate(dateFilter.to) || lastDayOfMonth(now);
  } else {
    granularity = 'month';
    currentStart = firstDayOfMonth(now);
    currentEnd = lastDayOfMonth(now);
  }

  const durationDays = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000) + 1);
  const lastEnd = new Date(currentStart.getTime() - 86400000);
  const lastStart = new Date(lastEnd.getTime() - (durationDays - 1) * 86400000);

  return {
    granularity,
    currentStart: toISODate(currentStart),
    currentEnd: toISODate(currentEnd),
    lastStart: toISODate(lastStart),
    lastEnd: toISODate(lastEnd),
  };
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem' }}>
      <h3 style={{ margin: 0, color: C.text, fontSize: '1rem' }}>{title}</h3>
      <p style={{ margin: '0.5rem 0 0', color: C.muted, fontSize: '0.82rem' }}>{body}</p>
    </div>
  );
}

export default function MosPage() {
  const { filteredData, isLoading, hierarchyFilter, dateFilter, updateData, refreshData } = useData();

  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedChargeCode, setSelectedChargeCode] = useState<string>('');
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [selectedMilestoneBucket, setSelectedMilestoneBucket] = useState<MilestoneBucket>('Completed On Time');
  const [entityType, setEntityType] = useState<CommentEntity>('tasks');
  const [selectedCommentEntityId, setSelectedCommentEntityId] = useState<string>('');
  const [commentDraft, setCommentDraft] = useState<string>('');
  const [isSavingComments, setIsSavingComments] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const periods = useMemo(() => derivePeriods(dateFilter), [dateFilter]);

  const portfolios = (filteredData.portfolios || []) as any[];
  const customers = (filteredData.customers || []) as any[];
  const sites = (filteredData.sites || []) as any[];
  const projects = (filteredData.projects || []) as any[];
  const units = (filteredData.units || []) as any[];
  const phases = (filteredData.phases || []) as any[];
  const tasks = (filteredData.tasks || []) as any[];
  const subTasks = (filteredData.subTasks || []) as any[];
  const milestones = ([...(filteredData.milestones || []), ...(filteredData.milestonesTable || [])] as any[]);
  const hours = (filteredData.hours || []) as any[];
  const moPeriodNotes = (filteredData.moPeriodNotes || []) as MoPeriodNote[];

  const projectById = useMemo(() => {
    const map = new Map<string, any>();
    projects.forEach((p) => map.set(String(p.id || p.projectId), p));
    return map;
  }, [projects]);

  const siteById = useMemo(() => {
    const map = new Map<string, any>();
    sites.forEach((s) => map.set(String(s.id || s.siteId), s));
    return map;
  }, [sites]);

  const customerById = useMemo(() => {
    const map = new Map<string, any>();
    customers.forEach((c) => map.set(String(c.id || c.customerId), c));
    return map;
  }, [customers]);

  const portfolioById = useMemo(() => {
    const map = new Map<string, any>();
    portfolios.forEach((p) => map.set(String(p.id || p.portfolioId), p));
    return map;
  }, [portfolios]);

  const taskById = useMemo(() => {
    const map = new Map<string, any>();
    tasks.forEach((t) => map.set(normalizeTaskId(t.id || t.taskId), t));
    return map;
  }, [tasks]);

  const taskActualHours = useMemo(() => {
    const map = new Map<string, number>();
    hours.forEach((h) => {
      const tid = normalizeTaskId(h.taskId || h.task_id);
      if (!tid) return;
      map.set(tid, (map.get(tid) || 0) + num(h.hours));
    });
    return map;
  }, [hours]);

  const taskEfficiencyRows = useMemo(() => {
    const rows = tasks.map((t) => {
      const id = normalizeTaskId(t.id || t.taskId);
      const baseline = num(t.baselineHours || t.baseline_hours || t.projectedHours || t.projected_hours);
      const actual = taskActualHours.get(id) ?? num(t.actualHours || t.actual_hours);
      const added = Math.max(0, actual - baseline);
      return {
        id,
        name: String(t.taskName || t.name || id),
        baseline,
        actual,
        added,
        comments: String(t.comments || ''),
      };
    }).filter((r) => r.id && (r.baseline > 0 || r.actual > 0));
    rows.sort((a, b) => (b.actual + b.baseline) - (a.actual + a.baseline));
    return rows.slice(0, 50);
  }, [tasks, taskActualHours]);

  useEffect(() => {
    if (!selectedTaskId && taskEfficiencyRows.length > 0) {
      setSelectedTaskId(taskEfficiencyRows[0].id);
    }
  }, [selectedTaskId, taskEfficiencyRows]);

  const selectedTask = useMemo(() => taskById.get(normalizeTaskId(selectedTaskId)), [taskById, selectedTaskId]);

  const hierarchyBucketLevel = useMemo(() => {
    const path = hierarchyFilter?.path || [];
    if (!path[0]) return 'portfolio';
    if (!path[1]) return 'customer';
    if (!path[2]) return 'site';
    if (!path[3]) return 'project';
    return 'unit';
  }, [hierarchyFilter]);

  const getHourBucket = (h: any): string => {
    const pid = String(h.projectId || h.project_id || '');
    const project = projectById.get(pid);
    if (!project) return 'Unassigned';
    if (hierarchyBucketLevel === 'project') return String(project.name || project.projectName || pid);

    const siteId = String(project.siteId || project.site_id || '');
    const site = siteById.get(siteId);
    if (hierarchyBucketLevel === 'site') return String(site?.name || 'Unassigned');

    const customerId = String(site?.customerId || site?.customer_id || '');
    const customer = customerById.get(customerId);
    if (hierarchyBucketLevel === 'customer') return String(customer?.name || 'Unassigned');

    const portfolioId = String(customer?.portfolioId || customer?.portfolio_id || '');
    const portfolio = portfolioById.get(portfolioId);
    if (hierarchyBucketLevel === 'portfolio') return String(portfolio?.name || 'Unassigned');

    const taskId = normalizeTaskId(h.taskId || h.task_id);
    const task = taskById.get(taskId);
    const unitId = String(task?.unitId || task?.unit_id || '');
    const unit = units.find((u: any) => String(u.id || u.unitId) === unitId);
    return String(unit?.name || 'Unassigned');
  };

  const isExcludedCode = (h: any) => {
    const code = String(h.chargeCode || h.charge_code || '').toUpperCase().trim();
    const chargeType = String(h.chargeType || h.charge_type || '').toUpperCase().trim();
    return code === 'EX' || code === 'QC' || chargeType === 'EX' || chargeType === 'QC';
  };

  const hoursForPie = useMemo(() => {
    return hours.filter((h) => {
      if (isExcludedCode(h)) return false;
      if (selectedChargeCode && String(h.chargeCode || h.charge_code || '') !== selectedChargeCode) return false;
      if (selectedBucket && getHourBucket(h) !== selectedBucket) return false;
      return true;
    });
  }, [hours, selectedChargeCode, selectedBucket, hierarchyBucketLevel, projectById, siteById, customerById, portfolioById, taskById, units]);

  const milestoneRows = useMemo(() => {
    return milestones.map((m, idx) => {
      const status = String(m.status || '').toLowerCase();
      const pct = num(m.percentComplete || m.percent_complete);
      const baselineStart = parseDate(m.baselineStartDate || m.baseline_start_date || m.plannedStartDate || m.planned_start_date);
      const baselineEnd = parseDate(m.baselineEndDate || m.baseline_end_date || m.plannedDate || m.planned_date);
      const actualStart = parseDate(m.actualStartDate || m.actual_start_date);
      const actualEnd = parseDate(m.actualEndDate || m.actual_end_date || m.actualDate || m.actual_date);
      const forecastEnd = parseDate(m.forecastedDate || m.forecasted_date || m.endDate || m.end_date);
      const delayed = Boolean(baselineEnd && ((actualEnd && actualEnd > baselineEnd) || (forecastEnd && forecastEnd > baselineEnd)));

      const isCompleted = status.includes('complete') || Boolean(actualEnd) || pct >= 100;
      const isNotStarted = status.includes('not') || pct === 0;

      let bucket: MilestoneBucket;
      if (isCompleted) {
        bucket = delayed ? 'Completed Delayed' : 'Completed On Time';
      } else if (isNotStarted) {
        bucket = delayed ? 'Not Started Forecasted Delayed' : 'Not Started Forecasted On Time';
      } else {
        bucket = delayed ? 'In Progress Forecasted Delayed' : 'In Progress Forecasted On Time';
      }

      return {
        key: String(m.id || m.milestoneId || `m-${idx}`),
        name: String(m.milestoneName || m.name || m.title || m.id || ''),
        status: String(m.status || '-'),
        bucket,
        baselineStart,
        baselineEnd,
        actualStart,
        actualEnd,
        forecastEnd,
      };
    }).filter((r) => r.name);
  }, [milestones]);

  const milestoneSummary = useMemo(() => {
    const base = {
      'Completed On Time': 0,
      'Completed Delayed': 0,
      'In Progress Forecasted On Time': 0,
      'In Progress Forecasted Delayed': 0,
      'Not Started Forecasted On Time': 0,
      'Not Started Forecasted Delayed': 0,
    } as Record<MilestoneBucket, number>;
    milestoneRows.forEach((r) => { base[r.bucket] += 1; });
    return base;
  }, [milestoneRows]);

  const periodHours = useMemo(() => {
    const plan = taskEfficiencyRows.reduce((s, r) => s + r.baseline, 0);
    const actual = taskEfficiencyRows.reduce((s, r) => s + r.actual, 0);
    const added = Math.max(0, actual - plan);
    const reduced = Math.max(0, plan - actual);
    const efficiency = plan > 0 ? Math.round((Math.min(plan, actual) / plan) * 100) : 0;
    const deltaHours = actual - plan;
    const deltaPct = plan > 0 ? (deltaHours / plan) * 100 : 0;
    return { plan, actual, added, reduced, efficiency, deltaHours, deltaPct, fte: added / 160 };
  }, [taskEfficiencyRows]);

  const taskEfficiencyOption: EChartsOption = useMemo(() => {
    const top = taskEfficiencyRows.slice(0, 20);
    if (!top.length) return {};
    return {
      tooltip: TT,
      legend: { top: 0, textStyle: { color: C.muted } },
      grid: { left: 220, right: 20, top: 30, bottom: 30, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
      yAxis: { type: 'category', data: top.map((r) => r.name), axisLabel: { color: C.text, width: 210, overflow: 'truncate' } },
      series: [
        { type: 'bar', name: 'Baseline', data: top.map((r) => ({ value: r.baseline, itemStyle: { color: '#3B82F6' } })) },
        { type: 'bar', name: 'Actual', data: top.map((r) => ({ value: r.actual, itemStyle: { color: '#22C55E' } })) },
        { type: 'bar', name: 'Added Hours', data: top.map((r) => ({ value: r.added, itemStyle: { color: '#F59E0B' } })) },
      ],
    };
  }, [taskEfficiencyRows]);

  const taskChargeCodeRows = useMemo(() => {
    if (!selectedTaskId) return [] as Array<{ code: string; hours: number }>;
    const selected = normalizeTaskId(selectedTaskId);
    const map = new Map<string, number>();
    hours.forEach((h) => {
      if (normalizeTaskId(h.taskId || h.task_id) !== selected) return;
      const code = String(h.chargeCode || h.charge_code || h.chargeType || h.charge_type || 'Uncoded');
      map.set(code, (map.get(code) || 0) + num(h.hours));
    });
    return Array.from(map.entries()).map(([code, value]) => ({ code, hours: value })).sort((a, b) => b.hours - a.hours);
  }, [hours, selectedTaskId]);

  const lifecycleOption: EChartsOption = useMemo(() => {
    if (!taskChargeCodeRows.length) return {};
    return {
      tooltip: { ...TT, trigger: 'item' },
      grid: { left: 50, right: 20, top: 20, bottom: 50, containLabel: true },
      xAxis: { type: 'category', data: taskChargeCodeRows.map((r) => r.code), axisLabel: { color: C.muted, interval: 0, rotate: 25 } },
      yAxis: { type: 'value', axisLabel: { color: C.muted }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
      series: [{ type: 'bar', name: 'Hours', data: taskChargeCodeRows.map((r) => ({ value: r.hours, itemStyle: { color: selectedChargeCode && selectedChargeCode !== r.code ? 'rgba(100,100,100,0.35)' : C.blue } })) }],
    };
  }, [taskChargeCodeRows, selectedChargeCode]);

  const pieRows = useMemo(() => {
    const map = new Map<string, number>();
    hoursForPie.forEach((h) => {
      const bucket = getHourBucket(h);
      map.set(bucket, (map.get(bucket) || 0) + num(h.hours));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [hoursForPie, hierarchyBucketLevel]);

  const pieOption: EChartsOption = useMemo(() => {
    if (!pieRows.length) return {};
    return {
      tooltip: { ...TT, trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: C.muted } },
      series: [{ type: 'pie', radius: ['35%', '72%'], center: ['50%', '48%'], data: pieRows.map((r) => ({ ...r, itemStyle: { opacity: selectedBucket && selectedBucket !== r.name ? 0.35 : 1 } })), label: { color: C.text } }],
    };
  }, [pieRows, selectedBucket]);

  const milestoneBuckets: Array<{ label: MilestoneBucket; value: number; color: string }> = [
    { label: 'Completed On Time', value: milestoneSummary['Completed On Time'], color: '#22C55E' },
    { label: 'Completed Delayed', value: milestoneSummary['Completed Delayed'], color: '#EF4444' },
    { label: 'In Progress Forecasted On Time', value: milestoneSummary['In Progress Forecasted On Time'], color: '#14B8A6' },
    { label: 'In Progress Forecasted Delayed', value: milestoneSummary['In Progress Forecasted Delayed'], color: '#F59E0B' },
    { label: 'Not Started Forecasted On Time', value: milestoneSummary['Not Started Forecasted On Time'], color: '#3B82F6' },
    { label: 'Not Started Forecasted Delayed', value: milestoneSummary['Not Started Forecasted Delayed'], color: '#A855F7' },
  ];

  const milestoneChartOption: EChartsOption = useMemo(() => {
    return {
      tooltip: TT,
      grid: { left: 230, right: 20, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: C.muted } },
      yAxis: { type: 'category', data: milestoneBuckets.map((c) => c.label), axisLabel: { color: C.text, width: 220, overflow: 'truncate' } },
      series: [{ type: 'bar', data: milestoneBuckets.map((c) => ({ value: c.value, itemStyle: { color: c.color } })) }],
    };
  }, [milestoneBuckets]);

  const milestoneDrillRows = useMemo(() => {
    return milestoneRows
      .filter((r) => r.bucket === selectedMilestoneBucket)
      .map((r) => [
        r.name,
        r.status,
        fmtDate(r.baselineStart),
        fmtDate(r.baselineEnd),
        fmtDate(r.actualStart),
        fmtDate(r.actualEnd),
        fmtDate(r.forecastEnd),
      ]);
  }, [milestoneRows, selectedMilestoneBucket]);

  const noteScope = useMemo(() => {
    const byName = (arr: any[], name: string) => arr.find((x) => String(x.name || '') === name);
    const path = hierarchyFilter?.path || [];
    const portfolioId = hierarchyFilter?.portfolio || (path[0] ? String(byName(portfolios, path[0])?.id || '') : '');
    const customerId = hierarchyFilter?.customer || (path[1] ? String(byName(customers, path[1])?.id || '') : '');
    const siteId = hierarchyFilter?.site || (path[2] ? String(byName(sites, path[2])?.id || '') : '');
    const projectId = hierarchyFilter?.project || (path[3] ? String(byName(projects, path[3])?.id || '') : '');
    return { portfolioId: portfolioId || null, customerId: customerId || null, siteId: siteId || null, projectId: projectId || null };
  }, [hierarchyFilter, portfolios, customers, sites, projects]);

  const isSameScope = (n: any) => {
    const pid = n.projectId || n.project_id || null;
    const sid = n.siteId || n.site_id || null;
    const cid = n.customerId || n.customer_id || null;
    const pfid = n.portfolioId || n.portfolio_id || null;
    return pid === noteScope.projectId && sid === noteScope.siteId && cid === noteScope.customerId && pfid === noteScope.portfolioId;
  };

  const scopedNotes = useMemo(() => moPeriodNotes.filter((n: any) => isSameScope(n)), [moPeriodNotes, noteScope]);

  const [lastCommitmentsDraft, setLastCommitmentsDraft] = useState('');
  const [thisCommitmentsDraft, setThisCommitmentsDraft] = useState('');
  const [hoursCommentsDraft, setHoursCommentsDraft] = useState('');

  useEffect(() => {
    const getContent = (type: MoPeriodNoteType, start: string, end: string) => {
      const row = scopedNotes.find((n: any) => (n.noteType || n.note_type) === type && (n.periodStart || n.period_start) === start && (n.periodEnd || n.period_end) === end);
      return String(row?.content || '');
    };

    setLastCommitmentsDraft(getContent('last_commitment', periods.lastStart, periods.lastEnd));
    setThisCommitmentsDraft(getContent('this_commitment', periods.currentStart, periods.currentEnd));
    setHoursCommentsDraft(getContent('hours_comment', periods.currentStart, periods.currentEnd));
  }, [scopedNotes, periods]);

  const upsertNote = async (type: MoPeriodNoteType, content: string, periodStart: string, periodEnd: string) => {
    const existing = scopedNotes.find((n: any) => (n.noteType || n.note_type) === type && (n.periodStart || n.period_start) === periodStart && (n.periodEnd || n.period_end) === periodEnd);
    const record: MoPeriodNote = {
      id: existing?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `monote-${Date.now()}-${type}`),
      noteType: type,
      periodGranularity: periods.granularity,
      periodStart,
      periodEnd,
      portfolioId: noteScope.portfolioId,
      customerId: noteScope.customerId,
      siteId: noteScope.siteId,
      projectId: noteScope.projectId,
      content,
      sortOrder: 0,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    const res = await fetch('/api/data/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataKey: 'moPeriodNotes', records: [record] }),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || `Failed to save ${type}`);
    return record;
  };

  const saveAllNotes = async () => {
    setIsSavingNotes(true);
    try {
      const savedLast = await upsertNote('last_commitment', lastCommitmentsDraft, periods.lastStart, periods.lastEnd);
      const savedThis = await upsertNote('this_commitment', thisCommitmentsDraft, periods.currentStart, periods.currentEnd);
      const savedHours = await upsertNote('hours_comment', hoursCommentsDraft, periods.currentStart, periods.currentEnd);

      const remaining = moPeriodNotes.filter((n: any) => {
        const t = n.noteType || n.note_type;
        const ps = n.periodStart || n.period_start;
        const pe = n.periodEnd || n.period_end;
        if (t === 'last_commitment' && ps === periods.lastStart && pe === periods.lastEnd && isSameScope(n)) return false;
        if ((t === 'this_commitment' || t === 'hours_comment') && ps === periods.currentStart && pe === periods.currentEnd && isSameScope(n)) return false;
        return true;
      });

      updateData({ moPeriodNotes: [...remaining, savedLast, savedThis, savedHours] as any });
    } finally {
      setIsSavingNotes(false);
    }
  };

  const commentEntities = useMemo(() => {
    const src = entityType === 'tasks' ? tasks : entityType === 'units' ? units : entityType === 'phases' ? phases : subTasks;
    return src
      .map((r: any) => ({ id: String(r.id || r.taskId || r.unitId || r.phaseId || ''), name: String(r.taskName || r.name || ''), comments: String(r.comments || '') }))
      .filter((r: any) => r.id && r.name)
      .slice(0, 200);
  }, [entityType, tasks, units, phases, subTasks]);

  const saveComment = async () => {
    if (!selectedCommentEntityId) return;
    setIsSavingComments(true);
    try {
      const dataKey = entityType === 'subTasks' ? 'tasks' : entityType;
      const res = await fetch('/api/data/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataKey, operation: 'update', records: [{ id: selectedCommentEntityId, comments: commentDraft }] }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to save comment');
      await refreshData();
    } finally {
      setIsSavingComments(false);
    }
  };

  const clearCrossFilters = () => {
    setSelectedChargeCode('');
    setSelectedBucket('');
  };

  if (isLoading) {
    return (
      <div className="page-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <ContainerLoader message="Loading Mo's Page..." minHeight={220} />
      </div>
    );
  }

  const hasAnyData = milestones.length > 0 || taskEfficiencyRows.length > 0 || hours.length > 0;

  return (
    <div style={{ minHeight: 'calc(100vh - 90px)', padding: '1rem 1.1rem 2rem', display: 'grid', gap: '0.8rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: C.text, fontSize: '1.65rem', fontWeight: 900 }}>Mo&apos;s Page</h1>
          <p style={{ margin: '0.3rem 0 0', color: C.muted, fontSize: '0.8rem' }}>Dashboard is DB-backed only and respects global hierarchy/time filters.</p>
        </div>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', height: 36 }}>
          <button onClick={() => setTab('dashboard')} style={{ background: tab === 'dashboard' ? 'rgba(16,185,129,0.2)' : 'transparent', color: C.text, border: 'none', padding: '0 0.9rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>Dashboard</button>
          <button onClick={() => setTab('qa')} style={{ background: tab === 'qa' ? 'rgba(16,185,129,0.2)' : 'transparent', color: C.text, border: 'none', padding: '0 0.9rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>Q&A</button>
        </div>
      </header>

      {tab === 'dashboard' ? (
        <>
          {!hasAnyData && <EmptyState title="No dashboard data in scope" body="No records matched the current global hierarchy/time filters. Import or edit data in Data Management, then refresh this page." />}

          <section style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1.2fr 1fr' }}>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem', display: 'grid', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, color: C.text, fontSize: '0.95rem' }}>Milestones</h3>
              <ChartWrapper
                option={milestoneChartOption}
                height={280}
                onClick={(p) => {
                  if (!p.name) return;
                  setSelectedMilestoneBucket(String(p.name) as MilestoneBucket);
                }}
              />
              <MosGlideTable
                columns={['Section', 'Count']}
                rows={milestoneBuckets.map((b) => [b.label, b.value])}
                height={180}
                onRowClick={(row) => setSelectedMilestoneBucket(milestoneBuckets[row]?.label || 'Completed On Time')}
              />
              <div style={{ color: C.muted, fontSize: '0.75rem' }}>Drilldown: {selectedMilestoneBucket}</div>
              <MosGlideTable
                columns={['Milestone', 'Status', 'BL Start', 'BL Finish', 'Actual Start', 'Actual Finish', 'Forecast Finish']}
                rows={milestoneDrillRows}
                height={260}
              />
            </div>

            <div style={{ display: 'grid', gap: '0.8rem' }}>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', color: C.text, fontSize: '0.9rem' }}>Last period commitments</h3>
                <textarea value={lastCommitmentsDraft} onChange={(e) => setLastCommitmentsDraft(e.target.value)} rows={6} style={{ width: '100%', background: 'rgba(0,0,0,0.35)', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.45rem' }} />
              </div>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem' }}>
                <h3 style={{ margin: '0 0 0.5rem', color: C.text, fontSize: '0.9rem' }}>This period commitments</h3>
                <textarea value={thisCommitmentsDraft} onChange={(e) => setThisCommitmentsDraft(e.target.value)} rows={6} style={{ width: '100%', background: 'rgba(0,0,0,0.35)', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.45rem' }} />
              </div>
              <button onClick={saveAllNotes} disabled={isSavingNotes} style={{ background: C.teal, color: '#000', border: 'none', borderRadius: 8, padding: '0.55rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>{isSavingNotes ? 'Saving...' : 'Save Commitments & Hours Comments'}</button>
            </div>
          </section>

          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem', display: 'grid', gap: '0.7rem' }}>
            <h3 style={{ margin: 0, color: C.text, fontSize: '0.95rem' }}>
              Period Hours Efficiency: <span style={{ color: C.blue }}>{periodHours.efficiency}%</span> | Plan {Math.round(periodHours.plan)}h | Actual {Math.round(periodHours.actual)}h | Added {Math.round(periodHours.added)}h | Delta {Math.round(periodHours.deltaHours)}h ({periodHours.deltaPct.toFixed(1)}%)
            </h3>
            <div style={{ color: C.muted, fontSize: '0.76rem' }}>Reduced hours = max(0, Plan - Actual). It represents planned hours not consumed in the current scope/time window.</div>
            <ChartWrapper
              option={{
                tooltip: TT,
                grid: { left: 80, right: 20, top: 12, bottom: 12, containLabel: true },
                xAxis: { type: 'value', axisLabel: { color: C.muted } },
                yAxis: { type: 'category', data: ['Plan', 'Actual', 'Reduced'], axisLabel: { color: C.text } },
                series: [{ type: 'bar', data: [{ value: periodHours.plan, itemStyle: { color: '#3B82F6' } }, { value: periodHours.actual, itemStyle: { color: '#22C55E' } }, { value: periodHours.reduced, itemStyle: { color: '#F59E0B' } }] }],
              }}
              height={220}
            />
            <div>
              <h4 style={{ margin: '0 0 0.4rem', color: C.text, fontSize: '0.82rem' }}>Hours comments</h4>
              <textarea value={hoursCommentsDraft} onChange={(e) => setHoursCommentsDraft(e.target.value)} rows={4} style={{ width: '100%', background: 'rgba(0,0,0,0.35)', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.45rem' }} />
            </div>
          </section>

          <section style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1fr 1fr' }}>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: '0.4rem', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: C.text, fontSize: '0.9rem' }}>Task Hours Efficiency</h3>
                <button onClick={clearCrossFilters} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem' }}>Clear visual filters</button>
              </div>
              <ChartWrapper
                option={taskEfficiencyOption}
                height={420}
                onClick={(p) => {
                  const idx = Number(p.dataIndex);
                  const row = taskEfficiencyRows[idx];
                  if (row) setSelectedTaskId(row.id);
                }}
              />
              <MosGlideTable
                columns={['Task', 'Baseline', 'Actual', 'Added', 'Delta', 'Comments']}
                rows={taskEfficiencyRows.slice(0, 30).map((r) => [r.name, Math.round(r.baseline), Math.round(r.actual), Math.round(r.added), Math.round(r.actual - r.baseline), r.comments])}
                height={300}
                onRowClick={(row) => setSelectedTaskId(taskEfficiencyRows[row]?.id || '')}
              />
            </div>

            <div style={{ display: 'grid', gap: '0.8rem' }}>
              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem' }}>
                <h3 style={{ margin: '0 0 0.4rem', color: C.text, fontSize: '0.9rem' }}>Task Lifecycle Charge Code Breakdown</h3>
                <p style={{ margin: '0 0 0.4rem', color: C.muted, fontSize: '0.74rem' }}>{selectedTask ? `Selected task: ${selectedTask.taskName || selectedTask.name || selectedTaskId}` : 'Select a task from Task Hours Efficiency'}</p>
                <ChartWrapper
                  option={lifecycleOption}
                  height={230}
                  onClick={(p) => {
                    if (p.name) setSelectedChargeCode(String(p.name));
                  }}
                  isEmpty={!taskChargeCodeRows.length}
                />
              </div>

              <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem' }}>
                <h3 style={{ margin: '0 0 0.4rem', color: C.text, fontSize: '0.9rem' }}>Non-EX/QC Hours by {hierarchyBucketLevel[0].toUpperCase() + hierarchyBucketLevel.slice(1)}</h3>
                <ChartWrapper
                  option={pieOption}
                  height={260}
                  onClick={(p) => {
                    if (p.name) setSelectedBucket(String(p.name));
                  }}
                  isEmpty={!pieRows.length}
                />
              </div>
            </div>
          </section>

          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem', display: 'grid', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, color: C.text, fontSize: '0.9rem' }}>Hierarchy Comments</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={entityType} onChange={(e) => setEntityType(e.target.value as CommentEntity)} style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '0.35rem 0.5rem' }}>
                <option value="tasks">Tasks</option>
                <option value="units">Units</option>
                <option value="phases">Phases</option>
                <option value="subTasks">Sub-Tasks</option>
              </select>
              <span style={{ color: C.muted, fontSize: '0.75rem', alignSelf: 'center' }}>Select a row below to edit comments.</span>
            </div>
            <MosGlideTable
              columns={['Name', 'Comments']}
              rows={commentEntities.map((r) => [r.name, r.comments])}
              height={270}
              onRowClick={(row) => {
                const item = commentEntities[row];
                if (!item) return;
                setSelectedCommentEntityId(item.id);
                setCommentDraft(item.comments);
              }}
            />
            <textarea value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} rows={4} placeholder="Edit selected entity comments..." style={{ width: '100%', background: 'rgba(0,0,0,0.35)', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.5rem' }} />
            <button disabled={!selectedCommentEntityId || isSavingComments} onClick={saveComment} style={{ justifySelf: 'start', background: C.teal, color: '#000', border: 'none', borderRadius: 8, padding: '0.45rem 0.8rem', fontWeight: 700, cursor: 'pointer' }}>{isSavingComments ? 'Saving...' : 'Save Comment'}</button>
          </section>
        </>
      ) : (
        <section style={{ display: 'grid', gap: '0.8rem' }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem' }}>
            <h3 style={{ margin: 0, color: C.text }}>Q&A</h3>
            <p style={{ color: C.muted, fontSize: '0.8rem', marginTop: '0.4rem' }}>This section keeps the Mo page discussion context. Dashboard visuals and tables now provide live DB-backed operational tracking.</p>
          </div>

          {[
            { q: 'Do we have a workflow/plan to complete deliverables?', a: 'Use Milestones + commitments on the Dashboard. Enter commitments for last and current period, scoped by the global hierarchy filter.' },
            { q: 'Are we ahead or behind plan?', a: 'Task Hours Efficiency compares baseline vs actual and added hours per task, with comments editable from the hierarchy comments section.' },
            { q: 'Where are hours being spent?', a: 'Task Lifecycle Charge Code Breakdown shows charge-code distribution for the selected task. Pie chart shows non-EX/QC by next hierarchy level.' },
            { q: 'How do filters apply?', a: 'Global hierarchy and time filters constrain all data. Cross-visual clicks add local filters that can be cleared with Clear visual filters.' },
          ].map((item, idx) => (
            <div key={idx} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem' }}>
              <div style={{ color: C.teal, fontSize: '0.78rem', fontWeight: 700 }}>{item.q}</div>
              <div style={{ color: C.text, fontSize: '0.84rem', marginTop: '0.35rem' }}>{item.a}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
