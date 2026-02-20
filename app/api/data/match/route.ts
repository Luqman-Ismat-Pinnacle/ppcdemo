/**
 * @fileoverview Hours-to-Tasks Matching API
 *
 * Matching: same project_id; hour's charge code must contain task name and phase name.
 */

import { NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    if (isPostgresConfigured()) {
      return await matchWithPostgres();
    }

    // Supabase fallback
    return await matchWithSupabase();
  } catch (error: any) {
    console.error('[Matching] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

async function matchWithPostgres() {
  // Fetch unassigned hours
  let unassignedHours: any[] = [];
  try {
    const res = await pgQuery('SELECT id, project_id, COALESCE(charge_code, charge_code_v2, \'\') AS charge_code FROM hour_entries WHERE task_id IS NULL');
    unassignedHours = res.rows;
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }

  if (unassignedHours.length === 0) {
    return NextResponse.json({ success: true, tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0, aggregated: 0 });
  }

  // Fetch tasks with phase names (join phases for phase name)
  const tasksRes = await pgQuery(`
    SELECT t.id, t.project_id, t.name, COALESCE(p.name, '') AS phase_name
    FROM tasks t
    LEFT JOIN phases p ON t.phase_id = p.id
    WHERE t.project_id IS NOT NULL AND t.name IS NOT NULL
  `);
  const tasks = tasksRes.rows;

  const validTaskIds = new Set<string>(tasks.map((t: any) => t.id));
  const normalize = (s: string) => (s ?? '').toString().trim().toLowerCase();

  let tasksMatched = 0;
  let skippedInvalidFK = 0;
  const updates: { id: string; task_id: string }[] = [];

  for (const h of unassignedHours) {
    if (!h.project_id) continue;
    const chargeCode = normalize(h.charge_code || '');
    if (!chargeCode) continue;

    const projectTasks = tasks.filter((t: any) => String(t.project_id) === String(h.project_id));

    for (const task of projectTasks) {
      const taskName = normalize(task.name || '');
      const phaseName = normalize(task.phase_name || '');
      if (!taskName) continue;

      const taskInChargeCode = chargeCode.includes(taskName);
      const phaseInChargeCode = !phaseName || chargeCode.includes(phaseName);
      if (taskInChargeCode && phaseInChargeCode) {
        updates.push({ id: h.id, task_id: task.id });
        tasksMatched++;
        break;
      }
    }
  }

  // Batch update hour_entries — only with validated task IDs
  for (const u of updates) {
    if (!validTaskIds.has(u.task_id)) {
      skippedInvalidFK++;
      continue;
    }
    try {
      await pgQuery('UPDATE hour_entries SET task_id = $1 WHERE id = $2', [u.task_id, u.id]);
    } catch (e: any) {
      console.warn(`[Matching] Skipped task_id=${u.task_id} for hour ${u.id}: ${e.message}`);
      skippedInvalidFK++;
    }
  }

  // Aggregate actual hours/cost to tasks
  const aggRes = await pgQuery(`
    SELECT task_id, SUM(COALESCE(hours, 0)) as total_hours, 
           SUM(COALESCE(actual_cost, reported_standard_cost_amt, 0)) as total_cost
    FROM hour_entries WHERE task_id IS NOT NULL
    GROUP BY task_id
  `);

  let aggregated = 0;
  for (const row of aggRes.rows) {
    await pgQuery('UPDATE tasks SET actual_hours = $1, actual_cost = $2 WHERE id = $3',
      [row.total_hours, row.total_cost, row.task_id]);
    aggregated++;
  }

  return NextResponse.json({
    success: true,
    tasksMatched,
    unitsMatched: 0,
    skippedInvalidFK,
    stillUnmatched: unassignedHours.length - tasksMatched,
    aggregated,
  });
}

async function matchWithSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  const PAGE = 1000;
  const all: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('hour_entries').select('id, project_id, charge_code, charge_code_v2')
      .is('task_id', null).range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  if (all.length === 0) {
    return NextResponse.json({ success: true, tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0, aggregated: 0 });
  }

  const { data: tasks } = await supabase.from('tasks').select('id, project_id, name, phase_id');
  const { data: phases } = await supabase.from('phases').select('id, name');
  const phaseIdToName = new Map<string, string>();
  (phases || []).forEach((p: any) => {
    if (p.id) phaseIdToName.set(String(p.id), (p.name || '').toString().trim());
  });

  const tasksWithPhase = (tasks || []).map((t: any) => ({
    ...t,
    phase_name: (t.phase_id ? phaseIdToName.get(String(t.phase_id)) : null) || '',
  }));

  const validTaskIds = new Set<string>(tasksWithPhase.map((t: any) => t.id));
  const normalize = (s: string) => (s ?? '').toString().trim().toLowerCase();

  let tasksMatched = 0;
  const updates: { id: string; task_id: string }[] = [];

  for (const h of all) {
    if (!h.project_id) continue;
    const chargeCode = normalize((h.charge_code ?? h.charge_code_v2 ?? '').toString());
    if (!chargeCode) continue;

    const projectTasks = tasksWithPhase.filter((t: any) => String(t.project_id) === String(h.project_id));
    for (const task of projectTasks) {
      const taskName = normalize(task.name || '');
      const phaseName = normalize(task.phase_name || '');
      if (!taskName) continue;

      const taskInChargeCode = chargeCode.includes(taskName);
      const phaseInChargeCode = !phaseName || chargeCode.includes(phaseName);
      if (taskInChargeCode && phaseInChargeCode) {
        updates.push({ id: h.id, task_id: task.id });
        tasksMatched++;
        break;
      }
    }
  }

  for (const u of updates) {
    if (!validTaskIds.has(u.task_id)) continue;
    await supabase.from('hour_entries').update({ task_id: u.task_id }).eq('id', u.id);
  }

  return NextResponse.json({
    success: true,
    tasksMatched,
    unitsMatched: 0,
    stillUnmatched: all.length - tasksMatched,
    aggregated: 0,
  });
}
