'use client';

import { useCallback, useState } from 'react';
import { useRoleView } from '@/lib/role-view-context';
import { useUser } from '@/lib/user-context';
import type { MetricProvenance } from '@/lib/calculations/types';

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

export function useMetricExplain() {
  const { activeRole } = useRoleView();
  const { user } = useUser();
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onExplain = useCallback(
    async (provenance: MetricProvenance, value?: string | number | null) => {
      setOpen(true);
      setLoading(true);
      setResult(null);
      setError(null);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-role-view': activeRole.key,
        'x-actor-email': user?.email || '',
      };

      try {
        const res = await fetch('/api/ai/query', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            provenance,
            value,
            role: activeRole.key,
            employeeId: user?.employeeId || user?.email || null,
          }),
        });

        if (!res.ok) {
          throw new Error(`AI query failed (${res.status})`);
        }

        await readSseText(res, (delta) => {
          setResult((prev) => (prev || '') + delta);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to explain metric');
      } finally {
        setLoading(false);
      }
    },
    [activeRole.key, user?.email, user?.employeeId]
  );

  const close = useCallback(() => {
    setOpen(false);
    setResult(null);
    setError(null);
  }, []);

  return { onExplain, result, loading, open, close, error };
}
