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
  const [prompt, setPrompt] = useState('');
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
    setMessages([{ role: 'assistant', text: '' }]);

    try {
      const response = await fetch('/api/ai/briefing', {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: activeRole.key, employeeId: user?.employeeId || user?.email || null }),
      });

      if (!response.ok) {
        throw new Error(`Briefing failed (${response.status})`);
      }

      await readSseText(response, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          if (!next.length || next[next.length - 1].role !== 'assistant') {
            next.push({ role: 'assistant', text: delta });
            return next;
          }
          next[next.length - 1] = {
            ...next[next.length - 1],
            text: `${next[next.length - 1].text}${delta}`,
          };
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
    setPrompt('');
    setMessages([]);
    void runBriefing();
  }, [activeRole.key, runBriefing]);

  const showSuggestedPrompts = messages.filter((entry) => entry.role === 'user').length === 0;

  return (
    <aside className="workstation-ai-panel">
      <div className="workstation-ai-header">
        <div className="workstation-ai-icon" aria-hidden>◌</div>
        <div className="workstation-ai-title-wrap">
          <div className="workstation-ai-title">Create a chat prompt</div>
          <div className="workstation-ai-subtitle">{activeRole.label} Copilot</div>
        </div>
      </div>

      {showSuggestedPrompts ? (
        <div className="workstation-ai-suggested">
          {[
            'Top blocker',
            'Risk scan',
            'Schedule brief',
            'Commitment status',
            'Action plan',
          ].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPrompt(item)}
              className="workstation-ai-suggested-chip"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}

      <div className="workstation-ai-chat">
        {messages.length === 0 ? <div className="workstation-ai-empty">Preparing role briefing...</div> : null}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`workstation-ai-message ${message.role === 'user' ? 'user' : 'assistant'}`}
          >
            {message.text || (message.role === 'assistant' && (asking || loadingBriefing) ? '…' : '')}
          </div>
        ))}
      </div>

      <div className="workstation-ai-input-wrap">
        <button type="button" className="workstation-ai-create-btn" onClick={() => void runBriefing()} disabled={loadingBriefing}>
          + Create
        </button>
        <div className="workstation-ai-input-shell">
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void ask();
              }
            }}
            placeholder="Generate..."
            className="workstation-ai-input"
          />
          <button type="button" className="workstation-ai-send-btn" onClick={() => void ask()} disabled={asking || !prompt.trim()}>
            ↑
          </button>
        </div>
      </div>
      {error ? <div className="workstation-ai-error">{error}</div> : null}
    </aside>
  );
}
