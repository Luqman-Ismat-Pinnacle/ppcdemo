'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import ChartWrapper from '@/components/charts/ChartWrapper';
import type { EChartsOption } from 'echarts';

type Client = {
  customer_name: string; customer_id: string; projects: number;
  total_contract: number; total_eac: number; margin_pct: number;
  at_risk: number; escalation_count: number; total_variance_hrs: number;
  avg_progress: number; critical_open: number;
};
type ProjectRow = { id: string; name: string; customer_name: string; owner: string; margin: number; variance_pct: number; critical_open: number; percent_complete: number };
type Escalation = { id: string; project_name: string; customer_name: string; signal: string; severity: string };
type Deliverable = { project_id: string; project_name: string; customer_name: string; task_name: string; baseline_end: string; percent_complete: number; status: string };
type Amendment = { project_id: string; project_name: string; customer_name: string; line_amount: number; line_date: string };

type Payload = {
  success: boolean;
  kpis: { clientsServed: number; atRiskClients: number; escalationSignals: number; avgClientMargin: number };
  clients: Client[];
  projects: ProjectRow[];
  escalations: Escalation[];
  deliverables: Deliverable[];
  amendments: Amendment[];
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

const fmt = (n: number) => {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

function rygDot(severity: string) {
  const color = severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#10b981';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 4 }} />;
}

export default function ClientAssurancePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    fetch('/api/senior-manager/client-assurance', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const clientHealthChart = useMemo<EChartsOption>(() => {
    if (!data?.clients.length) return {};
    const sorted = [...data.clients].sort((a, b) => a.margin_pct - b.margin_pct).slice(0, 12);
    return {
      tooltip: { trigger: 'axis', formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params;
        const d = p as { dataIndex?: number };
        const idx = d.dataIndex ?? 0;
        const c = sorted[idx];
        return c ? `${c.customer_name}<br/>Margin: ${c.margin_pct}%<br/>Variance: ${c.total_variance_hrs} hrs` : '';
      } },
      grid: { left: 120, right: 40, top: 20, bottom: 30 },
      yAxis: { type: 'category', data: sorted.map((c) => c.customer_name.length > 22 ? c.customer_name.slice(0, 20) + '…' : c.customer_name), axisLabel: { color: '#94a3b8', fontSize: 10 } },
      xAxis: { type: 'value', name: 'Margin %', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{
        type: 'bar',
        data: sorted.map((c) => ({
          value: c.margin_pct,
          itemStyle: { borderRadius: [0, 3, 3, 0], color: c.margin_pct >= 15 ? '#10b981' : c.margin_pct >= 5 ? '#f59e0b' : '#ef4444' },
        })),
      }],
    };
  }, [data]);

  const riskScatterChart = useMemo<EChartsOption>(() => {
    if (!data?.clients.length) return {};
    return {
      tooltip: { trigger: 'item', formatter: (p: unknown) => {
        const d = (p as { data?: number[] }).data;
        if (!Array.isArray(d)) return '';
        return `${d[3]}<br/>Margin: ${d[0]}%<br/>Variance: ${d[1]} hrs<br/>Critical: ${d[2]}`;
      } },
      grid: { left: 55, right: 20, top: 20, bottom: 40 },
      xAxis: { type: 'value', name: 'Margin %', nameLocation: 'middle', nameGap: 25, axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      yAxis: { type: 'value', name: 'Variance (hrs)', axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(148,163,184,0.08)' } } },
      series: [{
        type: 'scatter',
        symbolSize: (d: number[]) => Math.max(8, Math.min((d[2] as number) * 5, 40)),
        data: data.clients.map((c) => [c.margin_pct, c.total_variance_hrs, c.critical_open, c.customer_name]),
        itemStyle: { color: 'rgba(99,102,241,0.6)', borderColor: '#6366f1' },
      }],
    } as EChartsOption;
  }, [data]);

  const saveComment = useCallback(async (customerId: string) => {
    if (!commentText.trim()) return;
    await fetch('/api/senior-manager/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'client-assurance', scope: 'customer', recordId: customerId, metricKey: 'sm_client_note', comment: commentText }),
    });
    setCommentText('');
  }, [commentText]);

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Client Assurance</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={80} />)}
        </div>
        <Skeleton height={300} />
      </div>
    );
  }

  if (!data?.success) {
    return <div><h1 className="page-title">Client Assurance</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load client data.</div></div>;
  }

  const k = data.kpis;

  return (
    <div>
      <h1 className="page-title">Client Assurance</h1>
      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1rem' }}>
        SLA tracking, escalation signals, key deliverables, and client-facing risk — distinct from Financial Health.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <KpiCard label="Clients Served" value={k.clientsServed} />
        <KpiCard label="At-Risk Clients" value={k.atRiskClients} color={k.atRiskClients > 0 ? '#ef4444' : '#10b981'} detail="Low margin or critical issues" />
        <KpiCard label="Escalation Signals" value={k.escalationSignals} color={k.escalationSignals > 3 ? '#ef4444' : '#f59e0b'} />
        <KpiCard label="Avg Client Margin" value={`${k.avgClientMargin}%`} color={k.avgClientMargin >= 15 ? '#10b981' : k.avgClientMargin >= 5 ? '#f59e0b' : '#ef4444'} />
      </div>

      {data.escalations && data.escalations.length > 0 && (
        <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Escalation Signals</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                  {['', 'Project', 'Customer', 'Signal'].map((h) => (
                    <th key={h} style={{ padding: '0.35rem 0.5rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.escalations.map((e, i) => (
                  <tr key={e.id || i} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                    <td style={{ padding: '0.35rem 0.5rem' }}>{rygDot(e.severity)}</td>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#e2e8f0' }}>{e.project_name}</td>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#94a3b8' }}>{e.customer_name}</td>
                    <td style={{ padding: '0.35rem 0.5rem', color: e.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>{e.signal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Client Margin Distribution</h3>
          <ChartWrapper option={clientHealthChart} height={260} />
        </div>
        <div className="glass" style={{ padding: '0.75rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.4rem', color: '#e2e8f0' }}>Risk Landscape (Margin × Variance × Critical)</h3>
          <ChartWrapper option={riskScatterChart} height={260} />
        </div>
      </div>

      {data.deliverables && data.deliverables.length > 0 && (
        <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Key Deliverables (Milestones)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                  {['Project', 'Customer', 'Deliverable', 'Due', 'Progress', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '0.35rem 0.5rem', textAlign: h === 'Project' || h === 'Customer' ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.deliverables.slice(0, 25).map((d, i) => (
                  <tr key={`${d.project_id}-${d.task_name}-${i}`} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#e2e8f0' }}>{d.project_name}</td>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#94a3b8' }}>{d.customer_name}</td>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#cbd5e1' }}>{d.task_name.length > 40 ? d.task_name.slice(0, 38) + '…' : d.task_name}</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{d.baseline_end ? new Date(d.baseline_end).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{d.percent_complete}%</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: d.status === 'overdue' ? '#ef4444' : d.status === 'at_risk' ? '#f59e0b' : '#10b981' }}>{d.status.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.amendments && data.amendments.length > 0 && (
        <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Recent Contract Amendments (6 months)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                  {['Project', 'Customer', 'Amount', 'Date'].map((h) => (
                    <th key={h} style={{ padding: '0.35rem 0.5rem', textAlign: h === 'Project' || h === 'Customer' ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.amendments.slice(0, 15).map((a, i) => (
                  <tr key={`${a.project_id}-${a.line_date}-${i}`} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#e2e8f0' }}>{a.project_name}</td>
                    <td style={{ padding: '0.35rem 0.5rem', color: '#94a3b8' }}>{a.customer_name}</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#10b981' }}>{fmt(a.line_amount)}</td>
                    <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{a.line_date ? new Date(a.line_date).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="glass" style={{ padding: '0.75rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Client Portfolio Register</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Customer', 'Projects', 'Contract', 'EAC', 'Margin', 'Variance (hrs)', 'Critical', 'At Risk'].map((h) => (
                  <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: h === 'Customer' ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.clients.map((c) => (
                <React.Fragment key={c.customer_id || c.customer_name}>
                  <tr
                    onClick={() => { setExpandedClient((prev) => (prev === (c.customer_id || c.customer_name) ? null : c.customer_id || c.customer_name)); setCommentText(''); }}
                    style={{ cursor: 'pointer', borderBottom: '1px solid rgba(148,163,184,0.06)', transition: 'background 0.15s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.06)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                  >
                    <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0', fontWeight: 500 }}>{c.customer_name}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{c.projects}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#94a3b8' }}>{fmt(c.total_contract)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: c.total_eac > c.total_contract ? '#ef4444' : '#94a3b8' }}>{fmt(c.total_eac)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: c.margin_pct >= 15 ? '#10b981' : c.margin_pct >= 5 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>{c.margin_pct.toFixed(1)}%</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: c.total_variance_hrs > 0 ? '#ef4444' : '#94a3b8' }}>{c.total_variance_hrs.toLocaleString()}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: c.critical_open > 0 ? '#ef4444' : '#94a3b8' }}>{c.critical_open}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: c.at_risk > 0 ? '#ef4444' : '#94a3b8' }}>{c.at_risk}</td>
                  </tr>
                  {expandedClient === (c.customer_id || c.customer_name) && (
                    <tr>
                      <td colSpan={8} style={{ padding: '0.5rem 0.75rem', background: 'rgba(30,41,59,0.5)' }}>
                        <div style={{ fontSize: '0.68rem', marginBottom: '0.4rem' }}>
                          <strong style={{ color: '#94a3b8' }}>Projects under {c.customer_name}:</strong>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', marginBottom: '0.5rem' }}>
                          <thead>
                            <tr>
                              {['Project', 'Owner', 'Margin', 'Variance', 'Critical', 'Progress'].map((h) => (
                                <th key={h} style={{ padding: '0.25rem 0.4rem', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {data.projects.filter((p) => p.customer_name === c.customer_name).map((p) => (
                              <tr key={p.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.04)' }}>
                                <td style={{ padding: '0.25rem 0.4rem', color: '#e2e8f0' }}>{p.name}</td>
                                <td style={{ padding: '0.25rem 0.4rem', color: '#94a3b8' }}>{p.owner}</td>
                                <td style={{ padding: '0.25rem 0.4rem', color: p.margin >= 15 ? '#10b981' : p.margin >= 5 ? '#f59e0b' : '#ef4444' }}>{p.margin.toFixed(1)}%</td>
                                <td style={{ padding: '0.25rem 0.4rem', color: Math.abs(p.variance_pct) > 15 ? '#ef4444' : '#94a3b8' }}>{p.variance_pct > 0 ? '+' : ''}{p.variance_pct.toFixed(1)}%</td>
                                <td style={{ padding: '0.25rem 0.4rem', color: p.critical_open > 0 ? '#ef4444' : '#94a3b8' }}>{p.critical_open}</td>
                                <td style={{ padding: '0.25rem 0.4rem', color: '#94a3b8' }}>{p.percent_complete.toFixed(0)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <input type="text" value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a client note..." style={{ flex: 1, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }} onKeyDown={(e) => { if (e.key === 'Enter') saveComment(c.customer_id || c.customer_name); }} />
                          <button onClick={() => saveComment(c.customer_id || c.customer_name)} style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', color: '#c7d2fe', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.68rem', cursor: 'pointer' }}>Save</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
