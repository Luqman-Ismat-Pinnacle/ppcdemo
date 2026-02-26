/**
 * Task Assign API — assign a task to an employee.
 * POST body: { taskId: string, employeeId: string, employeeName: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool, withClient } from '@/lib/postgres';
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
    const employeeId = searchParams.get('employeeId');
    const projectId = searchParams.get('projectId');
    const days = Math.max(1, Math.min(180, Number(searchParams.get('days') || 30)));
    const sinceParam = `${days} days`;

    if (employeeId) {
      const rows = await pool.query(
        `SELECT
           id,
           task_id AS "taskId",
           employee_id AS "employeeId",
           employee_name AS "employeeName",
           previous_employee_id AS "previousEmployeeId",
           previous_employee_name AS "previousEmployeeName",
           assignment_source AS "assignmentSource",
           changed_at AS "changedAt",
           metadata
         FROM task_assignments
         WHERE employee_id = $1
           AND changed_at >= NOW() - $2::interval
         ORDER BY changed_at DESC
         LIMIT 100`,
        [employeeId, sinceParam],
      );
      const summary = await pool.query(
        `SELECT
           COUNT(*)::int AS assignments,
           COUNT(*) FILTER (WHERE previous_employee_id IS NOT NULL AND previous_employee_id <> employee_id)::int AS reassignments,
           MAX(changed_at) AS latest_change
         FROM task_assignments
         WHERE employee_id = $1
           AND changed_at >= NOW() - $2::interval`,
        [employeeId, sinceParam],
      );
      return NextResponse.json({ success: true, assignments: rows.rows, summary: summary.rows[0] });
    }

    const filterParams: unknown[] = [sinceParam];
    let filterProjectSql = '';
    if (projectId) {
      filterParams.push(projectId);
      filterProjectSql = ` AND t.project_id = $${filterParams.length}`;
    }

    const summary = await pool.query(
      `SELECT
         COUNT(*)::int AS assignments,
         COUNT(*) FILTER (WHERE ta.previous_employee_id IS NOT NULL AND ta.previous_employee_id <> ta.employee_id)::int AS reassignments,
         COUNT(DISTINCT ta.employee_id)::int AS employees_affected,
         MAX(ta.changed_at) AS latest_change
       FROM task_assignments ta
       LEFT JOIN tasks t ON t.id = ta.task_id
       WHERE ta.changed_at >= NOW() - $1::interval
       ${filterProjectSql}`,
      filterParams,
    );

    const recent = await pool.query(
      `SELECT
         ta.id,
         ta.task_id AS "taskId",
         ta.employee_id AS "employeeId",
         ta.employee_name AS "employeeName",
         ta.previous_employee_id AS "previousEmployeeId",
         ta.previous_employee_name AS "previousEmployeeName",
         ta.assignment_source AS "assignmentSource",
         ta.changed_at AS "changedAt",
         t.project_id AS "projectId"
       FROM task_assignments ta
       LEFT JOIN tasks t ON t.id = ta.task_id
       WHERE ta.changed_at >= NOW() - $1::interval
       ${filterProjectSql}
       ORDER BY ta.changed_at DESC
       LIMIT 30`,
      filterParams,
    );

    const topReassigned = await pool.query(
      `SELECT
         ta.employee_id AS "employeeId",
         ta.employee_name AS "employeeName",
         COUNT(*)::int AS assignments,
         COUNT(*) FILTER (WHERE ta.previous_employee_id IS NOT NULL AND ta.previous_employee_id <> ta.employee_id)::int AS reassignments
       FROM task_assignments ta
       LEFT JOIN tasks t ON t.id = ta.task_id
       WHERE ta.changed_at >= NOW() - $1::interval
       ${filterProjectSql}
       GROUP BY ta.employee_id, ta.employee_name
       ORDER BY reassignments DESC, assignments DESC, "employeeName" ASC
       LIMIT 8`,
      filterParams,
    );

    const sourceBreakdown = await pool.query(
      `SELECT
         COALESCE(ta.assignment_source, 'unknown') AS source,
         COUNT(*)::int AS assignments,
         COUNT(*) FILTER (WHERE ta.previous_employee_id IS NOT NULL AND ta.previous_employee_id <> ta.employee_id)::int AS reassignments
       FROM task_assignments ta
       LEFT JOIN tasks t ON t.id = ta.task_id
       WHERE ta.changed_at >= NOW() - $1::interval
       ${filterProjectSql}
       GROUP BY source
       ORDER BY assignments DESC, source ASC`,
      filterParams,
    );

    const projectBreakdown = await pool.query(
      `SELECT
         COALESCE(t.project_id, 'unknown') AS "projectId",
         COUNT(*)::int AS assignments,
         COUNT(*) FILTER (WHERE ta.previous_employee_id IS NOT NULL AND ta.previous_employee_id <> ta.employee_id)::int AS reassignments
       FROM task_assignments ta
       LEFT JOIN tasks t ON t.id = ta.task_id
       WHERE ta.changed_at >= NOW() - $1::interval
       ${filterProjectSql}
       GROUP BY "projectId"
       ORDER BY reassignments DESC, assignments DESC
       LIMIT 10`,
      filterParams,
    );

    return NextResponse.json({
      success: true,
      summary: summary.rows[0],
      recentChanges: recent.rows,
      topReassigned: topReassigned.rows,
      sourceBreakdown: sourceBreakdown.rows,
      projectBreakdown: projectBreakdown.rows,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API tasks/assign GET]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const roleContext = roleContextFromRequest(req);
    if (!hasRolePermission(roleContext, 'editWbs')) {
      return NextResponse.json({ success: false, error: 'Forbidden for current role view' }, { status: 403 });
    }

    const body = await req.json();
    const { taskId, employeeId, employeeName, assignedBy, assignmentSource, note } = body;

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
    const normalizedEmployeeId = String(employeeId).trim();
    const normalizedEmployeeName = String(employeeName).trim();
    const normalizedAssignedBy = assignedBy != null ? String(assignedBy).trim() : null;
    const normalizedAssignmentSource = assignmentSource != null
      ? String(assignmentSource).trim()
      : 'resourcing_modal';
    const normalizedNote = note != null ? String(note).trim() : null;

    if (!normalizedEmployeeId || !normalizedEmployeeName) {
      return NextResponse.json(
        { success: false, error: 'employeeId and employeeName must be non-empty' },
        { status: 400 }
      );
    }

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

        const priorEmployeeId = (taskRow.employee_id || '').trim();
        const priorEmployeeName = (taskRow.assignedTo || '').trim();
        const noAssignmentChange = priorEmployeeId === normalizedEmployeeId
          && priorEmployeeName.toLowerCase() === normalizedEmployeeName.toLowerCase();
        if (noAssignmentChange) {
          await client.query('ROLLBACK');
          return { found: true as const, taskId: taskRow.id, unchanged: true as const };
        }

        await client.query(
          `UPDATE tasks
           SET "assignedTo" = $1, employee_id = $2, updated_at = NOW()
           WHERE id = $3`,
          [normalizedEmployeeName, normalizedEmployeeId, taskRow.id],
        );

        await client.query(
          `INSERT INTO task_assignments (
             task_id, employee_id, employee_name, assignment_source,
             previous_employee_id, previous_employee_name, assigned_by, note, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            taskRow.id,
            normalizedEmployeeId,
            normalizedEmployeeName,
            normalizedAssignmentSource || 'resourcing_modal',
            taskRow.employee_id ?? null,
            taskRow.assignedTo ?? null,
            normalizedAssignedBy,
            normalizedNote,
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

        await writeWorkflowAudit(client, {
          eventType: 'tasks.assignment_changed',
          roleKey: roleContext.roleKey,
          actorEmail: roleContext.actorEmail ?? normalizedAssignedBy ?? null,
          projectId: taskRow.project_id ?? null,
          entityType: 'task',
          entityId: taskRow.id,
          payload: {
            previousEmployeeId: taskRow.employee_id ?? null,
            previousEmployeeName: taskRow.assignedTo ?? null,
            nextEmployeeId: normalizedEmployeeId,
            nextEmployeeName: normalizedEmployeeName,
            assignmentSource: normalizedAssignmentSource || 'resourcing_modal',
          },
        });

        await client.query('COMMIT');
        return { found: true as const, taskId: taskRow.id, unchanged: false as const };
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

    if (assignmentResult.unchanged) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    return NextResponse.json({ success: true, unchanged: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[API tasks/assign]', err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
