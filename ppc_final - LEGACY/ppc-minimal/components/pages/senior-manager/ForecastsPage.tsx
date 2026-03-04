'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Forecast = {
  id: string; project_id: string; project_name: string; owner: string; submitted_by: string;
  forecast_hours: number; forecast_cost: number; baseline_hours: number; baseline_cost: number;
  forecast_end_date: string | null; period: string; notes: string; status: string;
  reviewed_by: string; review_comment: string; reviewed_at: string | null; created_at: string;
};
type Project = { id: string; name: string; owner: string; customer_name: string; actual_cost: number; remaining_cost: number; contract_value: number; baseline_end: string | null };
type PhaseLine = { phase_name: string; unit_name: string; baseline_hours: number; actual_hours: number; current_remaining_hours: number; delta_hours: number; revised_eac_hours: number; current_eac_cost: number; delta_cost: number; revised_eac_cost: number; rationale: string };
type Analytics = {
  totalContract: number; currentEac: number; currentMargin: number;
  portfolioEacWithForecasts: number; portfolioMarginWithForecasts: number;
  marginIfAllPendingApproved: number; eacDeltaIfAllApproved: number;
  byCustomer: Array<{ customer_name: string; contract: number; current_eac: number; forecast_eac: number; margin_now: number; margin_with_forecasts: number; projects: number }>;
  scheduleImpact: Array<{ project_name: string; slip_days: number; forecast_end: string }>;
  pendingCount: number; approvedCount: number; revisionRequestedCount: number;
};
type Payload = { success: boolean; forecasts: Forecast[]; projects: Project[]; phaseLinesByForecast: Record<string, PhaseLine[]>; analytics: Analytics };

function KpiCard({ label, value, detail, color }: { label: string; value: string | number; detail?: string; color?: string }) {
  return (
    <div className="glass kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={color ? { color } : {}}>{value}</div>
      {detail && <div className="kpi-detail">{detail}</div>}
    </div>
  );
}

