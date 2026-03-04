'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';

type Commitment = {
  id: string;
  project_id: string;
  project_name: string;
  accountable_owner: string;
  workstream: string;
  intervention_priority: 'P1' | 'P2' | 'P3';
  status: string;
  decision_sla_days: number;
  executive_note: string;
  review_note: string;
  variance_pct: number;
  spi: number;
  avg_progress: number;
  critical_open: number;
  updated_at: string;
};

type Summary = {
  total: number; open: number; in_review: number; committed: number;
  blocked: number; escalated: number; approved: number; rejected: number;
};
type Payload = { success: boolean; summary: Summary; commitments: Commitment[]; error?: string };

const STATUS_OPTIONS = ['open', 'in_review', 'committed', 'blocked', 'escalated', 'approved', 'rejected'] as const;
const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_review: 'In Review', committed: 'Committed', blocked: 'Blocked',
  escalated: 'Escalated', approved: 'Approved', rejected: 'Rejected',
};
const STATUS_COLOR: Record<string, string> = {
  open: '#f59e0b', in_review: '#60a5fa', committed: '#10b981', blocked: '#ef4444',
  escalated: '#a855f7', approved: '#10b981', rejected: '#ef4444',
};

export default function CooCommitmentsPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const d: Payload = await fetch('/api/coo/commitments', { cache: 'no-store' }).then((r) => r.json());
    if (!d.success) throw new Error(d.error || 'Failed');
    setPayload(d);
  }, []);

  useEffect(() => { load().catch((e) => setError(e.message)).finally(() => setLoading(false)); }, [load]);

  const updateCommitment = async (id: string, patch: Partial<Pick<Commitment, 'status' | 'executive_note' | 'review_note'>>) => {
    setSaving(id);
    setError('');
    try {
      const res = await fetch('/api/coo/commitments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || 'Update failed');
      setPayload(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSaving(null); }
  };

  const quickAction = (id: string, action: 'escalated' | 'approved' | 'rejected') => updateCommitment(id, { status: action });

  const filteredCommitments = (payload?.commitments || []).filter((c) => statusFilter === 'all' || c.status === statusFilter);

  return (
    <div>
      <h1 className="page-title">Executive Commitments</h1>
      <p className="page-subtitle">Commitment register with intervention workflow, SLA tracking, and executive decision controls.</p>
      {error && <div style={{ color: 'var(--color-error)', fontSize: '0.78rem', marginBottom: 10 }}>{error}</div>}

      {loading ? <Skeleton height={400} /> : (
        <>
          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'Total', value: payload?.summary.total || 0 },
              { label: 'Open', value: payload?.summary.open || 0, color: '#f59e0b' },
              { label: 'In Review', value: payload?.summary.in_review || 0, color: '#60a5fa' },
              { label: 'Committed', value: payload?.summary.committed || 0, color: '#10b981' },
              { label: 'Blocked', value: payload?.summary.blocked || 0, color: '#ef4444' },
              { label: 'Escalated', value: payload?.summary.escalated || 0, color: '#a855f7' },
              { label: 'Approved', value: payload?.summary.approved || 0, color: '#10b981' },
              { label: 'Rejected', value: payload?.summary.rejected || 0, color: '#ef4444' },
            ].map((k) => (
              <div key={k.label} className="glass kpi-card" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter(k.label.toLowerCase().replace(/ /g, '_') === 'total' ? 'all' : k.label.toLowerCase().replace(/ /g, '_'))}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-value" style={k.color ? { color: k.color } : {}}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div className="glass-raised" style={{ padding: '0.5rem 0.7rem', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '0.25rem 0.4rem', fontSize: '0.72rem' }}>
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <span style={{ marginLeft: 'auto', fontSize: '0.69rem', color: 'var(--text-muted)' }}>Showing {filteredCommitments.length} of {payload?.summary.total || 0}</span>
          </div>

          {/* Table */}
          <div className="glass" style={{ padding: '1rem', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
              <table className="dm-table" style={{ width: '100%', minWidth: 1100, fontSize: '0.72rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 26 }} />
                    <th style={{ textAlign: 'left' }}>Project</th>
                    <th style={{ textAlign: 'left' }}>Priority</th>
                    <th style={{ textAlign: 'left' }}>Owner</th>
                    <th style={{ textAlign: 'left' }}>Status</th>
                    <th style={{ textAlign: 'right' }}>SLA (days)</th>
                    <th style={{ textAlign: 'right' }}>SPI</th>
                    <th style={{ textAlign: 'right' }}>Variance %</th>
                    <th style={{ textAlign: 'left' }}>Executive Directive</th>
                    <th style={{ textAlign: 'left' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCommitments.map((row) => (
                    <React.Fragment key={row.id}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => toggleExpand(row.id)}>
                        <td style={{ textAlign: 'center', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{expanded.has(row.id) ? '▾' : '▸'}</td>
                        <td style={{ fontWeight: 600 }}>{row.project_name}</td>
                        <td style={{ fontWeight: 700, color: row.intervention_priority === 'P1' ? '#ef4444' : row.intervention_priority === 'P2' ? '#f59e0b' : '#60a5fa' }}>{row.intervention_priority}</td>
                        <td>{row.accountable_owner}</td>
                        <td>
                          <select
                            value={row.status}
                            onChange={(e) => { e.stopPropagation(); updateCommitment(row.id, { status: e.target.value }); }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ background: 'var(--glass-bg)', color: STATUS_COLOR[row.status] || 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.18rem 0.3rem', fontSize: '0.68rem', fontWeight: 700 }}
                            disabled={saving === row.id}
                          >
                            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                          </select>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: row.decision_sla_days <= 3 ? '#ef4444' : row.decision_sla_days <= 7 ? '#f59e0b' : 'var(--text-secondary)' }}>{row.decision_sla_days}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: row.spi >= 0.95 ? '#10b981' : row.spi >= 0.85 ? '#f59e0b' : '#ef4444' }}>{row.spi.toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: row.variance_pct >= 20 ? '#ef4444' : row.variance_pct >= 10 ? '#f59e0b' : '#10b981' }}>{row.variance_pct.toFixed(1)}%</td>
                        <td>
                          <input
                            value={row.executive_note || ''}
                            onChange={(e) => { const v = e.target.value; setPayload((p) => p ? { ...p, commitments: p.commitments.map((c) => c.id === row.id ? { ...c, executive_note: v } : c) } : p); }}
                            onBlur={(e) => updateCommitment(row.id, { executive_note: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Enter directive…"
                            style={{ width: '100%', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.2rem 0.35rem', fontSize: '0.68rem' }}
                            disabled={saving === row.id}
                          />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => quickAction(row.id, 'escalated')} disabled={saving === row.id} style={{ background: 'rgba(168,85,247,0.18)', color: '#c4b5fd', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 5, padding: '0.15rem 0.35rem', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer' }} title="Escalate">Escalate</button>
                            <button onClick={() => quickAction(row.id, 'approved')} disabled={saving === row.id} style={{ background: 'rgba(16,185,129,0.18)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 5, padding: '0.15rem 0.35rem', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer' }} title="Approve">Approve</button>
                            <button onClick={() => quickAction(row.id, 'rejected')} disabled={saving === row.id} style={{ background: 'rgba(239,68,68,0.18)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 5, padding: '0.15rem 0.35rem', fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer' }} title="Reject">Reject</button>
                          </div>
                        </td>
                      </tr>
                      {expanded.has(row.id) && (
                        <tr>
                          <td colSpan={10} style={{ padding: '0.5rem 0.8rem 0.6rem 2rem', background: 'rgba(99,102,241,0.04)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, fontSize: '0.69rem', marginBottom: 8 }}>
                              <div><span style={{ color: 'var(--text-muted)' }}>Workstream:</span> {row.workstream}</div>
                              <div><span style={{ color: 'var(--text-muted)' }}>Progress:</span> {row.avg_progress}%</div>
                              <div><span style={{ color: 'var(--text-muted)' }}>Critical Open:</span> <span style={{ color: row.critical_open >= 5 ? '#ef4444' : 'var(--text-primary)' }}>{row.critical_open}</span></div>
                              <div><span style={{ color: 'var(--text-muted)' }}>Last Updated:</span> {new Date(row.updated_at).toLocaleString()}</div>
                            </div>
                            <div style={{ fontSize: '0.69rem' }}>
                              <span style={{ color: 'var(--text-muted)' }}>Review Note:</span>
                              <input
                                value={row.review_note || ''}
                                onChange={(e) => { const v = e.target.value; setPayload((p) => p ? { ...p, commitments: p.commitments.map((c) => c.id === row.id ? { ...c, review_note: v } : c) } : p); }}
                                onBlur={(e) => updateCommitment(row.id, { review_note: e.target.value })}
                                placeholder="Add review context…"
                                style={{ width: '100%', marginTop: 4, background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '0.22rem 0.38rem', fontSize: '0.68rem' }}
                                disabled={saving === row.id}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {filteredCommitments.length === 0 && (
                    <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No commitments for selected filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
