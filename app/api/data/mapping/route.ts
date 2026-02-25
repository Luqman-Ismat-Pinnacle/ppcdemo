/**
 * Mapping API: assign hour entry to task, or assign task to workday phase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';
import { parseHourDescription } from '@/lib/hours-description';
let postgresMappingColumnsEnsured = false;

function normalizeText(input: string | null | undefined): string {
  return (input || '')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i += 1) matrix[i] = [i];
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a: string, b: string): number {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.93;
  const maxLen = Math.max(x.length, y.length);
  return maxLen === 0 ? 0 : 1 - (levenshtein(x, y) / maxLen);
}

async function ensurePostgresMappingColumns(): Promise<void> {
  if (postgresMappingColumnsEnsured) return;
  await pgQuery(`
    ALTER TABLE hour_entries
    ADD COLUMN IF NOT EXISTS workday_phase_id VARCHAR(50),
    ADD COLUMN IF NOT EXISTS phases VARCHAR(255),
    ADD COLUMN IF NOT EXISTS charge_code VARCHAR(255),
    ADD COLUMN IF NOT EXISTS charge_code_v2 VARCHAR(500),
    ADD COLUMN IF NOT EXISTS task TEXT
  `);
  await pgQuery(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS wd_charge_code VARCHAR(255)`);
  await pgQuery(`ALTER TABLE units ADD COLUMN IF NOT EXISTS workday_phase_id VARCHAR(50)`);
  await pgQuery(`ALTER TABLE phases ADD COLUMN IF NOT EXISTS workday_phase_id VARCHAR(50)`);
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_hour_entries_workday_phase_id ON hour_entries(workday_phase_id)`);
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_units_workday_phase_id ON units(workday_phase_id)`);
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_phases_workday_phase_id ON phases(workday_phase_id)`);
  postgresMappingColumnsEnsured = true;
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (isPostgresConfigured()) {
      await ensurePostgresMappingColumns();
    }
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'assignHourToTask') {
      const hourId = body.hourId as string;
      const taskId = body.taskId as string | null;
      if (!hourId) {
        return NextResponse.json({ success: false, error: 'hourId required' }, { status: 400 });
      }
      if (isPostgresConfigured()) {
        await pgQuery('UPDATE hour_entries SET task_id = $1, updated_at = NOW() WHERE id = $2', [taskId || null, hourId]);
        return NextResponse.json({ success: true, hourId, taskId: taskId || null });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('hour_entries').update({ task_id: taskId || null }).eq('id', hourId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, hourId, taskId: taskId || null });
    }

    if (action === 'assignTaskToWorkdayPhase') {
      const taskId = body.taskId as string;
      const workdayPhaseId = body.workdayPhaseId as string | null;
      if (!taskId) {
        return NextResponse.json({ success: false, error: 'taskId required' }, { status: 400 });
      }
      if (isPostgresConfigured()) {
        await pgQuery('UPDATE tasks SET workday_phase_id = $1, updated_at = NOW() WHERE id = $2', [workdayPhaseId || null, taskId]);
        return NextResponse.json({ success: true, taskId, workdayPhaseId: workdayPhaseId || null });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('tasks').update({ workday_phase_id: workdayPhaseId || null }).eq('id', taskId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, taskId, workdayPhaseId: workdayPhaseId || null });
    }

    if (action === 'assignEntityToWorkdayPhase') {
      const entityType = body.entityType as 'units' | 'phases' | 'tasks';
      const entityId = body.entityId as string;
      const workdayPhaseId = body.workdayPhaseId as string | null;
      if (!entityType || !entityId || !['units', 'phases', 'tasks'].includes(entityType)) {
        return NextResponse.json({ success: false, error: 'entityType (units|phases|tasks) and entityId required' }, { status: 400 });
      }
      if (isPostgresConfigured()) {
        await pgQuery(`UPDATE ${entityType} SET workday_phase_id = $1, updated_at = NOW() WHERE id = $2`, [workdayPhaseId || null, entityId]);
        return NextResponse.json({ success: true, entityType, entityId, workdayPhaseId: workdayPhaseId || null });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from(entityType).update({ workday_phase_id: workdayPhaseId || null }).eq('id', entityId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, entityType, entityId, workdayPhaseId: workdayPhaseId || null });
    }

    if (action === 'assignHourToWorkdayPhase') {
      const hourId = body.hourId as string;
      const workdayPhaseId = body.workdayPhaseId as string | null;
      if (!hourId) {
        return NextResponse.json({ success: false, error: 'hourId required' }, { status: 400 });
      }
      if (isPostgresConfigured()) {
        await pgQuery('UPDATE hour_entries SET workday_phase_id = $1, updated_at = NOW() WHERE id = $2', [workdayPhaseId || null, hourId]);
        return NextResponse.json({ success: true, hourId, workdayPhaseId: workdayPhaseId || null });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('hour_entries').update({ workday_phase_id: workdayPhaseId || null }).eq('id', hourId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, hourId, workdayPhaseId: workdayPhaseId || null });
    }

    if (action === 'matchWorkdayPhaseToHoursPhases') {
      const projectId = body.projectId as string;
      const rematchAll = Boolean(body.rematchAll);
      if (!projectId) {
        return NextResponse.json({ success: false, error: 'projectId required' }, { status: 400 });
      }

      if (isPostgresConfigured()) {
        if (rematchAll) {
          await pgQuery(
            `UPDATE hour_entries
             SET workday_phase_id = NULL, updated_at = NOW()
             WHERE project_id = $1`,
            [projectId],
          );
        }
        const hoursRes = await pgQuery(
          `SELECT id, COALESCE(phases, '') AS phases, COALESCE(description, '') AS description
           FROM hour_entries
           WHERE project_id = $1 AND workday_phase_id IS NULL`,
          [projectId]
        );
        const phasesRes = await pgQuery(
          `SELECT id, COALESCE(name, '') AS name, COALESCE(unit, '') AS unit
           FROM workday_phases
           WHERE project_id = $1`,
          [projectId]
        );

        const hours = hoursRes.rows || [];
        const workdayPhases = phasesRes.rows || [];
        let matched = 0;
        const updates: Array<{ hourId: string; workdayPhaseId: string }> = [];

        for (const h of hours) {
          const source = String(h.phases || parseHourDescription(String(h.description || '')).phases || '').trim();
          if (!source) continue;

          const exact = workdayPhases.find((wp) => normalizeText(source) === normalizeText(String(wp.name || '')));
          if (exact) {
            updates.push({ hourId: String(h.id), workdayPhaseId: String(exact.id) });
            matched += 1;
          }
        }

        for (const u of updates) {
          await pgQuery('UPDATE hour_entries SET workday_phase_id = $1, updated_at = NOW() WHERE id = $2', [u.workdayPhaseId, u.hourId]);
        }

        return NextResponse.json({
          success: true,
          projectId,
          matched,
          unmatched: Math.max(hours.length - matched, 0),
          considered: hours.length,
        });
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);

      if (rematchAll) {
        await supabase.from('hour_entries').update({ workday_phase_id: null }).eq('project_id', projectId);
      }

      const { data: hours, error: hoursErr } = await supabase
        .from('hour_entries')
        .select('id, phases, description')
        .eq('project_id', projectId)
        .is('workday_phase_id', null);
      if (hoursErr) return NextResponse.json({ success: false, error: hoursErr.message }, { status: 500 });

      const { data: workdayPhases, error: phasesErr } = await supabase
        .from('workday_phases')
        .select('id, name, unit')
        .eq('project_id', projectId);
      if (phasesErr) return NextResponse.json({ success: false, error: phasesErr.message }, { status: 500 });

      let matched = 0;
      const updates: Array<{ hourId: string; workdayPhaseId: string }> = [];
      for (const h of hours || []) {
        const source = String(h.phases || parseHourDescription(String(h.description || '')).phases || '').trim();
        if (!source) continue;

        const exact = (workdayPhases || []).find((wp) => normalizeText(source) === normalizeText(String(wp.name || '')));
        if (exact) {
          updates.push({ hourId: String(h.id), workdayPhaseId: String(exact.id) });
          matched += 1;
        }
      }

      for (const u of updates) {
        await supabase.from('hour_entries').update({ workday_phase_id: u.workdayPhaseId }).eq('id', u.hourId);
      }

      return NextResponse.json({
        success: true,
        projectId,
        matched,
        unmatched: Math.max((hours || []).length - matched, 0),
        considered: (hours || []).length,
      });
    }

    if (action === 'autoMatchHoursToTasksInWorkdayPhaseBucket') {
      const projectId = body.projectId as string;
      const workdayPhaseId = body.workdayPhaseId as string;
      if (!projectId || !workdayPhaseId) {
        return NextResponse.json({ success: false, error: 'projectId and workdayPhaseId required' }, { status: 400 });
      }

      if (isPostgresConfigured()) {
        const hoursRes = await pgQuery(
          `SELECT id, COALESCE(task, '') AS task_text, COALESCE(description, '') AS description
           FROM hour_entries
           WHERE project_id = $1 AND workday_phase_id = $2`,
          [projectId, workdayPhaseId],
        );
        const tasksRes = await pgQuery(
          `SELECT id, COALESCE(name, '') AS name, COALESCE(task_name, '') AS task_name
           FROM tasks
           WHERE project_id = $1 AND workday_phase_id = $2`,
          [projectId, workdayPhaseId],
        );
        const hours = hoursRes.rows || [];
        const tasks = tasksRes.rows || [];
        let matched = 0;
        let unmatched = 0;
        let fuzzyMatched = 0;
        for (const h of hours) {
          const source = String(h.task_text || parseHourDescription(String(h.description || '')).task || '').trim();
          if (!source) {
            unmatched += 1;
            continue;
          }
          const exact = tasks.find((t) =>
            normalizeText(source) === normalizeText(String(t.name || t.task_name || ''))
          );
          if (exact) {
            await pgQuery('UPDATE hour_entries SET task_id = $1, updated_at = NOW() WHERE id = $2', [exact.id, h.id]);
            matched += 1;
            continue;
          }
          const ranked = tasks
            .map((t) => ({ taskId: String(t.id), score: similarity(source, String(t.name || t.task_name || '')) }))
            .sort((a, b) => b.score - a.score);
          if (ranked[0] && ranked[0].score >= 0.88) {
            await pgQuery('UPDATE hour_entries SET task_id = $1, updated_at = NOW() WHERE id = $2', [ranked[0].taskId, h.id]);
            matched += 1;
            fuzzyMatched += 1;
          } else {
            unmatched += 1;
          }
        }
        return NextResponse.json({ success: true, projectId, workdayPhaseId, matched, unmatched, considered: hours.length, fuzzyMatched });
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: hours, error: hErr } = await supabase
        .from('hour_entries')
        .select('id, task, description')
        .eq('project_id', projectId)
        .eq('workday_phase_id', workdayPhaseId);
      if (hErr) return NextResponse.json({ success: false, error: hErr.message }, { status: 500 });
      const { data: tasks, error: tErr } = await supabase
        .from('tasks')
        .select('id, name, task_name')
        .eq('project_id', projectId)
        .eq('workday_phase_id', workdayPhaseId);
      if (tErr) return NextResponse.json({ success: false, error: tErr.message }, { status: 500 });

      let matched = 0;
      let unmatched = 0;
      let fuzzyMatched = 0;
      for (const h of hours || []) {
        const source = String(h.task || parseHourDescription(String(h.description || '')).task || '').trim();
        if (!source) {
          unmatched += 1;
          continue;
        }
        const exact = (tasks || []).find((t) => normalizeText(source) === normalizeText(String(t.name || t.task_name || '')));
        if (exact) {
          await supabase.from('hour_entries').update({ task_id: exact.id }).eq('id', h.id);
          matched += 1;
          continue;
        }
        const ranked = (tasks || [])
          .map((t) => ({ taskId: String(t.id), score: similarity(source, String(t.name || t.task_name || '')) }))
          .sort((a, b) => b.score - a.score);
        if (ranked[0] && ranked[0].score >= 0.88) {
          await supabase.from('hour_entries').update({ task_id: ranked[0].taskId }).eq('id', h.id);
          matched += 1;
          fuzzyMatched += 1;
        } else {
          unmatched += 1;
        }
      }
      return NextResponse.json({ success: true, projectId, workdayPhaseId, matched, unmatched, considered: (hours || []).length, fuzzyMatched });
    }

    if (action === 'bulkAssignHoursToTasks') {
      const pairs = Array.isArray(body.pairs) ? body.pairs : [];
      if (!pairs.length) {
        return NextResponse.json({ success: true, updated: 0 });
      }
      if (isPostgresConfigured()) {
        for (const pair of pairs) {
          const hourId = String(pair.hourId || '');
          const taskId = pair.taskId ? String(pair.taskId) : null;
          if (!hourId) continue;
          await pgQuery('UPDATE hour_entries SET task_id = $1, updated_at = NOW() WHERE id = $2', [taskId, hourId]);
        }
        return NextResponse.json({ success: true, updated: pairs.length });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      for (const pair of pairs) {
        const hourId = String(pair.hourId || '');
        const taskId = pair.taskId ? String(pair.taskId) : null;
        if (!hourId) continue;
        await supabase.from('hour_entries').update({ task_id: taskId }).eq('id', hourId);
      }
      return NextResponse.json({ success: true, updated: pairs.length });
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    console.error('[Mapping] Error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
