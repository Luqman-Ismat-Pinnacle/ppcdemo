import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');

    let sprints: Record<string, unknown>[];
    if (projectId) {
      sprints = await query(
        `SELECT s.*
         FROM sprints s
         JOIN projects p ON p.id = s.project_id
         WHERE s.project_id = $1 AND p.is_active = true AND p.has_schedule = true
         ORDER BY s.start_date DESC NULLS LAST`,
        [projectId],
      );
    } else {
      sprints = await query(
        `SELECT s.*
         FROM sprints s
         JOIN projects p ON p.id = s.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY s.start_date DESC NULLS LAST`,
      );
    }

    const sprintIds = sprints.map((s) => String(s.id));
    let sprintTasks: Record<string, unknown>[] = [];
    if (sprintIds.length > 0) {
      const ph = sprintIds.map((_, i) => `$${i + 1}`).join(',');
      sprintTasks = await query(
        `SELECT st.*, t.name as task_name, t.percent_complete, t.actual_hours, t.total_hours,
                t.baseline_start, t.baseline_end, t.actual_start, t.actual_end, t.is_critical,
                t.resource, t.priority_value, t.phase_id,
                COALESCE(ph.name, 'Ungrouped') as phase_name,
                t.epic_id, t.feature_id,
                COALESCE(ep.name, '') as epic_name,
                COALESCE(ft.name, '') as feature_name
         FROM sprint_tasks st JOIN tasks t ON st.task_id = t.id
         LEFT JOIN phases ph ON t.phase_id = ph.id
         LEFT JOIN epics ep ON t.epic_id = ep.id
         LEFT JOIN features ft ON t.feature_id = ft.id
         WHERE st.sprint_id IN (${ph}) ORDER BY ep.name NULLS LAST, ft.name NULLS LAST, ph.name NULLS LAST, st.sort_order`,
        sprintIds,
      );
    }

    const unassignedFilter = projectId
      ? 'WHERE t.project_id = $1 AND p.is_active = true AND p.has_schedule = true AND t.id NOT IN (SELECT task_id FROM sprint_tasks) AND t.is_summary = false'
      : 'WHERE p.is_active = true AND p.has_schedule = true AND t.id NOT IN (SELECT task_id FROM sprint_tasks) AND t.is_summary = false';
    const unassigned = await query(
      `SELECT t.id, t.name, t.project_id, t.percent_complete, t.actual_hours, t.total_hours,
              t.baseline_start, t.baseline_end, t.resource, t.priority_value, t.phase_id,
              COALESCE(ph.name, 'Ungrouped') as phase_name,
              t.epic_id, t.feature_id,
              COALESCE(ep.name, '') as epic_name,
              COALESCE(ft.name, '') as feature_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN phases ph ON t.phase_id = ph.id
       LEFT JOIN epics ep ON t.epic_id = ep.id
       LEFT JOIN features ft ON t.feature_id = ft.id
       ${unassignedFilter}
       ORDER BY t.priority_value DESC, t.name LIMIT 200`,
      projectId ? [projectId] : [],
    );

    const projects = await query('SELECT id, name FROM projects WHERE is_active = true AND has_schedule = true ORDER BY name');
    const employees = await query('SELECT id, name FROM employees ORDER BY name NULLS LAST, id LIMIT 2000');

    let epics: Record<string, unknown>[] = [];
    let features: Record<string, unknown>[] = [];
    try {
      epics = await query(
        `SELECT e.*, COALESCE(ph.name, '') AS phase_name
         FROM epics e LEFT JOIN phases ph ON ph.id = e.phase_id
         WHERE e.status = 'active' ORDER BY e.name`,
      );
      features = await query(
        `SELECT f.*, COALESCE(e.name, '') AS epic_name
         FROM features f LEFT JOIN epics e ON e.id = f.epic_id
         WHERE f.status = 'active' ORDER BY f.name`,
      );
    } catch { /* tables may not exist yet */ }

    return NextResponse.json({ success: true, sprints, sprintTasks, unassigned, projects, employees, epics, features });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'createSprint') {
      const { name, projectId, startDate, endDate } = body;
      const id = `sprint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO sprints (id, name, project_id, start_date, end_date, status) VALUES ($1,$2,$3,$4,$5,'Planned')`,
        [id, name, projectId, startDate || null, endDate || null],
      );
      return NextResponse.json({ success: true, id });
    }

    if (action === 'assignTask') {
      const { sprintId, taskId, epicId, featureId } = body;
      const id = `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO sprint_tasks (id, sprint_id, task_id, sort_order) VALUES ($1,$2,$3,0) ON CONFLICT DO NOTHING`,
        [id, sprintId, taskId],
      );
      if (epicId || featureId) {
        await execute(
          `UPDATE tasks SET epic_id = COALESCE($1, epic_id), feature_id = COALESCE($2, feature_id) WHERE id = $3`,
          [epicId || null, featureId || null, taskId],
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'removeTask') {
      const { sprintId, taskId } = body;
      await execute('DELETE FROM sprint_tasks WHERE sprint_id = $1 AND task_id = $2', [sprintId, taskId]);
      return NextResponse.json({ success: true });
    }

    if (action === 'updateStatus') {
      const { sprintId, status } = body;
      await execute('UPDATE sprints SET status = $1, updated_at = NOW() WHERE id = $2', [status, sprintId]);
      return NextResponse.json({ success: true });
    }

    if (action === 'updateTask') {
      const { taskId, resource, percentComplete, priorityValue } = body;
      if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      const rows = await query<{ total_hours: string; percent_complete: string; actual_start: string | null; actual_end: string | null }>(
        `SELECT total_hours, percent_complete, actual_start, actual_end FROM tasks WHERE id = $1 LIMIT 1`,
        [taskId],
      );
      const row = rows[0];
      if (!row) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      const totalHours = Number(row.total_hours || 0);
      const pctInput = typeof percentComplete === 'number'
        ? Math.max(0, Math.min(100, percentComplete))
        : Number(row.percent_complete || 0);
      const actualHours = totalHours > 0 ? Number(((pctInput / 100) * totalHours).toFixed(2)) : null;
      const remainingHours = totalHours > 0 ? Number((totalHours - (actualHours || 0)).toFixed(2)) : null;
      const hasResourceUpdate = resource !== undefined;
      const actualStart = (pctInput > 0 || hasResourceUpdate) ? (row.actual_start || new Date().toISOString()) : row.actual_start;
      const actualEnd = pctInput >= 100 ? (row.actual_end || new Date().toISOString()) : null;
      await execute(
        `UPDATE tasks
           SET resource = COALESCE($1, resource),
               percent_complete = COALESCE($2, percent_complete),
               actual_hours = COALESCE($3, actual_hours),
               remaining_hours = COALESCE($4, remaining_hours),
               actual_start = COALESCE($5, actual_start),
               actual_end = $6,
               priority_value = COALESCE($7, priority_value),
               updated_at = NOW()
         WHERE id = $8`,
        [
          resource ?? null,
          typeof percentComplete === 'number' ? pctInput : null,
          actualHours,
          remainingHours,
          actualStart,
          actualEnd,
          typeof priorityValue === 'number' ? Math.round(priorityValue) : null,
          taskId,
        ],
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
