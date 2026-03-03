'use client';

import { useState } from 'react';
import { useUser } from '@/lib/user-context';

type Mode = 'issue' | 'feature';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  defaultMode?: Mode;
  prefill?: {
    title?: string;
    pagePath?: string;
    errorMessage?: string;
    source?: string;
    runtimeErrorName?: string;
    runtimeStack?: string;
  };
}

export default function FeedbackModal({ open, onClose, defaultMode = 'issue', prefill }: FeedbackModalProps) {
  const { user } = useUser();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(prefill?.title || '');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<string>('medium');
  const [pagePath, setPagePath] = useState(prefill?.pagePath || (typeof window !== 'undefined' ? window.location.pathname : '/'));

  if (!open) return null;

  const reset = () => {
    setTitle(prefill?.title || '');
    setDescription('');
    setSeverity('medium');
    setPagePath(prefill?.pagePath || '/');
    setSuccess(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType: mode,
          title: title.trim(),
          description: description.trim(),
          pagePath: pagePath || null,
          severity: mode === 'issue' ? severity : 'low',
          source: prefill?.source || 'manual',
          createdByName: user?.name || null,
          createdByEmail: user?.email || null,
          createdByEmployeeId: user?.employeeId || null,
          browserInfo: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          errorMessage: prefill?.errorMessage || null,
          runtimeErrorName: prefill?.runtimeErrorName || null,
          runtimeStack: prefill?.runtimeStack || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to submit');
      setSuccess(true);
      setTimeout(() => { reset(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={handleClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 520, background: 'var(--bg-card, #1a1a2e)', border: '1px solid var(--border-color)', borderRadius: 14, padding: '1.2rem', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <TabBtn active={mode === 'issue'} onClick={() => setMode('issue')}>Report Issue</TabBtn>
            <TabBtn active={mode === 'feature'} onClick={() => setMode('feature')}>Request Feature</TabBtn>
          </div>
          <button type="button" onClick={handleClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer', padding: '0.2rem' }}>
            &times;
          </button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Submitted</div>
            <div style={{ color: '#10B981', fontSize: '0.82rem' }}>
              Your {mode === 'issue' ? 'issue' : 'feature request'} has been logged.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {error && <div style={{ color: '#FCA5A5', fontSize: '0.74rem' }}>{error}</div>}
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={mode === 'issue' ? 'Issue title' : 'Feature title'} required style={inputStyle} />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={mode === 'issue' ? 'Describe the issue, steps to reproduce, and what you expected...' : 'Describe the feature, the problem it solves, and acceptance criteria...'} required rows={4} style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input value={pagePath} onChange={e => setPagePath(e.target.value)} placeholder="Page path" style={inputStyle} />
              {mode === 'issue' ? (
                <select value={severity} onChange={e => setSeverity(e.target.value)} style={inputStyle}>
                  <option value="low">Low severity</option>
                  <option value="medium">Medium severity</option>
                  <option value="high">High severity</option>
                  <option value="critical">Critical severity</option>
                </select>
              ) : (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                  Features start as &quot;Planned&quot;
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.3rem' }}>
              <button type="button" onClick={handleClose} style={{ ...btnStyle, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ ...btnStyle, background: mode === 'issue' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)', color: mode === 'issue' ? '#FCA5A5' : '#93C5FD', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Submitting...' : mode === 'issue' ? 'Submit Issue' : 'Submit Feature'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      border: `1px solid ${active ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
      background: active ? 'rgba(64,224,208,0.15)' : 'transparent',
      color: active ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
      borderRadius: 8, padding: '0.3rem 0.65rem', fontSize: '0.72rem',
      fontWeight: 600, cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-color)',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  borderRadius: 8, padding: '0.5rem 0.6rem', fontSize: '0.76rem',
};

const btnStyle: React.CSSProperties = {
  border: '1px solid var(--border-color)', borderRadius: 8,
  padding: '0.4rem 0.85rem', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
};
