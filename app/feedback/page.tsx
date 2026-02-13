'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useUser } from '@/lib/user-context';

type FeedbackItem = {
  id: number;
  itemType: 'issue' | 'feature';
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
  createdByEmployeeId: string | null;
  browserInfo: string | null;
  runtimeErrorName: string | null;
  runtimeStack: string | null;
  createdAt: string;
  updatedAt: string;
};

type IssueForm = {
  title: string;
  pagePath: string;
  userAction: string;
  expectedResult: string;
  actualResult: string;
  errorMessage: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

type FeatureForm = {
  title: string;
  description: string;
  notes: string;
};

const statusOptions = [
  'open',
  'triaged',
  'in_progress',
  'planned',
  'resolved',
  'released',
  'closed',
];

const getErrorMessage = (e: unknown, fallback: string) => {
  if (e instanceof Error && e.message) return e.message;
  return fallback;
};

const severityColor: Record<string, string> = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#F97316',
  critical: '#EF4444',
};

const statusColor: Record<string, string> = {
  open: '#EF4444',
  triaged: '#F59E0B',
  in_progress: '#3B82F6',
  planned: '#60A5FA',
  resolved: '#10B981',
  released: '#22C55E',
  closed: '#6B7280',
};

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div style={{ padding: '0.8rem 1rem', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: accent }}>{value}</div>
    </div>
  );
}

