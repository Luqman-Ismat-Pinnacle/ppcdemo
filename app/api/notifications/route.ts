/**
 * Notifications API — GET (list by employee/role), POST (create).
 * Table: notifications (created if not exists).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    employee_id TEXT,
    role TEXT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_task_id TEXT,
    related_project_id TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

async function ensureTable(pool: NonNullable<ReturnType<typeof getPool>>) {
  await pool.query(CREATE_TABLE_SQL);
}

export async function GET(req: NextRequest) {
  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json(
        { success: false, error: 'PostgreSQL not configured' },
        { status: 503 }
      );
    }

    await ensureTable(pool);

    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get('employeeId');
    const role = searchParams.get('role');
    const all = searchParams.get('all') === '1';

    if (!all && !employeeId && !role) {
      return NextResponse.json(
        { success: false, error: 'Query param employeeId or role is required' },
        { status: 400 }
      );
    }

    let result;
    if (all) {
      result = await pool.query(
        `SELECT id, employee_id AS "employeeId", role, type, title, message,
                related_task_id AS "relatedTaskId", related_project_id AS "relatedProjectId",
                is_read AS "isRead", created_at AS "createdAt"
         FROM notifications
         ORDER BY created_at DESC`
      );
    } else if (employeeId && role) {
      result = await pool.query(
        `SELECT id, employee_id AS "employeeId", role, type, title, message,
                related_task_id AS "relatedTaskId", related_project_id AS "relatedProjectId",
                is_read AS "isRead", created_at AS "createdAt"
         FROM notifications
         WHERE (employee_id = $1 OR role = $2)
         ORDER BY created_at DESC`,
        [employeeId, role]
      );
    } else if (employeeId) {
      result = await pool.query(
        `SELECT id, employee_id AS "employeeId", role, type, title, message,
                related_task_id AS "relatedTaskId", related_project_id AS "relatedProjectId",
                is_read AS "isRead", created_at AS "createdAt"
         FROM notifications
         WHERE employee_id = $1
         ORDER BY created_at DESC`,
        [employeeId]
      );
    } else {
      result = await pool.query(
        `SELECT id, employee_id AS "employeeId", role, type, title, message,
                related_task_id AS "relatedTaskId", related_project_id AS "relatedProjectId",
                is_read AS "isRead", created_at AS "createdAt"
         FROM notifications
         WHERE role = $1
         ORDER BY created_at DESC`,
        [role!]
      );
    }

    return NextResponse.json({ success: true, notifications: result.rows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API notifications GET]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
    }
    await ensureTable(pool);
    const body = await req.json();
    const { id, ids, markAllRead, employeeId, role, all } = body;

    if (markAllRead && all === true) {
      await pool.query(`UPDATE notifications SET is_read = true WHERE is_read = false`);
    } else if (markAllRead && (employeeId || role)) {
      const conditions: string[] = [];
      const params: string[] = [];
      if (employeeId) { params.push(employeeId); conditions.push(`employee_id = $${params.length}`); }
      if (role) { params.push(role); conditions.push(`role = $${params.length}`); }
      await pool.query(`UPDATE notifications SET is_read = true WHERE (${conditions.join(' OR ')}) AND is_read = false`, params);
    } else if (ids && Array.isArray(ids)) {
      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
      await pool.query(`UPDATE notifications SET is_read = true WHERE id IN (${placeholders})`, ids);
    } else if (id) {
      await pool.query(`UPDATE notifications SET is_read = true WHERE id = $1`, [id]);
    } else {
      return NextResponse.json({ success: false, error: 'id, ids, or markAllRead required' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API notifications PATCH]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const pool = getPool();
    if (!pool) {
      return NextResponse.json(
        { success: false, error: 'PostgreSQL not configured' },
        { status: 503 }
      );
    }

    await ensureTable(pool);

    const body = await req.json();
    const {
      employeeId,
      role,
      type,
      title,
      message,
      relatedTaskId,
      relatedProjectId,
    } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { success: false, error: 'type, title, and message are required' },
        { status: 400 }
      );
    }

    await pool.query(
      `INSERT INTO notifications (employee_id, role, type, title, message, related_task_id, related_project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        employeeId ?? null,
        role ?? null,
        String(type),
        String(title),
        String(message),
        relatedTaskId ?? null,
        relatedProjectId ?? null,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API notifications POST]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
