'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type CadenceRow = { week_start: string; target_hrs: number; actual_hrs: number; adherence_pct: number };
type SprintBurnRow = { sprint_name: string; project_name: string; planned_hrs: number; actual_hrs: number; burn_pct: number };

type Payload = {
  success: boolean;
  kpis: { totalHours: number; executeRatio: number; avgWeeklyHours: number; headcount: number; milestoneOnTimeRate: number };
  weeklyThroughput: { week: string; hours: number; headcount: number }[];
  chargeBreakdown: { category: string; hours: number; pct: number }[];
  milestoneDist: Record<string, number>;
  laborByProject: { project_id: string; project_name: string; hours: number }[];
  cadenceAdherence?: CadenceRow[];
  sprintBurn?: SprintBurnRow[];
};

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

export default function OperatingRhythmPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/senior-manager/operating-rhythm', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const weeklyChart = useMemo<EChartsOption>(() => {
    if (!data?.weeklyThroughput.length) return {};
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Hours', 'Headcount'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 55, top: 35, bottom: 30 },
      xAxis: { type: 'category', data: data.weeklyThroughput.map((w) => w.week), axisLabel: { color: '#94a3b8', fontSize: 9, rotate: 30 } },
      yAxis: [
        { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
        { type: 'value', name: 'Headcount', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Hours', type: 'bar', data: data.weeklyThroughput.map((w) => w.hours), itemStyle: { borderRadius: [3, 3, 0, 0], color: 'rgba(99,102,241,0.55)' } },
        { name: 'Headcount', type: 'line', yAxisIndex: 1, data: data.weeklyThroughput.map((w) => w.headcount), smooth: true, lineStyle: { color: '#10b981' }, itemStyle: { color: '#10b981' } },
      ],
    };
  }, [data]);

  const chargeChart = useMemo<EChartsOption>(() => {
    if (!data?.chargeBreakdown.length) return {};
    const colorMap: Record<string, string> = { Execute: '#10b981', 'Non-Execute': '#f59e0b', 'Quality / Rework': '#ef4444' };
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        label: { color: '#cbd5e1', fontSize: 10, formatter: '{b}: {d}%' },
        data: data.chargeBreakdown.map((c) => ({ name: c.category, value: c.hours, itemStyle: { color: colorMap[c.category] || '#6366f1' } })),
      }],
    };
  }, [data]);

  const milestoneChart = useMemo<EChartsOption>(() => {
    if (!data?.milestoneDist) return {};
    const colorMap: Record<string, string> = { on_time: '#10b981', on_track: '#3b82f6', late: '#f59e0b', delayed: '#f97316', overdue: '#ef4444', upcoming: '#64748b' };
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        label: { color: '#cbd5e1', fontSize: 10 },
        data: Object.entries(data.milestoneDist).map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: v, itemStyle: { color: colorMap[k] || '#6366f1' } })),
      }],
    };
  }, [data]);

  const laborChart = useMemo<EChartsOption>(() => {
    if (!data?.laborByProject.length) return {};
    const sorted = [...data.laborByProject].sort((a, b) => b.hours - a.hours).slice(0, 12);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 120, right: 40, top: 20, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((p) => p.project_name.length > 22 ? p.project_name.slice(0, 20) + '…' : p.project_name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{ type: 'bar', data: sorted.map((p) => p.hours), itemStyle: { borderRadius: [0, 3, 3, 0], color: 'rgba(99,102,241,0.6)' } }],
    };
  }, [data]);

  const cadenceChart = useMemo<EChartsOption>(() => {
    if (!data?.cadenceAdherence?.length) return {};
    const rows = [...data.cadenceAdherence].reverse();
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Actual hrs', 'Target hrs', 'Adherence %'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 55, top: 35, bottom: 30 },
      xAxis: { type: 'category', data: rows.map((r) => r.week_start ? new Date(r.week_start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''), axisLabel: { color: '#94a3b8', fontSize: 9 } },
      yAxis: [
        { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
        { type: 'value', name: 'Adherence %', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Actual hrs', type: 'bar', data: rows.map((r) => r.actual_hrs), itemStyle: { borderRadius: [3, 3, 0, 0], color: 'rgba(99,102,241,0.6)' } },
        { name: 'Target hrs', type: 'line', data: rows.map((r) => r.target_hrs), lineStyle: { color: '#64748b', type: 'dashed' }, itemStyle: { color: '#64748b' } },
        { name: 'Adherence %', type: 'line', yAxisIndex: 1, data: rows.map((r) => r.adherence_pct), smooth: true, lineStyle: { color: '#10b981' }, itemStyle: { color: '#10b981' } },
      ],
    };
  }, [data]);

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Operating Rhythm</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
        <Skeleton height={300} />
      </div>
    );
  }

  if (!data?.success) {
    return <div><h1 className="page-title">Operating Rhythm</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load operating rhythm data.</div></div>;
  }

  const k = data.kpis;

  return (
    <div>
      <h1 className="page-title">Operating Rhythm</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <KpiCard label="Total Hours" value={k.totalHours.toLocaleString()} />
        <KpiCard label="Execute Ratio" value={`${k.executeRatio}%`} color={k.executeRatio >= 70 ? '#10b981' : k.executeRatio >= 50 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Avg Weekly Hours" value={k.avgWeeklyHours.toFixed(1)} />
        <KpiCard label="Headcount" value={k.headcount} />
        <KpiCard label="Milestone On-Time" value={`${k.milestoneOnTimeRate}%`} color={k.milestoneOnTimeRate >= 80 ? '#10b981' : '#f59e0b'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Weekly Throughput & Headcount</h3>
          <ChartWrapper option={weeklyChart} height={240} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Charge Breakdown</h3>
          <ChartWrapper option={chargeChart} height={240} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Milestone Status</h3>
          <ChartWrapper option={milestoneChart} height={200} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Labor by Project (4 weeks)</h3>
          <ChartWrapper option={laborChart} height={200} />
        </div>
      </div>

      {data.cadenceAdherence && data.cadenceAdherence.length > 0 && (
        <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Cadence Adherence (Weekly Target vs Actual)</h3>
          <ChartWrapper option={cadenceChart} height={200} />
        </div>
      )}

      {data.sprintBurn && data.sprintBurn.length > 0 && (
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Sprint Burn Comparison</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                  {['Sprint', 'Project', 'Planned hrs', 'Actual hrs', 'Burn %'].map((h) => (
                    <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: ['Sprint', 'Project'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sprintBurn.slice(0, 15).map((s, i) => (
                  <tr key={`${s.sprint_name}-${s.project_name}-${i}`} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0' }}>{s.sprint_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{s.project_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{s.planned_hrs.toLocaleString()}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{s.actual_hrs.toLocaleString()}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: s.burn_pct >= 100 ? '#10b981' : s.burn_pct >= 70 ? '#f59e0b' : '#ef4444' }}>{s.burn_pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
