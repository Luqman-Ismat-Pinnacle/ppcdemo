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

function scoreMatch(sourceRaw: string, candidateRaw: string): number {
  const source = normalizeText(sourceRaw);
  const candidate = normalizeText(candidateRaw);
  if (!source || !candidate) return 0;
  if (source === candidate) return 100;
  if (source.includes(candidate) || candidate.includes(source)) return 60;

  const sourceTokens = new Set(source.split(' ').filter(Boolean));
  const candidateTokens = new Set(candidate.split(' ').filter(Boolean));
  let overlap = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) overlap += 1;
  }
  const maxLen = Math.max(sourceTokens.size, candidateTokens.size, 1);
  return Math.round((overlap / maxLen) * 50);
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
  await pgQuery(`CREATE INDEX IF NOT EXISTS idx_hour_entries_workday_phase_id ON hour_entries(workday_phase_id)`);
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
      const taskId = body.taskId as string;
      if (!hourId || !taskId) {
        return NextResponse.json({ success: false, error: 'hourId and taskId required' }, { status: 400 });
      }
      if (isPostgresConfigured()) {
        await pgQuery('UPDATE hour_entries SET task_id = $1, updated_at = NOW() WHERE id = $2', [taskId, hourId]);
        return NextResponse.json({ success: true, hourId, taskId });
      }
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ success: false, error: 'No database configured' }, { status: 500 });
      }
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('hour_entries').update({ task_id: taskId }).eq('id', hourId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, hourId, taskId });
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
      if (!projectId) {
        return NextResponse.json({ success: false, error: 'projectId required' }, { status: 400 });
      }

      if (isPostgresConfigured()) {
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

          let best: { id: string; score: number } | null = null;
          for (const wp of workdayPhases) {
            const s1 = scoreMatch(source, String(wp.name || ''));
            const s2 = scoreMatch(source, String(wp.unit || ''));
            const s3 = scoreMatch(source, `${wp.unit || ''} ${wp.name || ''}`);
            const score = Math.max(s1, s2, s3);
            if (!best || score > best.score) {
              best = { id: String(wp.id), score };
            }
          }

          if (best && best.score >= 35) {
            updates.push({ hourId: String(h.id), workdayPhaseId: best.id });
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

        let best: { id: string; score: number } | null = null;
        for (const wp of workdayPhases || []) {
          const s1 = scoreMatch(source, String(wp.name || ''));
          const s2 = scoreMatch(source, String(wp.unit || ''));
          const s3 = scoreMatch(source, `${wp.unit || ''} ${wp.name || ''}`);
          const score = Math.max(s1, s2, s3);
          if (!best || score > best.score) {
            best = { id: String(wp.id), score };
          }
        }

        if (best && best.score >= 35) {
          updates.push({ hourId: String(h.id), workdayPhaseId: best.id });
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

    return NextResponse.json({ success: false, error: 'Invalid action.' }, { status: 400 });
  } catch (err: any) {
    console.error('[Mapping] Error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Unknown error' }, { status: 500 });
  }
}
