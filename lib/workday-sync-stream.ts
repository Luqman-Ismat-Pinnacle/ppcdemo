/**
 * Workday sync via constant stream (NDJSON).
 * Use stream: true for more stable sync: pulls in small date windows instead of one big request.
 * Mapping stays the same; only the fetching process is chunked.
 */

export type WorkdayStreamEvent =
  | { type: 'step'; step: string; status: 'started' | 'done' | 'chunk' | 'chunk_done'; result?: any; stats?: any; chunk?: number; totalChunks?: number; startDate?: string; endDate?: string; totalHours?: number }
  | { type: 'error'; error: string }
  | { type: 'done'; success: boolean; logs?: string[]; totalHours?: number };

export interface RunWorkdaySyncStreamOptions {
  /** 'unified' = employees + projects + hours (chunked). 'hours' = hours only (chunked). */
  syncType?: 'unified' | 'hours';
  /** Days of hours to sync (default 90). Only for hours step. */
  hoursDaysBack?: number;
  /** Called for each NDJSON event. */
  onEvent: (event: WorkdayStreamEvent) => void;
}

/**
 * Run Workday sync with stream: true. Reads NDJSON from response and calls onEvent for each line.
 * Constant stream = one date window at a time, more stable than pulling everything at once.
 */
export async function runWorkdaySyncStream(options: RunWorkdaySyncStreamOptions): Promise<{ success: boolean }> {
  const { syncType = 'unified', hoursDaysBack = 365, onEvent } = options;
  const res = await fetch('/api/workday', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      syncType,
      stream: true,
      hoursDaysBack,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    onEvent({ type: 'error', error: err || `HTTP ${res.status}` });
    return { success: false };
  }
  const reader = res.body?.getReader();
  if (!reader) {
    onEvent({ type: 'error', error: 'No response body' });
    return { success: false };
  }
  const decoder = new TextDecoder();
  let buffer = '';
  let success = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed) as WorkdayStreamEvent;
          onEvent(event);
          if (event.type === 'done') success = event.success;
        } catch (_) {
          // skip malformed line
        }
      }
    }
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim()) as WorkdayStreamEvent;
        onEvent(event);
        if (event.type === 'done') success = event.success;
      } catch (_) {}
    }
  } finally {
    reader.releaseLock();
  }
  return { success };
}
