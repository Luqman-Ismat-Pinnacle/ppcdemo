'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';
import { useUser } from '@/lib/user-context';
import { getGreetingTitle } from '@/lib/greeting';

type Project = {
  id: string; name: string; owner: string; customer_name: string;
  actual_cost: number; remaining_cost: number; contract_value: number; eac: number;
  margin: number; actual_hours: number; baseline_hours: number; total_hours: number;
  percent_complete: number; critical_open: number; spi: number;
  trend_hours_pct: number; variance_pct: number;
};
type ClientRisk = { customer_name: string; projects: number; total_contract: number; total_cost: number; margin_pct: number; at_risk: number };
type Efficiency = { category: string; hours: number; pct: number };
type ActionItem = { id: string; source_role: string; priority: string; title: string; message: string; project_name: string; owner: string; created_at: string };

type SummaryPayload = {
  success: boolean;
  kpis: {
    activeProjects: number; totalActualCost: number; totalEac: number; totalContract: number;
    portfolioMargin: number; varianceHours: number; variancePct: number;
    atRiskProjects: number; healthyProjects: number; clientsServed: number;
  };
  projects: Project[];
  clientRisk: ClientRisk[];
  costTrend: { month: string; hours: number; cost: number }[];
  milestoneDist: Record<string, number>;
  efficiency: Efficiency[];
  actionItems?: ActionItem[];
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
  return v >= 75 ? '#10b981' : v >= 55 ? '#f59e0b' : '#ef4444';
}

