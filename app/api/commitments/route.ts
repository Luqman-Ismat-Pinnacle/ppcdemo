/**
 * @fileoverview Commitments API.
 *
 * GET: list commitments by project/period/role
 * POST: upsert commitment record and write audit trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (project_id, period_key, owner_role, author_email)
    );

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
    const limit = Math.min(500, Number(searchParams.get('limit') || 100));

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, value: unknown) => {
      params.push(value);
      where.push(`${column} = $${params.length}`);
    };

    if (projectId) add('project_id', projectId);
    if (periodKey) add('period_key', periodKey);
    if (ownerRole) add('owner_role', ownerRole);
    params.push(limit);

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
         updated_at AS "updatedAt"
       FROM commitments
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY updated_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return NextResponse.json({ success: true, rows: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
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

    if (!projectId || !periodKey || !ownerRole || !commitmentText) {
      return NextResponse.json({ success: false, error: 'projectId, periodKey, ownerRole, and commitmentText are required' }, { status: 400 });
    }

    const id = String(body.id || makeId());

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

    return NextResponse.json({ success: true, row: result.rows?.[0] ?? null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
