'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

type FeedbackItem = { id: number; itemType: string; title: string; status: string; severity: string; createdAt: string };
type Connection = { id: number; connectionKey: string; displayName: string; status: string; lastSyncAt: string | null; lastError: string | null };
type TableStat = { name: string; rowCount: number; totalSize: string };

const statusColor: Record<string, string> = {
  open: '#EF4444', triaged: '#F59E0B', in_progress: '#3B82F6',
  planned: '#60A5FA', resolved: '#10B981', released: '#22C55E', closed: '#6B7280',
};

const connectionStatusColor: Record<string, string> = {
  healthy: '#10B981', degraded: '#F59E0B', down: '#EF4444', unknown: '#6B7280',
};

function KpiCard({ label, value, accent, href, sub }: { label: string; value: string | number; accent: string; href?: string; sub?: string }) {
  const inner = (
    <div className="glass" style={{ padding: '0.65rem 0.8rem', minHeight: 88, cursor: href ? 'pointer' : undefined }}>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: accent, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 1, minHeight: 14 }}>
        {sub || '\u00a0'}
      </div>
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link> : inner;
}

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

export default function ProductOwnerOverviewPage() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dbStats, setDbStats] = useState<{ databaseSize: string; tables: TableStat[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/feedback?type=all&limit=100').then(r => r.json()).catch(() => ({ items: [] })),
      fetch('/api/product-owner/connections').then(r => r.json()).catch(() => ({ connections: [] })),
      fetch('/api/product-owner/database?table=__stats').then(r => r.json()).catch(() => null),
    ]).then(([fb, conn, db]) => {
      setItems(fb.items || []);
      setConnections(conn.connections || []);
      if (db?.success) setDbStats(db);
    }).finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const issues = items.filter(i => i.itemType === 'issue');
    const features = items.filter(i => i.itemType === 'feature');
    return {
      openIssues: issues.filter(i => !['resolved', 'closed', 'released'].includes(i.status)).length,
      totalIssues: issues.length,
      criticalIssues: issues.filter(i => i.severity === 'critical').length,
      activeFeatures: features.filter(i => ['in_progress', 'planned', 'triaged'].includes(i.status)).length,
      totalFeatures: features.length,
      healthyConns: connections.filter(c => c.status === 'healthy').length,
      degradedConns: connections.filter(c => c.status !== 'healthy').length,
      totalConns: connections.length,
    };
  }, [items, connections]);

  const totalDbRows = useMemo(() => dbStats?.tables.reduce((s, t) => s + t.rowCount, 0) ?? 0, [dbStats]);
  const topTables = useMemo(() => [...(dbStats?.tables || [])].sort((a, b) => b.rowCount - a.rowCount).slice(0, 8), [dbStats]);
  const workdayConn = connections.find(c => c.connectionKey === 'workday_sync');
  const postgresConn = connections.find(c => c.connectionKey === 'azure_postgres');

  const recentIssues = items.filter(i => i.itemType === 'issue').slice(0, 5);
  const recentFeatures = items.filter(i => i.itemType === 'feature').slice(0, 5);

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Product Owner</h1>
          <p className="page-subtitle">System health, data pipelines, database status, and platform management.</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.55rem' }}>
        <KpiCard label="Open Issues" value={loading ? '...' : stats.openIssues} accent="#EF4444" href="/product-owner/feedback" />
        <KpiCard label="Critical" value={loading ? '...' : stats.criticalIssues} accent="#DC2626" href="/product-owner/feedback" />
        <KpiCard label="Active Features" value={loading ? '...' : stats.activeFeatures} accent="#3B82F6" href="/product-owner/feedback" />
        <KpiCard label="Connections" value={loading ? '...' : `${stats.healthyConns}/${stats.totalConns}`} accent="#10B981" href="/product-owner/connections" sub={stats.degradedConns > 0 ? `${stats.degradedConns} degraded` : 'All healthy'} />
        <KpiCard label="DB Size" value={loading ? '...' : (dbStats?.databaseSize || '—')} accent="#8B5CF6" href="/product-owner/database" />
        <KpiCard label="Total Rows" value={loading ? '...' : totalDbRows.toLocaleString()} accent="#10B981" href="/product-owner/database" />
        <KpiCard label="Tables" value={loading ? '...' : (dbStats?.tables.length ?? 0)} accent="#3B82F6" href="/product-owner/database" />
        <KpiCard label="Workday Sync" value={loading ? '...' : (workdayConn ? timeAgo(workdayConn.lastSyncAt) : 'N/A')} accent={workdayConn?.status === 'healthy' ? '#10B981' : '#F59E0B'} href="/product-owner/connections" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
        {/* Database Tables */}
        <section className="glass" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>Database Tables</h3>
            <Link href="/product-owner/database" style={{ fontSize: '0.64rem', color: 'var(--pinnacle-teal)' }}>Browse all</Link>
          </div>
          {loading ? <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Loading...</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.66rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(148,163,184,.12)' }}>
                  <th style={{ textAlign: 'left', color: '#94a3b8', fontWeight: 600, padding: '0.25rem 0.35rem' }}>Table</th>
                  <th style={{ textAlign: 'right', color: '#94a3b8', fontWeight: 600, padding: '0.25rem 0.35rem' }}>Rows</th>
                  <th style={{ textAlign: 'right', color: '#94a3b8', fontWeight: 600, padding: '0.25rem 0.35rem' }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {topTables.map(t => (
                  <tr key={t.name} style={{ borderBottom: '1px solid rgba(148,163,184,.05)', cursor: 'pointer' }} onClick={() => window.location.href = '/product-owner/database'}>
                    <td style={{ padding: '0.25rem 0.35rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</td>
                    <td style={{ padding: '0.25rem 0.35rem', textAlign: 'right', color: 'var(--text-secondary)' }}>{t.rowCount.toLocaleString()}</td>
                    <td style={{ padding: '0.25rem 0.35rem', textAlign: 'right', color: 'var(--text-muted)' }}>{t.totalSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Connections */}
        <section className="glass" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>Integration Health</h3>
            <Link href="/product-owner/connections" style={{ fontSize: '0.64rem', color: 'var(--pinnacle-teal)' }}>Manage</Link>
          </div>
          {loading ? <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Loading...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {connections.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>No connections. Seed defaults on the connections page.</div>}
              {connections.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.5rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: connectionStatusColor[c.status] || '#6B7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, flex: 1 }}>{c.displayName}</span>
                  <span style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>{timeAgo(c.lastSyncAt)}</span>
                  <span style={{ fontSize: '0.56rem', padding: '0.08rem 0.3rem', borderRadius: 999, background: `${connectionStatusColor[c.status]}20`, color: connectionStatusColor[c.status], textTransform: 'uppercase', fontWeight: 700 }}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Issues */}
        <section className="glass" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>Recent Issues</h3>
            <Link href="/product-owner/feedback" style={{ fontSize: '0.64rem', color: 'var(--pinnacle-teal)' }}>View all</Link>
          </div>
          {loading ? <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Loading...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {recentIssues.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>No issues.</div>}
              {recentIssues.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.5rem', borderRadius: 7, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor[item.status] || '#6B7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  <span style={{ fontSize: '0.56rem', color: statusColor[item.status] || '#9CA3AF', textTransform: 'uppercase', fontWeight: 700 }}>{item.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Feature Pipeline */}
        <section className="glass" style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700 }}>Feature Pipeline</h3>
            <Link href="/product-owner/feedback" style={{ fontSize: '0.64rem', color: 'var(--pinnacle-teal)' }}>View all</Link>
          </div>
          {loading ? <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Loading...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {recentFeatures.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>No features.</div>}
              {recentFeatures.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.5rem', borderRadius: 7, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor[item.status] || '#6B7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                  <span style={{ fontSize: '0.56rem', color: statusColor[item.status] || '#9CA3AF', textTransform: 'uppercase', fontWeight: 700 }}>{item.status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Data Pipeline Status */}
        <section className="glass" style={{ padding: '0.75rem', gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', fontWeight: 700 }}>Data Pipeline</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
            <PipelineCard
              name="Workday Sync"
              description="Employees, projects, hours, contracts, phases"
              status={workdayConn?.status || 'unknown'}
              lastSync={workdayConn?.lastSyncAt || null}
              error={workdayConn?.lastError || null}
            />
            <PipelineCard
              name="Azure PostgreSQL"
              description="Primary database (22 tables)"
              status={postgresConn?.status || 'unknown'}
              lastSync={postgresConn?.lastSyncAt || null}
              error={postgresConn?.lastError || null}
            />
            <PipelineCard
              name="Project Plans"
              description="MPP uploads to Azure Blob"
              status={connections.find(c => c.connectionKey === 'azure_blob_docs')?.status || 'unknown'}
              lastSync={connections.find(c => c.connectionKey === 'azure_blob_docs')?.lastSyncAt || null}
              error={null}
            />
            <PipelineCard
              name="Azure DevOps"
              description="CI/CD pipeline"
              status={connections.find(c => c.connectionKey === 'azure_devops')?.status || 'unknown'}
              lastSync={connections.find(c => c.connectionKey === 'azure_devops')?.lastSyncAt || null}
              error={null}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function PipelineCard({ name, description, status, lastSync, error: err }: { name: string; description: string; status: string; lastSync: string | null; error: string | null }) {
  const color = connectionStatusColor[status] || '#6B7280';
  return (
    <div style={{ padding: '0.55rem 0.65rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: 3 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: '0.74rem', fontWeight: 700 }}>{name}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.54rem', padding: '0.06rem 0.25rem', borderRadius: 999, background: `${color}20`, color, textTransform: 'uppercase', fontWeight: 700 }}>{status}</span>
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 3 }}>{description}</div>
      <div style={{ fontSize: '0.56rem', color: 'var(--text-muted)' }}>Last sync: {timeAgo(lastSync)}</div>
      {err && <div style={{ fontSize: '0.56rem', color: '#FCA5A5', marginTop: 2 }}>{err}</div>}
    </div>
  );
}