const fmt = (n: number) => {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

export default function CommandCenterPage() {
  const { user } = useUser();
  const [data, setData] = useState<SummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  useEffect(() => {
    fetch('/api/senior-manager/summary', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const portfolioHealthScore = useMemo(() => {
    if (!data?.success || !data?.kpis) return 0;
    const { portfolioMargin, variancePct, atRiskProjects, activeProjects } = data.kpis;
    const marginScore = Math.min(portfolioMargin / 20, 1) * 35;
    const varianceScore = Math.max(0, 1 - Math.abs(variancePct) / 30) * 25;
    const riskScore = activeProjects > 0 ? (1 - atRiskProjects / activeProjects) * 25 : 25;
    const effScore = data.efficiency.find((e) => e.category === 'Execute');
    const executeScore = effScore ? (effScore.pct / 100) * 15 : 8;
    return Math.round(marginScore + varianceScore + riskScore + executeScore);
  }, [data]);

  const costTrendChart = useMemo<EChartsOption>(() => {
    if (!data?.costTrend.length) return {};
    const cumCost: number[] = [];
    data.costTrend.forEach((t, i) => { cumCost.push((cumCost[i - 1] || 0) + t.cost); });
    return {
      tooltip: { trigger: 'axis' },
      legend: { data: ['Monthly Spend', 'Hours', 'Cumulative'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
      grid: { left: 55, right: 55, top: 35, bottom: 30 },
      xAxis: { type: 'category', data: data.costTrend.map((t) => t.month), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        { type: 'value', name: '$', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
        { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Monthly Spend', type: 'bar', data: data.costTrend.map((t) => t.cost), itemStyle: { borderRadius: [3, 3, 0, 0], color: 'rgba(99,102,241,0.5)' } },
        { name: 'Hours', type: 'line', yAxisIndex: 1, data: data.costTrend.map((t) => t.hours), smooth: true, lineStyle: { color: '#10b981' }, itemStyle: { color: '#10b981' } },
        { name: 'Cumulative', type: 'line', data: cumCost, smooth: true, lineStyle: { color: '#f59e0b', type: 'dashed' as const }, itemStyle: { color: '#f59e0b' }, symbol: 'none' },
      ],
    };
  }, [data]);

  const marginByCustomerChart = useMemo<EChartsOption>(() => {
    if (!data?.clientRisk.length) return {};
    const sorted = [...data.clientRisk].sort((a, b) => b.total_contract - a.total_contract).slice(0, 10);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 120, right: 40, top: 20, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((c) => c.customer_name.length > 20 ? c.customer_name.slice(0, 18) + '…' : c.customer_name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{ type: 'bar', data: sorted.map((c) => ({ value: c.margin_pct, itemStyle: { borderRadius: [0, 3, 3, 0], color: healthColor(c.margin_pct, true) } })) }],
    };
  }, [data]);

  const milestoneChart = useMemo<EChartsOption>(() => {
    if (!data?.milestoneDist) return {};
    const colorMap: Record<string, string> = { on_time: '#10b981', on_track: '#3b82f6', late: '#f59e0b', delayed: '#f97316', overdue: '#ef4444', upcoming: '#64748b' };
    return {
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['40%', '70%'], label: { color: '#cbd5e1', fontSize: 10 }, data: Object.entries(data.milestoneDist).map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: v, itemStyle: { color: colorMap[k] || '#6366f1' } })) }],
    };
  }, [data]);

  const efficiencyChart = useMemo<EChartsOption>(() => {
    if (!data?.efficiency.length) return {};
    const colorMap: Record<string, string> = { Execute: '#10b981', 'Non-Execute': '#f59e0b', 'Quality / Rework': '#ef4444', Baseline: '#3b82f6' };
    return {
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['40%', '70%'], label: { color: '#cbd5e1', fontSize: 10, formatter: '{b}: {d}%' }, data: data.efficiency.map((e) => ({ name: e.category, value: e.hours, itemStyle: { color: colorMap[e.category] || '#6366f1' } })) }],
    };
  }, [data]);

  const topRiskProjects = useMemo(() => {
    if (!data?.projects.length) return [];
    let filtered = data.projects;
    if (projectFilter) {
      const s = projectFilter.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(s) || p.owner.toLowerCase().includes(s) || p.customer_name.toLowerCase().includes(s));
    }
    return filtered
      .filter((p) => p.margin < 10 || Math.abs(p.variance_pct) > 10 || p.critical_open >= 2)
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 20);
  }, [data, projectFilter]);

  const actionItems = useMemo(() => data?.actionItems || [], [data?.actionItems]);

  const saveComment = useCallback(async (projectId: string) => {
    if (!commentText.trim()) return;
    await fetch('/api/senior-manager/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'command-center', scope: 'project', recordId: projectId, metricKey: 'sm_comment_project', comment: commentText }),
    });
    setCommentText('');
  }, [commentText]);

  if (loading) {
    return (
      <div>
        <h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
        <Skeleton height={300} />
      </div>
    );
  }

  if (!data?.success) {
    return <div><h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load portfolio data.</div></div>;
  }

  const k = data.kpis;
  const totalRemaining = k.totalEac - k.totalActualCost;
  const contractGap = k.totalContract - k.totalEac;

  return (
    <div>
      <h1 className="page-title">{getGreetingTitle(user?.name || 'User')}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <KpiCard label="Active Projects" value={k.activeProjects} detail={`${k.clientsServed} clients`} />
        <KpiCard label="Portfolio Margin" value={`${k.portfolioMargin}%`} color={healthColor(k.portfolioMargin, true)} detail={`${k.healthyProjects} healthy / ${k.atRiskProjects} at risk`} />
        <KpiCard label="Total Contract" value={fmt(k.totalContract)} />
        <KpiCard label="EAC" value={fmt(k.totalEac)} detail={`Remaining: ${fmt(totalRemaining)}`} />
        <KpiCard label="Contract Gap" value={fmt(contractGap)} color={contractGap < 0 ? '#ef4444' : '#10b981'} detail="Contract - EAC" />
        <KpiCard label="Hours Variance" value={`${k.variancePct}%`} color={Math.abs(k.variancePct) > 10 ? '#ef4444' : '#10b981'} detail={`${k.varianceHours.toLocaleString()} hrs`} />
        <KpiCard label="Burn Rate" value={`${k.totalContract > 0 ? ((k.totalActualCost / k.totalContract) * 100).toFixed(1) : 0}%`} color={k.totalContract > 0 && (k.totalActualCost / k.totalContract) > 0.85 ? '#ef4444' : '#10b981'} detail="Actual / Contract" />
        <KpiCard label="Health Score" value={portfolioHealthScore} color={healthColor(portfolioHealthScore)} detail="Composite" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Monthly Spend, Hours & Cumulative</h3>
          <ChartWrapper option={costTrendChart} height={240} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Action List</h3>
          {actionItems.length === 0 ? (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.72rem' }}>No pending actions.</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {actionItems.slice(0, 25).map((a) => (
                <div key={a.id} style={{ padding: '0.45rem 0.5rem', borderRadius: 6, background: 'rgba(30,41,59,0.45)', border: '1px solid rgba(148,163,184,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.68rem', color: '#e2e8f0', fontWeight: 600 }}>{a.title}</div>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.56rem', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)', padding: '0.08rem 0.3rem', borderRadius: 4 }}>{a.source_role || 'PL'}</span>
                      <span style={{ fontSize: '0.56rem', color: a.priority === 'P1' ? '#ef4444' : '#f59e0b', border: `1px solid ${a.priority === 'P1' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}`, padding: '0.08rem 0.3rem', borderRadius: 4 }}>{a.priority}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.2rem' }}>{a.project_name} · {a.owner || 'Unassigned'}</div>
                  <div style={{ fontSize: '0.64rem', color: '#cbd5e1', marginTop: '0.18rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.message || 'No detail provided'}</div>
                  <div style={{ fontSize: '0.58rem', color: '#64748b', marginTop: '0.16rem' }}>{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Margin by Customer</h3>
          <ChartWrapper option={marginByCustomerChart} height={220} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Milestone Status</h3>
          <ChartWrapper option={milestoneChart} height={220} />
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Hours Efficiency</h3>
        <ChartWrapper option={efficiencyChart} height={200} />
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Portfolio Watch List</h3>
          <input type="text" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} placeholder="Filter projects…" style={{ width: 200, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }} />
        </div>
        {topRiskProjects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b' }}>No projects requiring attention.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                  {['Project', 'Lead', 'Customer', 'Margin', 'Variance', 'Critical', 'SPI', 'Progress', 'Burn Rate'].map((h) => (
                    <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: ['Project', 'Lead', 'Customer'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topRiskProjects.map((p) => {
                  const br = p.contract_value > 0 ? (p.actual_cost / p.contract_value) * 100 : 0;
                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        onClick={() => { setExpandedProject((prev) => (prev === p.id ? null : p.id)); setCommentText(''); }}
                        style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.06)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                      >
                        <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0', fontWeight: 500 }}>{p.name}</td>
                        <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{p.owner}</td>
                        <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{p.customer_name}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: healthColor(p.margin, true), fontWeight: 600 }}>{p.margin.toFixed(1)}%</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: Math.abs(p.variance_pct) > 15 ? '#ef4444' : '#94a3b8' }}>{p.variance_pct > 0 ? '+' : ''}{p.variance_pct.toFixed(1)}%</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.critical_open > 0 ? '#ef4444' : '#94a3b8' }}>{p.critical_open}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: p.spi > 1.1 ? '#ef4444' : p.spi < 0.9 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{p.spi.toFixed(2)}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                              <div style={{ width: `${Math.min(100, p.percent_complete)}%`, height: '100%', background: p.percent_complete >= 80 ? '#10b981' : '#f59e0b', borderRadius: 2 }} />
                            </div>
                            <span style={{ color: '#94a3b8' }}>{p.percent_complete.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: br > 100 ? '#ef4444' : br > 85 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{br.toFixed(1)}%</td>
                      </tr>
                      {expandedProject === p.id && (
                        <tr>
                          <td colSpan={9} style={{ padding: '0.6rem 0.75rem', background: 'rgba(30,41,59,0.5)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', fontSize: '0.68rem', marginBottom: '0.5rem' }}>
                              <div><span style={{ color: '#64748b' }}>Contract</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.contract_value)}</span></div>
                              <div><span style={{ color: '#64748b' }}>EAC</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.eac)}</span></div>
                              <div><span style={{ color: '#64748b' }}>Actual Cost</span><br /><span style={{ color: '#e2e8f0' }}>{fmt(p.actual_cost)}</span></div>
                              <div><span style={{ color: '#64748b' }}>Hours (Act / Base)</span><br /><span style={{ color: '#e2e8f0' }}>{p.actual_hours.toLocaleString()} / {p.baseline_hours.toLocaleString()}</span></div>
                              <div><span style={{ color: '#64748b' }}>Trending Δ</span><br /><span style={{ color: p.trend_hours_pct > 10 ? '#ef4444' : '#10b981' }}>{p.trend_hours_pct > 0 ? '+' : ''}{p.trend_hours_pct.toFixed(1)}%</span></div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a note…" style={{ flex: 1, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }} onKeyDown={(e) => { if (e.key === 'Enter') saveComment(p.id); }} />
                              <button onClick={() => saveComment(p.id)} style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', color: '#c7d2fe', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.68rem', cursor: 'pointer' }}>Save</button>
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
        )}
      </div>
    </div>
  );
}
