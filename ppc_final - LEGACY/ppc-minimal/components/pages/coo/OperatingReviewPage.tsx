'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

/* ---------- types ---------- */

type MilestoneRow = {
  id: string; name: string; project_name: string;
  baseline_start: string | null; baseline_end: string | null;
  start_date: string | null; end_date: string | null;
  actual_start: string | null; actual_end: string | null;
  percent_complete: number; is_critical: boolean;
  total_float: string | null; comments: string | null;
  bucket: string;
};
type EffRow = { category: string; hours: number; entries: number; pct: number };
type TaskRow = {
  id: string; task_name: string; project_name: string;
  baseline_hours: number; actual_hours: number; remaining_hours: number;
  variance_hours: number; variance_pct: number; percent_complete: number;
};
type LaborRow = { role?: string; project_name?: string; phase?: string; charge_type?: string; hours: number; headcount: number };
type ChargeRow = { charge_code: string; hours: number; entries: number };
type WeekPoint = { week: string; hours: number; cost: number; entries: number };
type EffKpis = { baselineTotal: number; actualTotal: number; varianceTotal: number; efficiencyPct: number; totalHours: number };
type CatChargeRow = { charge_code: string; hours: number; project_name: string };
type TaskLifecycleRow = { project_name: string; task_name: string; date: string; charge_code: string; hours: number; employee_names?: string };
type LaborTimelineRow = { week: string; role: string; project_name: string; phase: string; charge_type: string; hours: number };

type Payload = {
  success: boolean;
  milestoneDistribution: Record<string, number>;
  totalMilestones: number;
  milestones: MilestoneRow[];
  efficiency: EffRow[];
  efficiencyKpis: EffKpis;
  topTasks: TaskRow[];
  laborByRole: LaborRow[];
  laborByProject: LaborRow[];
  laborByPhase: LaborRow[];
  laborByChargeType: LaborRow[];
  chargeCodes: ChargeRow[];
  categorizedCharges: Record<string, CatChargeRow[]>;
  weeklyTrend: WeekPoint[];
  taskLifecycle: TaskLifecycleRow[];
  laborTimeline: LaborTimelineRow[];
  error?: string;
};

/* ---------- constants ---------- */

const BUCKET_META: Record<string, { color: string; order: number }> = {
  'Completed On Time': { color: '#10b981', order: 1 },
  'Completed Late': { color: '#f59e0b', order: 2 },
  'In Progress On Track': { color: '#6366f1', order: 3 },
  'In Progress Delayed': { color: '#ef4444', order: 4 },
  'Not Started': { color: '#64748b', order: 5 },
  'Not Started Overdue': { color: '#dc2626', order: 6 },
};
const ALL_BUCKETS = Object.keys(BUCKET_META).sort((a, b) => BUCKET_META[a].order - BUCKET_META[b].order);

/* ---------- helpers ---------- */

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

/* ---------- component ---------- */

