'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '@/lib/user-context';

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

type Tab = 'issues' | 'features';

const sevColor: Record<string, string> = { low: '#10B981', medium: '#F59E0B', high: '#F97316', critical: '#EF4444' };
const statusColor: Record<string, string> = {
  open: '#EF4444', triaged: '#F59E0B', in_progress: '#3B82F6',
  planned: '#60A5FA', resolved: '#10B981', released: '#22C55E', closed: '#6B7280',
};
const ISSUE_STATUSES = ['open', 'triaged', 'in_progress', 'planned', 'resolved', 'released', 'closed'];
const FEATURE_STATUSES = ['planned', 'triaged', 'in_progress', 'resolved', 'released', 'closed'];

export default function FeedbackPage() {
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>('issues');
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSeverity, setFormSeverity] = useState('medium');
  const [formPage, setFormPage] = useState('');
  const [formExpected, setFormExpected] = useState('');
  const [formActual, setFormActual] = useState('');
  const [formError, setFormError] = useState('');
  const [formSteps, setFormSteps] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const type = tab === 'issues' ? 'issue' : 'feature';
      const res = await fetch(`/api/feedback?type=${type}&limit=500`, { cache: 'no-store' });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setItems(data.items || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadItems(); setStatusFilter('all'); setSearch(''); setExpanded(null); }, [loadItems]);

  const statuses = tab === 'issues' ? ISSUE_STATUSES : FEATURE_STATUSES;

  const visible = useMemo(() => {
    let list = items;
    if (statusFilter !== 'all') list = list.filter(i => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        (i.createdByName || '').toLowerCase().includes(q) ||
        (i.pagePath || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, statusFilter, search]);

  const summary = useMemo(() => ({
    total: items.length,
    open: items.filter(i => i.status === 'open').length,
    critical: items.filter(i => i.severity === 'critical').length,
    resolved: items.filter(i => ['resolved', 'released', 'closed'].includes(i.status)).length,
    planned: items.filter(i => i.status === 'planned').length,
    inProgress: items.filter(i => i.status === 'in_progress').length,
    released: items.filter(i => i.status === 'released').length,
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

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDesc.trim()) { setError('Title and description are required.'); return; }
    setFormSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: tab === 'issues' ? 'issue' : 'feature',
          title: formTitle.trim(),
          description: formDesc.trim(),
          pagePath: formPage || null,
          severity: tab === 'issues' ? formSeverity : 'low',
          source: 'manual',
          createdByName: user?.name || null,
          createdByEmail: user?.email || null,
          createdByEmployeeId: user?.employeeId || null,
          browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          expectedResult: formExpected || null,
          actualResult: formActual || null,
          errorMessage: formError || null,
          userAction: formSteps || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to submit');
      resetForm();
      loadItems();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setFormSaving(false);
    }
  };

  const resetForm = () => {
    setFormTitle(''); setFormDesc(''); setFormSeverity('medium');
    setFormPage(''); setFormExpected(''); setFormActual('');
    setFormError(''); setFormSteps(''); setShowForm(false);
  };

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Issues &amp; Features</h1>
          <p className="page-subtitle">Log issues, request features, and track progress across the platform.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="btn btn-accent"
          style={{ fontSize: '0.72rem', padding: '0.35rem 0.7rem', borderRadius: 8, whiteSpace: 'nowrap' }}
        >
          {showForm ? 'Cancel' : tab === 'issues' ? '+ Log Issue' : '+ Request Feature'}
        </button>
      </div>

      {error && (
        <div style={{ border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', borderRadius: 8, padding: '0.5rem 0.7rem', fontSize: '0.74rem' }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer', fontSize: '0.9rem' }}>&times;</button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.35rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        {(['issues', 'features'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--pinnacle-teal)' : 'transparent'}`,
              background: 'none',
              color: tab === t ? 'var(--pinnacle-teal)' : 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: 700,
              padding: '0.35rem 0.75rem',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Inline creation form */}
      {showForm && (
        <form onSubmit={submitForm} className="glass" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
            {tab === 'issues' ? 'Log an Issue' : 'Request a Feature'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Title *" required style={inputStyle} />
            <input value={formPage} onChange={e => setFormPage(e.target.value)} placeholder="Page / area" style={inputStyle} />
          </div>
          <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder={tab === 'issues' ? 'Describe the issue, steps to reproduce, what happened...' : 'Describe the feature, the problem it solves, and acceptance criteria...'} required rows={3} style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }} />
          {tab === 'issues' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
              <select value={formSeverity} onChange={e => setFormSeverity(e.target.value)} style={inputStyle}>
                <option value="low">Low severity</option>
                <option value="medium">Medium severity</option>
                <option value="high">High severity</option>
                <option value="critical">Critical severity</option>
              </select>
              <input value={formExpected} onChange={e => setFormExpected(e.target.value)} placeholder="Expected result" style={inputStyle} />
              <input value={formActual} onChange={e => setFormActual(e.target.value)} placeholder="Actual result" style={inputStyle} />
            </div>
          )}
          {tab === 'issues' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              <input value={formError} onChange={e => setFormError(e.target.value)} placeholder="Error message (if any)" style={inputStyle} />
              <input value={formSteps} onChange={e => setFormSteps(e.target.value)} placeholder="Steps to reproduce" style={inputStyle} />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.2rem' }}>
            <button type="button" onClick={resetForm} style={{ ...btnStyle, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button type="submit" disabled={formSaving} className="btn btn-accent" style={{ fontSize: '0.72rem', padding: '0.32rem 0.75rem', opacity: formSaving ? 0.6 : 1 }}>
              {formSaving ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.55rem' }}>
        {tab === 'issues' ? (
          <>
            <StatCard label="Total Issues" value={summary.total} accent="#F97316" />
            <StatCard label="Open" value={summary.open} accent="#EF4444" />
            <StatCard label="Critical" value={summary.critical} accent="#DC2626" />
            <StatCard label="Resolved" value={summary.resolved} accent="#10B981" />
          </>
        ) : (
          <>
            <StatCard label="Total Requests" value={summary.total} accent="#3B82F6" />
            <StatCard label="Planned" value={summary.planned ?? 0} accent="#60A5FA" />
            <StatCard label="In Progress" value={summary.inProgress ?? 0} accent="#8B5CF6" />
            <StatCard label="Released" value={summary.released ?? 0} accent="#22C55E" />
          </>
        )}
      </div>

      {/* Filter + search */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginRight: '0.15rem' }}>Status:</span>
        {['all', ...statuses].map(s => (
          <button key={s} type="button" onClick={() => setStatusFilter(s)} style={pillStyle(statusFilter === s)}>
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          style={{ ...inputStyle, maxWidth: 200, padding: '0.25rem 0.5rem', fontSize: '0.68rem' }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>Loading...</div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 360px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(148,163,184,.15)' }}>
                <th style={thStyle}>Title</th>
                <th style={{ ...thStyle, width: 70 }}>Status</th>
                {tab === 'issues' && <th style={{ ...thStyle, width: 65 }}>Severity</th>}
                {tab === 'issues' && <th style={{ ...thStyle, width: 55 }}>Source</th>}
                <th style={{ ...thStyle, width: 100 }}>Submitted by</th>
                <th style={{ ...thStyle, width: 75 }}>Date</th>
                <th style={{ ...thStyle, width: 100, textAlign: 'center' }}>Progress</th>
                <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>Update</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={tab === 'issues' ? 8 : 6} style={{ padding: '1.2rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    No {tab} match this filter.
                  </td>
                </tr>
              )}
              {visible.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  tab={tab}
                  statuses={statuses}
                  updating={updating}
                  expanded={expanded === item.id}
                  onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                  onUpdateStatus={updateStatus}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item, tab, statuses, updating, expanded, onToggle, onUpdateStatus,
}: {
  item: FeedbackItem; tab: Tab; statuses: string[]; updating: number | null;
  expanded: boolean; onToggle: () => void; onUpdateStatus: (_id: number, _status: string) => void;
}) {
  const pct = item.progressPercent || 0;
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ borderBottom: '1px solid rgba(148,163,184,.06)', cursor: 'pointer', background: expanded ? 'rgba(64,224,208,0.03)' : 'transparent' }}
      >
        <td style={tdStyle}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</span>
        </td>
        <td style={tdStyle}>
          <Badge color={statusColor[item.status]}>{item.status.replace('_', ' ')}</Badge>
        </td>
        {tab === 'issues' && (
          <td style={tdStyle}>
            <Badge color={sevColor[item.severity]}>{item.severity}</Badge>
          </td>
        )}
        {tab === 'issues' && (
          <td style={tdStyle}>
            {item.source === 'runtime' ? <Badge color="#8B5CF6">runtime</Badge> : <span style={{ color: 'var(--text-muted)' }}>manual</span>}
          </td>
        )}
        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{item.createdByName || item.createdByEmail || '—'}</td>
        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleDateString()}</td>
        <td style={{ ...tdStyle, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <div style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: statusColor[item.status] || '#6B7280' }} />
            </div>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', minWidth: 24, textAlign: 'right' }}>{pct}%</span>
          </div>
        </td>
        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <select
            value={item.status}
            onChange={e => onUpdateStatus(item.id, e.target.value)}
            disabled={updating === item.id}
            style={{ fontSize: '0.62rem', padding: '0.15rem 0.25rem', borderRadius: 5, border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
          >
            {statuses.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'rgba(64,224,208,0.02)' }}>
          <td colSpan={tab === 'issues' ? 8 : 6} style={{ padding: '0.55rem 0.8rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginBottom: '0.4rem', maxHeight: 160, overflow: 'auto' }}>
              {item.description}
            </div>
            {tab === 'issues' && (item.pagePath || item.errorMessage || item.expectedResult || item.actualResult || item.userAction) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 0.8rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {item.pagePath && <div><strong>Page:</strong> {item.pagePath}</div>}
                {item.errorMessage && <div><strong>Error:</strong> {item.errorMessage}</div>}
                {item.expectedResult && <div><strong>Expected:</strong> {item.expectedResult}</div>}
                {item.actualResult && <div><strong>Actual:</strong> {item.actualResult}</div>}
                {item.userAction && <div><strong>Steps:</strong> {item.userAction}</div>}
              </div>
            )}
            {item.runtimeStack && (
              <pre style={{ fontSize: '0.6rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: '0.4rem', marginTop: '0.35rem', overflow: 'auto', maxHeight: 100 }}>
                {item.runtimeStack}
              </pre>
            )}
            {item.notes && (
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.3rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.3rem' }}>
                <strong>Notes:</strong> {item.notes}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="glass" style={{ padding: '0.6rem 0.75rem' }}>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: accent, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '0.58rem', padding: '0.1rem 0.35rem', borderRadius: 999, background: `${color}20`, color, textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', color: '#94a3b8', fontWeight: 600, padding: '0.4rem 0.5rem', fontSize: '0.66rem',
};
const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.5rem',
};
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  borderRadius: 7, padding: '0.4rem 0.55rem', fontSize: '0.72rem',
};
const btnStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)', borderRadius: 7,
  padding: '0.32rem 0.7rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
};
const pillStyle = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
  background: active ? 'rgba(64,224,208,0.15)' : 'var(--bg-secondary)',
  color: active ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
  borderRadius: 7, padding: '0.22rem 0.48rem', fontSize: '0.62rem',
  fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
});
