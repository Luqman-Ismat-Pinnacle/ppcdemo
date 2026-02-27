/**
 * @fileoverview Role-aware proactive AI briefing endpoint (SSE).
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

async function buildBriefing(role: string, employeeId?: string | null): Promise<string> {
  const context = await buildRoleContext(role, { employeeId });
  if (!process.env.AI_API_KEY && !process.env.OPENAI_API_KEY) {
    return `Daily briefing for ${role}: prioritize highest-risk items first. ${context}`;
  }

  const output = await runAiCompletion(
    [
      {
        role: 'system',
        content: 'You are an operations briefing assistant. Give a concise, actionable briefing in 4-6 bullets.',
      },
      {
        role: 'user',
        content: `Generate today brief for role ${role}. Use context: ${context}`,
      },
    ],
    380,
  );
  return output || `Daily briefing for ${role}: ${context}`;
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
    const role = String(body.role || roleContext.roleKey || 'coo').trim();
    const employeeId = body.employeeId ? String(body.employeeId) : null;

    const briefing = await buildBriefing(role, employeeId);

    const pool = getPool();
    if (pool) {
      await writeWorkflowAudit(pool, {
        eventType: 'ai_briefing',
        roleKey: roleContext.roleKey,
        actorEmail: roleContext.actorEmail,
        entityType: 'ai',
        payload: {
          role,
          employeeId: employeeId || null,
          usedAiProvider: (process.env.AI_PROVIDER || 'openai'),
          usedOpenAiKey: Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY),
        },
      });
    }

    return new Response(streamText(briefing), {
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(streamText(`Briefing unavailable: ${message}`), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  }
}