export default function OperatingReviewPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [laborView, setLaborView] = useState<'role' | 'project' | 'phase' | 'charge_type'>('role');
  const [taskExpanded, setTaskExpanded] = useState<Set<string>>(new Set());
  const [activeEffCategory, setActiveEffCategory] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingCommentKey, setSavingCommentKey] = useState<string | null>(null);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);

  const toggleTask = useCallback((id: string) => {
    setTaskExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  useEffect(() => {
    fetch('/api/coo/operating-review', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Payload) => {
        if (!d.success) throw new Error(d.error || 'Failed');
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/coo/comments?page=operating-review', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { success: boolean; comments?: Record<string, string>; error?: string }) => {
        if (!d.success) throw new Error(d.error || 'Failed to load comments');
        setComments(d.comments || {});
      })
      .catch(() => {
        // non-blocking
      });
  }, []);

  const saveComment = useCallback(async (scope: 'milestone' | 'task', recordId: string, text: string) => {
    const key = `${scope}:${recordId}`;
    setSavingCommentKey(key);
    try {
      await fetch('/api/coo/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 'operating-review', scope, recordId, comment: text }),
      });
    } finally {
      setSavingCommentKey(null);
    }
  }, []);

  /* ---------- milestone chart ---------- */

  const milestoneBarOption: EChartsOption = useMemo(() => {
    const md = data?.milestoneDistribution || {};
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 170, right: 32, top: 8, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      yAxis: { type: 'category', data: ALL_BUCKETS, axisLabel: { color: '#94a3b8', fontSize: 10 }, inverse: true },
      series: [{
        type: 'bar',
        data: ALL_BUCKETS.map((b) => ({ value: md[b] || 0, itemStyle: { color: BUCKET_META[b]?.color || '#64748b', borderRadius: [0, 3, 3, 0] } })),
        barMaxWidth: 20,
        label: { show: true, position: 'right', color: '#94a3b8', fontSize: 10 },
      }],
    } as EChartsOption;
  }, [data?.milestoneDistribution]);

  /* ---------- weekly trend ---------- */

  const weeklyOption: EChartsOption = useMemo(() => {
    const pts = data?.weeklyTrend || [];
    const avgHours = pts.length > 0 ? pts.reduce((s, p) => s + p.hours, 0) / pts.length : 0;
    return {
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#94a3b8', fontSize: 10 }, bottom: 0 },
      grid: { left: 50, right: 50, top: 12, bottom: 34 },
      xAxis: { type: 'category', data: pts.map((p) => p.week.slice(5)), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
        { type: 'value', name: 'Cost', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Hours', type: 'bar', data: pts.map((p) => p.hours), itemStyle: { color: '#6366f1', borderRadius: [3, 3, 0, 0] } },
        { name: 'Cost', type: 'line', yAxisIndex: 1, smooth: true, data: pts.map((p) => p.cost), lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#fbbf24' } },
        { name: '4W Avg Hours', type: 'line', smooth: true, data: pts.map((p, i) => {
          const start = Math.max(0, i - 3);
          const window = pts.slice(start, i + 1);
          return window.reduce((s, w) => s + w.hours, 0) / window.length;
        }), lineStyle: { color: '#10b981', width: 2, type: 'dashed' }, itemStyle: { color: '#34d399' } },
      ],
      markLine: { symbol: 'none', data: [{ yAxis: avgHours }], lineStyle: { color: 'rgba(16,185,129,0.35)', type: 'dotted' }, label: { formatter: `Avg ${avgHours.toFixed(1)}h` } },
    } as EChartsOption;
  }, [data?.weeklyTrend]);

  /* ---------- task variance chart ---------- */

  const taskVarOption: EChartsOption = useMemo(() => {
    const tasks = (data?.topTasks || []).slice(0, 15);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { textStyle: { color: '#94a3b8', fontSize: 10 }, bottom: 0 },
      grid: { left: 160, right: 24, top: 8, bottom: 36 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      yAxis: { type: 'category', data: tasks.map((t) => t.task_name.length > 24 ? t.task_name.slice(0, 22) + '…' : t.task_name), axisLabel: { color: '#94a3b8', fontSize: 10 }, inverse: true },
      series: [
        { name: 'Baseline', type: 'bar', stack: 'comp', data: tasks.map((t) => t.baseline_hours), itemStyle: { color: 'rgba(99,102,241,0.5)' }, barMaxWidth: 14 },
        { name: 'Variance', type: 'bar', stack: 'comp', data: tasks.map((t) => t.variance_hours), itemStyle: { color: (p: { value: number }) => p.value > 0 ? '#ef4444' : '#10b981' }, barMaxWidth: 14 },
      ],
    } as EChartsOption;
  }, [data?.topTasks]);

  /* ---------- charge code chart ---------- */

  const chargeOption: EChartsOption = useMemo(() => {
    const codes = (data?.chargeCodes || []).slice(0, 12);
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['40%', '68%'],
        center: ['50%', '50%'],
        label: { color: '#94a3b8', fontSize: 10, formatter: '{b}: {d}%' },
        data: codes.map((c, i) => ({
          name: c.charge_code,
          value: c.hours,
          itemStyle: { color: ['#6366f1', '#818cf8', '#a78bfa', '#c4b5fd', '#10b981', '#34d399', '#f59e0b', '#fbbf24', '#ef4444', '#f87171', '#64748b', '#94a3b8'][i % 12] },
        })),
      }],
    } as EChartsOption;
  }, [data?.chargeCodes]);

  /* ---------- filtered milestones ---------- */

  const filteredMilestones = useMemo(() => {
    if (!activeBucket) return data?.milestones || [];
    return (data?.milestones || []).filter((m) => m.bucket === activeBucket);
  }, [data?.milestones, activeBucket]);

  const taskBreakdownOption: EChartsOption = useMemo(() => {
    const fallbackTask = data?.topTasks?.[0];
    const key = selectedTaskKey || (fallbackTask ? `${fallbackTask.project_name}::${fallbackTask.task_name}` : null);
    if (!key || !data?.taskLifecycle?.length) return {};
    const [projectName, taskName] = key.split('::');
    const taskMeta = (data.topTasks || []).find((t) => t.project_name === projectName && t.task_name === taskName);
    const rows = data.taskLifecycle.filter((r) => r.project_name === projectName && r.task_name === taskName);
    if (!rows.length) return {};

    const groupedByDate = new Map<string, Map<string, number>>();
    const segmentPeople = new Map<string, Set<string>>();
    rows.forEach((r) => {
      if (!groupedByDate.has(r.date)) groupedByDate.set(r.date, new Map());
      const m = groupedByDate.get(r.date)!;
      m.set(r.charge_code, (m.get(r.charge_code) || 0) + r.hours);
      const keySeg = `${r.date}|||${r.charge_code}`;
      if (!segmentPeople.has(keySeg)) segmentPeople.set(keySeg, new Set<string>());
      (r.employee_names || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((name) => segmentPeople.get(keySeg)!.add(name));
    });
    const segments = Array.from(groupedByDate.entries())
      .flatMap(([date, charges]) => Array.from(charges.entries()).map(([charge, hours]) => ({ date, charge, hours })))
      .sort((a, b) => (a.date === b.date ? a.charge.localeCompare(b.charge) : a.date.localeCompare(b.date)));

    const dateBreaks: Array<{ x: number; day: string }> = [];
    let cumulative = 0;
    let lastDay = '';
    segments.forEach((s, idx) => {
      if (idx > 0 && s.date !== lastDay) dateBreaks.push({ x: cumulative, day: s.date.slice(5) });
      cumulative += s.hours;
      lastDay = s.date;
    });

    const palette = ['#6366f1', '#818cf8', '#a78bfa', '#10b981', '#34d399', '#f59e0b', '#ef4444', '#64748b'];
    const chargeCodes = Array.from(new Set(segments.map((s) => s.charge))).slice(0, 12);
    const colorByCharge = new Map<string, string>();
    chargeCodes.forEach((c, i) => colorByCharge.set(c, palette[i % palette.length]));
    const actualSeries = segments.map((seg, idx) => ({
      type: 'bar' as const,
      stack: 'actual',
      // keep segment visual by date + charge, but legend will be charge-only via explicit legend.data
      name: seg.charge,
      itemStyle: { color: colorByCharge.get(seg.charge) || palette[idx % palette.length] },
      data: [0, {
        value: seg.hours,
        meta: {
          date: seg.date,
          charge: seg.charge,
          people: Array.from(segmentPeople.get(`${seg.date}|||${seg.charge}`) || []).slice(0, 12),
        },
      }],
      markLine: idx === 0 ? {
        symbol: 'none',
        lineStyle: { type: 'dotted', color: 'rgba(255,255,255,0.25)' },
        label: { show: true, color: 'var(--text-muted)', formatter: (p: { data?: { name?: string } }) => String(p.data?.name || ''), fontSize: 10 },
        data: dateBreaks.map((d) => ({ xAxis: d.x, name: d.day })),
      } : undefined,
    }));

    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: { seriesName?: string; value?: unknown; data?: { meta?: { date?: string; charge?: string; people?: string[] } } }) => {
          if (p.seriesName === 'Baseline') return `Baseline<br/>Hours: ${Number(p.value || 0).toFixed(1)}`;
          const meta = p?.data?.meta;
          const names = meta?.people?.length ? meta.people.join(', ') : 'Unknown';
          return [
            `${meta?.charge || p.seriesName || 'Actual'}`,
            `Date: ${meta?.date || '-'}`,
            `Hours: ${Number(p.value || 0).toFixed(1)}`,
            `Charged by: ${names}`,
          ].join('<br/>');
        },
      },
      legend: { top: 0, data: ['Baseline', ...chargeCodes], textStyle: { color: '#94a3b8', fontSize: 10 }, type: 'scroll' },
      grid: { left: 110, right: 20, top: 34, bottom: 42, containLabel: true },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 14,
          bottom: 6,
          borderColor: 'rgba(148,163,184,0.6)',
          fillerColor: 'rgba(99,102,241,0.24)',
          handleStyle: { color: '#818cf8', borderWidth: 0 },
          showDetail: false,
        },
      ],
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      yAxis: { type: 'category', data: ['Baseline', 'Actual'], axisLabel: { color: '#cbd5e1', fontSize: 11 } },
      series: [
        {
          type: 'bar',
          stack: 'baseline',
          name: 'Baseline',
          itemStyle: { color: '#3b82f6' },
          data: [Number(taskMeta?.baseline_hours || 0), 0],
        },
        ...actualSeries,
      ],
      graphic: [{
        type: 'text',
        right: 8,
        top: 8,
        style: { text: `${projectName} · ${taskName}`, fill: '#94a3b8', fontSize: 11 },
      }],
    } as EChartsOption;
  }, [data?.taskLifecycle, data?.topTasks, selectedTaskKey]);

  const laborStackOption: EChartsOption = useMemo(() => {
    const rows = data?.laborTimeline || [];
    if (!rows.length) return {};
    const weeks = Array.from(new Set(rows.map((r) => r.week))).sort();
    const dimKey =
      laborView === 'role' ? 'role'
      : laborView === 'project' ? 'project_name'
      : laborView === 'phase' ? 'phase'
      : 'charge_type';
    const totals = new Map<string, number>();
    rows.forEach((r) => {
      const cat = String((r as unknown as Record<string, string>)[dimKey] || 'Unknown');
      totals.set(cat, (totals.get(cat) || 0) + r.hours);
    });
    const cats = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
    const palette = ['#6366f1', '#818cf8', '#a78bfa', '#10b981', '#34d399', '#f59e0b', '#ef4444', '#64748b', '#14b8a6', '#f97316'];
    const series = cats.map((cat, i) => ({
      name: cat,
      type: 'bar' as const,
      stack: 'total',
      barMaxWidth: 18,
      itemStyle: { color: palette[i % palette.length] },
      data: weeks.map((w) =>
        rows
          .filter((r) => r.week === w && String((r as unknown as Record<string, string>)[dimKey] || 'Unknown') === cat)
          .reduce((s, r) => s + r.hours, 0),
      ),
    }));
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { type: 'scroll', bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 54, right: 18, top: 12, bottom: 42 },
      xAxis: { type: 'category', data: weeks.map((w) => w.slice(5)), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      series,
    } as EChartsOption;
  }, [data?.laborTimeline, laborView]);

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Operating Review</h1>
        <p className="page-subtitle">Portfolio operating cadence — milestones, efficiency, task variance, and labor distribution.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={78} />)}
        </div>
        <Skeleton height={300} />
      </div>
    );
  }

  if (error) return <div><h1 className="page-title">Operating Review</h1><div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{error}</div></div>;
  if (!data) return null;

  const { efficiencyKpis: ek, efficiency: eff } = data;

  return (
    <div>
      <h1 className="page-title">Operating Review</h1>
      <p className="page-subtitle">Portfolio operating cadence — milestones, efficiency, task variance, and labor distribution.</p>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="Total Milestones" value={data.totalMilestones} />
        <KpiCard label="On-Time Completion" value={`${data.totalMilestones > 0 ? Math.round(((data.milestoneDistribution['Completed On Time'] || 0) / data.totalMilestones) * 100) : 0}%`} color="#10b981" detail={`${data.milestoneDistribution['Completed On Time'] || 0} of ${data.totalMilestones}`} />
        <KpiCard label="Execution Efficiency" value={`${ek.efficiencyPct}%`} color={ek.efficiencyPct > 110 ? '#ef4444' : ek.efficiencyPct > 100 ? '#f59e0b' : '#10b981'} detail={`${Math.round(ek.actualTotal).toLocaleString()} / ${Math.round(ek.baselineTotal).toLocaleString()} hrs`} />
        <KpiCard label="Hours Variance" value={`${Math.round(ek.varianceTotal).toLocaleString()} hrs`} color={ek.varianceTotal > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Total Charged Hours" value={Math.round(ek.totalHours).toLocaleString()} />
        <KpiCard label="Delayed / Overdue" value={(data.milestoneDistribution['In Progress Delayed'] || 0) + (data.milestoneDistribution['Not Started Overdue'] || 0) + (data.milestoneDistribution['Completed Late'] || 0)} color="#ef4444" />
      </div>

      {/* Row 1: Milestone Distribution + Weekly Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14, marginBottom: 14 }}>
        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Milestone Execution Distribution</div>
          <ChartWrapper option={milestoneBarOption} height={200} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <button
              onClick={() => setActiveBucket(null)}
              style={{ background: !activeBucket ? 'rgba(99,102,241,0.25)' : 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.18rem 0.45rem', fontSize: '0.66rem', cursor: 'pointer', fontWeight: !activeBucket ? 700 : 400 }}
            >All ({data.totalMilestones})</button>
            {ALL_BUCKETS.map((b) => (
              <button
                key={b}
                onClick={() => setActiveBucket(activeBucket === b ? null : b)}
                style={{ background: activeBucket === b ? `${BUCKET_META[b].color}33` : 'transparent', color: BUCKET_META[b].color, border: `1px solid ${activeBucket === b ? BUCKET_META[b].color : 'var(--glass-border)'}`, borderRadius: 6, padding: '0.18rem 0.45rem', fontSize: '0.66rem', cursor: 'pointer', fontWeight: activeBucket === b ? 700 : 400 }}
              >{b} ({data.milestoneDistribution[b] || 0})</button>
            ))}
          </div>
        </div>

        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Weekly Hours Throughput</div>
          <ChartWrapper option={weeklyOption} height={200} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8, fontSize: '0.67rem', color: 'var(--text-muted)' }}>
            <div>Total Hours: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{Math.round((data.weeklyTrend || []).reduce((s, w) => s + w.hours, 0)).toLocaleString()}</span></div>
            <div>Total Entries: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{(data.weeklyTrend || []).reduce((s, w) => s + w.entries, 0).toLocaleString()}</span></div>
            <div>Total Cost: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>${Math.round((data.weeklyTrend || []).reduce((s, w) => s + w.cost, 0)).toLocaleString()}</span></div>
          </div>
        </div>
      </div>

      {/* Milestone Drill-Down Table */}
      {filteredMilestones.length > 0 && (
        <div className="glass" style={{ padding: '1rem', marginBottom: 14, overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>
            Milestone Detail{activeBucket ? ` — ${activeBucket}` : ''} ({filteredMilestones.length})
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', minWidth: 900, fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Milestone</th>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Baseline Start</th>
                  <th style={{ textAlign: 'center' }}>Baseline End</th>
                  <th style={{ textAlign: 'center' }}>Actual Start</th>
                  <th style={{ textAlign: 'center' }}>Actual / Sched End</th>
                  <th style={{ textAlign: 'right' }}>Progress</th>
                  <th style={{ textAlign: 'center' }}>Critical</th>
                  <th style={{ textAlign: 'left' }}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {filteredMilestones.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td>{m.project_name}</td>
                    <td><span style={{ color: BUCKET_META[m.bucket]?.color || '#94a3b8', fontWeight: 700, fontSize: '0.68rem' }}>{m.bucket}</span></td>
                    <td style={{ textAlign: 'center' }}>{fmtDate(m.baseline_start)}</td>
                    <td style={{ textAlign: 'center' }}>{fmtDate(m.baseline_end)}</td>
                    <td style={{ textAlign: 'center' }}>{fmtDate(m.actual_start)}</td>
                    <td style={{ textAlign: 'center' }}>{fmtDate(m.actual_end || m.end_date)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: m.percent_complete >= 100 ? '#10b981' : m.percent_complete > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{m.percent_complete}%</td>
                    <td style={{ textAlign: 'center' }}>{m.is_critical ? '●' : ''}</td>
                    <td style={{ minWidth: 220 }}>
                      <input
                        value={comments[`milestone:${m.id}`] || ''}
                        onChange={(e) => setComments((prev) => ({ ...prev, [`milestone:${m.id}`]: e.target.value }))}
                        onBlur={(e) => saveComment('milestone', m.id, e.target.value)}
                        placeholder="Add milestone comment"
                        style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                      />
                      {savingCommentKey === `milestone:${m.id}` && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Row 2: Task Variance + Efficiency */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.5fr', gap: 14, marginBottom: 14 }}>
        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Task Hours Variance (Top Movers)</div>
          <ChartWrapper option={taskVarOption} height={Math.max(200, (data.topTasks.slice(0, 15).length) * 22 + 48)} />
        </div>

        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 10 }}>Period Efficiency Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {eff.map((e) => {
              const barColor = e.category === 'Execute' ? '#6366f1' : e.category.includes('Quality') ? '#f59e0b' : '#64748b';
              const isActive = activeEffCategory === e.category;
              return (
                <div key={e.category}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 3, cursor: 'pointer' }}
                    onClick={() => setActiveEffCategory(isActive ? null : e.category)}
                  >
                    <span style={{ fontWeight: isActive ? 700 : 400 }}>{isActive ? '▾ ' : '▸ '}{e.category}</span>
                    <span style={{ fontWeight: 700 }}>{e.pct}% <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({e.hours.toLocaleString()} hrs · {e.entries.toLocaleString()} entries)</span></span>
                  </div>
                  <div style={{ width: '100%', height: 10, borderRadius: 5, background: 'rgba(148,163,184,0.12)' }}>
                    <div style={{ width: `${Math.min(e.pct, 100)}%`, height: '100%', borderRadius: 5, background: barColor, transition: 'width 0.3s' }} />
                  </div>
                  {isActive && (
                    <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto', fontSize: '0.69rem' }}>
                      <table className="dm-table" style={{ width: '100%', fontSize: '0.69rem' }}>
                        <thead><tr><th style={{ textAlign: 'left' }}>Charge Code</th><th style={{ textAlign: 'left' }}>Project</th><th style={{ textAlign: 'right' }}>Hours</th></tr></thead>
                        <tbody>
                          {(data.categorizedCharges?.[e.category] || []).slice(0, 15).map((cc, ci) => (
                            <tr key={ci}><td>{cc.charge_code}</td><td>{cc.project_name}</td><td style={{ textAlign: 'right' }}>{cc.hours.toLocaleString()}</td></tr>
                          ))}
                          {!(data.categorizedCharges?.[e.category]?.length) && <tr><td colSpan={3} style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No detail</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {eff.length === 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No charge data</div>}
          </div>
        </div>
      </div>

      {/* Task Variance Detail Table */}
      <div className="glass" style={{ padding: '1rem', marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Task Variance Register</div>
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', minWidth: 900, fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ width: 26 }} />
                <th style={{ textAlign: 'left' }}>Task</th>
                <th style={{ textAlign: 'left' }}>Project</th>
                <th style={{ textAlign: 'right' }}>Baseline Hrs</th>
                <th style={{ textAlign: 'right' }}>Actual Hrs</th>
                <th style={{ textAlign: 'right' }}>Variance Hrs</th>
                <th style={{ textAlign: 'right' }}>Variance %</th>
                <th style={{ textAlign: 'right' }}>Progress</th>
                <th style={{ textAlign: 'left' }}>Comment</th>
              </tr>
            </thead>
            <tbody>
              {data.topTasks.map((t) => (
                <React.Fragment key={t.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => { toggleTask(t.id); setSelectedTaskKey(`${t.project_name}::${t.task_name}`); }}>
                    <td style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{taskExpanded.has(t.id) ? '▾' : '▸'}</td>
                    <td style={{ fontWeight: 600 }}>{t.task_name}</td>
                    <td>{t.project_name}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(t.baseline_hours).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(t.actual_hours).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: t.variance_hours > 0 ? '#ef4444' : '#10b981' }}>{t.variance_hours > 0 ? '+' : ''}{Math.round(t.variance_hours).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: t.variance_pct > 15 ? '#ef4444' : t.variance_pct > 5 ? '#f59e0b' : '#10b981' }}>{t.variance_pct.toFixed(1)}%</td>
                    <td style={{ textAlign: 'right' }}>{t.percent_complete.toFixed(0)}%</td>
                    <td style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const taskKey = `${t.project_name}::${t.task_name}`;
                        return (
                      <input
                        value={comments[`task:${taskKey}`] || ''}
                        onChange={(e) => setComments((prev) => ({ ...prev, [`task:${taskKey}`]: e.target.value }))}
                        onBlur={(e) => saveComment('task', taskKey, e.target.value)}
                        placeholder="Add task comment"
                        style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                      />
                        );
                      })()}
                      {(() => {
                        const taskKey = `${t.project_name}::${t.task_name}`;
                        return savingCommentKey === `task:${taskKey}` ? <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div> : null;
                      })()}
                    </td>
                  </tr>
                  {taskExpanded.has(t.id) && (
                    <tr>
                      <td colSpan={9} style={{ padding: '0.4rem 0.8rem 0.5rem 2rem', background: 'rgba(99,102,241,0.04)', fontSize: '0.69rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Remaining:</span> {Math.round(t.remaining_hours).toLocaleString()} hrs &nbsp;·&nbsp;
                        <span style={{ color: 'var(--text-muted)' }}>EAC:</span> {Math.round(t.actual_hours + t.remaining_hours).toLocaleString()} hrs &nbsp;·&nbsp;
                        <span style={{ color: 'var(--text-muted)' }}>Efficiency:</span> {t.baseline_hours > 0 ? Math.round((t.actual_hours / t.baseline_hours) * 100) : 0}%
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {data.topTasks.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No task data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mo-style Task Breakdown */}
      <div style={{ marginBottom: 14 }}>
        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Task Breakdown</div>
            <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)' }}>Baseline vs actual segments by date + charge code + charged by</div>
          </div>
          <ChartWrapper option={taskBreakdownOption} height={320} />
        </div>
      </div>

      {/* Row 3: Labor Distribution + Charge Code Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.6fr', gap: 14 }}>
        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>Labor Breakdown (Over-Time)</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['role', 'project', 'phase', 'charge_type'] as const).map((v) => (
                <button key={v} onClick={() => setLaborView(v)} style={{ background: laborView === v ? 'rgba(99,102,241,0.22)' : 'transparent', color: laborView === v ? '#c4b5fd' : 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.18rem 0.45rem', fontSize: '0.66rem', cursor: 'pointer', fontWeight: laborView === v ? 700 : 400 }}>
                  {v === 'role' ? 'By Role' : v === 'project' ? 'By Project' : v === 'phase' ? 'By Phase' : 'By Charge Type'}
                </button>
              ))}
            </div>
          </div>
          <ChartWrapper option={laborStackOption} height={300} />
        </div>

        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Charge Code Distribution</div>
          <ChartWrapper option={chargeOption} height={260} />
        </div>
      </div>
    </div>
  );
}
