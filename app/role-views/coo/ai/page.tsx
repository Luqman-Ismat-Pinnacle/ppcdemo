'use client';

/**
 * @fileoverview COO AI briefing chat page backed by /api/ai/query.
 */

import React, { useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

type Message = { role: 'user' | 'assistant'; text: string };

export default function CooAiPage() {
  const [query, setQuery] = useState('Summarize today\'s highest execution risks by project.');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const { activeRole } = useRoleView();
  const { user } = useUser();

  const send = async () => {
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role-view': activeRole.key,
          'x-actor-email': user?.email || '',
        },
        body: JSON.stringify({ query, role: 'coo' }),
      });
      const payload = await res.json().catch(() => ({}));
      const text = payload?.answer || payload?.error || 'No response';
      setMessages((prev) => [...prev, { role: 'assistant', text: String(text) }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RoleWorkstationShell role="coo" title="AI Briefing" subtitle="OpenAI-backed executive briefing and Q&A from live operating data.">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem' }}>
        <textarea rows={4} value={query} onChange={(event) => setQuery(event.target.value)} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />
        <div>
          <button type="button" onClick={() => void send()} disabled={loading} style={{ padding: '0.42rem 0.7rem', borderRadius: 8, border: 'none', background: 'var(--pinnacle-teal)', color: '#05201d', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Querying...' : 'Ask AI'}
          </button>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem', maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {messages.length === 0 ? <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No prompts yet.</div> : messages.map((message, idx) => (
            <div key={`${message.role}-${idx}`} style={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.45rem 0.55rem', fontSize: '0.78rem', background: message.role === 'user' ? 'rgba(16,185,129,0.12)' : 'var(--bg-secondary)' }}>
              <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginBottom: 3 }}>{message.role === 'user' ? 'You' : 'AI'}</div>
              <div>{message.text}</div>
            </div>
          ))}
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
