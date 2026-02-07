/**
 * @fileoverview Hours-to-Tasks Matching API
 * 
 * Matches unassigned hour_entries to tasks/units based on description matching.
 * Uses PostgreSQL (primary) or Supabase (fallback).
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
  const PAGE = 5000;

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
  const tasksRes = await pgQuery('SELECT id, project_id, name FROM tasks');
  const unitsRes = await pgQuery('SELECT id, project_id, name FROM units');
  const tasks = tasksRes.rows;
  const units = unitsRes.rows;

  // Group by project
  const tasksByProject = new Map<string, any[]>();
  tasks.forEach((t: any) => {
    if (!t.project_id || !t.name) return;
    const arr = tasksByProject.get(t.project_id) || [];
    arr.push(t);
    tasksByProject.set(t.project_id, arr);
  });

  const unitsByProject = new Map<string, any[]>();
  units.forEach((u: any) => {
    if (!u.project_id || !u.name) return;
    const arr = unitsByProject.get(u.project_id) || [];
    arr.push(u);
    unitsByProject.set(u.project_id, arr);
  });

  const normalize = (s: string) => (s ?? '').toString().trim().toLowerCase();
  let tasksMatched = 0;
  let unitsMatched = 0;
  const updates: { id: string; task_id: string }[] = [];

  for (const h of unassignedHours) {
    if (!h.project_id) continue;
    const desc = normalize(h.description || '');
    const chargeCode = normalize(h.charge_code || '');
    const searchStr = chargeCode || desc;
    if (!searchStr) continue;

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

    if (!matched) {
      // Fallback: match units
      const projectUnits = unitsByProject.get(h.project_id) || [];
      for (const unit of projectUnits) {
        const unitName = normalize(unit.name);
        if (unitName && (desc.includes(unitName) || (chargeCode && chargeCode.includes(unitName)))) {
          updates.push({ id: h.id, task_id: unit.id });
          unitsMatched++;
          break;
        }
      }
    }
  }

  // Batch update hour_entries
  for (const u of updates) {
    await pgQuery('UPDATE hour_entries SET task_id = $1 WHERE id = $2', [u.task_id, u.id]);
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
    unitsMatched,
    stillUnmatched: unassignedHours.length - tasksMatched - unitsMatched,
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
    const { data, error } = await supabase.from('hour_entries').select('id, project_id, description')
      .is('task_id', null).range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }

  if (all.length === 0) {
    return NextResponse.json({ success: true, tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0, aggregated: 0 });
  }

  const { data: tasks } = await supabase.from('tasks').select('id, project_id, name');
  const { data: units } = await supabase.from('units').select('id, project_id, name');

  const tasksByProject = new Map<string, any[]>();
  (tasks || []).forEach((t: any) => {
    if (!t.project_id || !t.name) return;
    const arr = tasksByProject.get(t.project_id) || [];
    arr.push(t);
    tasksByProject.set(t.project_id, arr);
  });

  const normalize = (s: string) => (s ?? '').toString().trim().toLowerCase();
  let tasksMatched = 0, unitsMatched = 0;
  const updates: { id: string; task_id: string }[] = [];

  for (const h of all) {
    if (!h.project_id) continue;
    const desc = normalize(h.description || '');
    if (!desc) continue;
    let matched = false;
    for (const task of (tasksByProject.get(h.project_id) || [])) {
      if (normalize(task.name) && desc.includes(normalize(task.name))) {
        updates.push({ id: h.id, task_id: task.id });
        tasksMatched++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const projectUnits = (units || []).filter((u: any) => u.project_id === h.project_id);
      for (const unit of projectUnits) {
        if (normalize(unit.name) && desc.includes(normalize(unit.name))) {
          updates.push({ id: h.id, task_id: unit.id });
          unitsMatched++;
          break;
        }
      }
    }
  }

  for (const u of updates) {
    await supabase.from('hour_entries').update({ task_id: u.task_id }).eq('id', u.id);
  }

  return NextResponse.json({
    success: true,
    tasksMatched,
    unitsMatched,
    stillUnmatched: all.length - tasksMatched - unitsMatched,
    aggregated: 0,
  });
}
