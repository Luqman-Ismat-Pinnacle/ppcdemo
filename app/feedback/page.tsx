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
  reproSteps: string;
  expectedResult: string;
  actualResult: string;
  errorMessage: string;
  environment: string;
  frequency: string;
  impact: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

type FeatureForm = {
  title: string;
  description: string;
  targetPage: string;
  workflow: string;
  businessValue: string;
  acceptanceCriteria: string;
};

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
  const [issueStatusFilter, setIssueStatusFilter] = useState<string>('all');
  const [featureStatusFilter, setFeatureStatusFilter] = useState<string>('all');

  const [issueForm, setIssueForm] = useState<IssueForm>({
    title: '',
    pagePath: pathname || '/',
    userAction: '',
    reproSteps: '',
    expectedResult: '',
    actualResult: '',
    errorMessage: '',
    environment: 'production',
    frequency: '',
    impact: '',
    description: '',
    severity: 'medium',
  });

  const [featureForm, setFeatureForm] = useState<FeatureForm>({
    title: '',
    description: '',
    targetPage: '',
    workflow: '',
    businessValue: '',
    acceptanceCriteria: '',
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
    if (!issueForm.title.trim() || !issueForm.description.trim() || !issueForm.userAction.trim() || !issueForm.reproSteps.trim() || !issueForm.expectedResult.trim() || !issueForm.actualResult.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const structuredDescription = [
        issueForm.description.trim(),
        issueForm.reproSteps.trim() ? `Reproduction Steps:\n${issueForm.reproSteps.trim()}` : '',
        issueForm.frequency.trim() ? `Frequency: ${issueForm.frequency.trim()}` : '',
        issueForm.impact.trim() ? `Business Impact: ${issueForm.impact.trim()}` : '',
        issueForm.environment.trim() ? `Environment: ${issueForm.environment.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'issue',
          title: issueForm.title,
          description: structuredDescription,
          pagePath: issueForm.pagePath,
          userAction: issueForm.userAction,
          expectedResult: issueForm.expectedResult,
          actualResult: issueForm.actualResult,
          errorMessage: issueForm.errorMessage,
          severity: issueForm.severity,
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
        reproSteps: '',
        expectedResult: '',
        actualResult: '',
        errorMessage: '',
        environment: 'production',
        frequency: '',
        impact: '',
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
    if (!featureForm.title.trim() || !featureForm.description.trim() || !featureForm.targetPage.trim() || !featureForm.acceptanceCriteria.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const structuredDescription = [
        featureForm.description.trim(),
        featureForm.workflow.trim() ? `Workflow to Improve: ${featureForm.workflow.trim()}` : '',
        featureForm.businessValue.trim() ? `Business Value: ${featureForm.businessValue.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const structuredNotes = [
        featureForm.targetPage.trim() ? `Target Page: ${featureForm.targetPage.trim()}` : '',
        featureForm.acceptanceCriteria.trim() ? `Acceptance Criteria:\n${featureForm.acceptanceCriteria.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: 'feature',
          title: featureForm.title,
          description: structuredDescription,
          notes: structuredNotes,
          severity: 'low',
          source: 'manual',
          createdByName: user?.name || null,
          createdByEmail: user?.email || null,
          createdByEmployeeId: user?.employeeId || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to create feature');
      setFeatureForm({ title: '', description: '', targetPage: '', workflow: '', businessValue: '', acceptanceCriteria: '' });
      await loadItems();
      setActiveTab('feature');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create feature'));
    } finally {
      setSaving(false);
    }
  };

  const issueItems = items.filter(i => i.itemType === 'issue');
  const featureItems = items.filter(i => i.itemType === 'feature');
  const visibleIssueItems = issueItems.filter(i => issueStatusFilter === 'all' || i.status === issueStatusFilter);
  const visibleFeatureItems = featureItems.filter(i => featureStatusFilter === 'all' || i.status === featureStatusFilter);
  const issueStatuses = useMemo(() => ['all', ...Array.from(new Set(issueItems.map(i => i.status)))], [issueItems]);
  const featureStatuses = useMemo(() => ['all', ...Array.from(new Set(featureItems.map(i => i.status)))], [featureItems]);

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
            <select value={issueForm.environment} onChange={e => setIssueForm(s => ({ ...s, environment: e.target.value }))} style={inputStyle}>
              <option value="production">Environment: Production</option>
              <option value="staging">Environment: Staging</option>
              <option value="development">Environment: Development</option>
            </select>
            <input value={issueForm.frequency} onChange={e => setIssueForm(s => ({ ...s, frequency: e.target.value }))} placeholder="Frequency (always/intermittent/% of attempts)" style={inputStyle} />
            <input value={issueForm.impact} onChange={e => setIssueForm(s => ({ ...s, impact: e.target.value }))} placeholder="Impact (blocked workflow/users affected)" style={inputStyle} />
            <select value={issueForm.severity} onChange={e => setIssueForm(s => ({ ...s, severity: e.target.value as IssueForm['severity'] }))} style={inputStyle}>
              <option value="low">Severity: Low</option>
              <option value="medium">Severity: Medium</option>
              <option value="high">Severity: High</option>
              <option value="critical">Severity: Critical</option>
            </select>
            <input value={issueForm.expectedResult} onChange={e => setIssueForm(s => ({ ...s, expectedResult: e.target.value }))} placeholder="Expected result" style={inputStyle} />
            <input value={issueForm.actualResult} onChange={e => setIssueForm(s => ({ ...s, actualResult: e.target.value }))} placeholder="Actual result" style={inputStyle} />
            <input value={issueForm.errorMessage} onChange={e => setIssueForm(s => ({ ...s, errorMessage: e.target.value }))} placeholder="Exact error message (if shown)" style={{ ...inputStyle, gridColumn: '1 / -1' }} />
            <textarea value={issueForm.reproSteps} onChange={e => setIssueForm(s => ({ ...s, reproSteps: e.target.value }))} placeholder="Step-by-step reproduction (required for fast diagnosis)" style={{ ...inputStyle, gridColumn: '1 / -1', minHeight: 88, resize: 'vertical' }} />
            <textarea value={issueForm.description} onChange={e => setIssueForm(s => ({ ...s, description: e.target.value }))} placeholder="Additional context and technical details (required)" style={{ ...inputStyle, gridColumn: '1 / -1', minHeight: 82, resize: 'vertical' }} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving...' : 'Submit Issue'}</button>
            </div>
          </form>
        </section>

        <section className="chart-card" style={{ padding: '1rem' }}>
          <h3 style={{ margin: 0, marginBottom: '0.7rem', fontSize: '0.95rem' }}>Request a Feature</h3>
          <form onSubmit={onCreateFeature} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <input value={featureForm.title} onChange={e => setFeatureForm(s => ({ ...s, title: e.target.value }))} placeholder="Feature title (required)" style={inputStyle} />
            <input value={featureForm.targetPage} onChange={e => setFeatureForm(s => ({ ...s, targetPage: e.target.value }))} placeholder="Target page / module (e.g. /insights/tasks)" style={inputStyle} />
            <textarea value={featureForm.description} onChange={e => setFeatureForm(s => ({ ...s, description: e.target.value }))} placeholder="Problem statement and desired capability (required)" style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} />
            <textarea value={featureForm.workflow} onChange={e => setFeatureForm(s => ({ ...s, workflow: e.target.value }))} placeholder="Current workflow pain points (who does what today?)" style={{ ...inputStyle, minHeight: 78, resize: 'vertical' }} />
            <textarea value={featureForm.businessValue} onChange={e => setFeatureForm(s => ({ ...s, businessValue: e.target.value }))} placeholder="Business value and urgency (time/cost/risk impact)" style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} />
            <textarea value={featureForm.acceptanceCriteria} onChange={e => setFeatureForm(s => ({ ...s, acceptanceCriteria: e.target.value }))} placeholder="Acceptance criteria (specific expected outcomes)" style={{ ...inputStyle, minHeight: 85, resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Saving...' : 'Submit Feature'}</button>
            </div>
          </form>
        </section>
      </div>

      <section className="chart-card" style={{ padding: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setActiveTab('issue')} style={tabStyle(activeTab === 'issue')}>Current Issues ({issueItems.length})</button>
          <button type="button" onClick={() => setActiveTab('feature')} style={tabStyle(activeTab === 'feature')}>Features ({featureItems.length})</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Status</span>
            {activeTab === 'issue' ? (
              <select value={issueStatusFilter} onChange={e => setIssueStatusFilter(e.target.value)} style={{ ...inputStyle, width: 160, padding: '0.35rem 0.5rem' }}>
                {issueStatuses.map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace('_', ' ')}</option>
                ))}
              </select>
            ) : (
              <select value={featureStatusFilter} onChange={e => setFeatureStatusFilter(e.target.value)} style={{ ...inputStyle, width: 160, padding: '0.35rem 0.5rem' }}>
                {featureStatuses.map(s => (
                  <option key={s} value={s}>{s === 'all' ? 'All statuses' : s.replace('_', ' ')}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '1.2rem', color: 'var(--text-muted)' }}>Loading items...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '52vh', overflow: 'auto' }}>
            {(activeTab === 'issue' ? visibleIssueItems : visibleFeatureItems).map(item => (
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--bg-card)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, item.progressPercent || 0))}%`, height: '100%', background: statusColor[item.status] || '#6B7280', transition: 'width 220ms ease' }} />
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>{item.progressPercent || 0}%</span>
                </div>
                {item.notes && (
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.45rem', lineHeight: 1.3 }}>
                    {item.notes}
                  </div>
                )}
                {item.source && (
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.35rem', opacity: 0.8 }}>
                    Source: {item.source}
                  </div>
                )}
              </div>
            ))}
            {(activeTab === 'issue' ? visibleIssueItems : visibleFeatureItems).length === 0 && (
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