export default function FeedbackPage() {
  const { user } = useUser();
  const pathname = usePathname();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'issue' | 'feature'>('issue');
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [issueForm, setIssueForm] = useState<IssueForm>({
    title: '',
    pagePath: pathname || '/',
    userAction: '',
    expectedResult: '',
    actualResult: '',
    errorMessage: '',
    description: '',
    severity: 'medium',
  });

  const [featureForm, setFeatureForm] = useState<FeatureForm>({
    title: '',
    description: '',
    notes: '',
  });

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/feedback?type=all&limit=250', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to load feedback');
      setItems(payload?.items || []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load feedback'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const summary = useMemo(() => {
    const issues = items.filter(i => i.itemType === 'issue');
    const features = items.filter(i => i.itemType === 'feature');
    const activeIssues = issues.filter(i => !['resolved', 'closed', 'released'].includes(i.status));
    const inDevFeatures = features.filter(i => ['in_progress', 'planned', 'triaged'].includes(i.status));
    return {
      issueCount: issues.length,
      activeIssues: activeIssues.length,
      featureCount: features.length,
      inDevFeatures: inDevFeatures.length,
    };
  }, [items]);

  const onCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueForm.title.trim() || !issueForm.description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'issue',
          title: issueForm.title,
          description: issueForm.description,
          pagePath: issueForm.pagePath,
          userAction: issueForm.userAction,
          expectedResult: issueForm.expectedResult,
          actualResult: issueForm.actualResult,
          errorMessage: issueForm.errorMessage,
          severity: issueForm.severity,
          status: 'open',
          source: 'manual',
          createdByName: user?.name || null,
          createdByEmail: user?.email || null,
          createdByEmployeeId: user?.employeeId || null,
          browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to create issue');
      setIssueForm({
        title: '',
        pagePath: pathname || '/',
        userAction: '',
        expectedResult: '',
        actualResult: '',
        errorMessage: '',
        description: '',
        severity: 'medium',
      });
      await loadItems();
      setActiveTab('issue');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create issue'));
    } finally {
      setSaving(false);
    }
  };

  const onCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!featureForm.title.trim() || !featureForm.description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'feature',
          title: featureForm.title,
          description: featureForm.description,
          notes: featureForm.notes,
          status: 'planned',
          severity: 'low',
          source: 'manual',
          createdByName: user?.name || null,
          createdByEmail: user?.email || null,
          createdByEmployeeId: user?.employeeId || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to create feature');
      setFeatureForm({ title: '', description: '', notes: '' });
      await loadItems();
      setActiveTab('feature');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create feature'));
    } finally {
      setSaving(false);
    }
  };

  const onUpdateItem = async (item: FeedbackItem, patch: Partial<FeedbackItem>) => {
    setSavingId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: patch.status ?? item.status,
          notes: patch.notes ?? item.notes,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to update');
      setItems(prev => prev.map(x => (x.id === item.id ? payload.item : x)));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update'));
    } finally {
      setSavingId(null);
    }
  };

  const issueItems = items.filter(i => i.itemType === 'issue');
  const featureItems = items.filter(i => i.itemType === 'feature');

  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Issues & Features</h1>
          <p className="page-subtitle">Central backlog for bug reports, feature requests, development progress, and release notes.</p>
        </div>
      </div>

      {error && (
        <div style={{ border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.08)', color: '#FCA5A5', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.78rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: '0.8rem' }}>
        <StatCard label="Total Issues" value={summary.issueCount} accent="#F97316" />
        <StatCard label="Open Issues" value={summary.activeIssues} accent="#EF4444" />
        <StatCard label="Feature Requests" value={summary.featureCount} accent="#3B82F6" />
        <StatCard label="Features In Dev" value={summary.inDevFeatures} accent="#10B981" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
        <section className="chart-card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.7rem', fontSize: '0.95rem' }}>Log an Issue</h3>
          <form onSubmit={onCreateIssue} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            <input value={issueForm.title} onChange={e => setIssueForm(s => ({ ...s, title: e.target.value }))} placeholder="Issue title (required)" style={inputStyle} />
            <input value={issueForm.pagePath} onChange={e => setIssueForm(s => ({ ...s, pagePath: e.target.value }))} placeholder="Page route (e.g. /project-controls/wbs-gantt)" style={inputStyle} />
            <input value={issueForm.userAction} onChange={e => setIssueForm(s => ({ ...s, userAction: e.target.value }))} placeholder="What action caused it?" style={inputStyle} />
            <select value={issueForm.severity} onChange={e => setIssueForm(s => ({ ...s, severity: e.target.value as IssueForm['severity'] }))} style={inputStyle}>
              <option value="low">Severity: Low</option>
              <option value="medium">Severity: Medium</option>
              <option value="high">Severity: High</option>
              <option value="critical">Severity: Critical</option>
            </select>
            <input value={issueForm.expectedResult} onChange={e => setIssueForm(s => ({ ...s, expectedResult: e.target.value }))} placeholder="Expected result" style={inputStyle} />
            <input value={issueForm.actualResult} onChange={e => setIssueForm(s => ({ ...s, actualResult: e.target.value }))} placeholder="Actual result" style={inputStyle} />
            <input value={issueForm.errorMessage} onChange={e => setIssueForm(s => ({ ...s, errorMessage: e.target.value }))} placeholder="Exact error message (if shown)" style={{ ...inputStyle, gridColumn: '1 / -1' }} />
            <textarea value={issueForm.description} onChange={e => setIssueForm(s => ({ ...s, description: e.target.value }))} placeholder="Detailed description and reproduction steps (required)" style={{ ...inputStyle, gridColumn: '1 / -1', minHeight: 90, resize: 'vertical' }} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving...' : 'Submit Issue'}</button>
            </div>
          </form>
        </section>

        <section className="chart-card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.7rem', fontSize: '0.95rem' }}>Request a Feature</h3>
          <form onSubmit={onCreateFeature} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <input value={featureForm.title} onChange={e => setFeatureForm(s => ({ ...s, title: e.target.value }))} placeholder="Feature title (required)" style={inputStyle} />
            <textarea value={featureForm.description} onChange={e => setFeatureForm(s => ({ ...s, description: e.target.value }))} placeholder="What problem does this solve? What should the feature do?" style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} />
            <textarea value={featureForm.notes} onChange={e => setFeatureForm(s => ({ ...s, notes: e.target.value }))} placeholder="Business context, urgency, or acceptance notes (optional)" style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving...' : 'Submit Feature'}</button>
            </div>
          </form>
        </section>
      </div>

      <section className="chart-card" style={{ padding: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
          <button type="button" onClick={() => setActiveTab('issue')} style={tabStyle(activeTab === 'issue')}>Current Issues ({issueItems.length})</button>
          <button type="button" onClick={() => setActiveTab('feature')} style={tabStyle(activeTab === 'feature')}>Features ({featureItems.length})</button>
        </div>

        {loading ? (
          <div style={{ padding: '1.2rem', color: 'var(--text-muted)' }}>Loading items...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '52vh', overflow: 'auto' }}>
            {(activeTab === 'issue' ? issueItems : featureItems).map(item => (
              <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.7rem 0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{item.title}</span>
                  <span style={{ fontSize: '0.62rem', padding: '0.15rem 0.45rem', borderRadius: 999, background: `${statusColor[item.status] || '#6B7280'}20`, color: statusColor[item.status] || '#9CA3AF', textTransform: 'uppercase', fontWeight: 700 }}>{item.status.replace('_', ' ')}</span>
                  {item.itemType === 'issue' && (
                    <span style={{ fontSize: '0.62rem', padding: '0.15rem 0.45rem', borderRadius: 999, background: `${severityColor[item.severity] || '#6B7280'}20`, color: severityColor[item.severity] || '#9CA3AF', textTransform: 'uppercase', fontWeight: 700 }}>{item.severity}</span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '0.63rem', color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}>{item.description}</div>
                {item.itemType === 'issue' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 0.8rem', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Page:</strong> {item.pagePath || '-'}</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Action:</strong> {item.userAction || '-'}</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Expected:</strong> {item.expectedResult || '-'}</div>
                    <div><strong style={{ color: 'var(--text-secondary)' }}>Actual:</strong> {item.actualResult || '-'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-secondary)' }}>Error:</strong> {item.errorMessage || '-'}</div>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                  <select value={item.status} onChange={e => onUpdateItem(item, { status: e.target.value })} style={inputStyle} disabled={savingId === item.id}>
                    {statusOptions.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  <input value={item.notes || ''} onChange={e => onUpdateItem(item, { notes: e.target.value })} placeholder="Progress notes / release notes" style={inputStyle} disabled={savingId === item.id} />
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{savingId === item.id ? 'Saving...' : `${item.progressPercent || 0}%`}</span>
                </div>
              </div>
            ))}
            {(activeTab === 'issue' ? issueItems : featureItems).length === 0 && (
              <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                No {activeTab === 'issue' ? 'issues' : 'features'} logged yet.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  borderRadius: 8,
  padding: '0.5rem 0.6rem',
  fontSize: '0.76rem',
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
  background: active ? 'rgba(64,224,208,0.15)' : 'var(--bg-secondary)',
  color: active ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
  borderRadius: 8,
  padding: '0.35rem 0.65rem',
  fontSize: '0.72rem',
  fontWeight: 600,
  cursor: 'pointer',
});