const fmt = (n: number) => {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

function marginColor(v: number) {
  if (v >= 15) return '#10b981';
  if (v >= 5) return '#f59e0b';
  return '#ef4444';
}

export default function ForecastsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'denied' | 'revision_requested'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/senior-manager/forecasts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: Payload) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (forecastId: string, action: 'approve' | 'deny' | 'revision') => {
    setBusyId(forecastId);
    try {
      await fetch('/api/senior-manager/forecasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, forecastId, reviewedBy: 'Senior Manager', reviewComment: reviewComment || (action === 'revision' ? 'Please revise scope assumptions.' : '') }),
      });
      setReviewComment('');
      load();
    } finally {
      setBusyId('');
    }
  };

  const filtered = useMemo(
    () => (data?.forecasts || []).filter((f) => (filter === 'all' ? true : f.status === filter)),
    [data, filter],
  );

  const a = data?.analytics;
  const statusChart = useMemo<EChartsOption>(() => {
    const rows = data?.forecasts || [];
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    const keys = ['pending', 'revision_requested', 'approved', 'denied'].filter((k) => c[k] != null);
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 80, right: 15, top: 12, bottom: 20 },
      xAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10 } },
      yAxis: { type: 'category', data: keys.map((k) => k.replace(/_/g, ' ')), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{ type: 'bar', data: keys.map((k) => ({ value: c[k], itemStyle: { color: k === 'approved' ? '#10b981' : k === 'denied' ? '#ef4444' : k === 'revision_requested' ? '#f59e0b' : '#64748b', borderRadius: [0, 4, 4, 0] } })) }],
    };
  }, [data]);

  const marginImpactChart = useMemo<EChartsOption>(() => {
    if (!a?.byCustomer.length) return {};
    const sorted = [...a.byCustomer].sort((x, y) => x.margin_with_forecasts - y.margin_with_forecasts).slice(0, 10);
    return {
      tooltip: { trigger: 'axis', formatter: (p: unknown) => {
        const arr = Array.isArray(p) ? p : [p];
        const idx = (arr[0] as { dataIndex?: number })?.dataIndex ?? 0;
        const c = sorted[idx];
        return c ? `${c.customer_name}<br/>Margin now: ${c.margin_now.toFixed(1)}%<br/>With forecasts: ${c.margin_with_forecasts.toFixed(1)}%` : '';
      } },
      grid: { left: 100, right: 20, top: 12, bottom: 25 },
      xAxis: { type: 'value', name: 'Margin %', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' } },
      yAxis: { type: 'category', data: sorted.map((c) => c.customer_name.length > 18 ? c.customer_name.slice(0, 16) + '…' : c.customer_name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      series: [{
        type: 'bar',
        data: sorted.map((c) => ({ value: c.margin_now, itemStyle: { color: 'rgba(148,163,184,0.5)', borderRadius: [0, 3, 3, 0] } })),
      }, {
        type: 'bar',
        data: sorted.map((c) => ({ value: c.margin_with_forecasts, itemStyle: { color: marginColor(c.margin_with_forecasts), borderRadius: [0, 3, 3, 0] } })),
      }],
      legend: { data: ['Current', 'With Forecasts'], top: 0, textStyle: { color: '#94a3b8', fontSize: 10 } },
    };
  }, [a]);

  const portfolioImpactChart = useMemo<EChartsOption>(() => {
    if (!a) return {};
    const labels = ['Current EAC', 'With Approved', 'If All Pending Approved'];
    const values = [a.currentEac, a.portfolioEacWithForecasts, a.portfolioEacWithForecasts + a.eacDeltaIfAllApproved];
    return {
      tooltip: { trigger: 'axis', formatter: (p: unknown) => {
        const arr = Array.isArray(p) ? p : [p];
        const idx = (arr[0] as { dataIndex?: number })?.dataIndex ?? 0;
        return `${labels[idx]}: ${fmt(values[idx])}`;
      } },
      grid: { left: 50, right: 20, top: 12, bottom: 30 },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#94a3b8', fontSize: 9, rotate: 15 } },
      yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => fmt(v) } },
      series: [{ type: 'bar', data: values.map((v, i) => ({ value: v, itemStyle: { color: i === 0 ? '#64748b' : i === 1 ? '#6366f1' : '#f59e0b', borderRadius: [3, 3, 0, 0] } })) }],
    };
  }, [a]);

  if (loading) return <div><h1 className="page-title">Forecast Review</h1><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={80} />)}</div><Skeleton height={400} /></div>;
  if (!data?.success) return <div><h1 className="page-title">Forecast Review</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load forecast data.</div></div>;

  return (
    <div>
      <h1 className="page-title">Forecast Review</h1>
      <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '1rem' }}>
        Project Leads submit forecasts from their <Link href="/project-lead/forecast" style={{ color: '#6366f1', textDecoration: 'underline' }}>Forecast</Link> page. Approve or request revisions here. Changes sync to the PL view.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <KpiCard label="Pending Review" value={a?.pendingCount ?? 0} color={(a?.pendingCount ?? 0) > 0 ? '#f59e0b' : '#10b981'} />
        <KpiCard label="Revision Requested" value={a?.revisionRequestedCount ?? 0} color={(a?.revisionRequestedCount ?? 0) > 0 ? '#f59e0b' : '#94a3b8'} />
        <KpiCard label="Approved" value={a?.approvedCount ?? 0} color="#10b981" />
        <KpiCard label="Portfolio Margin (Current)" value={`${(a?.currentMargin ?? 0).toFixed(1)}%`} color={marginColor(a?.currentMargin ?? 0)} />
        <KpiCard label="Portfolio Margin (Approved)" value={`${(a?.portfolioMarginWithForecasts ?? 0).toFixed(1)}%`} color={marginColor(a?.portfolioMarginWithForecasts ?? 0)} />
        <KpiCard label="If All Pending Approved" value={`${(a?.marginIfAllPendingApproved ?? 0).toFixed(1)}%`} color={marginColor(a?.marginIfAllPendingApproved ?? 0)} detail={`EAC Δ ${fmt(a?.eacDeltaIfAllApproved ?? 0)}`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Submission Status</h3>
          <ChartWrapper option={statusChart} height={140} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Portfolio EAC Impact</h3>
          <ChartWrapper option={portfolioImpactChart} height={140} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Margin by Customer (Current vs Forecast)</h3>
          <ChartWrapper option={marginImpactChart} height={140} />
        </div>
      </div>

      {a?.scheduleImpact && a.scheduleImpact.length > 0 && (
        <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Schedule Impact (Pending forecasts extending end date)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {a.scheduleImpact.map((s) => (
              <span key={s.project_name} style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#fca5a5' }}>
                {s.project_name}: +{s.slip_days}d (→ {s.forecast_end})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Forecast Register</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.3rem 0.5rem', fontSize: '0.72rem' }}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="revision_requested">Revision Requested</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
            </select>
            <Link href="/project-lead/forecast" style={{ fontSize: '0.68rem', padding: '0.25rem 0.5rem', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#c7d2fe', borderRadius: 6, textDecoration: 'none' }}>View PL Forecast →</Link>
          </div>
        </div>

        <div style={{ marginBottom: '0.5rem' }}>
          <input type="text" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Review comment (for Approve/Revise/Deny)…" style={{ width: '100%', maxWidth: 400, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, padding: '0.35rem 0.5rem', color: '#e2e8f0', fontSize: '0.72rem' }} />
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            No forecasts {filter !== 'all' ? <>with status &quot;{filter.replace('_', ' ')}&quot;</> : 'yet'}. Project Leads submit from their <Link href="/project-lead/forecast" style={{ color: '#6366f1' }}>Forecast</Link> page.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.14)' }}>
                  {['Project', 'Lead', 'Forecast Hrs', 'Forecast Cost', 'Baseline Var', 'Margin', 'Status', 'Period', 'Created', 'Review'].map((h) => (
                    <th key={h} style={{ textAlign: ['Project', 'Lead'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600, padding: '0.4rem 0.5rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const p = data.projects.find((x) => x.id === f.project_id);
                  const margin = p && p.contract_value > 0 ? ((p.contract_value - f.forecast_cost) / p.contract_value) * 100 : 0;
                  const baselineVar = f.baseline_hours > 0 ? ((f.forecast_hours - f.baseline_hours) / f.baseline_hours) * 100 : 0;
                  const expanded = expandedId === f.id;
                  const lines = data.phaseLinesByForecast?.[f.id] || [];
                  return (
                    <React.Fragment key={f.id}>
                      <tr
                        style={{ borderBottom: '1px solid rgba(148,163,184,0.08)', cursor: 'pointer' }}
                        onClick={() => setExpandedId((prev) => (prev === f.id ? null : f.id))}
                      >
                        <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0' }}>{f.project_name}</td>
                        <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{f.owner}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#cbd5e1' }}>{f.forecast_hours.toLocaleString()}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#cbd5e1' }}>{fmt(f.forecast_cost)}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: baselineVar > 5 ? '#ef4444' : baselineVar > 0 ? '#f59e0b' : '#10b981' }}>{baselineVar > 0 ? '+' : ''}{baselineVar.toFixed(1)}%</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: marginColor(margin), fontWeight: 600 }}>{margin.toFixed(1)}%</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: f.status === 'approved' ? '#10b981' : f.status === 'denied' ? '#ef4444' : f.status === 'revision_requested' ? '#f59e0b' : '#94a3b8' }}>{f.status.replace('_', ' ')}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{f.period || '—'}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#64748b' }}>{f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}</td>
                        <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          {f.status === 'approved' || f.status === 'denied' ? (
                            <span style={{ color: '#64748b', fontSize: '0.68rem' }}>Locked</span>
                          ) : (
                            <div style={{ display: 'inline-flex', gap: 4 }}>
                              <button disabled={busyId === f.id} onClick={() => review(f.id, 'approve')} style={{ fontSize: '0.62rem', padding: '0.18rem 0.35rem', borderRadius: 6, border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', cursor: 'pointer' }}>Approve</button>
                              <button disabled={busyId === f.id} onClick={() => review(f.id, 'revision')} style={{ fontSize: '0.62rem', padding: '0.18rem 0.35rem', borderRadius: 6, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', cursor: 'pointer' }}>Revise</button>
                              <button disabled={busyId === f.id} onClick={() => review(f.id, 'deny')} style={{ fontSize: '0.62rem', padding: '0.18rem 0.35rem', borderRadius: 6, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', cursor: 'pointer' }}>Deny</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={10} style={{ padding: '0.6rem 0.75rem', background: 'rgba(30,41,59,0.5)' }}>
                            {f.status === 'revision_requested' && f.review_comment && (
                              <div style={{ marginBottom: '0.5rem', padding: '0.4rem', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, color: '#fde68a', fontSize: '0.72rem' }}>
                                <strong>SM feedback:</strong> {f.review_comment}
                              </div>
                            )}
                            <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginBottom: '0.35rem' }}>{f.notes || 'No notes provided.'}</div>
                            {lines.length > 0 ? (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                                      {['Phase', 'Δ Hrs', 'Revised EAC Hrs', 'Δ Cost', 'Revised EAC Cost', 'Rationale'].map((h) => (
                                        <th key={h} style={{ textAlign: ['Phase', 'Rationale'].includes(h) ? 'left' : 'right', color: '#94a3b8', padding: '0.28rem 0.35rem' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines.map((l, idx) => (
                                      <tr key={idx} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                                        <td style={{ padding: '0.28rem 0.35rem', color: '#e2e8f0' }}>{l.phase_name}</td>
                                        <td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: l.delta_hours > 0 ? '#ef4444' : '#10b981' }}>{l.delta_hours > 0 ? '+' : ''}{l.delta_hours.toFixed(1)}</td>
                                        <td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: '#cbd5e1' }}>{l.revised_eac_hours.toFixed(1)}</td>
                                        <td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: l.delta_cost > 0 ? '#ef4444' : '#10b981' }}>{l.delta_cost > 0 ? '+' : ''}{fmt(l.delta_cost)}</td>
                                        <td style={{ padding: '0.28rem 0.35rem', textAlign: 'right', color: '#cbd5e1' }}>{fmt(l.revised_eac_cost)}</td>
                                        <td style={{ padding: '0.28rem 0.35rem', color: '#94a3b8' }}>{l.rationale || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>No phase breakdown.</div>
                            )}
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
