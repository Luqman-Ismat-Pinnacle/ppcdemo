/**
 * Task Assign API — assign a task to an employee.
 * POST body: { taskId: string, employeeId: string, employeeName: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool, withClient } from '@/lib/postgres';
import { emitAlertEvent, ensurePhase6Tables } from '@/lib/phase6-data';

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

    const resolvedTaskId = String(taskId);
    const normalizedEmployeeId = String(employeeId);
    const normalizedEmployeeName = String(employeeName);

    const assignmentResult = await withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await ensurePhase6Tables(client);

        const current = await client.query(
          `SELECT id, "taskId", name, project_id, employee_id, "assignedTo"
           FROM tasks
           WHERE id = $1 OR "taskId" = $1
           LIMIT 1`,
          [resolvedTaskId],
        );

        if (current.rowCount === 0) {
          await client.query('ROLLBACK');
          return { found: false as const };
        }

        const taskRow = current.rows[0] as {
          id: string;
          taskId?: string | null;
          name?: string | null;
          project_id?: string | null;
          employee_id?: string | null;
          assignedTo?: string | null;
        };

        await client.query(
          `UPDATE tasks
           SET "assignedTo" = $1, employee_id = $2, updated_at = NOW()
           WHERE id = $3`,
          [normalizedEmployeeName, normalizedEmployeeId, taskRow.id],
        );

        await client.query(
          `INSERT INTO task_assignments (
             task_id, employee_id, employee_name, assignment_source,
             previous_employee_id, previous_employee_name, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            taskRow.id,
            normalizedEmployeeId,
            normalizedEmployeeName,
            'resourcing_modal',
            taskRow.employee_id ?? null,
            taskRow.assignedTo ?? null,
            JSON.stringify({
              taskName: taskRow.name ?? null,
              taskReference: taskRow.taskId ?? null,
            }),
          ],
        );

        await emitAlertEvent(client, {
          eventType: 'task_assignment.changed',
          severity: 'info',
          title: 'Task Assignment Updated',
          message: `Task "${taskRow.name || taskRow.id}" assigned to ${normalizedEmployeeName}.`,
          source: 'api/tasks/assign',
          entityType: 'task',
          entityId: taskRow.id,
          relatedTaskId: taskRow.id,
          relatedProjectId: taskRow.project_id ?? undefined,
          dedupeKey: `task-assignment-${taskRow.id}-${normalizedEmployeeId}`,
          metadata: {
            previousEmployeeId: taskRow.employee_id ?? null,
            previousEmployeeName: taskRow.assignedTo ?? null,
            nextEmployeeId: normalizedEmployeeId,
            nextEmployeeName: normalizedEmployeeName,
          },
        });

        await client.query('COMMIT');
        return { found: true as const, taskId: taskRow.id };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    if (!assignmentResult.found) {
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
