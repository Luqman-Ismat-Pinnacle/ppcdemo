import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role');
    const all = searchParams.get('all') === '1';

    let rows;
    if (all) {
      rows = await query(
        `SELECT id, employee_id AS "employeeId", role, type, title, message,
                related_task_id AS "relatedTaskId", related_project_id AS "relatedProjectId",
                is_read AS "isRead", created_at AS "createdAt"
         FROM notifications ORDER BY created_at DESC LIMIT 100`
      );
    } else if (role) {
      rows = await query(
        `SELECT id, employee_id AS "employeeId", role, type, title, message,
                related_task_id AS "relatedTaskId", related_project_id AS "relatedProjectId",
                is_read AS "isRead", created_at AS "createdAt"
         FROM notifications WHERE role = $1 ORDER BY created_at DESC LIMIT 100`,
        [role]
      );
    } else {
      rows = await query(
        `SELECT id, employee_id AS "employeeId", role, type, title, message,
                related_task_id AS "relatedTaskId", related_project_id AS "relatedProjectId",
                is_read AS "isRead", created_at AS "createdAt"
         FROM notifications ORDER BY created_at DESC LIMIT 100`
      );
    }

    return NextResponse.json({ success: true, notifications: rows });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, markAllRead, role } = body;

    if (markAllRead) {
      if (role) {
        await execute('UPDATE notifications SET is_read = true WHERE role = $1 AND is_read = false', [role]);
      } else {
        await execute('UPDATE notifications SET is_read = true WHERE is_read = false');
      }
    } else if (id) {
      await execute('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
    } else {
      return NextResponse.json({ success: false, error: 'id or markAllRead required' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { employeeId, role, type, title, message, relatedTaskId, relatedProjectId } = body;

    if (!type || !title || !message) {
      return NextResponse.json({ success: false, error: 'type, title, and message are required' }, { status: 400 });
    }

    await execute(
      `INSERT INTO notifications (employee_id, role, type, title, message, related_task_id, related_project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [employeeId ?? null, role ?? null, type, title, message, relatedTaskId ?? null, relatedProjectId ?? null]
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
