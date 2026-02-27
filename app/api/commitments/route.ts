/**
 * @fileoverview Commitments API.
 *
 * GET: list commitments by project/period/role
 * POST: upsert commitment record and write audit trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';
import { hasRolePermission, roleContextFromRequest } from '@/lib/api-role-guard';
import { writeWorkflowAudit } from '@/lib/workflow-audit';

export const dynamic = 'force-dynamic';
const EDIT_WINDOW_DAYS = Math.max(1, Number(process.env.COMMITMENT_EDIT_WINDOW_DAYS || 3));

async function ensureTables(pool: import('pg').Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commitments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      period_key TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      author_employee_id TEXT,
      author_email TEXT,
      commitment_text TEXT NOT NULL,
      followthrough_text TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      review_note TEXT,
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, period_key, owner_role, author_email)
    );

    ALTER TABLE commitments ADD COLUMN IF NOT EXISTS review_note TEXT;
    ALTER TABLE commitments ADD COLUMN IF NOT EXISTS reviewed_by TEXT;
    ALTER TABLE commitments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_commitments_project_period ON commitments(project_id, period_key);
    CREATE INDEX IF NOT EXISTS idx_commitments_author_period ON commitments(author_email, period_key);
    CREATE INDEX IF NOT EXISTS idx_commitments_status_created ON commitments(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS workflow_audit_log (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      role_key TEXT,
      actor_email TEXT,
      project_id TEXT,
      entity_type TEXT,
      entity_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_audit_event_created ON workflow_audit_log(event_type, created_at DESC);
  `);
}

function makeId() {
  return `commit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: NextRequest) {
  try {
    const pool = getPool();
    if (!pool) return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
    await ensureTables(pool);

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const periodKey = searchParams.get('periodKey');
    const ownerRole = searchParams.get('ownerRole');
    const authorEmail = searchParams.get('authorEmail');
    const limit = Math.min(500, Number(searchParams.get('limit') || 100));
    const aggregate = searchParams.get('aggregate') === 'coo-summary';

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: unknown) => {
      params.push(value);
      where.push(`${column} = $${params.length}`);
    };

    if (projectId) add('project_id', projectId);
    if (periodKey) add('period_key', periodKey);
    if (ownerRole) add('owner_role', ownerRole);
    if (authorEmail) add('author_email', authorEmail);

    if (aggregate) {
      const rows = await pool.query(
        `SELECT
           period_key AS "periodKey",
           owner_role AS "ownerRole",
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status IN ('submitted'))::int AS submitted,
           COUNT(*) FILTER (WHERE status IN ('reviewed','approved'))::int AS approved,
           COUNT(*) FILTER (WHERE status IN ('escalated'))::int AS escalated,
           COUNT(*) FILTER (WHERE status IN ('rejected'))::int AS rejected
         FROM commitments
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         GROUP BY period_key, owner_role
         ORDER BY period_key DESC`,
        params,
      );

      return NextResponse.json({ success: true, aggregates: rows.rows });
    }

    const result = await pool.query(
      `SELECT
         id,
         project_id AS "projectId",
         period_key AS "periodKey",
         owner_role AS "ownerRole",
         author_employee_id AS "authorEmployeeId",
         author_email AS "authorEmail",
         commitment_text AS "commitmentText",
         followthrough_text AS "followthroughText",
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt",
         (
           status = 'submitted'
           AND updated_at < NOW() - ($${params.length + 1}::text || ' days')::interval
         ) AS "locked"
       FROM commitments
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY updated_at DESC
       LIMIT $${params.length + 2}`,
      [...params, String(EDIT_WINDOW_DAYS), limit],
    );

    return NextResponse.json({ success: true, rows: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'submitCommitments')) {
      return NextResponse.json({ success: false, error: 'Forbidden for active role view' }, { status: 403 });
    }

    const pool = getPool();
    if (!pool) return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
    await ensureTables(pool);

    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || '').trim();
    const periodKey = String(body.periodKey || '').trim();
    const ownerRole = String(body.ownerRole || '').trim();
    const authorEmployeeId = body.authorEmployeeId ? String(body.authorEmployeeId) : null;
    const authorEmail = body.authorEmail ? String(body.authorEmail) : null;
    const commitmentText = String(body.commitmentText || '').trim();
    const followthroughText = body.followthroughText ? String(body.followthroughText) : null;
    const status = String(body.status || 'draft').trim().toLowerCase();
    const overrideLock = Boolean(body.overrideLock);

    if (!projectId || !periodKey || !ownerRole || !commitmentText) {
      return NextResponse.json({ success: false, error: 'projectId, periodKey, ownerRole, and commitmentText are required' }, { status: 400 });
    }

    const existing = await pool.query(
      `SELECT id, status, updated_at
       FROM commitments
       WHERE project_id = $1
         AND period_key = $2
         AND owner_role = $3
         AND author_email IS NOT DISTINCT FROM $4
       LIMIT 1`,
      [projectId, periodKey, ownerRole, authorEmail],
    );
    const existingRow = existing.rows?.[0] as { id: string; status: string; updated_at: string } | undefined;
    const id = String(existingRow?.id || body.id || makeId());

    if (existingRow?.status === 'submitted' && !overrideLock) {
      const updatedAtMs = new Date(existingRow.updated_at).getTime();
      const lockDeadline = updatedAtMs + (EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      if (Number.isFinite(updatedAtMs) && lockDeadline < Date.now()) {
        return NextResponse.json({
          success: false,
          error: `Commitment is locked after ${EDIT_WINDOW_DAYS} day edit window.`,
          code: 'COMMITMENT_LOCKED',
          editableWindowDays: EDIT_WINDOW_DAYS,
        }, { status: 409 });
      }
    }

    const result = await pool.query(
      `INSERT INTO commitments (
         id, project_id, period_key, owner_role, author_employee_id, author_email,
         commitment_text, followthrough_text, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (project_id, period_key, owner_role, author_email)
       DO UPDATE SET
         commitment_text = EXCLUDED.commitment_text,
         followthrough_text = EXCLUDED.followthrough_text,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING
         id,
         project_id AS "projectId",
         period_key AS "periodKey",
         owner_role AS "ownerRole",
         author_employee_id AS "authorEmployeeId",
         author_email AS "authorEmail",
         commitment_text AS "commitmentText",
         followthrough_text AS "followthroughText",
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [id, projectId, periodKey, ownerRole, authorEmployeeId, authorEmail, commitmentText, followthroughText, status],
    );

    await pool.query(
      `INSERT INTO workflow_audit_log (event_type, role_key, actor_email, project_id, entity_type, entity_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        'commitment_upsert',
        ownerRole,
        authorEmail,
        projectId,
        'commitment',
        result.rows?.[0]?.id ?? id,
        JSON.stringify({ periodKey, status }),
      ],
    );
    await writeWorkflowAudit(pool, {
      eventType: 'commitment_upsert',
      roleKey: roleContext.roleKey,
      actorEmail: roleContext.actorEmail,
      projectId,
      entityType: 'commitment',
      entityId: result.rows?.[0]?.id ?? id,
      payload: { periodKey, status },
    });

    return NextResponse.json({
      success: true,
      row: result.rows?.[0] ?? null,
      editableWindowDays: EDIT_WINDOW_DAYS,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'submitCommitments')) {
      return NextResponse.json({ success: false, error: 'Forbidden for active role view' }, { status: 403 });
    }

    const pool = getPool();
    if (!pool) return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
    await ensureTables(pool);

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    const status = String(body.status || '').trim().toLowerCase();
    const reviewNote = body.reviewNote ? String(body.reviewNote) : null;
    const reviewerEmail = body.reviewerEmail ? String(body.reviewerEmail) : roleContext.actorEmail;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'id and status are required' }, { status: 400 });
    }

    const allowed = new Set(['draft', 'submitted', 'reviewed', 'escalated', 'approved', 'rejected']);
    if (!allowed.has(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }

    const result = await pool.query(
      `UPDATE commitments
       SET status = $2,
           review_note = COALESCE($3, review_note),
           reviewed_by = $4,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         project_id AS "projectId",
         period_key AS "periodKey",
         owner_role AS "ownerRole",
         author_employee_id AS "authorEmployeeId",
         author_email AS "authorEmail",
         commitment_text AS "commitmentText",
         followthrough_text AS "followthroughText",
         status,
         review_note AS "reviewNote",
         reviewed_by AS "reviewedBy",
         reviewed_at AS "reviewedAt",
         updated_at AS "updatedAt"`,
      [id, status, reviewNote, reviewerEmail],
    );

    if (!result.rows?.[0]) {
      return NextResponse.json({ success: false, error: 'Commitment not found' }, { status: 404 });
    }

    await writeWorkflowAudit(pool, {
      eventType: 'commitment_status_update',
      roleKey: roleContext.roleKey,
      actorEmail: reviewerEmail,
      projectId: result.rows[0].projectId,
      entityType: 'commitment',
      entityId: id,
      payload: { status, reviewNote },
    });

    return NextResponse.json({ success: true, row: result.rows[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
