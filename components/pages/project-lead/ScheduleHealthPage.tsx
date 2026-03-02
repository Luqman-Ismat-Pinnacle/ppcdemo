'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Project = {
  id: string; name: string;
  percent_complete: number; total_tasks: number; on_track: number; overdue: number;
  spi: number; total_float: number; schedule_variance_days: number;
};
type CriticalTask = {
  id: string; name: string; phase_name: string; project_name: string;
  percent_complete: number; total_float: number; baseline_end: string;
};
type FloatBucket = { float_bucket: string; count: number };
type Phase = {
  id: string; name: string; project_name: string; unit_name: string;
  percent_complete: number; task_count: number; overdue: number;
  spi: number; total_float: number; schedule_variance_days: number;
};
type EmployeeSummary = {
  employee_id: string; employee_name: string; total_tasks: number; overdue: number;
  critical_open: number; avg_spi: number; avg_progress: number; avg_float: number;
};
type Payload = {
  success: boolean;
  projects: Project[];
  phases?: Phase[];
  criticalPath: CriticalTask[];
  floatDistribution: FloatBucket[];
  employeeSummary?: EmployeeSummary[];
};

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (<div className="glass kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={color ? { color } : {}}>{value}</div>{detail && <div className="kpi-detail">{detail}</div>}</div>);
}

