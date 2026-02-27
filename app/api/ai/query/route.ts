/**
 * @fileoverview Role-aware AI query endpoint (SSE streaming).
 */

import { NextRequest } from 'next/server';
import { getPool } from '@/lib/postgres';
import { hasRolePermission, roleContextFromRequest } from '@/lib/api-role-guard';
import { writeWorkflowAudit } from '@/lib/workflow-audit';
import { buildRoleContext } from '@/lib/ai-context';
import { runAiCompletion } from '@/lib/ai-provider';

export const dynamic = 'force-dynamic';

function sseChunk(data: unknown): string {
  return `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
}

function streamText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(sseChunk({ text: part + ' ' })));
      }
      controller.enqueue(encoder.encode(sseChunk('[DONE]')));
      controller.close();
    },
  });
}

async function fallbackAnswer(query: string, context: string): Promise<string> {
  const lower = query.toLowerCase();
  if (lower.includes('risk')) return `Risk posture: prioritize low-SPI/CPI projects and unresolved critical alerts. ${context}`;
  if (lower.includes('cost')) return `Cost posture: review CPI outliers and IEAC deltas versus baseline. ${context}`;
  if (lower.includes('schedule')) return `Schedule posture: focus on overdue open tasks and stalled dependencies. ${context}`;
  return `Execution posture: monitor SPI/CPI drift, overdue tasks, and open exceptions. ${context}`;
}

async function fetchModelAnswer(input: {
  role: string;
  question: string;
  context: string;
  sessionHistory: Array<{ role: 'user' | 'assistant'; text: string }>;
}): Promise<string> {
  if (!process.env.AI_API_KEY && !process.env.OPENAI_API_KEY) {
    return fallbackAnswer(input.question, input.context);
  }

  const historyLines = input.sessionHistory
    .slice(-8)
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.text}`)
    .join('\n');

  const answer = await runAiCompletion(
    [
      {
        role: 'system',
        content: `You are an operations copilot for role ${input.role}. Keep responses concise, concrete, and action-oriented. Context: ${input.context}`,
      },
      {
        role: 'user',
        content: `Conversation:\n${historyLines || '(none)'}\n\nUser question: ${input.question}`,
      },
    ],
    500,
  );
  return answer || fallbackAnswer(input.question, input.context);
}

export async function POST(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'queryAiBriefing')) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden for active role view' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const question = String(body.question || body.query || '').trim();
    const role = String(body.role || roleContext.roleKey || 'coo').trim();
    const employeeId = body.employeeId ? String(body.employeeId) : null;
    const sessionHistory = Array.isArray(body.sessionHistory)
      ? body.sessionHistory.filter((entry: unknown): entry is { role: 'user' | 'assistant'; text: string } => {
        if (!entry || typeof entry !== 'object') return false;
        const row = entry as { role?: unknown; text?: unknown };
        return typeof row.text === 'string' && (row.role === 'user' || row.role === 'assistant');
      })
      : [];

    if (!question) {
      return new Response(JSON.stringify({ success: false, error: 'question is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const context = await buildRoleContext(role, { employeeId });
    const answer = await fetchModelAnswer({
      role,
      question,
      context,
      sessionHistory,
    });

    const pool = getPool();
    if (pool) {
      await writeWorkflowAudit(pool, {
        eventType: 'ai_query',
        roleKey: roleContext.roleKey,
        actorEmail: roleContext.actorEmail,
        entityType: 'ai',
        payload: {
          role,
          questionLength: question.length,
          usedAiProvider: (process.env.AI_PROVIDER || 'openai'),
          usedOpenAiKey: Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY),
        },
      });
    }

    return new Response(streamText(answer), {
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(streamText(`AI service error: ${message}`), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }
}
