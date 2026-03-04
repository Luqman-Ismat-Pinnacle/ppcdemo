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
  created_at: string;
};

export default function SMGuardrailPage() {
  const [items, setItems] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [smComment, setSmComment] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/forecast-guardrails?status=escalated_sm', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.guardrails || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolvedCount = useMemo(() => items.filter((g) => g.status === 'sm_resolved').length, [items]);

  const resolve = async (id: string) => {
    setActionLoading(id);
    await fetch('/api/forecast-guardrails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sm_resolve', id, sm_comment: smComment }),
    });
    setSmComment('');
    setExpandedId(null);
    setActionLoading(null);
    load();
  };

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Escalated Guardrails</h1>
        <Skeleton height={300} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Escalated Guardrails</h1>
      <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.85rem' }}>
        These items were escalated by PCAs because the Project Lead entered remaining hours significantly below predicted values. Review and resolve.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem', marginBottom: '0.85rem' }}>
        <div className="glass kpi-card">
          <div className="kpi-label">Escalated</div>
          <div className="kpi-value" style={{ color: items.length > 0 ? '#ef4444' : '#10b981' }}>{items.length}</div>
        </div>
        <div className="glass kpi-card">
          <div className="kpi-label">Resolved</div>
          <div className="kpi-value" style={{ color: '#10b981' }}>{resolvedCount}</div>
        </div>
      </div>

      <div className="glass" style={{ padding: '0.6rem' }}>
        {items.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.72rem' }}>No escalated guardrails at this time.</div>
        ) : (
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,.14)' }}>
                  {['Project', 'Item', 'Predicted', 'Entered', 'Delta', 'PL Rationale', 'PCA Notes', 'Created'].map((h) => (
                    <th key={h} style={{ padding: '0.35rem 0.4rem', textAlign: ['Project', 'Item', 'PL Rationale', 'PCA Notes'].includes(h) ? 'left' : 'right', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((g) => {
                  const expanded = expandedId === g.id;
                  return (
                    <React.Fragment key={g.id}>
                      <tr
                        onClick={() => { setExpandedId(expanded ? null : g.id); setSmComment(''); }}
                        style={{ borderBottom: '1px solid rgba(148,163,184,.06)', cursor: 'pointer' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.04)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                      >
                        <td style={{ padding: '0.35rem 0.4rem', color: '#e2e8f0' }}>{g.project_name}</td>
                        <td style={{ padding: '0.35rem 0.4rem', color: '#cbd5e1' }}>{g.record_name || g.record_id}</td>
                        <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', color: '#94a3b8' }}>{Number(g.predicted_hours).toFixed(1)}</td>
                        <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', color: '#fca5a5' }}>{Number(g.entered_hours).toFixed(1)}</td>
                        <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{Number(g.delta).toFixed(1)}</td>
                        <td style={{ padding: '0.35rem 0.4rem', color: '#94a3b8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.pl_comment || '—'}</td>
                        <td style={{ padding: '0.35rem 0.4rem', color: '#94a3b8', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.pca_comment || '—'}</td>
                        <td style={{ padding: '0.35rem 0.4rem', color: '#64748b' }}>{g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}</td>
                      </tr>

                      {expanded && g.status === 'escalated_sm' && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0.6rem 0.7rem', background: 'rgba(30,41,59,0.45)' }}>
                            <div style={{ fontSize: '0.68rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '0.3rem' }}>Resolve Escalation</div>
                            <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginBottom: '0.3rem' }}>
                              PL entered <strong>{Number(g.entered_hours).toFixed(1)} hrs</strong> vs predicted <strong>{Number(g.predicted_hours).toFixed(1)} hrs</strong>.
                              PL says: &ldquo;{g.pl_comment}&rdquo;
                            </div>
                            <textarea
                              value={smComment}
                              onChange={(e) => setSmComment(e.target.value)}
                              placeholder="SM resolution comment..."
                              rows={2}
                              style={{ width: '100%', background: 'rgba(15,23,42,.6)', border: '1px solid rgba(148,163,184,.2)', color: '#e2e8f0', borderRadius: 6, padding: '0.35rem', fontSize: '0.64rem', marginBottom: '0.35rem' }}
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); resolve(g.id); }}
                              disabled={actionLoading === g.id}
                              style={{ fontSize: '0.64rem', borderRadius: 5, border: '1px solid rgba(16,185,129,.4)', background: 'rgba(16,185,129,.2)', color: '#a7f3d0', padding: '0.25rem 0.6rem', cursor: 'pointer' }}
                            >{actionLoading === g.id ? 'Resolving...' : 'Mark Resolved'}</button>
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
