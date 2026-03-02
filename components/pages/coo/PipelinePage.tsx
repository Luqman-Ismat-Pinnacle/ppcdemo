'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Kpis = {
  totalOpportunities: number; activePrograms: number; totalPipelineValue: number;
  totalActualCost: number; totalHoursInvested: number; withSchedule: number; avgCompletion: number;
  opportunitiesWithInvestment: number; investmentRatioPct: number; avgHoursPerInvestedOpportunity: number;
};
type Opportunity = {
  id: string; name: string; owner: string; customer_id: string; stage: string;
  has_schedule: boolean; is_active: boolean;
  actualHours: number; totalHours: number; remainingHours: number; baselineHours: number;
  actualCost: number; remainingCost: number; contractValue: number; eac: number;
  percentComplete: number; headcount: number; taskCount: number; profitMargin: number;
};
type CustRow = { customer_id: string; projects: number; value: number; hours: number };
type ChargeRow = { charge_code: string; hours: number };
type MonthRow = { month: string; hours: number; cost: number };

type Payload = {
  success: boolean; kpis: Kpis; opportunities: Opportunity[];
  stageDist: Record<string, number>; byCustomer: CustRow[];
  chargeBreakdown: ChargeRow[]; monthlyTrend: MonthRow[]; error?: string;
};

const STAGE_COLOR: Record<string, string> = {
  'Prospect': '#64748b', 'Pre-Planning': '#a855f7', 'Planned': '#6366f1', 'In Execution': '#10b981',
};

