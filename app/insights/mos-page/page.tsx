'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ChartWrapper from '@/components/charts/ChartWrapper';
import ContainerLoader from '@/components/ui/ContainerLoader';
import { useData } from '@/lib/data-context';
import MosGlideTable from './components/MosGlideTable';
import type { MoPeriodGranularity, MoPeriodNote, MoPeriodNoteType } from '@/types/data';

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
type MilestoneBucket =
  | 'Completed On Time'
  | 'Completed Delayed'
  | 'In Progress Forecasted On Time'
  | 'In Progress Forecasted Delayed'
  | 'Not Started Forecasted On Time'
  | 'Not Started Forecasted Delayed';

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const parseDate = (v: unknown): Date | null => {
  const d = new Date(String(v || ''));
  return Number.isNaN(d.getTime()) ? null : d;
};
const fmtDate = (v: unknown) => {
  const d = parseDate(v);
  return d ? d.toLocaleDateString() : '-';
};
const normalizeTaskId = (v: unknown) => String(v || '').trim().replace(/^wbs-(task|sub_task)-/i, '');
const toISODate = (d: Date) => d.toISOString().slice(0, 10);

function firstDayOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function lastDayOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function firstDayOfQuarter(d: Date): Date { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3, 1); }
function lastDayOfQuarter(d: Date): Date { const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3 + 3, 0); }

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
  const { filteredData, isLoading, hierarchyFilter, dateFilter, updateData } = useData();

  const [tab, setTab] = useState<Tab>('dashboard');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedChargeCode, setSelectedChargeCode] = useState('');
  const [selectedBucket, setSelectedBucket] = useState('');
  const [selectedMilestoneBucket, setSelectedMilestoneBucket] = useState<MilestoneBucket>('Completed On Time');
  const [savingCommitments, setSavingCommitments] = useState(false);

  const periods = useMemo(() => derivePeriods(dateFilter), [dateFilter]);

  const portfolios = (filteredData.portfolios || []) as any[];
  const customers = (filteredData.customers || []) as any[];
  const sites = (filteredData.sites || []) as any[];
  const projects = (filteredData.projects || []) as any[];
  const units = (filteredData.units || []) as any[];
  const tasks = (filteredData.tasks || []) as any[];
  const milestones = ([...(filteredData.milestones || []), ...(filteredData.milestonesTable || [])] as any[]);
  const hours = (filteredData.hours || []) as any[];
  const moPeriodNotes = (filteredData.moPeriodNotes || []) as MoPeriodNote[];

  const projectById = useMemo(() => {
    const m = new Map<string, any>();
    projects.forEach((x) => m.set(String(x.id || x.projectId), x));
    return m;
  }, [projects]);
  const siteById = useMemo(() => {
    const m = new Map<string, any>();
    sites.forEach((x) => m.set(String(x.id || x.siteId), x));
    return m;
  }, [sites]);
  const customerById = useMemo(() => {
    const m = new Map<string, any>();
    customers.forEach((x) => m.set(String(x.id || x.customerId), x));
    return m;
  }, [customers]);
  const portfolioById = useMemo(() => {
    const m = new Map<string, any>();
    portfolios.forEach((x) => m.set(String(x.id || x.portfolioId), x));
    return m;
  }, [portfolios]);

  const taskById = useMemo(() => {
    const m = new Map<string, any>();
    tasks.forEach((t) => m.set(normalizeTaskId(t.id || t.taskId), t));
    return m;
  }, [tasks]);

  const taskActualHours = useMemo(() => {
    const m = new Map<string, number>();
    hours.forEach((h) => {
      const tid = normalizeTaskId(h.taskId || h.task_id);
      if (!tid) return;
      m.set(tid, (m.get(tid) || 0) + num(h.hours));
    });
    return m;
  }, [hours]);

  const taskRows = useMemo(() => {
    const rows = tasks
      .map((t) => {
        const sourceId = String(t.id || t.taskId || '');
        const id = normalizeTaskId(sourceId);
        const baseline = num(t.baselineHours || t.baseline_hours || t.projectedHours || t.projected_hours);
        const actual = taskActualHours.get(id) ?? num(t.actualHours || t.actual_hours);
        const added = Math.max(0, actual - baseline);
        return {
          sourceId,
          id,
          name: String(t.taskName || t.name || id),
          baseline,
          actual,
          added,
          delta: actual - baseline,
          comments: String(t.comments || ''),
        };
      })
      .filter((r) => r.id && (r.baseline > 0 || r.actual > 0))
      .sort((a, b) => (b.actual + b.baseline) - (a.actual + a.baseline));
    return rows.slice(0, 60);
  }, [tasks, taskActualHours]);

  useEffect(() => {
    if (!selectedTaskId && taskRows.length > 0) setSelectedTaskId(taskRows[0].id);
  }, [selectedTaskId, taskRows]);

  const selectedTask = useMemo(() => taskById.get(normalizeTaskId(selectedTaskId)), [taskById, selectedTaskId]);
  const selectedTaskName = String(selectedTask?.taskName || selectedTask?.name || '').trim().toLowerCase();

  const hierarchyBucketLevel = useMemo(() => {
    const path = hierarchyFilter?.path || [];
    if (!path[0]) return 'portfolio';
    if (!path[1]) return 'customer';
    if (!path[2]) return 'site';
    if (!path[3]) return 'project';
    return 'unit';
  }, [hierarchyFilter]);

  const getBucket = (h: any) => {
    const pid = String(h.projectId || h.project_id || '');
    const project = projectById.get(pid);
    if (!project) return 'Unassigned';

    if (hierarchyBucketLevel === 'project') return String(project.name || project.projectName || pid);

    const site = siteById.get(String(project.siteId || project.site_id || ''));
    if (hierarchyBucketLevel === 'site') return String(site?.name || 'Unassigned');

    const customer = customerById.get(String(site?.customerId || site?.customer_id || ''));
    if (hierarchyBucketLevel === 'customer') return String(customer?.name || 'Unassigned');

    const portfolio = portfolioById.get(String(customer?.portfolioId || customer?.portfolio_id || ''));
    if (hierarchyBucketLevel === 'portfolio') return String(portfolio?.name || 'Unassigned');

    const task = taskById.get(normalizeTaskId(h.taskId || h.task_id));
    const unit = units.find((u: any) => String(u.id || u.unitId) === String(task?.unitId || task?.unit_id || ''));
    return String(unit?.name || 'Unassigned');
  };

  const isExcluded = (h: any) => {
    const code = String(h.chargeCode || h.charge_code || '').toUpperCase().trim();
    const type = String(h.chargeType || h.charge_type || '').toUpperCase().trim();
    return code === 'EX' || code === 'QC' || type === 'EX' || type === 'QC';
  };

  const taskBreakdownInput = useMemo(() => {
    const selectedId = normalizeTaskId(selectedTaskId);
    return hours.filter((h) => {
      const hourTaskId = normalizeTaskId(h.taskId || h.task_id);
      const hourTaskText = String(h.task || '').trim().toLowerCase();
      if (hourTaskId && selectedId && hourTaskId === selectedId) return true;
      if (selectedTaskName && hourTaskText && (hourTaskText === selectedTaskName || hourTaskText.includes(selectedTaskName))) return true;
      return false;
    });
  }, [hours, selectedTaskId, selectedTaskName]);

  const taskBreakdownOption: EChartsOption = useMemo(() => {
    if (!taskBreakdownInput.length) return {};

    const grouped = new Map<string, number>();
    taskBreakdownInput.forEach((h) => {
      const day = toISODate(parseDate(h.date) || new Date());
      const code = String(h.chargeCode || h.charge_code || h.chargeType || h.charge_type || 'Other').trim() || 'Other';
      const k = `${day}|||${code}`;
      grouped.set(k, (grouped.get(k) || 0) + num(h.hours));
    });

    const segments = Array.from(grouped.entries())
      .map(([key, hours]) => {
        const [day, code] = key.split('|||');
        return { day, code, hours };
      })
      .sort((a, b) => (a.day === b.day ? a.code.localeCompare(b.code) : a.day.localeCompare(b.day)));

    if (!segments.length) return {};

    const dateBreaks: Array<{ x: number; day: string }> = [];
    let cumulative = 0;
    let lastDay = '';
    segments.forEach((s, idx) => {
      if (idx > 0 && s.day !== lastDay) dateBreaks.push({ x: cumulative, day: s.day });
      cumulative += s.hours;
      lastDay = s.day;
    });

    return {
      tooltip: { ...TT, trigger: 'item' },
      legend: { top: 0, textStyle: { color: C.muted } },
      grid: { left: 90, right: 20, top: 35, bottom: 20, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: C.muted },
        splitLine: { show: true, lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      yAxis: { type: 'category', data: ['Hours'], axisLabel: { color: C.text } },
      series: segments.map((seg, i) => ({
        type: 'bar',
        stack: 'timeline',
        name: seg.code,
        data: [{ value: seg.hours, itemStyle: { opacity: selectedChargeCode && selectedChargeCode !== seg.code ? 0.35 : 1 } }],
        markLine: i === 0 ? {
          symbol: 'none',
          lineStyle: { type: 'dotted', color: 'rgba(255,255,255,0.32)' },
          label: { show: true, color: C.muted, formatter: (p: any) => String(p.data?.name || ''), fontSize: 10 },
          data: dateBreaks.map((d) => ({ xAxis: d.x, name: d.day })),
        } : undefined,
      })),
    };
  }, [taskBreakdownInput, selectedChargeCode]);

  const nonExQcOption: EChartsOption = useMemo(() => {
    const rows = hours.filter((h) => {
      const type = String(h.chargeType || h.charge_type || '').toUpperCase().trim();
      return type !== 'EX' && type !== 'QC';
    });
    if (!rows.length) return {};

    const bucketMap = new Map<string, Map<string, Map<string, number>>>();
    let total = 0;

    rows.forEach((h) => {
      const bucket = getBucket(h);
      const chargeType = String(h.chargeType || h.charge_type || 'Other').trim() || 'Other';
      const chargeCode = String(h.chargeCode || h.charge_code || 'Uncoded').trim() || 'Uncoded';
      const hourValue = num(h.hours);
      total += hourValue;
      if (!bucketMap.has(bucket)) bucketMap.set(bucket, new Map());
      const typeMap = bucketMap.get(bucket)!;
      if (!typeMap.has(chargeType)) typeMap.set(chargeType, new Map());
      const codeMap = typeMap.get(chargeType)!;
      codeMap.set(chargeCode, (codeMap.get(chargeCode) || 0) + hourValue);
    });

    const sunburstData = Array.from(bucketMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, typeMap]) => {
        const typeChildren = Array.from(typeMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([chargeType, codeMap]) => {
            const codeChildren = Array.from(codeMap.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([chargeCode, v]) => ({ name: chargeCode, value: Number(v.toFixed(2)) }));
            return {
              name: chargeType,
              value: Number(codeChildren.reduce((s, c) => s + num(c.value), 0).toFixed(2)),
              children: codeChildren,
            };
          });
        return {
          name: bucket,
          value: Number(typeChildren.reduce((s, c) => s + num(c.value), 0).toFixed(2)),
          children: typeChildren,
        };
      });

    return {
      tooltip: {
        ...TT,
        trigger: 'item',
        formatter: (p: any) => `${p.name}<br/>Hours: ${num(p.value).toFixed(2)}`,
      },
      series: [{
        type: 'sunburst',
        radius: [0, '95%'],
        sort: null,
        nodeClick: 'rootToNode',
        itemStyle: { borderWidth: 1, borderColor: '#0f0f12' },
        label: { color: '#ffffff', minAngle: 4 },
        levels: [
          {},
          { r0: '0%', r: '28%', label: { rotate: 0 } },
          { r0: '30%', r: '62%', label: { rotate: 'tangential' } },
          { r0: '64%', r: '95%', label: { rotate: 'tangential', fontSize: 10 } },
        ],
        data: sunburstData,
      }],
      graphic: total <= 0 ? [{
        type: 'text',
        left: 'center',
        top: 'middle',
        style: { text: 'No Non-EX/QC hours in scope', fill: C.muted, fontSize: 13 },
      }] : undefined,
    };
  }, [hours, hierarchyBucketLevel, projectById, siteById, customerById, portfolioById, taskById, units]);

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
      if (isCompleted) bucket = delayed ? 'Completed Delayed' : 'Completed On Time';
      else if (isNotStarted) bucket = delayed ? 'Not Started Forecasted Delayed' : 'Not Started Forecasted On Time';
      else bucket = delayed ? 'In Progress Forecasted Delayed' : 'In Progress Forecasted On Time';

      return {
        id: String(m.id || m.milestoneId || `m-${idx}`),
        name: String(m.milestoneName || m.name || m.title || m.id || ''),
        status: String(m.status || '-'),
        baselineStart,
        baselineEnd,
        actualStart,
        actualEnd,
        forecastEnd,
        comments: String(m.comments || ''),
        bucket,
      };
    }).filter((r) => r.name);
  }, [milestones]);

  const milestoneSummary = useMemo(() => {
    const s: Record<MilestoneBucket, number> = {
      'Completed On Time': 0,
      'Completed Delayed': 0,
      'In Progress Forecasted On Time': 0,
      'In Progress Forecasted Delayed': 0,
      'Not Started Forecasted On Time': 0,
      'Not Started Forecasted Delayed': 0,
    };
    milestoneRows.forEach((r) => { s[r.bucket] += 1; });
    return s;
  }, [milestoneRows]);

  const bucketDefs: Array<{ label: MilestoneBucket; color: string }> = [
    { label: 'Completed On Time', color: '#22C55E' },
    { label: 'Completed Delayed', color: '#EF4444' },
    { label: 'In Progress Forecasted On Time', color: '#14B8A6' },
    { label: 'In Progress Forecasted Delayed', color: '#F59E0B' },
    { label: 'Not Started Forecasted On Time', color: '#3B82F6' },
    { label: 'Not Started Forecasted Delayed', color: '#A855F7' },
  ];

  const milestoneOption: EChartsOption = useMemo(() => ({
    tooltip: TT,
    grid: { left: 230, right: 20, top: 10, bottom: 10, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: C.muted } },
    yAxis: { type: 'category', data: bucketDefs.map((b) => b.label), axisLabel: { color: C.text, width: 220, overflow: 'truncate' } },
    series: [{ type: 'bar', data: bucketDefs.map((b) => ({ value: milestoneSummary[b.label], itemStyle: { color: b.color } })) }],
  }), [milestoneSummary]);

  const milestoneDrill = useMemo(() => {
    return milestoneRows.filter((r) => r.bucket === selectedMilestoneBucket);
  }, [milestoneRows, selectedMilestoneBucket]);

  const periodHours = useMemo(() => {
    const plan = taskRows.reduce((s, r) => s + r.baseline, 0);
    const actual = taskRows.reduce((s, r) => s + r.actual, 0);
    const added = Math.max(0, actual - plan);
    const reduced = Math.max(0, plan - actual);
    const deltaHours = actual - plan;
    const deltaPct = plan > 0 ? (deltaHours / plan) * 100 : 0;
    const efficiency = plan > 0 ? Math.round((Math.min(plan, actual) / plan) * 100) : 0;
    return { plan, actual, added, reduced, deltaHours, deltaPct, efficiency };
  }, [taskRows]);

  const taskOption: EChartsOption = useMemo(() => {
    const top = taskRows.slice(0, 20);
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
  }, [taskRows]);

  const byName = (arr: any[], name: string) => arr.find((x) => String(x.name || '') === name);
  const noteScope = useMemo(() => {
    const path = hierarchyFilter?.path || [];
    return {
      portfolioId: hierarchyFilter?.portfolio || (path[0] ? String(byName(portfolios, path[0])?.id || '') : '') || null,
      customerId: hierarchyFilter?.customer || (path[1] ? String(byName(customers, path[1])?.id || '') : '') || null,
      siteId: hierarchyFilter?.site || (path[2] ? String(byName(sites, path[2])?.id || '') : '') || null,
      projectId: hierarchyFilter?.project || (path[3] ? String(byName(projects, path[3])?.id || '') : '') || null,
    };
  }, [hierarchyFilter, portfolios, customers, sites, projects]);

  const scopedNotes = useMemo(() => {
    return moPeriodNotes.filter((n: any) => {
      const pid = n.projectId || n.project_id || null;
      const sid = n.siteId || n.site_id || null;
      const cid = n.customerId || n.customer_id || null;
      const pfid = n.portfolioId || n.portfolio_id || null;
      return pid === noteScope.projectId && sid === noteScope.siteId && cid === noteScope.customerId && pfid === noteScope.portfolioId;
    });
  }, [moPeriodNotes, noteScope]);

  const [lastCommitmentsDraft, setLastCommitmentsDraft] = useState('');
  const [thisCommitmentsDraft, setThisCommitmentsDraft] = useState('');
  const periodBreakdownBaseRows = useMemo(() => {
    const top = taskRows.slice(0, 12);
    const out: Array<{ section: 'Planned' | 'Actual' | 'Reduced'; task: string; hours: number }> = [];
    top.forEach((t) => {
      out.push({ section: 'Planned', task: t.name, hours: Math.round(t.baseline) });
      out.push({ section: 'Actual', task: t.name, hours: Math.round(t.actual) });
      out.push({ section: 'Reduced', task: t.name, hours: Math.round(Math.max(0, t.baseline - t.actual)) });
    });
    return out;
  }, [taskRows]);

  const [hoursCommentRows, setHoursCommentRows] = useState<Array<{ value: string; noteId: string }>>([]);

  useEffect(() => {
    const getNote = (type: MoPeriodNoteType, start: string, end: string) =>
      scopedNotes.find((n: any) => (n.noteType || n.note_type) === type && (n.periodStart || n.period_start) === start && (n.periodEnd || n.period_end) === end);

    setLastCommitmentsDraft(String(getNote('last_commitment', periods.lastStart, periods.lastEnd)?.content || ''));
    setThisCommitmentsDraft(String(getNote('this_commitment', periods.currentStart, periods.currentEnd)?.content || ''));

    const hrs = scopedNotes
      .filter((n: any) => (n.noteType || n.note_type) === 'hours_comment' && (n.periodStart || n.period_start) === periods.currentStart && (n.periodEnd || n.period_end) === periods.currentEnd)
      .sort((a: any, b: any) => num(a.sortOrder || a.sort_order) - num(b.sortOrder || b.sort_order));

    setHoursCommentRows(periodBreakdownBaseRows.map((_, idx) => ({
      value: String(hrs[idx]?.content || ''),
      noteId: String(hrs[idx]?.id || ''),
    })));
  }, [scopedNotes, periods, periodBreakdownBaseRows]);

  const upsertPeriodNote = async (type: MoPeriodNoteType, content: string, periodStart: string, periodEnd: string, sortOrder = 0, explicitId?: string) => {
    const existing = scopedNotes.find((n: any) => {
      const nt = n.noteType || n.note_type;
      const ps = n.periodStart || n.period_start;
      const pe = n.periodEnd || n.period_end;
      const so = num(n.sortOrder || n.sort_order);
      return nt === type && ps === periodStart && pe === periodEnd && so === sortOrder;
    });

    const rec: MoPeriodNote = {
      id: explicitId || existing?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `monote-${Date.now()}-${Math.random()}`),
      noteType: type,
      periodGranularity: periods.granularity,
      periodStart,
      periodEnd,
      portfolioId: noteScope.portfolioId,
      customerId: noteScope.customerId,
      siteId: noteScope.siteId,
      projectId: noteScope.projectId,
      content,
      sortOrder,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await fetch('/api/data/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataKey: 'moPeriodNotes', records: [rec] }),
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Failed to save note');
    return rec;
  };

  const saveCommitments = async () => {
    setSavingCommitments(true);
    try {
      const last = await upsertPeriodNote('last_commitment', lastCommitmentsDraft, periods.lastStart, periods.lastEnd, 0);
      const current = await upsertPeriodNote('this_commitment', thisCommitmentsDraft, periods.currentStart, periods.currentEnd, 0);
      const remaining = moPeriodNotes.filter((n: any) => {
        const t = n.noteType || n.note_type;
        const ps = n.periodStart || n.period_start;
        const pe = n.periodEnd || n.period_end;
        if (t === 'last_commitment' && ps === periods.lastStart && pe === periods.lastEnd) return false;
        if (t === 'this_commitment' && ps === periods.currentStart && pe === periods.currentEnd) return false;
        return true;
      });
      updateData({ moPeriodNotes: [...remaining, last, current] as any });
    } finally {
      setSavingCommitments(false);
    }
  };

  const saveTaskComment = async (row: number, value: string) => {
    const item = taskRows[row];
    if (!item?.sourceId) return;
    const res = await fetch('/api/data/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataKey: 'tasks', operation: 'update', records: [{ id: item.sourceId, comments: value }] }),
    });
    const result = await res.json();
    if (!result.success) return;
    updateData({ tasks: tasks.map((t: any) => normalizeTaskId(t.id || t.taskId) === item.id ? { ...t, comments: value } : t) as any });
  };

  const saveMilestoneComment = async (row: number, value: string) => {
    const item = milestoneDrill[row];
    if (!item?.id) return;
    const res = await fetch('/api/data/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataKey: 'milestonesTable', operation: 'update', records: [{ id: item.id, comments: value }] }),
    });
    const result = await res.json();
    if (!result.success) return;
    updateData({ milestonesTable: (filteredData.milestonesTable || []).map((m: any) => String(m.id || m.milestoneId) === item.id ? { ...m, comments: value } : m) as any });
  };

  const saveHoursComment = async (row: number, value: string) => {
    const current = hoursCommentRows[row];
    if (!current) return;
    const saved = await upsertPeriodNote('hours_comment', value, periods.currentStart, periods.currentEnd, row, current.noteId || undefined);
    setHoursCommentRows((prev) => prev.map((r, i) => i === row ? { ...r, value, noteId: saved.id } : r));
    const rest = moPeriodNotes.filter((n: any) => {
      const t = n.noteType || n.note_type;
      const ps = n.periodStart || n.period_start;
      const pe = n.periodEnd || n.period_end;
      const so = num(n.sortOrder || n.sort_order);
      return !(t === 'hours_comment' && ps === periods.currentStart && pe === periods.currentEnd && so === row);
    });
    updateData({ moPeriodNotes: [...rest, saved] as any });
  };

  const clearVisualFilters = () => {
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

  const hasAnyData = milestones.length > 0 || taskRows.length > 0 || hours.length > 0;

  return (
    <div style={{ minHeight: 'calc(100vh - 90px)', padding: '1rem 1.1rem 2rem', display: 'grid', gap: '0.8rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: C.text, fontSize: '1.65rem', fontWeight: 900 }}>Mo&apos;s Page</h1>
          <p style={{ margin: '0.3rem 0 0', color: C.muted, fontSize: '0.8rem' }}>Dashboard is DB-backed and scoped by global hierarchy/time filters.</p>
        </div>
        <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', height: 36 }}>
          <button onClick={() => setTab('dashboard')} style={{ background: tab === 'dashboard' ? 'rgba(16,185,129,0.2)' : 'transparent', color: C.text, border: 'none', padding: '0 0.9rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>Dashboard</button>
          <button onClick={() => setTab('qa')} style={{ background: tab === 'qa' ? 'rgba(16,185,129,0.2)' : 'transparent', color: C.text, border: 'none', padding: '0 0.9rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>Q&A</button>
        </div>
      </header>

      {tab === 'dashboard' ? (
        <>
          {!hasAnyData && <EmptyState title="No dashboard data in scope" body="No records matched the current global hierarchy/time filters. Import/edit in Data Management and refresh." />}

          <section style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1fr' }}>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem', display: 'grid', gap: '0.65rem' }}>
              <h3 style={{ margin: 0, color: C.text, fontSize: '0.95rem' }}>Milestones</h3>
              <ChartWrapper option={milestoneOption} height={280} onClick={(p) => p.name && setSelectedMilestoneBucket(String(p.name) as MilestoneBucket)} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {bucketDefs.map((b) => (
                  <button key={b.label} onClick={() => setSelectedMilestoneBucket(b.label)} style={{ background: selectedMilestoneBucket === b.label ? 'rgba(16,185,129,0.2)' : 'transparent', color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '0.25rem 0.5rem', cursor: 'pointer', fontSize: '0.72rem' }}>
                    {b.label} ({milestoneSummary[b.label]})
                  </button>
                ))}
              </div>
              <MosGlideTable
                columns={['Milestone', 'Status', 'BL Start', 'BL Finish', 'Actual Start', 'Actual Finish', 'Forecast Finish', 'Comments']}
                rows={milestoneDrill.map((r) => [r.name, r.status, fmtDate(r.baselineStart), fmtDate(r.baselineEnd), fmtDate(r.actualStart), fmtDate(r.actualEnd), fmtDate(r.forecastEnd), r.comments])}
                editableColumns={[7]}
                onTextCellEdited={(row, col, value) => { if (col === 7) void saveMilestoneComment(row, value); }}
                height={300}
                minColumnWidth={120}
              />
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1rem', display: 'grid', gap: '0.75rem' }}>
              <h3 style={{ margin: 0, color: C.text, fontSize: '0.95rem' }}>Commitments</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  <label style={{ color: C.muted, fontSize: '0.74rem' }}>Last period commitments</label>
                  <textarea value={lastCommitmentsDraft} onChange={(e) => setLastCommitmentsDraft(e.target.value)} rows={6} style={{ width: '100%', background: 'rgba(0,0,0,0.35)', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.55rem' }} />
                </div>
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  <label style={{ color: C.muted, fontSize: '0.74rem' }}>This period commitments</label>
                  <textarea value={thisCommitmentsDraft} onChange={(e) => setThisCommitmentsDraft(e.target.value)} rows={6} style={{ width: '100%', background: 'rgba(0,0,0,0.35)', color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.55rem' }} />
                </div>
              </div>
              <button onClick={saveCommitments} disabled={savingCommitments} style={{ justifySelf: 'start', background: C.teal, color: '#000', border: 'none', borderRadius: 7, padding: '0.3rem 0.55rem', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>{savingCommitments ? 'Saving...' : 'Save Commitments'}</button>
            </div>
          </section>

          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem', display: 'grid', gap: '0.7rem' }}>
            <h3 style={{ margin: 0, color: C.text, fontSize: '0.95rem' }}>
              Period Hours Efficiency: <span style={{ color: C.blue }}>{periodHours.efficiency}%</span> | Plan {Math.round(periodHours.plan)}h | Actual {Math.round(periodHours.actual)}h | Added {Math.round(periodHours.added)}h | Delta {Math.round(periodHours.deltaHours)}h ({periodHours.deltaPct.toFixed(1)}%)
            </h3>
            <div style={{ color: C.muted, fontSize: '0.76rem' }}>Reduced hours = `max(0, Plan - Actual)` for current filtered scope and period.</div>
            <ChartWrapper option={{ tooltip: TT, grid: { left: 80, right: 20, top: 12, bottom: 12, containLabel: true }, xAxis: { type: 'value', axisLabel: { color: C.muted } }, yAxis: { type: 'category', data: ['Plan', 'Actual', 'Reduced'], axisLabel: { color: C.text } }, series: [{ type: 'bar', data: [{ value: periodHours.plan, itemStyle: { color: '#3B82F6' } }, { value: periodHours.actual, itemStyle: { color: '#22C55E' } }, { value: periodHours.reduced, itemStyle: { color: '#F59E0B' } }] }] }} height={220} />
            <MosGlideTable
              columns={['Section', 'Task', 'Hours', 'Comments']}
              rows={periodBreakdownBaseRows.map((r, idx) => [r.section, r.task, r.hours, hoursCommentRows[idx]?.value || ''])}
              editableColumns={[3]}
              onTextCellEdited={(row, col, value) => { if (col === 3) void saveHoursComment(row, value); }}
              height={320}
            />
          </section>

          <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem' }}>
            <h3 style={{ margin: '0 0 0.45rem', color: C.text, fontSize: '0.9rem' }}>Task Breakdown</h3>
            <p style={{ margin: '0 0 0.5rem', color: C.muted, fontSize: '0.74rem' }}>{selectedTask ? `Selected task: ${selectedTask.taskName || selectedTask.name || selectedTaskId}` : 'Select a task from Task Hours Efficiency'}</p>
            <ChartWrapper option={taskBreakdownOption} height={300} onClick={(p) => p.seriesName && setSelectedChargeCode(String(p.seriesName))} isEmpty={!taskBreakdownInput.length} />
          </section>

          <section style={{ display: 'grid', gap: '0.8rem', gridTemplateColumns: '1fr' }}>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem', display: 'grid', gap: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, color: C.text, fontSize: '0.9rem' }}>Task Hours Efficiency</h3>
                <button onClick={clearVisualFilters} style={{ background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.7rem' }}>Clear visual filters</button>
              </div>
              <ChartWrapper option={taskOption} height={420} onClick={(p) => {
                const idx = Number(p.dataIndex);
                if (Number.isFinite(idx) && taskRows[idx]) setSelectedTaskId(taskRows[idx].id);
              }} />
              <MosGlideTable
                columns={['Task', 'Baseline', 'Actual', 'Added', 'Delta', 'Comments']}
                rows={taskRows.slice(0, 35).map((r) => [r.name, Math.round(r.baseline), Math.round(r.actual), Math.round(r.added), Math.round(r.delta), r.comments])}
                editableColumns={[5]}
                onTextCellEdited={(row, col, value) => { if (col === 5) void saveTaskComment(row, value); }}
                onRowClick={(row) => setSelectedTaskId(taskRows[row]?.id || '')}
                height={320}
              />
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.8rem' }}>
              <h3 style={{ margin: '0 0 0.45rem', color: C.text, fontSize: '0.9rem' }}>Non-EX/QC Hours Sunburst by {hierarchyBucketLevel[0].toUpperCase() + hierarchyBucketLevel.slice(1)}</h3>
              <ChartWrapper option={nonExQcOption} height={420} onClick={(p) => p.name && setSelectedBucket(String(p.name))} isEmpty={!hours.some((h) => {
                const type = String(h.chargeType || h.charge_type || '').toUpperCase().trim();
                return type !== 'EX' && type !== 'QC';
              })} />
            </div>
          </section>
        </>
      ) : (
        <section style={{ display: 'grid', gap: '0.8rem' }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: '0.9rem' }}>
            <h3 style={{ margin: 0, color: C.text }}>Q&A</h3>
            <p style={{ color: C.muted, fontSize: '0.8rem', marginTop: '0.4rem' }}>This section keeps the Mo page discussion context. Dashboard visuals/tables provide live DB-backed tracking.</p>
          </div>
        </section>
      )}
    </div>
  );
}
