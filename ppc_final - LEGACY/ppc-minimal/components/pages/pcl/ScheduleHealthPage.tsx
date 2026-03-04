'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';

interface OverdueTask {
  id: string; task_name: string; project_id: string; project_name: string;
  finish_date: string; percent_complete: number; days_overdue: number; total_float: number;
}
interface CriticalTask {
  id: string; task_name: string; project_id: string; project_name: string;
  start_date: string; finish_date: string; percent_complete: number; total_float: number;
}
interface ProjectHealth {
  id: string; name: string; percent_complete: number; actual_hours: number; baseline_hours: number;
  spi: number; critical_count: number; overdue_count: number; schedule_health?: number;
}
interface ScheduleData {
  kpis: {
    spi: number;
    overdueTasks: number;
    criticalTasks: number;
    avgFloat: number;
    slippedProjects: number;
    lowSpiProjects: number;
    overdueProjects: number;
  };
  overdueTasks: OverdueTask[];
  criticalPathTasks: CriticalTask[];
  projectScheduleHealth: ProjectHealth[];
  monthTrend: Array<{ month: string; spi: number; overdue_tasks: number }>;
}

const spiColor = (v: number) => v >= 0.95 ? '#10b981' : v >= 0.8 ? '#f59e0b' : '#ef4444';
const floatColor = (v: number) => v >= 10 ? '#10b981' : v >= 5 ? '#f59e0b' : '#ef4444';
const healthColor = (v: number) => v >= 75 ? '#22c55e' : v >= 55 ? '#f59e0b' : '#ef4444';

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
    </div>
  );
}

