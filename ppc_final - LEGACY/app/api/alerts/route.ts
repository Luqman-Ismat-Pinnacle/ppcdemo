/**
 * Alert Events API
 *
 * GET: list alert events
 * POST: create manual/system alert event
 * PATCH: acknowledge/resolve alert event(s)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';
import { emitAlertEvent, ensurePhase6Tables } from '@/lib/phase6-data';
import { hasRolePermission, roleContextFromRequest } from '@/lib/api-role-guard';
import { writeWorkflowAudit } from '@/lib/workflow-audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
    }
    await ensurePhase6Tables(pool);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const severity = searchParams.get('severity');
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500);

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (status) {
      params.push(status);
      clauses.push(`status = $${params.length}`);
    }
    if (severity) {
      params.push(severity);
      clauses.push(`severity = $${params.length}`);
    }
    params.push(limit);
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         id, event_type AS "eventType", severity, title, message, source,
         entity_type AS "entityType", entity_id AS "entityId",
         related_project_id AS "relatedProjectId", related_task_id AS "relatedTaskId",
         dedupe_key AS "dedupeKey", status, metadata,
         acknowledged_by AS "acknowledgedBy", acknowledged_at AS "acknowledgedAt",
         created_at AS "createdAt"
       FROM alert_events
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return NextResponse.json({ success: true, alerts: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API alerts GET]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'triageExceptions')) {
      return NextResponse.json({ success: false, error: 'Forbidden for active role view' }, { status: 403 });
    }

    const pool = getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
    }
    await ensurePhase6Tables(pool);

    const body = await req.json();
    const {
      eventType,
      severity,
      title,
      message,
      source,
      entityType,
      entityId,
      relatedProjectId,
      relatedTaskId,
      dedupeKey,
      metadata,
    } = body ?? {};

    if (!eventType || !message) {
      return NextResponse.json({ success: false, error: 'eventType and message are required' }, { status: 400 });
    }

    await emitAlertEvent(pool, {
      eventType: String(eventType),
      severity: (severity as 'info' | 'warning' | 'critical') || 'info',
      title: title ? String(title) : undefined,
      message: String(message),
      source: source ? String(source) : 'api/alerts',
      entityType: entityType ? String(entityType) : undefined,
      entityId: entityId ? String(entityId) : undefined,
      relatedProjectId: relatedProjectId ? String(relatedProjectId) : undefined,
      relatedTaskId: relatedTaskId ? String(relatedTaskId) : undefined,
      dedupeKey: dedupeKey ? String(dedupeKey) : undefined,
      metadata: metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {},
    });

    await writeWorkflowAudit(pool, {
      eventType: 'alert_create',
      roleKey: roleContext.roleKey,
      actorEmail: roleContext.actorEmail,
      projectId: relatedProjectId ? String(relatedProjectId) : null,
      entityType: entityType ? String(entityType) : 'alert_events',
      entityId: entityId ? String(entityId) : null,
      payload: { eventType, severity, source },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API alerts POST]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'triageExceptions')) {
      return NextResponse.json({ success: false, error: 'Forbidden for active role view' }, { status: 403 });
    }

    const pool = getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
    }
    await ensurePhase6Tables(pool);

    const body = await req.json();
    const { id, ids, status, acknowledgedBy } = body ?? {};
    const nextStatus = status ? String(status) : 'acknowledged';
    if (!['open', 'acknowledged', 'resolved'].includes(nextStatus)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const idList = Array.isArray(ids) ? ids : (id ? [id] : []);
    if (!idList.length) {
      return NextResponse.json({ success: false, error: 'id or ids required' }, { status: 400 });
    }

    const params: unknown[] = [nextStatus, acknowledgedBy ? String(acknowledgedBy) : null];
    const placeholders = idList.map((_: unknown, i: number) => `$${i + 3}`).join(',');
    params.push(...idList);

    await pool.query(
      `UPDATE alert_events
       SET status = $1,
           acknowledged_by = COALESCE($2, acknowledged_by),
           acknowledged_at = CASE WHEN $1 <> 'open' THEN NOW() ELSE acknowledged_at END
       WHERE id IN (${placeholders})`,
      params,
    );

    await writeWorkflowAudit(pool, {
      eventType: 'alert_status_update',
      roleKey: roleContext.roleKey,
      actorEmail: roleContext.actorEmail,
      entityType: 'alert_events',
      entityId: idList.length === 1 ? String(idList[0]) : null,
      payload: { status: nextStatus, ids: idList },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API alerts PATCH]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
