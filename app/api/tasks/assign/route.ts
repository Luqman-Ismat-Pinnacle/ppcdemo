/**
 * Task Assign API — assign a task to an employee.
 * POST body: { taskId: string, employeeId: string, employeeName: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, employeeId, employeeName } = body;

    if (!taskId || employeeId == null || employeeName == null) {
      return NextResponse.json(
        { success: false, error: 'taskId, employeeId, and employeeName are required' },
        { status: 400 }
      );
    }

    const pool = getPool();
    if (!pool) {
      return NextResponse.json(
        { success: false, error: 'PostgreSQL not configured' },
        { status: 503 }
      );
    }

    const result = await pool.query(
      `UPDATE tasks SET "assignedTo" = $1, employee_id = $2 WHERE id = $3 OR "taskId" = $3`,
      [String(employeeName), String(employeeId), String(taskId)]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'No task found with the given id or taskId' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API tasks/assign]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
