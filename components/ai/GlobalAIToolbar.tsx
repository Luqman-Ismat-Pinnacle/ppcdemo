'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

function normalizeEmail(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase() || 'anonymous';
}

function sessionKey(email: string | null | undefined, role: string) {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `ppc:ai-session:${normalizeEmail(email)}:${role}:${day}`;
}

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

export default function GlobalAIToolbar() {
  const pathname = usePathname();
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = pinnedOpen || hoverOpen;

  const disabled = pathname === '/login' || activeRole.key === 'client_portal';
  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || activeRole.label;
  const storageKey = useMemo(() => sessionKey(user?.email, activeRole.key), [activeRole.key, user?.email]);
  const hasUserMessages = useMemo(() => messages.some((message) => message.role === 'user'), [messages]);

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      'x-role-view': activeRole.key,
      'x-actor-email': user?.email || '',
    }),
    [activeRole.key, user?.email],
  );

  const persistMessages = useCallback((rows: ChatMessage[]) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(rows.slice(-30)));
  }, [storageKey]);

  const runBriefing = useCallback(async () => {
    setLoadingBriefing(true);
    setError(null);
    setMessages([{ role: 'assistant', text: '' }]);

    try {
      const response = await fetch('/api/ai/briefing', {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: activeRole.key, employeeId: user?.employeeId || user?.email || null }),
      });
      if (!response.ok) throw new Error(`Briefing failed (${response.status})`);

      await readSseText(response, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.length - 1;
          if (idx < 0 || next[idx].role !== 'assistant') {
            next.push({ role: 'assistant', text: delta });
          } else {
            next[idx] = { ...next[idx], text: `${next[idx].text}${delta}` };
          }
          persistMessages(next);
          return next;
        });
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Briefing unavailable');
    } finally {
      setLoadingBriefing(false);
    }
  }, [activeRole.key, headers, persistMessages, user?.email, user?.employeeId]);

  const ask = useCallback(async () => {
    const question = prompt.trim();
    if (!question || asking) return;

    setAsking(true);
    setError(null);
    setMessages((prev) => {
      const next: ChatMessage[] = [...prev, { role: 'user', text: question }, { role: 'assistant', text: '' }];
      persistMessages(next);
      return next;
    });

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
      if (!response.ok) throw new Error(`Query failed (${response.status})`);

      await readSseText(response, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.length - 1;
          if (idx < 0) return [{ role: 'assistant', text: delta }];
          next[idx] = { ...next[idx], text: `${next[idx].text}${delta}` };
          persistMessages(next);
          return next;
        });
      });
      setPrompt('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI unavailable');
    } finally {
      setAsking(false);
    }
  }, [activeRole.key, asking, headers, messages, persistMessages, prompt, user?.email, user?.employeeId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPrompt('');
    setError(null);
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(parsed);
          return;
        }
      } catch {
        // Ignore malformed storage payloads.
      }
    }
    setMessages([]);
    void runBriefing();
  }, [runBriefing, storageKey]);

  if (disabled) return null;

  return (
    <div
      onMouseEnter={() => setHoverOpen(true)}
      onMouseLeave={() => setHoverOpen(false)}
      style={{
        position: 'fixed',
        right: 12,
        bottom: 66,
        zIndex: 10009,
        width: open ? 420 : 160,
        transition: 'width 180ms ease',
        background: 'var(--bg-glass)',
        border: '1px solid var(--border-color)',
        borderRadius: 12,
        boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setPinnedOpen((value) => !value)}
        style={{
          width: '100%',
          border: 'none',
          borderBottom: open ? '1px solid var(--border-color)' : 'none',
          background: 'transparent',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          padding: '0.46rem 0.56rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          fontWeight: 700,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Image src="/logo.png" alt="Pinnacle" width={16} height={16} />
          <span style={{ color: 'var(--pinnacle-teal)' }}>Pinnacle AI</span>
        </span>
        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{open ? 'Close' : 'Open'}</span>
      </button>

      {open ? (
        <div style={{ padding: '0.55rem', display: 'grid', gap: '0.45rem' }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{firstName} · {activeRole.label}</div>

          <div style={{ maxHeight: 290, overflowY: 'auto', display: 'grid', gap: '0.35rem', paddingRight: 2 }}>
            {messages.length === 0 ? <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Preparing briefing...</div> : null}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                style={{
                  justifySelf: message.role === 'user' ? 'end' : 'stretch',
                  maxWidth: message.role === 'user' ? '88%' : '100%',
                  border: '1px solid var(--border-color)',
                  borderRadius: 10,
                  padding: '0.42rem 0.5rem',
                  fontSize: '0.72rem',
                  color: 'var(--text-primary)',
                  background: message.role === 'user' ? 'rgba(16,185,129,0.14)' : 'var(--bg-secondary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.text || (message.role === 'assistant' && (asking || loadingBriefing) ? '…' : '')}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              placeholder={`Ask ${activeRole.label} AI...`}
              style={{
                flex: 1,
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '0.74rem',
                padding: '0.42rem 0.5rem',
              }}
            />
            <button
              type="button"
              onClick={() => { void ask(); }}
              disabled={asking || !prompt.trim()}
              style={{
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                background: 'rgba(16,185,129,0.16)',
                color: 'var(--pinnacle-teal)',
                fontSize: '0.74rem',
                fontWeight: 700,
                padding: '0.42rem 0.55rem',
              }}
            >
              Send
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {!hasUserMessages ? ['Top blockers', 'Risk scan', 'Action plan'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPrompt(item)}
                style={{
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  borderRadius: 999,
                  padding: '0.15rem 0.45rem',
                  fontSize: '0.66rem',
                }}
              >
                {item}
              </button>
            )) : null}
          </div>
          {error ? <div style={{ fontSize: '0.68rem', color: '#F59E0B' }}>{error}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
