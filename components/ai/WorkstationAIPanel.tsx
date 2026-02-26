'use client';

/**
 * @fileoverview Shared workstation AI panel with SSE briefing and Q&A.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

async function readSseText(response: Response, onText: (delta: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const line = event
        .split('\n')
        .find((row) => row.startsWith('data:'))
        ?.replace(/^data:\s*/, '')
        .trim();
      if (!line || line === '[DONE]') continue;
      try {
        const parsed = JSON.parse(line) as { text?: string };
        if (parsed.text) onText(parsed.text);
      } catch {
        onText(line);
      }
    }
  }
}

export default function WorkstationAIPanel() {
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [prompt, setPrompt] = useState('What should I focus on today?');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-role-view': activeRole.key,
      'x-actor-email': user?.email || '',
    }),
    [activeRole.key, user?.email],
  );

  const runBriefing = useCallback(async () => {
    setLoadingBriefing(true);
    setError(null);
    setMessages((prev) => {
      const hasExisting = prev.some((message) => message.role === 'assistant');
      return hasExisting ? prev : [...prev, { role: 'assistant', text: '' }];
    });

    try {
      const response = await fetch('/api/ai/briefing', {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: activeRole.key, employeeId: user?.employeeId || user?.email || null }),
      });

      if (!response.ok) {
        throw new Error(`Briefing failed (${response.status})`);
      }

      setMessages((prev) => {
        const next = [...prev];
        if (!next.length || next[next.length - 1].role !== 'assistant') {
          next.push({ role: 'assistant', text: '' });
        }
        return next;
      });

      await readSseText(response, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.length - 1;
          if (idx < 0) return [{ role: 'assistant', text: delta }];
          if (next[idx].role !== 'assistant') {
            next.push({ role: 'assistant', text: delta });
            return next;
          }
          next[idx] = { ...next[idx], text: `${next[idx].text}${delta}` };
          return next;
        });
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Briefing unavailable');
    } finally {
      setLoadingBriefing(false);
    }
  }, [activeRole.key, headers, user?.email, user?.employeeId]);

  const ask = useCallback(async () => {
    const question = prompt.trim();
    if (!question || asking) return;

    setAsking(true);
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', text: question }, { role: 'assistant', text: '' }]);

    try {
      const response = await fetch('/api/ai/query', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role: activeRole.key,
          employeeId: user?.employeeId || user?.email || null,
          question,
          sessionHistory: messages,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI query failed (${response.status})`);
      }

      await readSseText(response, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.length - 1;
          if (idx < 0) return [{ role: 'assistant', text: delta }];
          next[idx] = { ...next[idx], text: `${next[idx].text}${delta}` };
          return next;
        });
      });
      setPrompt('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI query unavailable');
    } finally {
      setAsking(false);
    }
  }, [activeRole.key, asking, headers, messages, prompt, user?.email, user?.employeeId]);

  React.useEffect(() => {
    setMessages([]);
    void runBriefing();
  }, [activeRole.key, runBriefing]);

  const showSuggestedPrompts = messages.filter((entry) => entry.role === 'user').length === 0;

  return (
    <aside style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: 'calc(100vh - 180px)', minHeight: 360 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Copilot</div>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{activeRole.label} briefing</div>
        </div>
        <button type="button" onClick={() => void runBriefing()} disabled={loadingBriefing} style={{ border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: '0.68rem', color: 'var(--text-secondary)', padding: '0.3rem 0.5rem', cursor: 'pointer' }}>
          {loadingBriefing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {showSuggestedPrompts ? (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {[
            'What is the top blocker right now?',
            'Which numbers changed the most today?',
            'Where should I escalate first?',
          ].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPrompt(item)}
              style={{ borderRadius: 999, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.65rem', padding: '0.22rem 0.5rem' }}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.42rem' }}>
        {messages.length === 0 ? <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>No messages yet.</div> : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '92%',
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              background: message.role === 'user' ? 'rgba(16,185,129,0.14)' : 'var(--bg-card)',
              padding: '0.42rem 0.5rem',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
            }}
          >
            {message.text || (message.role === 'assistant' && (asking || loadingBriefing) ? '…' : '')}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '0.42rem' }}>
        <textarea
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask about this role's data and priorities..."
          style={{ width: '100%', resize: 'vertical', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', padding: '0.5rem', fontSize: '0.76rem' }}
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={asking || !prompt.trim()}
          style={{ border: 'none', borderRadius: 8, background: 'var(--pinnacle-teal)', color: '#03211d', fontSize: '0.76rem', fontWeight: 700, padding: '0.45rem 0.62rem', cursor: asking ? 'not-allowed' : 'pointer' }}
        >
          {asking ? 'Asking...' : 'Ask AI'}
        </button>
      </div>

      {error ? <div style={{ fontSize: '0.69rem', color: '#EF4444' }}>{error}</div> : null}
    </aside>
  );
}
