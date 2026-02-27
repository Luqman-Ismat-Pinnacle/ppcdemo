#!/usr/bin/env node
/**
 * Internal one-off matcher:
 * 1) hour_entries.phases -> workday_phases.name (same project)
 * 2) hour_entries.task -> tasks.name/phases.name (same project, hierarchy-aware)
 * 3) task/phase names -> workday phase names ("bucket" alignment)
 * 4) final fill for missed entries from bucket-constrained candidates
 *
 * Updates hour_entries:
 * - workday_phase_id
 * - workday_phase
 * - mpp_task_phase
 * - mpp_phase_unit
 * - task_id / phase_id (safe-fill only)
 *
 * Usage:
 *   node scripts/match-hours-workday-mpp-buckets.mjs
 *   node scripts/match-hours-workday-mpp-buckets.mjs --project <project_id>
 *   node scripts/match-hours-workday-mpp-buckets.mjs --dry-run
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

const MIN_SCORE_STRICT = 0.72;
const MIN_SCORE_FUZZY = 0.78;

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalize(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(v) {
  return normalize(v).split(' ').filter(Boolean);
}

function similarity(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) {
    const ratio = Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length);
    return Math.max(0.9, ratio);
  }
  const at = new Set(tokenize(aa));
  const bt = new Set(tokenize(bb));
  if (!at.size || !bt.size) return 0;
  let inter = 0;
  for (const t of at) if (bt.has(t)) inter += 1;
  const union = at.size + bt.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  const cover = Math.max(inter / at.size, inter / bt.size);
  return (jaccard * 0.7) + (cover * 0.3);
}

function chooseBest(text, candidates, minScore = MIN_SCORE_FUZZY) {
  const target = normalize(text);
  if (!target) return null;
  let best = null;
  let bestScore = minScore;
  for (const c of candidates) {
    const name = c.normName || normalize(c.name);
    if (!name) continue;
    const score = similarity(target, name);
    if (score > bestScore) {
      bestScore = score;
      best = c;
      if (score >= 0.999) break;
    }
  }
  return best ? { candidate: best, score: bestScore } : null;
}

async function scalar(client, sql, params = []) {
  const { rows } = await client.query(sql, params);
  return Number(rows?.[0] ? Object.values(rows[0])[0] : 0);
}

async function main() {
  loadEnvLocal();
  const dryRun = hasFlag('--dry-run');
  const projectFilter = argValue('--project');
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.AZURE_POSTGRES_CONNECTION_STRING ||
    process.env.POSTGRES_CONNECTION_STRING ||
    process.env.AZURE_DATABASE_URL;

  if (!dbUrl) throw new Error('Missing database connection string env.');

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE hour_entries
        ADD COLUMN IF NOT EXISTS mpp_task_phase TEXT,
        ADD COLUMN IF NOT EXISTS mpp_phase_unit TEXT
    `);

    const whereSql = projectFilter ? 'WHERE h.project_id = $1' : '';
    const params = projectFilter ? [projectFilter] : [];

    const [hoursRes, wpRes, tasksRes, phasesRes, unitsRes] = await Promise.all([
      client.query(
        `SELECT h.id, h.project_id, h.phase_id, h.task_id, h.phases, h.task, h.workday_phase_id, h.workday_phase,
                h.mpp_task_phase, h.mpp_phase_unit
           FROM hour_entries h
           ${whereSql}`,
        params,
      ),
      client.query(
        `SELECT id, project_id, name, unit
           FROM workday_phases
          ${projectFilter ? 'WHERE project_id = $1' : ''}`,
        params,
      ),
      client.query(
        `SELECT id, project_id, phase_id, unit_id, COALESCE(task_name, name, '') AS name, COALESCE(workday_phase_id, '') AS workday_phase_id
           FROM tasks
          ${projectFilter ? 'WHERE project_id = $1' : ''}`,
        params,
      ),
      client.query(
        `SELECT id, project_id, unit_id, COALESCE(name, '') AS name, COALESCE(workday_phase_id, '') AS workday_phase_id
           FROM phases
          ${projectFilter ? 'WHERE project_id = $1' : ''}`,
        params,
      ),
      client.query(
        `SELECT id, project_id, COALESCE(name, '') AS name
           FROM units
          ${projectFilter ? 'WHERE project_id = $1' : ''}`,
        params,
      ),
    ]);

    const unitsById = new Map(unitsRes.rows.map((u) => [String(u.id), String(u.name || '')]));
    const wpsByProject = new Map();
    const tasksByProject = new Map();
    const phasesByProject = new Map();
    const taskById = new Map();
    const phaseById = new Map();

    for (const wp of wpRes.rows) {
      const pid = String(wp.project_id || '');
      if (!wpsByProject.has(pid)) wpsByProject.set(pid, []);
      wpsByProject.get(pid).push({
        id: String(wp.id),
        name: String(wp.name || ''),
        unit: String(wp.unit || ''),
        normName: normalize(wp.name),
      });
    }

    for (const t of tasksRes.rows) {
      const task = {
        id: String(t.id),
        projectId: String(t.project_id || ''),
        phaseId: String(t.phase_id || ''),
        unitId: String(t.unit_id || ''),
        name: String(t.name || ''),
        normName: normalize(t.name),
        workdayPhaseId: String(t.workday_phase_id || '') || null,
      };
      taskById.set(task.id, task);
      if (!tasksByProject.has(task.projectId)) tasksByProject.set(task.projectId, []);
      tasksByProject.get(task.projectId).push(task);
    }

    for (const p of phasesRes.rows) {
      const phase = {
        id: String(p.id),
        projectId: String(p.project_id || ''),
        unitId: String(p.unit_id || ''),
        name: String(p.name || ''),
        normName: normalize(p.name),
        workdayPhaseId: String(p.workday_phase_id || '') || null,
      };
      phaseById.set(phase.id, phase);
      if (!phasesByProject.has(phase.projectId)) phasesByProject.set(phase.projectId, []);
      phasesByProject.get(phase.projectId).push(phase);
    }

    // Infer task/phase -> workday phase buckets by name when direct workday_phase_id is missing.
    for (const [pid, candidates] of tasksByProject.entries()) {
      const wps = wpsByProject.get(pid) || [];
      for (const c of candidates) {
        c.inferredWorkdayPhaseId = c.workdayPhaseId;
        if (!c.inferredWorkdayPhaseId && wps.length > 0) {
          const byTaskName = chooseBest(c.name, wps, MIN_SCORE_STRICT);
          if (byTaskName) c.inferredWorkdayPhaseId = byTaskName.candidate.id;
        }
      }
    }
    for (const [pid, candidates] of phasesByProject.entries()) {
      const wps = wpsByProject.get(pid) || [];
      for (const c of candidates) {
        c.inferredWorkdayPhaseId = c.workdayPhaseId;
        if (!c.inferredWorkdayPhaseId && wps.length > 0) {
          const byPhaseName = chooseBest(c.name, wps, MIN_SCORE_STRICT);
          if (byPhaseName) c.inferredWorkdayPhaseId = byPhaseName.candidate.id;
        }
      }
    }

    const projectMode = new Map();
    const projectIds = new Set([
      ...tasksByProject.keys(),
      ...phasesByProject.keys(),
      ...hoursRes.rows.map((h) => String(h.project_id || '')),
    ]);
    for (const pid of projectIds) {
      const tc = (tasksByProject.get(pid) || []).length;
      const pc = (phasesByProject.get(pid) || []).length;
      projectMode.set(pid, tc > 0 ? (pc > 0 ? 'tasks-first' : 'tasks-only') : 'phases-only');
    }

    const updates = [];
    const stats = {
      total: hoursRes.rowCount || 0,
      gate1: 0,
      gate2: 0,
      gate3: 0,
      gate4: 0,
      withWorkdayPhaseBefore: 0,
      withWorkdayPhaseAfter: 0,
      withTaskMapBefore: 0,
      withTaskMapAfter: 0,
    };

    for (const h of hoursRes.rows) {
      const pid = String(h.project_id || '');
      const workdayCandidates = wpsByProject.get(pid) || [];
      const taskCandidates = tasksByProject.get(pid) || [];
      const phaseCandidates = phasesByProject.get(pid) || [];

      const next = {
        workday_phase_id: h.workday_phase_id ? String(h.workday_phase_id) : null,
        workday_phase: h.workday_phase ? String(h.workday_phase) : null,
        mpp_task_phase: h.mpp_task_phase ? String(h.mpp_task_phase) : null,
        mpp_phase_unit: h.mpp_phase_unit ? String(h.mpp_phase_unit) : null,
        task_id: h.task_id ? String(h.task_id) : null,
        phase_id: h.phase_id ? String(h.phase_id) : null,
      };

      if (next.workday_phase_id) stats.withWorkdayPhaseBefore += 1;
      if (next.task_id || next.phase_id || next.mpp_task_phase) stats.withTaskMapBefore += 1;

      // Pre-gate: inherit workday bucket from existing mapped task/phase link.
      if (!next.workday_phase_id && next.task_id) {
        const existingTask = taskById.get(next.task_id);
        if (existingTask?.inferredWorkdayPhaseId) {
          next.workday_phase_id = existingTask.inferredWorkdayPhaseId;
          const wp = workdayCandidates.find((x) => x.id === existingTask.inferredWorkdayPhaseId);
          next.workday_phase = wp?.name || next.workday_phase;
          stats.gate3 += 1;
        }
      }
      if (!next.workday_phase_id && next.phase_id) {
        const existingPhase = phaseById.get(next.phase_id);
        if (existingPhase?.inferredWorkdayPhaseId) {
          next.workday_phase_id = existingPhase.inferredWorkdayPhaseId;
          const wp = workdayCandidates.find((x) => x.id === existingPhase.inferredWorkdayPhaseId);
          next.workday_phase = wp?.name || next.workday_phase;
          stats.gate3 += 1;
        }
      }

      // Gate 1: phases -> workday phase name
      if (!next.workday_phase_id && workdayCandidates.length > 0) {
        const g1 = chooseBest(h.phases, workdayCandidates, MIN_SCORE_STRICT);
        if (g1) {
          next.workday_phase_id = g1.candidate.id;
          next.workday_phase = g1.candidate.name;
          stats.gate1 += 1;
        }
      }

      // Gate 2: task text -> MPP task/phase (hierarchy-aware)
      const mode = projectMode.get(pid) || 'tasks-first';
      const primary = mode.startsWith('tasks') ? taskCandidates : phaseCandidates;
      const fallback = mode.startsWith('tasks') ? phaseCandidates : taskCandidates;
      const taskText = String(h.task || '').trim();
      const phaseText = String(h.phases || '').trim();
      const preferText = taskText || phaseText;

      let selectedKind = null;
      let selected = null;

      if (preferText) {
        const pBest = chooseBest(preferText, primary, MIN_SCORE_FUZZY);
        const fBest = chooseBest(preferText, fallback, MIN_SCORE_FUZZY);
        if (pBest && (!fBest || pBest.score >= fBest.score)) {
          selected = pBest.candidate;
          selectedKind = primary === taskCandidates ? 'task' : 'phase';
        } else if (fBest) {
          selected = fBest.candidate;
          selectedKind = fallback === taskCandidates ? 'task' : 'phase';
        }
      }

      if (selected) {
        stats.gate2 += 1;
        next.mpp_task_phase = selected.name || next.mpp_task_phase;
        if (selectedKind === 'task') {
          const phase = phaseById.get(selected.phaseId);
          next.mpp_phase_unit = phase?.name || unitsById.get(selected.unitId) || next.mpp_phase_unit;
          if (!next.task_id) next.task_id = selected.id;
          if (!next.phase_id && selected.phaseId) next.phase_id = selected.phaseId;
          if (!next.workday_phase_id && selected.inferredWorkdayPhaseId) {
            next.workday_phase_id = selected.inferredWorkdayPhaseId;
            const wp = workdayCandidates.find((x) => x.id === selected.inferredWorkdayPhaseId);
            next.workday_phase = wp?.name || next.workday_phase;
            stats.gate3 += 1;
          }
        } else {
          next.mpp_phase_unit = selected.name || unitsById.get(selected.unitId) || next.mpp_phase_unit;
          if (!next.phase_id) next.phase_id = selected.id;
          if (!next.workday_phase_id && selected.inferredWorkdayPhaseId) {
            next.workday_phase_id = selected.inferredWorkdayPhaseId;
            const wp = workdayCandidates.find((x) => x.id === selected.inferredWorkdayPhaseId);
            next.workday_phase = wp?.name || next.workday_phase;
            stats.gate3 += 1;
          }
        }
      }

      // Gate 3: MPP task/phase bucket -> workday phase
      if (!next.workday_phase_id && workdayCandidates.length > 0) {
        const bucketText = next.mpp_phase_unit || next.mpp_task_phase || phaseText;
        const g3 = chooseBest(bucketText, workdayCandidates, MIN_SCORE_FUZZY);
        if (g3) {
          next.workday_phase_id = g3.candidate.id;
          next.workday_phase = g3.candidate.name;
          stats.gate3 += 1;
        }
      }

      // Gate 4: bucket-constrained final fill for missed task/phase
      if ((!next.mpp_task_phase || (!next.task_id && !next.phase_id)) && next.workday_phase_id) {
        const bucketTasks = taskCandidates.filter((t) => t.inferredWorkdayPhaseId && t.inferredWorkdayPhaseId === next.workday_phase_id);
        const bucketPhases = phaseCandidates.filter((p) => p.inferredWorkdayPhaseId && p.inferredWorkdayPhaseId === next.workday_phase_id);
        const finalText = taskText || phaseText || next.workday_phase || '';
        const tBest = chooseBest(finalText, bucketTasks, MIN_SCORE_FUZZY);
        const pBest = chooseBest(finalText, bucketPhases, MIN_SCORE_FUZZY);

        if (tBest || pBest) {
          stats.gate4 += 1;
          if (tBest && (!pBest || tBest.score >= pBest.score)) {
            const t = tBest.candidate;
            const phase = phaseById.get(t.phaseId);
            next.mpp_task_phase = t.name || next.mpp_task_phase;
            next.mpp_phase_unit = phase?.name || unitsById.get(t.unitId) || next.mpp_phase_unit;
            if (!next.task_id) next.task_id = t.id;
            if (!next.phase_id && t.phaseId) next.phase_id = t.phaseId;
          } else if (pBest) {
            const p = pBest.candidate;
            next.mpp_task_phase = p.name || next.mpp_task_phase;
            next.mpp_phase_unit = p.name || unitsById.get(p.unitId) || next.mpp_phase_unit;
            if (!next.phase_id) next.phase_id = p.id;
          }
        }
      }

      if (next.workday_phase_id) stats.withWorkdayPhaseAfter += 1;
      if (next.task_id || next.phase_id || next.mpp_task_phase) stats.withTaskMapAfter += 1;

      const changed =
        String(next.workday_phase_id || '') !== String(h.workday_phase_id || '') ||
        String(next.workday_phase || '') !== String(h.workday_phase || '') ||
        String(next.mpp_task_phase || '') !== String(h.mpp_task_phase || '') ||
        String(next.mpp_phase_unit || '') !== String(h.mpp_phase_unit || '') ||
        String(next.task_id || '') !== String(h.task_id || '') ||
        String(next.phase_id || '') !== String(h.phase_id || '');

      if (changed) {
        updates.push({
          id: String(h.id),
          ...next,
        });
      }
    }

    if (!dryRun) {
      if (updates.length > 0) {
        await client.query(
          `WITH incoming AS (
             SELECT *
             FROM jsonb_to_recordset($1::jsonb) AS x(
               id TEXT,
               workday_phase_id TEXT,
               workday_phase TEXT,
               mpp_task_phase TEXT,
               mpp_phase_unit TEXT,
               task_id TEXT,
               phase_id TEXT
             )
           )
           UPDATE hour_entries h
              SET workday_phase_id = i.workday_phase_id,
                  workday_phase = i.workday_phase,
                  mpp_task_phase = i.mpp_task_phase,
                  mpp_phase_unit = i.mpp_phase_unit,
                  task_id = i.task_id,
                  phase_id = i.phase_id,
                  updated_at = NOW()
             FROM incoming i
            WHERE h.id = i.id`,
          [JSON.stringify(updates)],
        );
      }

      await client.query(
        `INSERT INTO workflow_audit_log (
           event_type,
           role_key,
           actor_email,
           project_id,
           entity_type,
           entity_id,
           payload,
           created_at
         )
         VALUES (
           'mapping_refresh',
           'system',
           'system@internal',
           $1,
           'hour_entries',
           $2,
           $3::jsonb,
           NOW()
         )`,
        [
          projectFilter || null,
          projectFilter || 'all',
          JSON.stringify({
            message: `Hour-entry bucket refresh completed (${updates.length} updated rows).`,
            updated: updates.length,
            stats,
          }),
        ],
      );
    }

    await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');

    console.log(`[Buckets] mode=${dryRun ? 'dry-run' : 'apply'} project=${projectFilter || 'all'}`);
    console.log(`[Buckets] total=${stats.total} updates=${updates.length}`);
    console.log(`[Buckets] gate1_phase_to_workday=${stats.gate1}`);
    console.log(`[Buckets] gate2_hour_to_mpp=${stats.gate2}`);
    console.log(`[Buckets] gate3_mpp_to_workday=${stats.gate3}`);
    console.log(`[Buckets] gate4_bucket_fill=${stats.gate4}`);
    console.log(`[Buckets] workday_phase mapped: ${stats.withWorkdayPhaseBefore} -> ${stats.withWorkdayPhaseAfter}`);
    console.log(`[Buckets] mpp task/phase mapped: ${stats.withTaskMapBefore} -> ${stats.withTaskMapAfter}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[Buckets] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
