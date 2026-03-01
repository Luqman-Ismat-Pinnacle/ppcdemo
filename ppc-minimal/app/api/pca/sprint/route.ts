import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');

    let sprints: Record<string, unknown>[];
    if (projectId) {
      sprints = await query('SELECT * FROM sprints WHERE project_id = $1 ORDER BY start_date DESC NULLS LAST', [projectId]);
    } else {
      sprints = await query('SELECT * FROM sprints ORDER BY start_date DESC NULLS LAST');
    }

    const sprintIds = sprints.map((s) => String(s.id));
    let sprintTasks: Record<string, unknown>[] = [];
    if (sprintIds.length > 0) {
      const ph = sprintIds.map((_, i) => `$${i + 1}`).join(',');
      sprintTasks = await query(
        `SELECT st.*, t.name as task_name, t.percent_complete, t.actual_hours, t.total_hours,
                t.baseline_start, t.baseline_end, t.actual_start, t.actual_end, t.is_critical,
                t.resource, t.priority_value, t.phase_id,
                COALESCE(ph.name, 'Ungrouped') as phase_name
         FROM sprint_tasks st JOIN tasks t ON st.task_id = t.id
         LEFT JOIN phases ph ON t.phase_id = ph.id
         WHERE st.sprint_id IN (${ph}) ORDER BY ph.name NULLS LAST, st.sort_order`,
        sprintIds,
      );
    }

    const unassignedFilter = projectId
      ? 'WHERE t.project_id = $1 AND t.id NOT IN (SELECT task_id FROM sprint_tasks) AND t.is_summary = false'
      : 'WHERE t.id NOT IN (SELECT task_id FROM sprint_tasks) AND t.is_summary = false';
    const unassigned = await query(
      `SELECT t.id, t.name, t.project_id, t.percent_complete, t.actual_hours, t.total_hours,
              t.baseline_start, t.baseline_end, t.resource, t.priority_value, t.phase_id,
              COALESCE(ph.name, 'Ungrouped') as phase_name
       FROM tasks t LEFT JOIN phases ph ON t.phase_id = ph.id
       ${unassignedFilter}
       ORDER BY t.priority_value DESC, t.name LIMIT 200`,
      projectId ? [projectId] : [],
    );

    const projects = await query('SELECT id, name FROM projects ORDER BY name');

    return NextResponse.json({ success: true, sprints, sprintTasks, unassigned, projects });
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
      const { sprintId, taskId } = body;
      const id = `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO sprint_tasks (id, sprint_id, task_id, sort_order) VALUES ($1,$2,$3,0) ON CONFLICT DO NOTHING`,
        [id, sprintId, taskId],
      );
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