function fmt$(n: number) { return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${Math.round(n)}`; }
function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return <div className="glass kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value" style={color ? { color } : {}}>{value}</div>{detail && <div className="kpi-detail">{detail}</div>}</div>;
}

export default function PipelinePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingCommentKey, setSavingCommentKey] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  useEffect(() => {
    fetch('/api/coo/pipeline', { cache: 'no-store' })
      .then((r) => r.json()).then((d: Payload) => { if (!d.success) throw new Error(d.error || 'Failed'); setData(d); })
      .catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/coo/comments?page=pipeline', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { success: boolean; comments?: Record<string, string>; error?: string }) => {
        if (!d.success) throw new Error(d.error || 'Failed to load comments');
        setComments(d.comments || {});
      })
      .catch(() => {
        // non-blocking
      });
  }, []);

  const saveComment = useCallback(async (projectId: string, text: string) => {
    const key = `opportunity:${projectId}`;
    setSavingCommentKey(key);
    try {
      await fetch('/api/coo/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: 'pipeline', scope: 'opportunity', recordId: projectId, comment: text }),
      });
    } finally {
      setSavingCommentKey(null);
    }
  }, []);

  const trendOption: EChartsOption = useMemo(() => {
    const pts = data?.monthlyTrend || [];
    return {
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#94a3b8', fontSize: 10 }, bottom: 0 },
      grid: { left: 50, right: 50, top: 12, bottom: 36 },
      xAxis: { type: 'category', data: pts.map((p) => p.month), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: [
        { type: 'value', name: 'Hours', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
        { type: 'value', name: 'Cost ($)', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: 'Hours', type: 'bar', data: pts.map((p) => p.hours), itemStyle: { color: '#a855f7', borderRadius: [3, 3, 0, 0] }, barMaxWidth: 16 },
        { name: 'Cost', type: 'line', yAxisIndex: 1, smooth: true, data: pts.map((p) => p.cost), lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#fbbf24' } },
      ],
    } as EChartsOption;
  }, [data?.monthlyTrend]);

  const customerOption: EChartsOption = useMemo(() => {
    const custs = (data?.byCustomer || []).slice(0, 10);
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 100, right: 24, top: 8, bottom: 24 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } } },
      yAxis: { type: 'category', data: custs.map((c) => c.customer_id.length > 18 ? c.customer_id.slice(0, 16) + '…' : c.customer_id), axisLabel: { color: '#94a3b8', fontSize: 10 }, inverse: true },
      series: [{
        type: 'bar', barMaxWidth: 16,
        data: custs.map((c) => ({ value: c.value, itemStyle: { color: '#818cf8', borderRadius: [0, 3, 3, 0] } })),
        label: { show: true, position: 'right', color: '#94a3b8', fontSize: 9, formatter: (p: { value: number }) => fmt$(p.value) },
      }],
    } as EChartsOption;
  }, [data?.byCustomer]);

  const filteredOps = useMemo(() => {
    if (stageFilter === 'all') return data?.opportunities || [];
    return (data?.opportunities || []).filter((o) => o.stage === stageFilter);
  }, [data?.opportunities, stageFilter]);

  if (loading) return <div><h1 className="page-title">Opportunity Pipeline</h1><p className="page-subtitle">Opportunity portfolio — [O] projects with stage tracking, investment analysis, and conversion readiness.</p><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} height={78} />)}</div><Skeleton height={300} /></div>;
  if (error) return <div><h1 className="page-title">Opportunity Pipeline</h1><div style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>{error}</div></div>;
  if (!data) return null;

  const k = data.kpis;
  const stages = Object.keys(data.stageDist);

  return (
    <div>
      <h1 className="page-title">Opportunity Pipeline</h1>
      <p className="page-subtitle">Opportunity portfolio — [O] projects with stage tracking, investment analysis, and conversion readiness.</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <KpiCard label="Pipeline Opportunities" value={k.totalOpportunities} />
        <KpiCard label="Pipeline Value" value={fmt$(k.totalPipelineValue)} color="#a855f7" />
        <KpiCard label="Investment to Date" value={fmt$(k.totalActualCost)} detail="Posted cost from hour entries" />
        <KpiCard label="Hours Invested" value={k.totalHoursInvested.toLocaleString(undefined, { maximumFractionDigits: 1 })} detail="Posted hours from hour entries" />
        <KpiCard label="Opportunities with Investment" value={k.opportunitiesWithInvestment} detail={`of ${k.totalOpportunities}`} color={k.opportunitiesWithInvestment > 0 ? '#10b981' : 'var(--text-secondary)'} />
        <KpiCard label="Investment Ratio" value={`${k.investmentRatioPct.toFixed(3)}%`} detail="Investment to date / Pipeline value" color={k.investmentRatioPct >= 60 ? '#ef4444' : k.investmentRatioPct >= 35 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Avg Hours / Invested Opportunity" value={k.avgHoursPerInvestedOpportunity.toLocaleString(undefined, { maximumFractionDigits: 1 })} detail="Posted hours / invested opportunities" />
      </div>

      {/* Charts: Customer + Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14, marginBottom: 14 }}>
        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Pipeline Value by Customer</div>
          <ChartWrapper option={customerOption} height={250} />
        </div>

        <div className="glass" style={{ padding: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Pipeline Investment Trend</div>
          <ChartWrapper option={trendOption} height={250} />
        </div>
      </div>

      {/* Filter */}
      <div className="glass-raised" style={{ padding: '0.5rem 0.7rem', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => setStageFilter('all')} style={{ background: stageFilter === 'all' ? 'rgba(99,102,241,0.22)' : 'transparent', color: stageFilter === 'all' ? '#c4b5fd' : 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.18rem 0.45rem', fontSize: '0.66rem', cursor: 'pointer', fontWeight: stageFilter === 'all' ? 700 : 400 }}>All ({data.opportunities.length})</button>
        {stages.map((s) => (
          <button key={s} onClick={() => setStageFilter(stageFilter === s ? 'all' : s)} style={{ background: stageFilter === s ? `${STAGE_COLOR[s] || '#818cf8'}33` : 'transparent', color: STAGE_COLOR[s] || '#818cf8', border: `1px solid ${stageFilter === s ? (STAGE_COLOR[s] || '#818cf8') : 'var(--glass-border)'}`, borderRadius: 6, padding: '0.18rem 0.45rem', fontSize: '0.66rem', cursor: 'pointer', fontWeight: stageFilter === s ? 700 : 400 }}>{s} ({data.stageDist[s]})</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.69rem', color: 'var(--text-muted)' }}>Showing {filteredOps.length}</span>
      </div>

      {/* Opportunity Register Table */}
      <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: 8 }}>Opportunity Register</div>
        <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
          <table className="dm-table" style={{ width: '100%', minWidth: 1080, fontSize: '0.72rem' }}>
            <thead>
              <tr>
                <th style={{ width: 26 }} />
                <th style={{ textAlign: 'left' }}>Opportunity</th>
                <th style={{ textAlign: 'left' }}>Owner</th>
                <th style={{ textAlign: 'left' }}>Stage</th>
                <th style={{ textAlign: 'right' }}>Pipeline Value</th>
                <th style={{ textAlign: 'right' }}>Investment</th>
                <th style={{ textAlign: 'right' }}>Hours</th>
                <th style={{ textAlign: 'right' }}>Resources</th>
                <th style={{ textAlign: 'right' }}>Progress</th>
                <th style={{ textAlign: 'left' }}>Comment</th>
              </tr>
            </thead>
            <tbody>
              {filteredOps.map((o) => (
                <React.Fragment key={o.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggle(o.id)}>
                    <td style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{expanded.has(o.id) ? '▾' : '▸'}</td>
                    <td style={{ fontWeight: 600 }}>{o.name}</td>
                    <td>{o.owner}</td>
                    <td><span style={{ color: STAGE_COLOR[o.stage] || '#818cf8', fontWeight: 700, fontSize: '0.68rem' }}>{o.stage}</span></td>
                    <td style={{ textAlign: 'right' }}>{o.contractValue > 0 ? fmt$(o.contractValue) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{o.actualCost > 0 ? fmt$(o.actualCost) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{Math.round(o.actualHours).toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{o.headcount}</td>
                    <td style={{ textAlign: 'right' }}>{o.percentComplete.toFixed(0)}%</td>
                    <td style={{ minWidth: 220 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        value={comments[`opportunity:${o.id}`] || ''}
                        onChange={(e) => setComments((prev) => ({ ...prev, [`opportunity:${o.id}`]: e.target.value }))}
                        onBlur={(e) => saveComment(o.id, e.target.value)}
                        placeholder="Add opportunity note"
                        style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                      />
                      {savingCommentKey === `opportunity:${o.id}` && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>Saving...</div>}
                    </td>
                  </tr>
                  {expanded.has(o.id) && (
                    <tr>
                      <td colSpan={10} style={{ padding: '0.45rem 0.8rem 0.55rem 2rem', background: 'rgba(168,85,247,0.04)', fontSize: '0.69rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                          <div><span style={{ color: 'var(--text-muted)' }}>Customer:</span> {o.customer_id}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>EAC:</span> {fmt$(o.eac)}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Remaining Cost:</span> {fmt$(o.remainingCost)}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Baseline Hours:</span> {Math.round(o.baselineHours).toLocaleString()}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Remaining Hours:</span> {Math.round(o.remainingHours).toLocaleString()}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Tasks:</span> {o.taskCount}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Schedule:</span> {o.has_schedule ? 'Yes' : 'No'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>Active:</span> {o.is_active ? 'Yes' : 'No'}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filteredOps.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No opportunity projects found. Projects with [O] in their name will appear here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
