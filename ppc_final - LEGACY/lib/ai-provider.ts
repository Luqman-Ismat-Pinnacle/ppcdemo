/**
 * @fileoverview AI provider abstraction for OpenAI and OpenAI-compatible endpoints.
 */

export type AiProviderMode = 'openai' | 'openai_compatible';

export type AiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type AiConfig = {
  provider: AiProviderMode;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, '');
}

export function getAiConfig(): AiConfig {
  const provider = (process.env.AI_PROVIDER || 'openai') as AiProviderMode;
  const baseUrl = normalizeBaseUrl(
    process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  );
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 30000);
  return { provider, baseUrl, apiKey, model, timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30000 };
}

function extractResponseOutput(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const row = payload as { output_text?: unknown; output?: unknown[] };
  if (typeof row.output_text === 'string') return row.output_text.trim();
  if (Array.isArray(row.output)) {
    const pieces: string[] = [];
    for (const item of row.output) {
      if (!item || typeof item !== 'object') continue;
      const asAny = item as { content?: Array<{ text?: string }> };
      if (!Array.isArray(asAny.content)) continue;
      for (const c of asAny.content) {
        if (typeof c?.text === 'string') pieces.push(c.text);
      }
    }
    return pieces.join('\n').trim();
  }
  return '';
}

function extractChatOutput(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const row = payload as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = row.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends a non-streaming completion request and returns normalized text output.
 * Uses `/responses` first, then falls back to `/chat/completions` for compatible providers.
 */
export async function runAiCompletion(messages: AiMessage[], maxTokens: number): Promise<string> {
  const config = getAiConfig();
  if (!config.apiKey) {
    throw new Error('AI API key is not configured');
  }

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };

  const responsesBody = {
    model: config.model,
    input: messages,
    max_output_tokens: maxTokens,
  };

  const responsesUrl = `${config.baseUrl}/responses`;
  const response = await fetchJsonWithTimeout(
    responsesUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(responsesBody),
    },
    config.timeoutMs,
  );

  if (response.ok) {
    const payload = await response.json().catch(() => ({}));
    const text = extractResponseOutput(payload);
    if (text) return text;
  }

  if (config.provider !== 'openai_compatible' && response.status !== 404) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: { message?: unknown } }).error?.message || 'AI request failed')
        : 'AI request failed';
    throw new Error(message);
  }

  const chatUrl = `${config.baseUrl}/chat/completions`;
  const chatResponse = await fetchJsonWithTimeout(
    chatUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: maxTokens,
      }),
    },
    config.timeoutMs,
  );

  const chatPayload = await chatResponse.json().catch(() => ({}));
  if (!chatResponse.ok) {
    const message =
      chatPayload && typeof chatPayload === 'object' && 'error' in chatPayload
        ? String((chatPayload as { error?: { message?: unknown } }).error?.message || 'AI chat request failed')
        : 'AI chat request failed';
    throw new Error(message);
  }

  const chatText = extractChatOutput(chatPayload);
  if (!chatText) throw new Error('AI returned an empty response');
  return chatText;
}
