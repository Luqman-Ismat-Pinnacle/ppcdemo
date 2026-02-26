'use client';

/**
 * @fileoverview Reusable AI briefing chat surface for executive workstations.
 */

import React, { useMemo, useState } from 'react';

type Message = { role: 'user' | 'assistant'; text: string };

interface AIBriefingChatProps {
  roleKey: string;
  actorEmail: string;
  initialPrompt?: string;
}

export default function AIBriefingChat({
  roleKey,
  actorEmail,
  initialPrompt = "Summarize today's highest execution risks by project.",
}: AIBriefingChatProps) {
  const [query, setQuery] = useState(initialPrompt);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string>('');

  const requestHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-role-view': roleKey,
      'x-actor-email': actorEmail || '',
    }),
    [actorEmail, roleKey],
  );

  const send = async () => {
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ query, role: 'coo' }),
      });
      const payload = await res.json().catch(() => ({}));
      const text = payload?.answer || payload?.error || 'No response';
      setMessages((prev) => [...prev, { role: 'assistant', text: String(text) }]);
      setLastRunAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem' }}>
      <textarea rows={4} value={query} onChange={(event) => setQuery(event.target.value)} style={{ padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }} />
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {[
          "Summarize today's highest execution risks by project.",
          'Which projects need COO escalation this week?',
          'What cost and schedule trend should I brief first?',
          'Where is commitment follow-through weak this period?',
        ].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setQuery(preset)}
            style={{ borderRadius: 999, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.68rem', padding: '0.25rem 0.55rem' }}
          >
            {preset}
          </button>
        ))}
      </div>
      <div>
        <button type="button" onClick={() => void send()} disabled={loading} style={{ padding: '0.42rem 0.7rem', borderRadius: 8, border: 'none', background: 'var(--pinnacle-teal)', color: '#05201d', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Querying...' : 'Ask AI'}
        </button>
        {lastRunAt ? <span style={{ marginLeft: 10, fontSize: '0.68rem', color: 'var(--text-muted)' }}>Last query: {new Date(lastRunAt).toLocaleString()}</span> : null}
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
  );
}