export default function PclScheduleHealthPage() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/pcl/schedule-health', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (!d.success) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const projectSpiChart = useMemo(() => {
    if (!data?.projectScheduleHealth) return null;
    const sorted = [...data.projectScheduleHealth]
      .sort((a, b) => Number(a.spi) - Number(b.spi))
      .slice(0, 20);
    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (p: any) => {
          const row = sorted[p?.dataIndex || 0];
          if (!row) return '';
          return `<b>${row.name}</b><br/>SPI: ${Number(row.spi).toFixed(2)}<br/>Overdue Tasks: ${Number(row.overdue_count || 0)}<br/>Critical Tasks: ${Number(row.critical_count || 0)}`;
        },
      },
      grid: { left: 150, right: 24, top: 24, bottom: 30 },
      xAxis: {
        type: 'value' as const,
        name: 'SPI',
        min: 0,
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } },
      },
      yAxis: {
        type: 'category' as const,
        data: sorted.map(p => String(p.name).slice(0, 28)),
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      series: [
        {
          name: 'Project SPI',
          type: 'bar' as const,
          data: sorted.map(p => ({
            value: Number(p.spi),
            itemStyle: { color: spiColor(Number(p.spi)), borderRadius: [0, 4, 4, 0] },
          })),
          markLine: {
            data: [{ xAxis: 1, lineStyle: { color: '#10b981', type: 'dashed' as const }, label: { formatter: 'Target SPI 1.0', color: '#10b981' } }],
            symbol: 'none',
          },
        },
      ],
    };
  }, [data]);

  const monthTrendChart = useMemo(() => {
    if (!data?.monthTrend?.length) return null;
    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: ['SPI', 'Overdue Tasks'], bottom: 8, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 40, right: 20, top: 20, bottom: 56 },
      xAxis: { type: 'category' as const, data: data.monthTrend.map((m) => m.month), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        { type: 'value' as const, name: 'SPI', min: 0, axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.12)' } } },
        { type: 'value' as const, name: 'Overdue', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'SPI', type: 'line' as const, smooth: true, data: data.monthTrend.map((m) => Number(m.spi || 0)), lineStyle: { color: '#10b981', width: 2 }, itemStyle: { color: '#10b981' }, areaStyle: { color: 'rgba(16,185,129,0.12)' }, symbolSize: 7 },
        { name: 'Overdue Tasks', type: 'bar' as const, yAxisIndex: 1, data: data.monthTrend.map((m) => Number(m.overdue_tasks || 0)), itemStyle: { color: '#f59e0b', borderRadius: [4, 4, 0, 0] } },
      ],
    };
  }, [data]);

  if (loading) return (
    <div>
      <h1 className="page-title">Schedule Health</h1>
      <p className="page-subtitle">Portfolio-wide schedule performance and critical path oversight.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={80} />)}
      </div>
      <Skeleton height={300} />
    </div>
  );

  if (error) return (
    <div>
      <h1 className="page-title">Schedule Health</h1>
      <div style={{ color: 'var(--color-error)', fontSize: '0.82rem' }}>{error}</div>
    </div>
  );

  if (!data) return null;
  const { kpis, overdueTasks, criticalPathTasks, projectScheduleHealth } = data;
  const onTrackProjects = projectScheduleHealth.filter((p) => Number(p.spi) >= 1 && Number(p.overdue_count || 0) === 0).length;

  return (
    <div>
      <h1 className="page-title">Schedule Health</h1>
      <p className="page-subtitle">Portfolio-wide schedule performance and critical path oversight.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Portfolio SPI" value={kpis.spi.toFixed(2)} color={spiColor(kpis.spi)} />
        <KpiCard label="Critical Tasks" value={kpis.criticalTasks} color={kpis.criticalTasks > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Overdue Tasks" value={kpis.overdueTasks} color={kpis.overdueTasks > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Avg Float (days)" value={kpis.avgFloat} color={floatColor(kpis.avgFloat)} />
        <KpiCard label="Slipped Projects" value={kpis.slippedProjects} color={kpis.slippedProjects > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Low SPI Projects" value={kpis.lowSpiProjects} color={kpis.lowSpiProjects > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Projects w/ Overdues" value={kpis.overdueProjects} color={kpis.overdueProjects > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="On-Track Projects" value={onTrackProjects} color={onTrackProjects > 0 ? '#10b981' : '#f59e0b'} />
      </div>

      {projectSpiChart && (
        <div className="glass-raised" style={{ padding: '1rem', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 8 }}>SPI by Project</div>
          <ChartWrapper option={projectSpiChart} height={320} />
        </div>
      )}

      {monthTrendChart && (
        <div className="glass-raised" style={{ padding: '1rem', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 8 }}>Schedule Trend (SPI + Overdues)</div>
          <ChartWrapper option={monthTrendChart} height={300} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Overdue Tasks</div>
          <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>Task</th>
                  <th style={{ textAlign: 'left' }}>Due</th>
                  <th style={{ textAlign: 'right' }}>% Done</th>
                  <th style={{ textAlign: 'right' }}>Days Over</th>
                </tr>
              </thead>
              <tbody>
                {overdueTasks.map((t, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.project_name}</td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task_name}</td>
                    <td>{t.finish_date ? new Date(t.finish_date).toLocaleDateString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(t.percent_complete))}%</td>
                    <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{t.days_overdue}</td>
                  </tr>
                ))}
                {overdueTasks.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No overdue tasks</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Critical Path Tasks</div>
          <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto' }}>
            <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Project</th>
                  <th style={{ textAlign: 'left' }}>Task</th>
                  <th style={{ textAlign: 'left' }}>Start</th>
                  <th style={{ textAlign: 'left' }}>Finish</th>
                  <th style={{ textAlign: 'right' }}>% Done</th>
                  <th style={{ textAlign: 'right' }}>Float</th>
                </tr>
              </thead>
              <tbody>
                {criticalPathTasks.map((t, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.project_name}</td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.task_name}</td>
                    <td>{t.start_date ? new Date(t.start_date).toLocaleDateString() : '-'}</td>
                    <td>{t.finish_date ? new Date(t.finish_date).toLocaleDateString() : '-'}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(Number(t.percent_complete))}%</td>
                    <td style={{ textAlign: 'right', color: floatColor(Number(t.total_float)), fontWeight: 600 }}>{Number(t.total_float)}</td>
                  </tr>
                ))}
                {criticalPathTasks.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No critical path tasks</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: '1rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', marginBottom: 10 }}>Project Schedule Summary</div>
        <div style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Project</th>
                <th style={{ textAlign: 'right' }}>% Complete</th>
                <th style={{ textAlign: 'right' }}>SPI</th>
                <th style={{ textAlign: 'right' }}>Schedule Health</th>
                <th style={{ textAlign: 'right' }}>Critical</th>
                <th style={{ textAlign: 'right' }}>Overdue</th>
                <th style={{ textAlign: 'right' }}>Actual Hrs</th>
                <th style={{ textAlign: 'right' }}>Baseline Hrs</th>
              </tr>
            </thead>
            <tbody>
              {projectScheduleHealth.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                  <td style={{ textAlign: 'right' }}>{Math.round(Number(p.percent_complete))}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: spiColor(Number(p.spi)) }}>{Number(p.spi).toFixed(2)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: p.schedule_health != null ? healthColor(p.schedule_health) : 'inherit' }}>{p.schedule_health != null ? `${p.schedule_health}%` : '—'}</td>
                  <td style={{ textAlign: 'right', color: Number(p.critical_count) > 0 ? '#ef4444' : 'var(--text-muted)' }}>{p.critical_count}</td>
                  <td style={{ textAlign: 'right', color: Number(p.overdue_count) > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{p.overdue_count}</td>
                  <td style={{ textAlign: 'right' }}>{Math.round(Number(p.actual_hours)).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>{Math.round(Number(p.baseline_hours)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
