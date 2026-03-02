'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import Link from 'next/link';
import { useUser } from '@/lib/user-context';
import { getGreetingTitle } from '@/lib/greeting';

type Project = {
  id: string; name: string; customer_name: string; portfolio_name: string;
  actual_hours: number; baseline_hours: number; remaining_hours: number; total_hours: number;
  actual_cost: number; remaining_cost: number; contract_value: number; eac: number; margin: number;
  percent_complete: number; baseline_start: string; baseline_end: string; actual_start: string;
  critical_open: number; total_tasks: number; completed_tasks: number; overdue_tasks: number;
  spi: number; variance_pct: number;
};
type TrendPoint = { month: string; hours: number; cost: number };
type ActionItem = { id: string; item_type: string; title: string; message: string; project_name: string; status: string; priority: string; created_at: string };
type SummaryPayload = {
  success: boolean;
  kpis: {
    activeProjects: number; totalTasks: number; completedTasks: number; overdueTasks: number;
    criticalOpen: number; completionRate: number; totalActual: number; totalEac: number;
    totalContract: number; avgCompletion: number; portfolioMargin: number;
  };
  projects: Project[];
  costTrend: TrendPoint[];
  taskStatusByProject: Record<string, Record<string, number>>;
  actionItems: ActionItem[];
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

function healthColor(v: number, isMargin = false) {
  if (isMargin) return v >= 15 ? '#10b981' : v >= 5 ? '#f59e0b' : '#ef4444';
  return v >= 75 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444';
}

const fmt = (n: number | null | undefined) => {
  const safe = Number.isFinite(n) ? Number(n) : 0;
  if (Math.abs(safe) >= 1e6) return `$${(safe / 1e6).toFixed(1)}M`;
  if (Math.abs(safe) >= 1e3) return `$${(safe / 1e3).toFixed(0)}K`;
  return `$${safe.toFixed(0)}`;
};

export default function PLCommandCenterPage() {
  const { user } = useUser();
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/api/project-lead/summary', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const actionHref = useCallback((a: ActionItem) => {
    if (a.item_type === 'forecast') return '/project-lead/forecast';
    if (a.item_type === 'overdue_task') return '/project-lead/task-progress';
    if (a.item_type === 'critical_task' || a.item_type === 'schedule_variance') return '/project-lead/schedule-health';
    if (a.item_type === 'cost_pressure') return '/project-lead/cost-control';
    if (a.item_type === 'notification') return '/project-lead';
    return '/project-lead';
  }, []);

  const groupedActions = useMemo(() => {
    const map: Record<string, ActionItem[]> = {};
    (data?.actionItems || []).forEach((a) => {
      if (!map[a.item_type]) map[a.item_type] = [];
      map[a.item_type].push(a);
    });
    return map;
  }, [data]);

  const burnTrendChart = useMemo<EChartsOption>(() => {
    if (!data?.costTrend?.length) return {};
    const cumCost: number[] = [];
    data.costTrend.forEach((t, i) => { cumCost.push((cumCost[i - 1] || 0) + t.cost); });
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Monthly Cost', 'Hours', 'Cumulative Cost'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 55, top: 35, bottom: 30 },
      xAxis: { type: 'category', data: data.costTrend.map((t) => t.month), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        { type: 'value', name: '$', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
        { type: 'value', name: 'Hrs', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Monthly Cost', type: 'bar', data: data.costTrend.map((t) => t.cost), itemStyle: { borderRadius: [3, 3, 0, 0], color: 'rgba(99,102,241,0.5)' } },
        { name: 'Hours', type: 'line', yAxisIndex: 1, data: data.costTrend.map((t) => t.hours), smooth: true, lineStyle: { color: '#10b981' }, itemStyle: { color: '#10b981' } },
        { name: 'Cumulative Cost', type: 'line', data: cumCost, smooth: true, lineStyle: { color: '#f59e0b', type: 'dashed' as const }, itemStyle: { color: '#f59e0b' }, symbol: 'none' },
      ],
    };
  }, [data]);

  const taskStatusChart = useMemo<EChartsOption>(() => {
    if (!data?.taskStatusByProject) return {};
    const agg: Record<string, number> = {};
    Object.values(data.taskStatusByProject).forEach((m) => {
      Object.entries(m).forEach(([k, v]) => { agg[k] = (agg[k] || 0) + v; });
    });
    const colorMap: Record<string, string> = { completed: '#10b981', in_progress: '#3b82f6', critical: '#ef4444', overdue: '#f97316', not_started: '#64748b' };
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['40%', '70%'],
        label: { color: '#cbd5e1', fontSize: 10, formatter: '{b}: {d}%' },
        data: Object.entries(agg).map(([k, v]) => ({
          name: k.replace(/_/g, ' '), value: v,
          itemStyle: { color: colorMap[k] || '#6366f1' },
        })),
      }],
    };
  }, [data]);

  const projectHealthChart = useMemo<EChartsOption>(() => {
    if (!data?.projects?.length) return {};
    const sorted = [...data.projects].sort((a, b) => a.percent_complete - b.percent_complete).slice(0, 15);
    return {
      tooltip: { trigger: 'axis', formatter: (params: unknown) => { const d = (params as { dataIndex: number }[])[0]; const p = sorted[d.dataIndex]; return `${p.name}<br/>Progress: ${p.percent_complete.toFixed(1)}%<br/>Tasks: ${p.completed_tasks}/${p.total_tasks}<br/>Overdue: ${p.overdue_tasks}<br/>Margin: ${p.margin.toFixed(1)}%`; } },
      grid: { left: 140, right: 40, top: 10, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((p) => p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', max: 100, axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{ type: 'bar', data: sorted.map((p) => ({ value: Math.round(p.percent_complete * 10) / 10, itemStyle: { borderRadius: [0, 3, 3, 0], color: healthColor(p.percent_complete) } })) }],
    };
  }, [data]);

  const filteredProjects = useMemo(() => {
    if (!data?.projects) return [];
    const s = filter.toLowerCase();
    return s ? data.projects.filter((p) => p.name.toLowerCase().includes(s) || p.customer_name.toLowerCase().includes(s)) : data.projects;
  }, [data, filter]);

  const greetingTitle = getGreetingTitle(user?.name || 'User');
  if (loading) {
    return (<div><h1 className="page-title">{greetingTitle}</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={80} />)}</div><Skeleton height={300} /></div>);
  }
  if (!data?.success) return <div><h1 className="page-title">{greetingTitle}</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load data.</div></div>;

  const k = data.kpis;

  return (
    <div>
      <h1 className="page-title">{greetingTitle}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <KpiCard label="Active Projects" value={k.activeProjects} />
        <KpiCard label="Task Completion" value={`${k.completionRate}%`} color={healthColor(k.completionRate)} detail={`${k.completedTasks} / ${k.totalTasks}`} />
        <KpiCard label="Overdue Tasks" value={k.overdueTasks} color={k.overdueTasks > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Critical Open" value={k.criticalOpen} color={k.criticalOpen > 0 ? '#ef4444' : '#10b981'} />
        <KpiCard label="Avg Progress" value={`${k.avgCompletion}%`} color={healthColor(k.avgCompletion)} />
        <KpiCard label="Total EAC" value={fmt(k.totalEac)} detail={`Actual: ${fmt(k.totalActual)}`} />
        <KpiCard label="Contract Value" value={fmt(k.totalContract)} />
        <KpiCard label="Margin" value={`${k.portfolioMargin}%`} color={healthColor(k.portfolioMargin, true)} detail={`Gap: ${fmt(k.totalContract - k.totalEac)}`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Burn Trend (12 mo)</h3>
          <ChartWrapper option={burnTrendChart} height={240} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Action List</h3>
          {(data.actionItems?.length || 0) === 0 ? (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.72rem' }}>No pending actions.</div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {Object.entries(groupedActions).map(([type, items]) => (
                <div key={type}>
                  <div style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {type.replace(/_/g, ' ')} ({items.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {items.slice(0, 6).map((a) => (
                      <Link key={a.id} href={actionHref(a)} style={{ padding: '0.45rem 0.5rem', borderRadius: 6, background: 'rgba(30,41,59,0.45)', border: '1px solid rgba(148,163,184,0.08)', textDecoration: 'none', display: 'block' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.68rem', color: '#e2e8f0', fontWeight: 600 }}>{a.title}</span>
                          <span style={{ fontSize: '0.56rem', color: a.priority === 'P1' ? '#ef4444' : '#f59e0b', border: `1px solid ${a.priority === 'P1' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}`, padding: '0.08rem 0.3rem', borderRadius: 4 }}>{a.priority}</span>
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.15rem' }}>{a.project_name}</div>
                        <div style={{ fontSize: '0.62rem', color: '#cbd5e1', marginTop: '0.12rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.message || '—'}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Task Status Mix</h3>
          <ChartWrapper option={taskStatusChart} height={220} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Project Progress</h3>
          <ChartWrapper option={projectHealthChart} height={220} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Project Overview</h3>
          <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter projects…" style={{ width: 200, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Project', 'Customer', 'Progress', 'Tasks', 'Overdue', 'Critical', 'SPI', 'Margin', 'Burn Rate'].map((h) => (
                  <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: ['Project', 'Customer'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((p) => {
                const br = p.contract_value > 0 ? (p.actual_cost / p.contract_value) * 100 : 0;
                return (
                  <React.Fragment key={p.id}>
                    <tr onClick={() => setExpandedProject((prev) => prev === p.id ? null : p.id)} style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.06)', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0', fontWeight: 500 }}>{p.name}</td>
                      <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{p.customer_name}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                            <div style={{ width: `${Math.min(100, p.percent_complete)}%`, height: '100%', background: healthColor(p.percent_complete), borderRadius: 2 }} />
                          </div>
                          <span style={{ color: '#94a3b8' }}>{p.percent_complete.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{p.completed_tasks}/{p.total_tasks}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.overdue_tasks > 0 ? '#ef4444' : '#94a3b8' }}>{p.overdue_tasks}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.critical_open > 0 ? '#ef4444' : '#94a3b8' }}>{p.critical_open}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.spi > 1.1 ? '#ef4444' : p.spi < 0.9 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{p.spi.toFixed(2)}</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: healthColor(p.margin, true), fontWeight: 600 }}>{p.margin.toFixed(1)}%</td>
                      <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: br > 100 ? '#ef4444' : br > 85 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{br.toFixed(1)}%</td>
                    </tr>
                    {expandedProject === p.id && (
                      <tr>
                        <td colSpan={9} style={{ padding: '0.6rem 0.75rem', background: 'rgba(30,41,59,0.5)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', fontSize: '0.68rem' }}>
                            <div><span style={{ color: '#64748b' }}>Contract</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.contract_value)}</span></div>
                            <div><span style={{ color: '#64748b' }}>EAC</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.eac)}</span></div>
                            <div><span style={{ color: '#64748b' }}>Actual Cost</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.actual_cost)}</span></div>
                            <div><span style={{ color: '#64748b' }}>Remaining Cost</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.remaining_cost)}</span></div>
                            <div><span style={{ color: '#64748b' }}>Hours (Act / Base)</span><br /><span style={{ color: '#e2e8f0' }}>{p.actual_hours.toLocaleString()} / {p.baseline_hours.toLocaleString()}</span></div>
                            <div><span style={{ color: '#64748b' }}>Remaining Hours</span><br /><span style={{ color: '#e2e8f0' }}>{p.remaining_hours.toLocaleString()}</span></div>
                            <div><span style={{ color: '#64748b' }}>Variance</span><br /><span style={{ color: Math.abs(p.variance_pct) > 10 ? '#ef4444' : '#10b981' }}>{p.variance_pct > 0 ? '+' : ''}{p.variance_pct.toFixed(1)}%</span></div>
                            <div><span style={{ color: '#64748b' }}>Schedule</span><br /><span style={{ color: '#94a3b8' }}>{p.baseline_start || '—'} → {p.baseline_end || '—'}</span></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
