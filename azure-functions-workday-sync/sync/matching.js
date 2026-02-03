/**
 * Match hour_entries to tasks (set task_id) and aggregate actual_hours/actual_cost to tasks.
 * 1:1 with the matching + aggregation steps in Next.js unifiedSyncStream.
 */

async function runMatchingAndAggregation(client) {
  const PAGE = 1000;

  const { rows: unassigned } = await client.query(
    `SELECT id, project_id, phase_id, workday_phase, workday_task, description FROM hour_entries WHERE task_id IS NULL`
  );

  if (unassigned.length === 0) {
    return { tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0, tasksUpdated: 0 };
  }

  const { rows: tasks } = await client.query(`SELECT id, project_id, name FROM tasks`);
  const { rows: units } = await client.query(`SELECT id, project_id, name FROM units`);

  const tasksByProject = new Map();
  for (const t of tasks) {
    if (!t.project_id || !t.name) continue;
    const list = tasksByProject.get(t.project_id) || [];
    list.push(t);
    tasksByProject.set(t.project_id, list);
  }
  const unitsByProject = new Map();
  for (const u of units) {
    if (!u.project_id || !u.name) continue;
    const list = unitsByProject.get(u.project_id) || [];
    list.push(u);
    unitsByProject.set(u.project_id, list);
  }

  const normalize = (s) => (s ?? '').toString().trim().toLowerCase();
  const hoursToUpdate = [];

  for (const h of unassigned) {
    if (!h.project_id) continue;
    const description = normalize(h.description || '');
    const projectTasks = tasksByProject.get(h.project_id) || [];
    let matched = false;
    for (const task of projectTasks) {
      const taskName = normalize(task.name);
      if (taskName && description.includes(taskName)) {
        hoursToUpdate.push({ id: h.id, task_id: task.id });
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const projectUnits = unitsByProject.get(h.project_id) || [];
    for (const unit of projectUnits) {
      const unitName = normalize(unit.name);
      if (unitName && description.includes(unitName)) {
        hoursToUpdate.push({ id: h.id, task_id: unit.id });
        break;
      }
    }
  }

  let tasksMatched = 0;
  let unitsMatched = 0;
  for (const u of hoursToUpdate) {
    const isUnit = units.some(un => un.id === u.task_id);
    if (isUnit) unitsMatched++; else tasksMatched++;
  }

  const BATCH = 100;
  for (let i = 0; i < hoursToUpdate.length; i += BATCH) {
    const batch = hoursToUpdate.slice(i, i + BATCH);
    for (const { id, task_id } of batch) {
      await client.query('UPDATE hour_entries SET task_id = $1 WHERE id = $2', [task_id, id]);
    }
  }

  const { rows: matchedHours } = await client.query(
    `SELECT task_id, SUM(hours) AS total_hours, SUM(COALESCE(actual_cost, reported_standard_cost_amt, 0)) AS total_cost FROM hour_entries WHERE task_id IS NOT NULL GROUP BY task_id`
  );

  let tasksUpdated = 0;
  for (const row of matchedHours) {
    const { rows: up } = await client.query(
      'UPDATE tasks SET actual_hours = $1, actual_cost = $2 WHERE id = $3',
      [Number(row.total_hours), Number(row.total_cost), row.task_id]
    );
    if (up) tasksUpdated++;
  }
  tasksUpdated = matchedHours.length;

  return {
    tasksMatched,
    unitsMatched,
    stillUnmatched: unassigned.length - hoursToUpdate.length,
    tasksUpdated,
  };
}

module.exports = { runMatchingAndAggregation };