function healthColor(v: number) { return v >= 80 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444'; }

export default function ScheduleHealthPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/project-lead/schedule-health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const spiChart = useMemo<EChartsOption>(() => {
    if (!data?.phases?.length) return {};
    const sorted = [...data.phases].sort((a, b) => a.spi - b.spi).slice(0, 20);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 140, right: 40, top: 10, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((p) => p.name.length > 24 ? p.name.slice(0, 22) + '…' : p.name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{ type: 'bar', data: sorted.map((p) => ({ value: Math.round(p.spi * 100) / 100, itemStyle: { borderRadius: [0, 3, 3, 0], color: p.spi >= 0.95 ? '#10b981' : p.spi >= 0.8 ? '#f59e0b' : '#ef4444' } })) }],
    };
  }, [data]);

  const floatChart = useMemo<EChartsOption>(() => {
    if (!data?.floatDistribution?.length) return {};
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['40%', '70%'],
        label: { color: '#cbd5e1', fontSize: 10, formatter: '{b}: {c}' },
        data: data.floatDistribution.map((f) => ({ name: f.float_bucket, value: f.count })),
      }],
    };
  }, [data]);

  const totalCritical = useMemo(() => data?.criticalPath?.length || 0, [data]);
  const overdueCritical = useMemo(() => data?.criticalPath?.filter((t) => t.percent_complete < 100 && t.baseline_end && new Date(t.baseline_end) < new Date()).length || 0, [data]);
  const zeroFloatTasks = useMemo(() => data?.criticalPath?.filter((t) => t.total_float <= 0).length || 0, [data]);
  const avgSpi = useMemo(() => {
    if (!data?.projects?.length) return 0;
    return Math.round((data.projects.reduce((s, p) => s + p.spi, 0) / data.projects.length) * 100) / 100;
  }, [data]);
  const varianceByProject = useMemo<EChartsOption>(() => {
    if (!data?.projects?.length) return {};
    const rows = [...data.projects].sort((a, b) => b.schedule_variance_days - a.schedule_variance_days).slice(0, 15);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 140, right: 30, top: 10, bottom: 30 },
      yAxis: { type: 'category', data: rows.map((r) => r.name.length > 22 ? `${r.name.slice(0, 20)}…` : r.name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', name: 'Variance (days)', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{ type: 'bar', data: rows.map((r) => ({ value: r.schedule_variance_days, itemStyle: { color: r.schedule_variance_days > 0 ? '#ef4444' : '#10b981', borderRadius: [0, 3, 3, 0] } })) }],
    };
  }, [data]);

  const employeeScheduleChart = useMemo<EChartsOption>(() => {
    const rows = [...(data?.employeeSummary || [])].sort((a, b) => b.overdue - a.overdue).slice(0, 12);
    if (!rows.length) return {};
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Overdue', 'Critical'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 140, right: 20, top: 30, bottom: 22 },
      yAxis: { type: 'category', data: rows.map((r) => r.employee_name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [
        { name: 'Overdue', type: 'bar', stack: 'a', data: rows.map((r) => r.overdue), itemStyle: { color: '#f97316' } },
        { name: 'Critical', type: 'bar', stack: 'a', data: rows.map((r) => r.critical_open), itemStyle: { color: '#ef4444', borderRadius: [0, 3, 3, 0] } },
      ],
    };
  }, [data]);

  if (loading) return <div><h1 className="page-title">Schedule Health</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={80} />)}</div><Skeleton height={300} /></div>;
  if (!data?.success) return <div><h1 className="page-title">Schedule Health</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load schedule data.</div></div>;

  return (
    <div>
      <h1 className="page-title">Schedule Health</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '0.95rem' }}>
        <KpiCard label="Avg SPI" value={avgSpi.toFixed(2)} color={avgSpi >= 0.95 ? '#10b981' : avgSpi >= 0.8 ? '#f59e0b' : '#ef4444'} />
        <KpiCard label="Critical Tasks" value={totalCritical} detail={`${overdueCritical} overdue`} color={overdueCritical > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Zero/Neg Float" value={zeroFloatTasks} color={zeroFloatTasks > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Projects" value={data.projects.length} />
        <KpiCard label="Avg Progress" value={`${data.projects.length > 0 ? (data.projects.reduce((s, p) => s + p.percent_complete, 0) / data.projects.length).toFixed(1) : 0}%`} color={healthColor(data.projects.length > 0 ? data.projects.reduce((s, p) => s + p.percent_complete, 0) / data.projects.length : 0)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>SPI by Phase</h3>
          <ChartWrapper option={spiChart} height={Math.max(210, (data.phases?.length || 5) * 20)} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Float Distribution</h3>
          <ChartWrapper option={floatChart} height={205} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Schedule Variance by Project</h3>
        <ChartWrapper option={varianceByProject} height={Math.max(200, (data.projects?.length || 5) * 22)} />
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Phase Schedule Summary</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Phase', 'Project', 'Unit', 'SPI', 'Progress', 'Tasks', 'Overdue', 'Float', 'Variance (d)'].map((h) => (
                  <th key={h} style={{ padding: '0.32rem 0.42rem', textAlign: ['Phase', 'Project', 'Unit'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.phases || []).map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                  <td style={{ padding: '0.32rem 0.42rem', color: '#e2e8f0', fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: '0.32rem 0.42rem', color: '#94a3b8' }}>{p.project_name}</td>
                  <td style={{ padding: '0.32rem 0.42rem', color: '#94a3b8' }}>{p.unit_name || '—'}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: p.spi >= 0.95 ? '#10b981' : p.spi >= 0.8 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>{p.spi.toFixed(2)}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: '#94a3b8' }}>{p.percent_complete.toFixed(0)}%</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: '#94a3b8' }}>{p.task_count}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: p.overdue > 0 ? '#ef4444' : '#94a3b8' }}>{p.overdue}</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: p.total_float <= 0 ? '#ef4444' : '#94a3b8' }}>{p.total_float}d</td>
                  <td style={{ padding: '0.32rem 0.42rem', textAlign: 'right', color: p.schedule_variance_days > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{p.schedule_variance_days > 0 ? '+' : ''}{p.schedule_variance_days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>Critical Path Tasks</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Task', 'Phase', 'Project', 'Progress', 'Float', 'Finish'].map((h) => (
                  <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: ['Task', 'Phase', 'Project'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.criticalPath.map((t) => {
                const isOverdue = t.percent_complete < 100 && t.baseline_end && new Date(t.baseline_end) < new Date();
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', color: isOverdue ? '#ef4444' : '#e2e8f0', fontWeight: 500 }}>● {t.name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{t.phase_name || '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{t.project_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{t.percent_complete.toFixed(0)}%</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: t.total_float <= 0 ? '#ef4444' : '#94a3b8' }}>{t.total_float}d</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: isOverdue ? '#f97316' : '#94a3b8', fontSize: '0.64rem' }}>{t.baseline_end || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginTop: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.45rem' }}>Schedule by Employee</h3>
        <ChartWrapper option={employeeScheduleChart} height={Math.max(220, ((data?.employeeSummary?.length || 5) * 24))} />
        <div style={{ overflowX: 'auto', marginTop: '0.6rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Employee', 'Tasks', 'Overdue', 'Critical', 'Avg SPI', 'Avg Progress', 'Avg Float (d)'].map((h) => (
                  <th key={h} style={{ padding: '0.35rem 0.45rem', textAlign: h === 'Employee' ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.employeeSummary || []).map((e) => (
                <tr key={e.employee_id} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                  <td style={{ padding: '0.35rem 0.45rem', color: '#e2e8f0' }}>{e.employee_name}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: '#94a3b8' }}>{e.total_tasks}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: e.overdue > 0 ? '#ef4444' : '#94a3b8' }}>{e.overdue}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: e.critical_open > 0 ? '#ef4444' : '#94a3b8' }}>{e.critical_open}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: e.avg_spi >= 0.95 ? '#10b981' : e.avg_spi >= 0.8 ? '#f59e0b' : '#ef4444' }}>{e.avg_spi.toFixed(2)}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: healthColor(e.avg_progress) }}>{e.avg_progress.toFixed(1)}%</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: e.avg_float <= 0 ? '#ef4444' : '#94a3b8' }}>{e.avg_float.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
