'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';

type Guardrail = {
  id: string;
  project_id: string;
  project_name: string;
  record_table: string;
  record_id: string;
  record_name: string;
  predicted_hours: number;
  entered_hours: number;
  delta: number;
  pl_comment: string;
  status: string;
  pca_comment: string | null;
  escalated_to: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  created_by: string;
  created_at: string;
  sm_name: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending_pca: 'Pending PCA Review',
  pca_approved: 'PCA Approved',
  escalated_sm: 'Escalated to SM',
  sm_resolved: 'SM Resolved',
};
const STATUS_COLORS: Record<string, string> = {
  pending_pca: '#f59e0b',
  pca_approved: '#10b981',
  escalated_sm: '#ef4444',
  sm_resolved: '#6366f1',
};

export default function GuardrailReviewPage() {
  const [items, setItems] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending_pca' | 'escalated_sm' | 'pca_approved' | 'sm_resolved'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pcaComment, setPcaComment] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/forecast-guardrails', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.guardrails || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((g) => g.status === filter);
  }, [items, filter]);

  const pendingCount = useMemo(() => items.filter((g) => g.status === 'pending_pca').length, [items]);
  const escalatedCount = useMemo(() => items.filter((g) => g.status === 'escalated_sm').length, [items]);

  const doAction = async (action: string, id: string) => {
    setActionLoading(id);
    await fetch('/api/forecast-guardrails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, pca_comment: pcaComment }),
    });
    setPcaComment('');
    setExpandedId(null);
    setActionLoading(null);
    load();
  };

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Guardrail Review</h1>
        <Skeleton height={400} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Guardrail Review</h1>
      <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.85rem' }}>
        Review PL forecast entries where remaining hours are below predicted values. Approve with rationale or escalate to the owning Senior Manager.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <div className="glass kpi-card">
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{items.length}</div>
        </div>
        <div className="glass kpi-card">
          <div className="kpi-label">Pending Review</div>
          <div className="kpi-value" style={{ color: pendingCount > 0 ? '#f59e0b' : '#10b981' }}>{pendingCount}</div>
        </div>
        <div className="glass kpi-card">
          <div className="kpi-label">Escalated</div>
          <div className="kpi-value" style={{ color: escalatedCount > 0 ? '#ef4444' : '#10b981' }}>{escalatedCount}</div>
        </div>
      </div>

      <div className="glass" style={{ padding: '0.6rem', marginBottom: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.35rem 0.5rem', fontSize: '0.72rem' }}>
          <option value="all">All</option>
          <option value="pending_pca">Pending PCA</option>
          <option value="pca_approved">Approved</option>
          <option value="escalated_sm">Escalated</option>
          <option value="sm_resolved">SM Resolved</option>
        </select>
      </div>

      <div className="glass" style={{ padding: '0.6rem' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.72rem' }}>No guardrail items found.</div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,.14)' }}>
                  {['Project', 'Item', 'Type', 'Predicted Hrs', 'Entered Hrs', 'Delta', 'PL Rationale', 'Status', 'Created'].map((h) => (
                    <th key={h} style={{ padding: '0.35rem 0.4rem', textAlign: ['Project', 'Item', 'Type', 'PL Rationale', 'Status'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => {
                  const expanded = expandedId === g.id;
                  return (
                    <React.Fragment key={g.id}>
                      <tr
                        onClick={() => { setExpandedId(expanded ? null : g.id); setPcaComment(''); }}
                        style={{ borderBottom: '1px solid rgba(148,163,184,.06)', cursor: 'pointer' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.04)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                      >
                        <td style={{ padding: '0.35rem 0.4rem', color: '#e2e8f0' }}>{g.project_name}</td>
                        <td style={{ padding: '0.35rem 0.4rem', color: '#cbd5e1' }}>{g.record_name || g.record_id}</td>
                        <td style={{ padding: '0.35rem 0.4rem', color: '#94a3b8' }}>{g.record_table.replace(/_/g, ' ')}</td>
                        <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', color: '#94a3b8' }}>{Number(g.predicted_hours).toFixed(1)}</td>
                        <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', color: '#fca5a5' }}>{Number(g.entered_hours).toFixed(1)}</td>
                        <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{Number(g.delta).toFixed(1)}</td>
                        <td style={{ padding: '0.35rem 0.4rem', color: '#94a3b8', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.pl_comment || '—'}</td>
                        <td style={{ padding: '0.35rem 0.4rem' }}>
                          <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem', borderRadius: 4, background: `${STATUS_COLORS[g.status] || '#64748b'}20`, color: STATUS_COLORS[g.status] || '#64748b' }}>
                            {STATUS_LABELS[g.status] || g.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.35rem 0.4rem', color: '#64748b' }}>{g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}</td>
                      </tr>

                      {expanded && (
                        <tr>
                          <td colSpan={9} style={{ padding: '0.6rem 0.7rem', background: 'rgba(30,41,59,0.45)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                              <div>
                                <div style={{ fontSize: '0.68rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>PL Rationale</div>
                                <div style={{ fontSize: '0.64rem', color: '#94a3b8', padding: '0.4rem', background: 'rgba(15,23,42,.4)', borderRadius: 6, border: '1px solid rgba(148,163,184,.1)' }}>
                                  {g.pl_comment || 'No rationale provided.'}
                                </div>
                                {g.pca_comment && (
                                  <div style={{ marginTop: '0.35rem' }}>
                                    <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 600 }}>PCA / SM Notes</div>
                                    <div style={{ fontSize: '0.64rem', color: '#cbd5e1' }}>{g.pca_comment}</div>
                                  </div>
                                )}
                                {g.escalated_to && (
                                  <div style={{ marginTop: '0.25rem', fontSize: '0.62rem', color: '#ef4444' }}>
                                    Escalated to: {g.sm_name || g.escalated_to}
                                  </div>
                                )}
                              </div>

                              {g.status === 'pending_pca' && (
                                <div>
                                  <div style={{ fontSize: '0.68rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>Take Action</div>
                                  <textarea
                                    value={pcaComment}
                                    onChange={(e) => setPcaComment(e.target.value)}
                                    placeholder="Optional PCA comment..."
                                    rows={2}
                                    style={{ width: '100%', background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.35rem', fontSize: '0.64rem', marginBottom: '0.35rem' }}
                                  />
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); doAction('pca_approve', g.id); }}
                                      disabled={actionLoading === g.id}
                                      style={{ fontSize: '0.64rem', borderRadius: 5, border: '1px solid rgba(16,185,129,.4)', background: 'rgba(16,185,129,.2)', color: '#a7f3d0', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                                    >Approve</button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); doAction('pca_escalate', g.id); }}
                                      disabled={actionLoading === g.id}
                                      style={{ fontSize: '0.64rem', borderRadius: 5, border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.2)', color: '#fca5a5', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                                    >Escalate to SM</button>
                                  </div>
                                </div>
                              )}

                              {g.status !== 'pending_pca' && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.64rem', color: '#64748b' }}>
                                  {g.status === 'pca_approved' ? 'Approved by PCA' : g.status === 'escalated_sm' ? 'Awaiting SM resolution' : 'Resolved'}
                                </div>
                              )}
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
