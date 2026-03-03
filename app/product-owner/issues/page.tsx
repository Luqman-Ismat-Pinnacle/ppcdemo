'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type FeedbackItem = {
  id: number;
  itemType: string;
  title: string;
  description: string;
  pagePath: string | null;
  userAction: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  errorMessage: string | null;
  severity: string;
  status: string;
  progressPercent: number;
  notes: string | null;
  source: string;
  createdByName: string | null;
  createdByEmail: string | null;
  runtimeErrorName: string | null;
  runtimeStack: string | null;
  createdAt: string;
  updatedAt: string;
};

const severityColor: Record<string, string> = {
  low: '#10B981', medium: '#F59E0B', high: '#F97316', critical: '#EF4444',
};
const statusColor: Record<string, string> = {
  open: '#EF4444', triaged: '#F59E0B', in_progress: '#3B82F6',
  planned: '#60A5FA', resolved: '#10B981', released: '#22C55E', closed: '#6B7280',
};

const ALL_STATUSES = ['open', 'triaged', 'in_progress', 'planned', 'resolved', 'released', 'closed'];

export default function ProductOwnerIssuesPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [updating, setUpdating] = useState<number | null>(null);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/feedback?type=issue&limit=300', { cache: 'no-store' });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setItems(data.items || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const visible = useMemo(() =>
    items.filter(i => statusFilter === 'all' || i.status === statusFilter),
  [items, statusFilter]);

  const summary = useMemo(() => ({
    total: items.length,
    open: items.filter(i => i.status === 'open').length,
    critical: items.filter(i => i.severity === 'critical').length,
    resolved: items.filter(i => ['resolved', 'released', 'closed'].includes(i.status)).length,
  }), [items]);

  const updateStatus = async (id: number, newStatus: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Update failed');
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...data.item } : i));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Issues</h1>
          <p className="page-subtitle">Triage, track, and resolve reported issues across the platform.</p>
        </div>
      </div>

      {error && (
        <div style={{ border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', borderRadius: 8, padding: '0.55rem 0.75rem', fontSize: '0.76rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem' }}>
        <StatCard label="Total" value={summary.total} accent="#F97316" />
        <StatCard label="Open" value={summary.open} accent="#EF4444" />
        <StatCard label="Critical" value={summary.critical} accent="#DC2626" />
        <StatCard label="Resolved" value={summary.resolved} accent="#10B981" />
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: '0.3rem' }}>Filter:</span>
        {['all', ...ALL_STATUSES].map(s => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)} style={pillStyle(statusFilter === s)}>
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading issues...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '62vh', overflow: 'auto' }}>
          {visible.length === 0 && <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>No issues match this filter.</div>}
          {visible.map(item => (
            <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.7rem 0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{item.title}</span>
                <Badge color={statusColor[item.status]}>{item.status.replace('_', ' ')}</Badge>
                <Badge color={severityColor[item.severity]}>{item.severity}</Badge>
                {item.source === 'runtime' && <Badge color="#8B5CF6">runtime</Badge>}
                <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                  {item.createdByName || item.createdByEmail || 'Anonymous'} &middot; {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '0.45rem', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
                {item.description}
              </div>
              {(item.pagePath || item.errorMessage) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', fontSize: '0.66rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  {item.pagePath && <div><strong>Page:</strong> {item.pagePath}</div>}
                  {item.errorMessage && <div><strong>Error:</strong> {item.errorMessage}</div>}
                  {item.expectedResult && <div><strong>Expected:</strong> {item.expectedResult}</div>}
                  {item.actualResult && <div><strong>Actual:</strong> {item.actualResult}</div>}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                  <div style={{ width: `${item.progressPercent || 0}%`, height: '100%', background: statusColor[item.status] || '#6B7280' }} />
                </div>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', minWidth: 30, textAlign: 'right' }}>{item.progressPercent || 0}%</span>
                <select
                  value={item.status}
                  onChange={e => updateStatus(item.id, e.target.value)}
                  disabled={updating === item.id}
                  style={{ fontSize: '0.64rem', padding: '0.2rem 0.35rem', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', marginLeft: '0.5rem' }}
                >
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
              {item.notes && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>{item.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ padding: '0.7rem 0.85rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '0.6rem', padding: '0.12rem 0.4rem', borderRadius: 999, background: `${color}20`, color, textTransform: 'uppercase', fontWeight: 700 }}>
      {children}
    </span>
  );
}

const pillStyle = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
  background: active ? 'rgba(64,224,208,0.15)' : 'var(--bg-secondary)',
  color: active ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
  borderRadius: 8, padding: '0.28rem 0.55rem', fontSize: '0.66rem',
  fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
});
