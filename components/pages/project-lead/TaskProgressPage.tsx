'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Phase = {
  id: string; name: string; project_id: string; project_name: string; unit_name: string;
  baseline_hours: number; actual_hours: number; remaining_hours: number; total_hours: number;
  percent_complete: number; baseline_start: string; baseline_end: string;
  actual_start: string; actual_end: string; is_critical: boolean;
  task_count: number; completed_count: number; overdue_count: number;
};
type Task = {
  id: string; name: string; phase_id: string; phase_name: string;
  project_id: string; project_name: string;
  baseline_hours: number; actual_hours: number; remaining_hours: number;
  percent_complete: number; baseline_start: string; baseline_end: string;
  actual_start: string; actual_end: string;
  is_critical: boolean; is_milestone: boolean; predecessor_task_id: string; employee_id: string;
};
type WeeklyProgress = { week: string; completed: number; started: number; total_hours: number };
type EmployeeSummary = {
  employee_id: string; employee_name: string; task_count: number; completed_count: number;
  overdue_count: number; critical_open: number; avg_progress: number; actual_hours: number; remaining_hours: number;
};
type Payload = { success: boolean; phases: Phase[]; tasks: Task[]; weeklyProgress: WeeklyProgress[]; employeeSummary?: EmployeeSummary[] };

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (<div className="glass kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={color ? { color } : {}}>{value}</div>{detail && <div className="kpi-detail">{detail}</div>}</div>);
}

