/**
 * @fileoverview COO AI query endpoint.
 *
 * Uses OpenAI Responses API when configured; falls back to deterministic
 * summary text if no API key is present.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';
import { hasRolePermission, roleContextFromRequest } from '@/lib/api-role-guard';
import { writeWorkflowAudit } from '@/lib/workflow-audit';

export const dynamic = 'force-dynamic';

async function fallbackAnswer(query: string): Promise<string> {
  const lower = query.toLowerCase();
  if (lower.includes('risk')) return 'Top risk posture: prioritize projects with low SPI/CPI and unresolved critical alerts.';
  if (lower.includes('cost')) return 'Cost posture: review CPI outliers and forecast IEAC deltas versus baseline budgets.';
  if (lower.includes('schedule')) return 'Schedule posture: focus on overdue open tasks and stalled critical-path dependencies.';
  return 'Executive summary: monitor SPI/CPI drift, overdue tasks, and unresolved high-severity exceptions.';
}

async function buildContextSnippet(): Promise<string> {
  const pool = getPool();
  if (!pool) return 'Database context unavailable.';

  const [projectCount, openAlerts] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM projects'),
    pool.query("SELECT COUNT(*)::int AS count FROM alert_events WHERE status = 'open'"),
  ]);

  return `Current state: ${projectCount.rows?.[0]?.count ?? 0} projects; ${openAlerts.rows?.[0]?.count ?? 0} open alerts.`;
}

export async function POST(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'queryAiBriefing')) {
      return NextResponse.json({ success: false, error: 'Forbidden for active role view' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body.query || '').trim();
    const role = String(body.role || 'coo').trim();

    if (!query) {
      return NextResponse.json({ success: false, error: 'query is required' }, { status: 400 });
    }

    const context = await buildContextSnippet();
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

    let answer = '';
    if (apiKey) {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: 'system',
              content: `You are an executive operations assistant for role ${role}. Ground your answer in this context: ${context}`,
            },
            { role: 'user', content: query },
          ],
          max_output_tokens: 500,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return NextResponse.json({ success: false, error: payload?.error?.message || 'OpenAI request failed' }, { status: 500 });
      }
      answer = String(payload?.output_text || '').trim();
    }

    if (!answer) {
      answer = `${await fallbackAnswer(query)} ${context}`;
    }

    const pool = getPool();
    if (pool) {
      await writeWorkflowAudit(pool, {
        eventType: 'ai_query',
        roleKey: roleContext.roleKey,
        actorEmail: roleContext.actorEmail,
        entityType: 'ai',
        payload: { role, queryLength: query.length, usedOpenAi: Boolean(apiKey) },
      });
    }

    return NextResponse.json({ success: true, answer, context });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
