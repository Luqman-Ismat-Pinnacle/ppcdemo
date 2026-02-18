/**
 * @fileoverview Hours-to-Tasks Matching API
 * 
 * Matches unassigned hour_entries to tasks/units based on description matching.
 * Uses PostgreSQL (primary) or Supabase (fallback).
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
    const res = await pgQuery('SELECT id, project_id, description, workday_phase, workday_task, charge_code FROM hour_entries WHERE task_id IS NULL');
    unassignedHours = res.rows;
  } catch {
    try {
      const res = await pgQuery('SELECT id, project_id, description FROM hour_entries WHERE task_id IS NULL');
      unassignedHours = res.rows;
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }

  if (unassignedHours.length === 0) {
    return NextResponse.json({ success: true, tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0, aggregated: 0 });
  }

  // Fetch tasks and units
  const tasksRes = await pgQuery('SELECT id, task_id, project_id, name FROM tasks');
  const tasks = tasksRes.rows;

  // Group by project
  const tasksByProject = new Map<string, any[]>();
  tasks.forEach((t: any) => {
    if (!t.project_id || !t.name) return;
    const arr = tasksByProject.get(t.project_id) || [];
    arr.push(t);
    tasksByProject.set(t.project_id, arr);
  });

  // Build a set of valid task IDs for FK validation
  const validTaskIds = new Set<string>(tasks.map((t: any) => t.id));

  const normalize = (s: string) => (s ?? '').toString().trim().toLowerCase();
  const normalizeId = (s: string) => (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, '');
  const taskByProjectAndUid = new Map<string, string>();
  tasks.forEach((t: any) => {
    const pid = String(t.project_id || '');
    if (!pid) return;
    const id = String(t.id || '').trim();
    const taskId = String(t.task_id || '').trim();
    if (taskId) taskByProjectAndUid.set(`${pid}|${normalizeId(taskId)}`, id);
    if (id) taskByProjectAndUid.set(`${pid}|${normalizeId(id)}`, id);
  });
  let tasksMatched = 0;
  let skippedInvalidFK = 0;
  const updates: { id: string; task_id: string }[] = [];

  for (const h of unassignedHours) {
    if (!h.project_id) continue;
    const desc = normalize(h.description || '');
    const chargeCode = normalize(h.charge_code || '');
    const searchStr = chargeCode || desc;
    if (!searchStr) continue;
    const workdayTaskRaw = normalizeId(String(h.workday_task || ''));

    // First: direct unique-ID match from project file UID/task_id.
    if (workdayTaskRaw) {
      const direct = taskByProjectAndUid.get(`${h.project_id}|${workdayTaskRaw}`);
      if (direct && validTaskIds.has(direct)) {
        updates.push({ id: h.id, task_id: direct });
        tasksMatched++;
        continue;
      }
      const tokenMatch = workdayTaskRaw.match(/([a-z0-9_.-]{2,})$/i);
      if (tokenMatch) {
        const fromToken = taskByProjectAndUid.get(`${h.project_id}|${normalizeId(tokenMatch[1])}`);
        if (fromToken && validTaskIds.has(fromToken)) {
          updates.push({ id: h.id, task_id: fromToken });
          tasksMatched++;
          continue;
        }
      }
    }

    // Try charge code segments first (split by >)
    const segments = chargeCode ? chargeCode.split('>').map((s: string) => s.trim()).filter(Boolean) : [];

    let matched = false;
    const projectTasks = tasksByProject.get(h.project_id) || [];

    // Match by charge code segments
    for (const seg of segments) {
      for (const task of projectTasks) {
        const taskName = normalize(task.name);
        if (taskName && (seg.includes(taskName) || taskName.includes(seg))) {
          updates.push({ id: h.id, task_id: task.id });
          tasksMatched++;
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched && desc) {
      // Match by description
      for (const task of projectTasks) {
        const taskName = normalize(task.name);
        if (taskName && desc.includes(taskName)) {
          updates.push({ id: h.id, task_id: task.id });
          tasksMatched++;
          matched = true;
          break;
        }
      }
    }

    // NOTE: Unit matching removed — unit IDs are NOT valid for hour_entries.task_id FK
    // (the FK references tasks(id), not units(id))
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

  // Fetch unassigned hours (paginated)
  const PAGE = 1000;
  const all: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('hour_entries').select('id, project_id, description, workday_task')
      .is('task_id', null).range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  if (all.length === 0) {
    return NextResponse.json({ success: true, tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0, aggregated: 0 });
  }

  const { data: tasks } = await supabase.from('tasks').select('id, task_id, project_id, name');
  const tasksByProject = new Map<string, any[]>();
  (tasks || []).forEach((t: any) => {
    if (!t.project_id || !t.name) return;
    const arr = tasksByProject.get(t.project_id) || [];
    arr.push(t);
    tasksByProject.set(t.project_id, arr);
  });

  const validTaskIds = new Set<string>((tasks || []).map((t: any) => t.id));
  const normalize = (s: string) => (s ?? '').toString().trim().toLowerCase();
  const normalizeId = (s: string) => (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, '');
  const taskByProjectAndUid = new Map<string, string>();
  (tasks || []).forEach((t: any) => {
    const pid = String(t.project_id || '');
    if (!pid) return;
    const id = String(t.id || '').trim();
    const taskId = String(t.task_id || '').trim();
    if (taskId) taskByProjectAndUid.set(`${pid}|${normalizeId(taskId)}`, id);
    if (id) taskByProjectAndUid.set(`${pid}|${normalizeId(id)}`, id);
  });
  let tasksMatched = 0;
  const updates: { id: string; task_id: string }[] = [];

  for (const h of all) {
    if (!h.project_id) continue;
    const workdayTaskRaw = normalizeId(String(h.workday_task || ''));
    if (workdayTaskRaw) {
      const direct = taskByProjectAndUid.get(`${h.project_id}|${workdayTaskRaw}`);
      if (direct && validTaskIds.has(direct)) {
        updates.push({ id: h.id, task_id: direct });
        tasksMatched++;
        continue;
      }
    }
    const desc = normalize(h.description || '');
    if (!desc) continue;
    for (const task of (tasksByProject.get(h.project_id) || [])) {
      if (normalize(task.name) && desc.includes(normalize(task.name))) {
        updates.push({ id: h.id, task_id: task.id });
        tasksMatched++;
        break;
      }
    }
    // Unit matching removed — unit IDs violate hour_entries.task_id FK
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