function healthColor(v: number) { return v >= 80 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444'; }

export default function TaskProgressPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState('all');
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/project-lead/task-progress', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const projects = useMemo(() => {
    if (!data?.phases) return [];
    const m = new Map<string, string>();
    data.phases.forEach((p) => m.set(p.project_id, p.project_name));
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const filteredPhases = useMemo(() => {
    if (!data?.phases) return [];
    return projectFilter === 'all' ? data.phases : data.phases.filter((p) => p.project_id === projectFilter);
  }, [data, projectFilter]);

  const phaseTasks = useMemo(() => {
    if (!data?.tasks || !expandedPhase) return [];
    return data.tasks.filter((t) => t.phase_id === expandedPhase);
  }, [data, expandedPhase]);

  const totalTasks = useMemo(() => data?.tasks?.length || 0, [data]);
  const completedTasks = useMemo(() => data?.tasks?.filter((t) => t.percent_complete >= 100).length || 0, [data]);
  const overdueTasks = useMemo(() => data?.tasks?.filter((t) => t.percent_complete < 100 && t.baseline_end && new Date(t.baseline_end) < new Date()).length || 0, [data]);
  const criticalTasks = useMemo(() => data?.tasks?.filter((t) => t.is_critical && t.percent_complete < 100).length || 0, [data]);
  const milestoneTasks = useMemo(() => data?.tasks?.filter((t) => t.is_milestone).length || 0, [data]);

  const weeklyChart = useMemo<EChartsOption>(() => {
    if (!data?.weeklyProgress?.length) return {};
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Completed', 'In Progress', 'Hours'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 50, right: 50, top: 35, bottom: 30 },
      xAxis: { type: 'category', data: data.weeklyProgress.map((w) => w.week.slice(5)), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        { type: 'value', name: 'Tasks', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
        { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Completed', type: 'bar', stack: 'tasks', data: data.weeklyProgress.map((w) => w.completed), itemStyle: { borderRadius: [3, 3, 0, 0], color: '#10b981' } },
        { name: 'In Progress', type: 'bar', stack: 'tasks', data: data.weeklyProgress.map((w) => w.started), itemStyle: { color: '#3b82f6' } },
        { name: 'Hours', type: 'line', yAxisIndex: 1, data: data.weeklyProgress.map((w) => w.total_hours), smooth: true, lineStyle: { color: '#f59e0b' }, itemStyle: { color: '#f59e0b' } },
      ],
    };
  }, [data]);

  const phaseCompletionChart = useMemo<EChartsOption>(() => {
    if (!filteredPhases.length) return {};
    const sorted = [...filteredPhases].sort((a, b) => a.percent_complete - b.percent_complete).slice(0, 20);
    return {
      tooltip: { trigger: 'axis', formatter: (params: unknown) => { const d = (params as { dataIndex: number }[])[0]; const ph = sorted[d.dataIndex]; return `${ph.name}<br/>Progress: ${ph.percent_complete.toFixed(1)}%<br/>Tasks: ${ph.completed_count}/${ph.task_count}<br/>Overdue: ${ph.overdue_count}`; } },
      grid: { left: 140, right: 40, top: 10, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((p) => p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', max: 100, axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{ type: 'bar', data: sorted.map((p) => ({ value: Math.round(p.percent_complete * 10) / 10, itemStyle: { borderRadius: [0, 3, 3, 0], color: p.is_critical ? '#ef4444' : healthColor(p.percent_complete) } })) }],
    };
  }, [filteredPhases]);

  const employeeLoadChart = useMemo<EChartsOption>(() => {
    const rows = [...(data?.employeeSummary || [])].sort((a, b) => b.task_count - a.task_count).slice(0, 12);
    if (!rows.length) return {};
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Completed', 'Overdue', 'Critical'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 140, right: 20, top: 30, bottom: 22 },
      yAxis: { type: 'category', data: rows.map((r) => r.employee_name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [
        { name: 'Completed', type: 'bar', stack: 'a', data: rows.map((r) => r.completed_count), itemStyle: { color: '#10b981' } },
        { name: 'Overdue', type: 'bar', stack: 'a', data: rows.map((r) => r.overdue_count), itemStyle: { color: '#f97316' } },
        { name: 'Critical', type: 'bar', stack: 'a', data: rows.map((r) => r.critical_open), itemStyle: { color: '#ef4444', borderRadius: [0, 3, 3, 0] } },
      ],
    };
  }, [data]);

  if (loading) return <div><h1 className="page-title">Task Progress</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={80} />)}</div><Skeleton height={300} /></div>;
  if (!data?.success) return <div><h1 className="page-title">Task Progress</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load task data.</div></div>;

  return (
    <div>
      <h1 className="page-title">Task Progress</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <KpiCard label="Total Tasks" value={totalTasks} />
        <KpiCard label="Completed" value={completedTasks} color="#10b981" detail={`${totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : 0}%`} />
        <KpiCard label="Overdue" value={overdueTasks} color={overdueTasks > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Critical Open" value={criticalTasks} color={criticalTasks > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Milestones" value={milestoneTasks} />
        <KpiCard label="Phases" value={filteredPhases.length} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Weekly Progress</h3>
          <ChartWrapper option={weeklyChart} height={240} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Phase Completion</h3>
          <ChartWrapper option={phaseCompletionChart} height={240} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Phase → Task Drill-Down</h3>
          <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setExpandedPhase(null); }} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }}>
            <option value="all">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Phase', 'Project', 'Tasks', 'Overdue', 'Progress', 'Hours (Act/Base)', 'Remaining', 'Schedule'].map((h) => (
                  <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: ['Phase', 'Project'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPhases.map((ph) => (
                <React.Fragment key={ph.id}>
                  <tr onClick={() => setExpandedPhase((prev) => prev === ph.id ? null : ph.id)} style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.06)', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                    <td style={{ padding: '0.4rem 0.5rem', color: ph.is_critical ? '#ef4444' : '#e2e8f0', fontWeight: 500 }}>{ph.is_critical ? '● ' : ''}{ph.name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{ph.project_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{ph.completed_count}/{ph.task_count}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: ph.overdue_count > 0 ? '#ef4444' : '#94a3b8' }}>{ph.overdue_count}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                        <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                          <div style={{ width: `${Math.min(100, ph.percent_complete)}%`, height: '100%', background: healthColor(ph.percent_complete), borderRadius: 2 }} />
                        </div>
                        <span style={{ color: '#94a3b8' }}>{ph.percent_complete.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{ph.actual_hours.toLocaleString()} / {ph.baseline_hours.toLocaleString()}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{ph.remaining_hours.toLocaleString()}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8', fontSize: '0.64rem' }}>{ph.baseline_start || '—'} → {ph.baseline_end || '—'}</td>
                  </tr>
                  {expandedPhase === ph.id && phaseTasks.length > 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', background: 'rgba(30,41,59,0.45)' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                              {['Task', 'Type', 'Progress', 'Hours (Act/Base)', 'Remaining', 'Schedule', 'Predecessor'].map((h) => (
                                <th key={h} style={{ padding: '0.35rem 0.5rem', textAlign: h === 'Task' ? 'left' : 'right', color: '#64748b', fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {phaseTasks.map((t) => {
                              const isOverdue = t.percent_complete < 100 && t.baseline_end && new Date(t.baseline_end) < new Date();
                              return (
                                <tr key={t.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.04)' }}>
                                  <td style={{ padding: '0.35rem 0.5rem', color: t.is_critical ? '#ef4444' : isOverdue ? '#f97316' : '#cbd5e1' }}>{t.is_critical ? '● ' : ''}{t.name}</td>
                                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#64748b' }}>{t.is_milestone ? 'Milestone' : t.is_critical ? 'Critical' : 'Task'}</td>
                                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                      <div style={{ width: 36, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                                        <div style={{ width: `${Math.min(100, t.percent_complete)}%`, height: '100%', background: healthColor(t.percent_complete), borderRadius: 2 }} />
                                      </div>
                                      <span style={{ color: '#94a3b8' }}>{t.percent_complete.toFixed(0)}%</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{t.actual_hours.toLocaleString()} / {t.baseline_hours.toLocaleString()}</td>
                                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{t.remaining_hours.toLocaleString()}</td>
                                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: isOverdue ? '#f97316' : '#94a3b8', fontSize: '0.62rem' }}>{t.baseline_start || '—'} → {t.baseline_end || '—'}</td>
                                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#64748b', fontSize: '0.6rem' }}>{t.predecessor_task_id || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginTop: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.45rem' }}>Employee Task Execution</h3>
        <ChartWrapper option={employeeLoadChart} height={Math.max(220, ((data?.employeeSummary?.length || 5) * 24))} />
        <div style={{ overflowX: 'auto', marginTop: '0.6rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Employee', 'Tasks', 'Completed', 'Overdue', 'Critical Open', 'Avg Progress', 'Hours (Act/Rem)'].map((h) => (
                  <th key={h} style={{ padding: '0.35rem 0.45rem', textAlign: h === 'Employee' ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.employeeSummary || []).map((e) => (
                <tr key={e.employee_id} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                  <td style={{ padding: '0.35rem 0.45rem', color: '#e2e8f0' }}>{e.employee_name}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: '#94a3b8' }}>{e.task_count}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: '#10b981' }}>{e.completed_count}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: e.overdue_count > 0 ? '#ef4444' : '#94a3b8' }}>{e.overdue_count}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: e.critical_open > 0 ? '#ef4444' : '#94a3b8' }}>{e.critical_open}</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: healthColor(e.avg_progress) }}>{e.avg_progress.toFixed(1)}%</td>
                  <td style={{ padding: '0.35rem 0.45rem', textAlign: 'right', color: '#94a3b8' }}>{e.actual_hours.toFixed(1)} / {e.remaining_hours.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
