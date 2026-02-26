/**
 * Mapping API: assign hour entry to task, or assign task to workday phase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';
import { parseHourDescription } from '@/lib/hours-description';
import { emitAlertEvent, ensurePhase6Tables } from '@/lib/phase6-data';
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
      await ensurePhase6Tables({ query: pgQuery } as { query: typeof pgQuery });
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

    if (action === 'generateMappingSuggestions') {
      if (!isPostgresConfigured()) {
        return NextResponse.json({ success: false, error: 'PostgreSQL required for mapping suggestions' }, { status: 501 });
      }
      const projectId = String(body.projectId || '');
      const workdayPhaseId = body.workdayPhaseId ? String(body.workdayPhaseId) : null;
      const minConfidence = Math.min(0.99, Math.max(0.5, Number(body.minConfidence ?? 0.78)));
      const limit = Math.min(500, Math.max(1, Number(body.limit ?? 200)));
      if (!projectId) {
        return NextResponse.json({ success: false, error: 'projectId required' }, { status: 400 });
      }

      const hourParams: unknown[] = [projectId];
      const hourWhere = workdayPhaseId
        ? `WHERE project_id = $1 AND task_id IS NULL AND workday_phase_id = $2`
        : `WHERE project_id = $1 AND task_id IS NULL`;
      if (workdayPhaseId) hourParams.push(workdayPhaseId);

      const hoursRes = await pgQuery(
        `SELECT id, COALESCE(task, '') AS task_text, COALESCE(description, '') AS description,
                COALESCE(phases, '') AS phases, workday_phase_id
         FROM hour_entries
         ${hourWhere}
         ORDER BY updated_at DESC NULLS LAST, id DESC
         LIMIT $${hourParams.length + 1}`,
        [...hourParams, limit],
      );

      const taskParams: unknown[] = [projectId];
      const taskWhere = workdayPhaseId
        ? `WHERE project_id = $1 AND workday_phase_id = $2`
        : `WHERE project_id = $1`;
      if (workdayPhaseId) taskParams.push(workdayPhaseId);
      const tasksRes = await pgQuery(
        `SELECT id, COALESCE(name, '') AS name, COALESCE(task_name, '') AS task_name, workday_phase_id
         FROM tasks
         ${taskWhere}`,
        taskParams,
      );

      let created = 0;
      for (const h of hoursRes.rows || []) {
        const source = String(h.task_text || parseHourDescription(String(h.description || '')).task || '').trim();
        if (!source) continue;

        const ranked = (tasksRes.rows || [])
          .map((t) => ({
            taskId: String(t.id),
            taskName: String(t.name || t.task_name || t.id),
            score: similarity(source, String(t.name || t.task_name || '')),
          }))
          .sort((a, b) => b.score - a.score);

        const top = ranked[0];
        if (!top || top.score < minConfidence) continue;

        const insertRes = await pgQuery(
          `INSERT INTO mapping_suggestions (
             project_id, workday_phase_id, hour_entry_id, task_id, suggestion_type,
             confidence, reason, source_value, target_value, status, metadata
           )
           SELECT $1, $2, $3, $4, 'hour_to_task', $5, $6, $7, $8, 'pending', $9::jsonb
           WHERE NOT EXISTS (
             SELECT 1 FROM mapping_suggestions
             WHERE status = 'pending'
               AND suggestion_type = 'hour_to_task'
               AND hour_entry_id = $3
           )`,
          [
            projectId,
            h.workday_phase_id ?? null,
            String(h.id),
            top.taskId,
            Number(top.score.toFixed(4)),
            `Matched hour entry task text to task name with confidence ${(top.score * 100).toFixed(1)}%`,
            source,
            top.taskName,
            JSON.stringify({ algorithm: 'levenshtein_similarity_v1' }),
          ],
        );
        if (insertRes.rowCount && insertRes.rowCount > 0) created += 1;
      }

      await emitAlertEvent({ query: pgQuery } as { query: typeof pgQuery }, {
        eventType: 'mapping_suggestions.generated',
        severity: created > 0 ? 'info' : 'warning',
        title: 'Mapping Suggestions Generated',
        message: created > 0
          ? `${created} mapping suggestion(s) generated for project ${projectId}.`
          : `No mapping suggestions generated for project ${projectId}.`,
        source: 'api/data/mapping',
        entityType: 'project',
        entityId: projectId,
        relatedProjectId: projectId,
        metadata: { projectId, workdayPhaseId, minConfidence, limit, created },
      });

      return NextResponse.json({ success: true, created });
    }

    if (action === 'listMappingSuggestions') {
      if (!isPostgresConfigured()) {
        return NextResponse.json({ success: false, error: 'PostgreSQL required for mapping suggestions' }, { status: 501 });
      }
      const projectId = String(body.projectId || '');
      const status = String(body.status || 'pending');
      const limit = Math.min(500, Math.max(1, Number(body.limit ?? 200)));
      if (!projectId) {
        return NextResponse.json({ success: false, error: 'projectId required' }, { status: 400 });
      }
      const result = await pgQuery(
        `SELECT
           ms.id,
           ms.project_id AS "projectId",
           ms.workday_phase_id AS "workdayPhaseId",
           ms.hour_entry_id AS "hourEntryId",
           ms.task_id AS "taskId",
           ms.suggestion_type AS "suggestionType",
           ms.confidence,
           ms.reason,
           ms.source_value AS "sourceValue",
           ms.target_value AS "targetValue",
           ms.status,
           ms.metadata,
           ms.created_at AS "createdAt",
           he.description AS "hourDescription",
           he.date AS "hourDate",
           t.name AS "taskName",
           t.task_name AS "taskNameAlt"
         FROM mapping_suggestions ms
         LEFT JOIN hour_entries he ON he.id = ms.hour_entry_id
         LEFT JOIN tasks t ON t.id = ms.task_id
         WHERE ms.project_id = $1 AND ms.status = $2
         ORDER BY ms.confidence DESC, ms.created_at DESC
         LIMIT $3`,
        [projectId, status, limit],
      );
      return NextResponse.json({ success: true, suggestions: result.rows });
    }

    if (action === 'applyMappingSuggestion') {
      if (!isPostgresConfigured()) {
        return NextResponse.json({ success: false, error: 'PostgreSQL required for mapping suggestions' }, { status: 501 });
      }
      const suggestionId = Number(body.suggestionId || 0);
      if (!suggestionId) {
        return NextResponse.json({ success: false, error: 'suggestionId required' }, { status: 400 });
      }

      const suggestionRes = await pgQuery(
        `SELECT id, project_id, hour_entry_id, task_id, confidence, status
         FROM mapping_suggestions
         WHERE id = $1
         LIMIT 1`,
        [suggestionId],
      );
      const suggestion = suggestionRes.rows[0] as {
        id: number;
        project_id: string;
        hour_entry_id: string;
        task_id: string;
        confidence: number;
        status: string;
      } | undefined;

      if (!suggestion) {
        return NextResponse.json({ success: false, error: 'Suggestion not found' }, { status: 404 });
      }
      if (suggestion.status !== 'pending') {
        return NextResponse.json({ success: false, error: 'Suggestion is not pending' }, { status: 400 });
      }

      const hourUpdate = await pgQuery(
        `UPDATE hour_entries
         SET task_id = $1, updated_at = NOW()
         WHERE id = $2
           AND (task_id IS NULL OR task_id = '')`,
        [suggestion.task_id, suggestion.hour_entry_id],
      );
      const applied = Boolean(hourUpdate.rowCount && hourUpdate.rowCount > 0);
      await pgQuery(
        `UPDATE mapping_suggestions
         SET status = $2,
             applied_at = CASE WHEN $2 = 'applied' THEN NOW() ELSE applied_at END,
             dismissed_at = CASE WHEN $2 = 'dismissed' THEN NOW() ELSE dismissed_at END
         WHERE id = $1`,
        [suggestion.id, applied ? 'applied' : 'dismissed'],
      );

      await emitAlertEvent({ query: pgQuery } as { query: typeof pgQuery }, {
        eventType: applied ? 'mapping_suggestion.applied' : 'mapping_suggestion.skipped',
        severity: applied ? 'info' : 'warning',
        title: applied ? 'Mapping Suggestion Applied' : 'Mapping Suggestion Skipped',
        message: applied
          ? `Applied suggestion #${suggestion.id} for project ${suggestion.project_id}.`
          : `Skipped suggestion #${suggestion.id} because the hour entry already has a task mapping.`,
        source: 'api/data/mapping',
        entityType: 'project',
        entityId: suggestion.project_id,
        relatedProjectId: suggestion.project_id,
        relatedTaskId: suggestion.task_id,
        metadata: {
          suggestionId: suggestion.id,
          hourEntryId: suggestion.hour_entry_id,
          taskId: suggestion.task_id,
          confidence: suggestion.confidence,
          applied,
        },
      });

      return NextResponse.json({ success: true, applied });
    }

    if (action === 'dismissMappingSuggestion') {
      if (!isPostgresConfigured()) {
        return NextResponse.json({ success: false, error: 'PostgreSQL required for mapping suggestions' }, { status: 501 });
      }
      const suggestionId = Number(body.suggestionId || 0);
      if (!suggestionId) {
        return NextResponse.json({ success: false, error: 'suggestionId required' }, { status: 400 });
      }
      await pgQuery(
        `UPDATE mapping_suggestions
         SET status = 'dismissed', dismissed_at = NOW()
         WHERE id = $1`,
        [suggestionId],
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'applyMappingSuggestionsBatch') {
      if (!isPostgresConfigured()) {
        return NextResponse.json({ success: false, error: 'PostgreSQL required for mapping suggestions' }, { status: 501 });
      }
      const projectId = String(body.projectId || '');
      const minConfidence = Math.min(0.99, Math.max(0.5, Number(body.minConfidence ?? 0.9)));
      const limit = Math.min(500, Math.max(1, Number(body.limit ?? 50)));
      if (!projectId) {
        return NextResponse.json({ success: false, error: 'projectId required' }, { status: 400 });
      }

      const pending = await pgQuery(
        `SELECT id, hour_entry_id, task_id, confidence
         FROM mapping_suggestions
         WHERE project_id = $1
           AND status = 'pending'
           AND confidence >= $2
         ORDER BY confidence DESC, created_at DESC
         LIMIT $3`,
        [projectId, minConfidence, limit],
      );

      let applied = 0;
      let skipped = 0;
      for (const row of pending.rows as Array<{ id: number; hour_entry_id: string; task_id: string; confidence: number }>) {
        const hourUpdate = await pgQuery(
          `UPDATE hour_entries
           SET task_id = $1, updated_at = NOW()
           WHERE id = $2
             AND (task_id IS NULL OR task_id = '')`,
          [row.task_id, row.hour_entry_id],
        );
        const rowApplied = Boolean(hourUpdate.rowCount && hourUpdate.rowCount > 0);
        if (rowApplied) {
          await pgQuery(
            `UPDATE mapping_suggestions SET status = 'applied', applied_at = NOW() WHERE id = $1`,
            [row.id],
          );
          applied += 1;
        } else {
          await pgQuery(
            `UPDATE mapping_suggestions SET status = 'dismissed', dismissed_at = NOW() WHERE id = $1`,
            [row.id],
          );
          skipped += 1;
        }
      }

      await emitAlertEvent({ query: pgQuery } as { query: typeof pgQuery }, {
        eventType: 'mapping_suggestions.batch_applied',
        severity: applied > 0 ? 'info' : 'warning',
        title: 'Batch Mapping Apply',
        message: applied > 0
          ? `Applied ${applied} mapping suggestions in batch for project ${projectId}.`
          : `No mapping suggestions met batch threshold for project ${projectId}.`,
        source: 'api/data/mapping',
        entityType: 'project',
        entityId: projectId,
        relatedProjectId: projectId,
        metadata: { projectId, minConfidence, limit, applied },
      });

      return NextResponse.json({ success: true, applied, skipped, considered: pending.rowCount || 0 });
    }

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Mapping] Error:', err);
    return NextResponse.json({ success: false, error: message || 'Unknown error' }, { status: 500 });
  }
}
