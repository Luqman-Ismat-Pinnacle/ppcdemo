/**
 * Workday sync via constant stream (NDJSON).
 * Use stream: true for more stable sync: pulls in small date windows instead of one big request.
 * Mapping stays the same; only the fetching process is chunked.
 * 
 * Enhanced with:
 * - Better error handling and recovery
 * - Detailed event types for UI feedback
 * - Timeout handling
 */

export type WorkdayStreamEvent =
  | { type: 'step'; step: string; status: 'started' | 'done' | 'chunk' | 'chunk_done'; result?: any; stats?: any; chunk?: number; totalChunks?: number; startDate?: string; endDate?: string; totalHours?: number; success?: boolean; error?: string }
  | { type: 'error'; error: string }
  | { type: 'done'; success: boolean; logs?: string[]; totalHours?: number; summary?: any };

export interface RunWorkdaySyncStreamOptions {
  /** 'unified' = employees + projects + hours (chunked). 'hours' = hours only (chunked). */
  syncType?: 'unified' | 'hours';
  /** Days of hours to sync (default 7). Only for hours step. */
  hoursDaysBack?: number;
  /** Called for each NDJSON event. */
  onEvent: (event: WorkdayStreamEvent) => void;
  /** Timeout in ms for the entire sync (default 10 minutes) */
  timeoutMs?: number;
}

/**
 * Run Workday sync with stream: true. Reads NDJSON from response and calls onEvent for each line.
 * Constant stream = one date window at a time, more stable than pulling everything at once.
 * 
 * The sync continues even if individual chunks fail - it will report partial success.
 */
export async function runWorkdaySyncStream(options: RunWorkdaySyncStreamOptions): Promise<{ success: boolean; summary?: any }> {
  const { syncType = 'unified', hoursDaysBack = 7, onEvent, timeoutMs = 600000 } = options;
  
  let timeoutId: NodeJS.Timeout | undefined;
  let aborted = false;
  
  try {
    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        aborted = true;
        reject(new Error(`Sync timed out after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);
    });
    
    const fetchPromise = fetch('/api/workday', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        syncType,
        stream: true,
        hoursDaysBack,
      }),
    });
    
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!res.ok) {
      const errText = await res.text().catch(() => 'Failed to read error');
      const errorMsg = errText || `HTTP ${res.status}`;
      console.error('[WorkdaySyncStream] HTTP error:', res.status, errorMsg);
      onEvent({ type: 'error', error: `Server error: ${errorMsg}` });
      return { success: false };
    }
    
    const reader = res.body?.getReader();
    if (!reader) {
      onEvent({ type: 'error', error: 'No response body from server' });
      return { success: false };
    }
    
    const decoder = new TextDecoder();
    let buffer = '';
    let success = false;
    let summary: any = undefined;
    let lastEventTime = Date.now();
    let eventsReceived = 0;
    
    try {
      while (!aborted) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Stream ended - process any remaining buffer
          break;
        }
        
        lastEventTime = Date.now();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          try {
            const event = JSON.parse(trimmed) as WorkdayStreamEvent;
            eventsReceived++;
            onEvent(event);
            
            if (event.type === 'done') {
              success = event.success;
              summary = event.summary;
            }
          } catch (parseErr) {
            // Log malformed lines for debugging but don't stop
            console.warn('[WorkdaySyncStream] Malformed NDJSON line:', trimmed.substring(0, 100));
          }
        }
      }
      
      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim()) as WorkdayStreamEvent;
          eventsReceived++;
          onEvent(event);
          if (event.type === 'done') {
            success = event.success;
            summary = event.summary;
          }
        } catch (parseErr) {
          console.warn('[WorkdaySyncStream] Malformed final buffer:', buffer.substring(0, 100));
        }
      }
      
      // If we received events but no 'done' event, something went wrong
      if (eventsReceived > 0 && summary === undefined) {
        console.warn('[WorkdaySyncStream] Stream ended without done event');
        onEvent({ type: 'error', error: 'Stream ended unexpectedly without completion signal' });
        // Still consider it a partial success if we got events
        return { success: eventsReceived > 1, summary: { partial: true, eventsReceived } };
      }
      
      // If we received no events at all, the stream was empty
      if (eventsReceived === 0) {
        console.error('[WorkdaySyncStream] No events received from stream');
        onEvent({ type: 'error', error: 'No data received from server' });
        return { success: false };
      }
      
      return { success, summary };
    } finally {
      reader.releaseLock();
    }
  } catch (error: any) {
    const errorMsg = error?.message || 'Unknown error';
    console.error('[WorkdaySyncStream] Error:', errorMsg);
    onEvent({ type: 'error', error: errorMsg });
    return { success: false };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
