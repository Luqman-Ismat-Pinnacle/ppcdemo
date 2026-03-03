'use client';

import { useEffect, useState, useMemo } from 'react';

type Connection = {
  id: number;
  connectionKey: string;
  displayName: string;
  description: string | null;
  connectionType: string;
  status: string;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  configSummary: string | null;
  ownerEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const statusConfig: Record<string, { color: string; bg: string }> = {
  healthy: { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  degraded: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  down: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  unknown: { color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
};

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ProductOwnerConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/product-owner/connections', { cache: 'no-store' });
        const data = await res.json();
        if (data?.error) throw new Error(data.error);
        setConnections(data.connections || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load connections');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() =>
    connections.filter(c => filter === 'all' || c.status === filter),
  [connections, filter]);

  const summary = useMemo(() => ({
    total: connections.length,
    healthy: connections.filter(c => c.status === 'healthy').length,
    degraded: connections.filter(c => c.status === 'degraded').length,
    down: connections.filter(c => c.status === 'down').length,
  }), [connections]);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Connections</h1>
          <p className="page-subtitle">Monitor data pipelines, integrations, and service health.</p>
        </div>
      </div>

      {error && (
        <div style={{ border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', borderRadius: 8, padding: '0.55rem 0.75rem', fontSize: '0.76rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.65rem' }}>
        <StatCard label="Total" value={summary.total} accent="#3B82F6" />
        <StatCard label="Healthy" value={summary.healthy} accent="#10B981" />
        <StatCard label="Degraded" value={summary.degraded} accent="#F59E0B" />
        <StatCard label="Down" value={summary.down} accent="#EF4444" />
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: '0.3rem' }}>Status:</span>
        {['all', 'healthy', 'degraded', 'down', 'unknown'].map(s => (
          <button key={s} type="button" onClick={() => setFilter(s)} style={pillStyle(filter === s)}>
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading connections...</div>
      ) : visible.length === 0 ? (
        <div className="chart-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
            No connections configured yet.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            Connections are registered via the API or will appear once data pipelines are integrated.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.65rem' }}>
          {visible.map(conn => {
            const cfg = statusConfig[conn.status] || statusConfig.unknown;
            return (
              <div key={conn.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, flex: 1 }}>{conn.displayName}</span>
                  <span style={{ fontSize: '0.6rem', padding: '0.12rem 0.4rem', borderRadius: 999, background: cfg.bg, color: cfg.color, textTransform: 'uppercase', fontWeight: 700 }}>
                    {conn.status}
                  </span>
                </div>
                {conn.description && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{conn.description}</div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  <div>Type: <strong>{conn.connectionType}</strong></div>
                  <div>Owner: <strong>{conn.ownerEmail || '-'}</strong></div>
                  <div>Last sync: <strong>{timeAgo(conn.lastSyncAt)}</strong></div>
                  <div>Last success: <strong>{timeAgo(conn.lastSuccessAt)}</strong></div>
                </div>
                {conn.lastError && (
                  <div style={{ fontSize: '0.64rem', color: '#FCA5A5', background: 'rgba(239,68,68,0.08)', borderRadius: 6, padding: '0.35rem 0.5rem', marginTop: '0.1rem' }}>
                    {conn.lastError}
                  </div>
                )}
              </div>
            );
          })}
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

const pillStyle = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
  background: active ? 'rgba(64,224,208,0.15)' : 'var(--bg-secondary)',
  color: active ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
  borderRadius: 8, padding: '0.28rem 0.55rem', fontSize: '0.66rem',
  fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
});
