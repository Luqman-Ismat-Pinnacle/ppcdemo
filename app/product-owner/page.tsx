'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

type FeedbackItem = {
  id: number;
  itemType: string;
  title: string;
  status: string;
  severity: string;
  createdAt: string;
};

type Connection = {
  id: number;
  displayName: string;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

const statusColor: Record<string, string> = {
  open: '#EF4444', triaged: '#F59E0B', in_progress: '#3B82F6',
  planned: '#60A5FA', resolved: '#10B981', released: '#22C55E', closed: '#6B7280',
};

const connectionStatusColor: Record<string, string> = {
  healthy: '#10B981', degraded: '#F59E0B', down: '#EF4444', unknown: '#6B7280',
};

function KpiCard({ label, value, accent, href }: { label: string; value: string | number; accent: string; href?: string }) {
  const inner = (
    <div style={{ padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-card)', cursor: href ? 'pointer' : undefined }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

export default function ProductOwnerOverviewPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/feedback?type=all&limit=100').then(r => r.json()).catch(() => ({ items: [] })),
      fetch('/api/product-owner/connections').then(r => r.json()).catch(() => ({ connections: [] })),
    ]).then(([fb, conn]) => {
      setItems(fb.items || []);
      setConnections(conn.connections || []);
    }).finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const issues = items.filter(i => i.itemType === 'issue');
    const features = items.filter(i => i.itemType === 'feature');
    const openIssues = issues.filter(i => !['resolved', 'closed', 'released'].includes(i.status));
    const activeFeatures = features.filter(i => ['in_progress', 'planned', 'triaged'].includes(i.status));
    const degradedConns = connections.filter(c => c.status !== 'healthy');
    return {
      openIssues: openIssues.length,
      totalIssues: issues.length,
      activeFeatures: activeFeatures.length,
      totalFeatures: features.length,
      healthyConns: connections.filter(c => c.status === 'healthy').length,
      degradedConns: degradedConns.length,
      totalConns: connections.length,
    };
  }, [items, connections]);

  const recentIssues = items.filter(i => i.itemType === 'issue').slice(0, 5);
  const recentFeatures = items.filter(i => i.itemType === 'feature').slice(0, 5);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Product Owner</h1>
          <p className="page-subtitle">Platform health, issue triage, feature pipeline, and integration status.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
        <KpiCard label="Open Issues" value={loading ? '...' : stats.openIssues} accent="#EF4444" href="/product-owner/issues" />
        <KpiCard label="Total Issues" value={loading ? '...' : stats.totalIssues} accent="#F97316" href="/product-owner/issues" />
        <KpiCard label="Active Features" value={loading ? '...' : stats.activeFeatures} accent="#3B82F6" href="/product-owner/features" />
        <KpiCard label="Total Features" value={loading ? '...' : stats.totalFeatures} accent="#60A5FA" href="/product-owner/features" />
        <KpiCard label="Healthy Connections" value={loading ? '...' : `${stats.healthyConns}/${stats.totalConns}`} accent="#10B981" href="/product-owner/connections" />
        <KpiCard label="Degraded" value={loading ? '...' : stats.degradedConns} accent={stats.degradedConns > 0 ? '#F59E0B' : '#10B981'} href="/product-owner/connections" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.9rem' }}>
        <section className="chart-card" style={{ padding: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.88rem' }}>Recent Issues</h3>
            <Link href="/product-owner/issues" style={{ fontSize: '0.68rem', color: 'var(--pinnacle-teal)' }}>View all</Link>
          </div>
          {loading ? <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>Loading...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {recentIssues.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>No issues yet.</div>}
              {recentIssues.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[item.status] || '#6B7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.76rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  <span style={{ fontSize: '0.6rem', color: statusColor[item.status] || '#9CA3AF', textTransform: 'uppercase', fontWeight: 700 }}>{item.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="chart-card" style={{ padding: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.88rem' }}>Feature Pipeline</h3>
            <Link href="/product-owner/features" style={{ fontSize: '0.68rem', color: 'var(--pinnacle-teal)' }}>View all</Link>
          </div>
          {loading ? <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>Loading...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {recentFeatures.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>No features yet.</div>}
              {recentFeatures.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.55rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[item.status] || '#6B7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.76rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  <span style={{ fontSize: '0.6rem', color: statusColor[item.status] || '#9CA3AF', textTransform: 'uppercase', fontWeight: 700 }}>{item.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {connections.length > 0 && (
        <section className="chart-card" style={{ padding: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.88rem' }}>Connection Health</h3>
            <Link href="/product-owner/connections" style={{ fontSize: '0.68rem', color: 'var(--pinnacle-teal)' }}>Manage</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
            {connections.slice(0, 6).map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: connectionStatusColor[c.status] || '#6B7280', flexShrink: 0 }} />
                <span style={{ fontSize: '0.74rem', fontWeight: 600 }}>{c.displayName}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: connectionStatusColor[c.status] || '#9CA3AF', textTransform: 'uppercase', fontWeight: 700 }}>{c.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
