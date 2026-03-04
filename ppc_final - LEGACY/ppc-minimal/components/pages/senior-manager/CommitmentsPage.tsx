'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Skeleton from '@/components/ui/Skeleton';

type Commitment = {
  id: string;
  scope: string;
  recordId: string | null;
  level: string | null;
  comment: string;
  status: string;
  project_name: string | null;
  owner: string | null;
  item_name: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectUnit = { id: string; name: string; phases: { id: string; name: string }[] };
type Project = { id: string; name: string; units: ProjectUnit[] };

type Payload = {
  success: boolean;
  commitments: Commitment[];
  summary: { total: number; open: number; inProgress: number; closed: number };
  projects?: Project[];
};

const VALID_STATUS = ['open', 'in_progress', 'closed'] as const;

export default function CommitmentsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [newScope, setNewScope] = useState('general');
  const [newComment, setNewComment] = useState('');
  const [newRecordId, setNewRecordId] = useState('');
  const [newLevel, setNewLevel] = useState<'project' | 'unit' | 'phase'>('project');

  const load = useCallback(() => {
    fetch('/api/senior-manager/commitments', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = useCallback(async (id: string, status: string) => {
    if (!VALID_STATUS.includes(status as typeof VALID_STATUS[number])) return;
    await fetch('/api/senior-manager/commitments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    load();
  }, [load]);

  const createCommitment = useCallback(async () => {
    if (!newComment.trim()) return;
    await fetch('/api/senior-manager/commitments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'commitments', scope: newScope, recordId: newRecordId || undefined, level: newLevel, comment: newComment }),
    });
    setNewComment('');
    setNewRecordId('');
    load();
  }, [newScope, newRecordId, newLevel, newComment, load]);

  const filtered = (data?.commitments || []).filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.comment?.toLowerCase().includes(s)) || (c.project_name?.toLowerCase().includes(s)) || (c.item_name?.toLowerCase().includes(s));
    }
    return true;
  });

  if (loading) {
    return (
      <div>
        <h1 className="page-title">Commitments Register</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={60} />)}
        </div>
        <Skeleton height={200} />
      </div>
    );
  }

  if (!data?.success) {
    return <div><h1 className="page-title">Commitments Register</h1><div className="glass" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Failed to load commitments.</div></div>;
  }

  const s = data.summary;

  return (
    <div>
      <h1 className="page-title">Commitments Register</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="glass kpi-card"><div className="kpi-label">Total</div><div className="kpi-value">{s.total}</div></div>
        <div className="glass kpi-card"><div className="kpi-label">Open</div><div className="kpi-value" style={{ color: '#f59e0b' }}>{s.open}</div></div>
        <div className="glass kpi-card"><div className="kpi-label">In Progress</div><div className="kpi-value" style={{ color: '#3b82f6' }}>{s.inProgress}</div></div>
        <div className="glass kpi-card"><div className="kpi-label">Closed</div><div className="kpi-value" style={{ color: '#10b981' }}>{s.closed}</div></div>
      </div>

      <div className="glass" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: '#e2e8f0' }}>Add Commitment</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Scope</label>
            <select value={newScope} onChange={(e) => setNewScope(e.target.value)} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.72rem' }}>
              {['general', 'financial', 'client', 'delivery', 'operating'].map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Level</label>
            <select value={newLevel} onChange={(e) => setNewLevel(e.target.value as 'project' | 'unit' | 'phase')} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.72rem' }}>
              <option value="project">Project</option>
              <option value="unit">Unit</option>
              <option value="phase">Phase</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Project / Unit / Phase</label>
            <select value={newRecordId} onChange={(e) => setNewRecordId(e.target.value)} style={{ minWidth: 180, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.72rem' }}>
              <option value="">— Select —</option>
              {(data?.projects || []).flatMap((p) => {
                const projectOpt = <option key={p.id} value={p.id}>{p.name} (Project)</option>;
                const unitOpts = p.units?.flatMap((u) => {
                  const unitOpt = <option key={u.id} value={u.id}>{p.name} › {u.name} (Unit)</option>;
                  const phaseOpts = u.phases?.map((ph) => <option key={ph.id} value={ph.id}>{p.name} › {u.name} › {ph.name} (Phase)</option>) ?? [];
                  return [unitOpt, ...phaseOpts];
                }) ?? [];
                return [projectOpt, ...unitOpts];
              })}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block', marginBottom: '0.2rem' }}>Comment</label>
            <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a commitment..." style={{ width: '100%', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.72rem' }} onKeyDown={(e) => { if (e.key === 'Enter') createCommitment(); }} />
          </div>
          <button onClick={createCommitment} style={{ background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', color: '#c7d2fe', borderRadius: 6, padding: '0.3rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer' }}>Add</button>
        </div>
      </div>

      <div className="glass" style={{ padding: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {['all', 'open', 'in_progress', 'closed'].map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)} style={{ background: statusFilter === f ? 'rgba(99,102,241,0.3)' : 'rgba(30,41,59,0.5)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, padding: '0.25rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem', cursor: 'pointer' }}>{f === 'all' ? 'All' : f.replace('_', ' ')}</button>
            ))}
          </div>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search commitments…" style={{ width: 180, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 6, padding: '0.3rem 0.5rem', color: '#e2e8f0', fontSize: '0.68rem' }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                {['Scope', 'Item (Project › Unit › Phase)', 'Comment', 'Status', 'Created', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>No commitments found.</td></tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8' }}>{c.scope}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#e2e8f0' }}>{c.project_name || c.item_name || c.recordId || '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#cbd5e1', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.comment || '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>
                      <span style={{ fontSize: '0.64rem', padding: '0.1rem 0.35rem', borderRadius: 4, background: c.status === 'closed' ? 'rgba(16,185,129,0.2)' : c.status === 'in_progress' ? 'rgba(59,130,246,0.2)' : 'rgba(245,158,11,0.2)', color: c.status === 'closed' ? '#10b981' : c.status === 'in_progress' ? '#3b82f6' : '#f59e0b' }}>{c.status}</span>
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', color: '#94a3b8', fontSize: '0.68rem' }}>{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>
                      {c.status === 'open' && <button onClick={() => updateStatus(c.id, 'in_progress')} style={{ marginRight: 4, background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd', borderRadius: 4, padding: '0.15rem 0.4rem', fontSize: '0.64rem', cursor: 'pointer' }}>Start</button>}
                      {c.status === 'in_progress' && <button onClick={() => updateStatus(c.id, 'closed')} style={{ marginRight: 4, background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#6ee7b7', borderRadius: 4, padding: '0.15rem 0.4rem', fontSize: '0.64rem', cursor: 'pointer' }}>Close</button>}
                      {c.status === 'closed' && <button onClick={() => updateStatus(c.id, 'open')} style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', color: '#fde68a', borderRadius: 4, padding: '0.15rem 0.4rem', fontSize: '0.64rem', cursor: 'pointer' }}>Reopen</button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
