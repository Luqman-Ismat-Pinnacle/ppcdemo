import { NextRequest, NextResponse } from 'next/server';
import { query, refreshRollups } from '@/lib/db';
import { suggestMappings, runMultiGateMatch } from '@/lib/matching/phase-match';
import type { HourEntry, WorkdayPhase, MppPhase, MppTask, MppSubTask } from '@/lib/matching/phase-match';
import { bulkApply, applyMultiGateUpdates } from '@/lib/matching/apply-suggestions';
import { syncMappedActualsToTasks } from '@/lib/matching/sync-actuals';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const hourBuckets = await query<{ phase: string; hours: string; entries: string }>(
      `SELECT COALESCE(NULLIF(TRIM(phase),''), 'Unphased') as phase,
              SUM(hours) as hours, COUNT(*) as entries
       FROM hour_entries WHERE project_id = $1
       GROUP BY COALESCE(NULLIF(TRIM(phase),''), 'Unphased')
       ORDER BY SUM(hours) DESC`,
      [projectId],
    );

    const mppPhases = await query<{ id: string; name: string }>(
      'SELECT id, name FROM phases WHERE project_id = $1', [projectId]
    );
    const [mppTasks, mppSubTasks] = await Promise.all([
      query<{ id: string; name: string }>(
        'SELECT id, name FROM tasks WHERE project_id = $1',
        [projectId],
      ),
      query<{ id: string; name: string }>(
        'SELECT id, name FROM sub_tasks WHERE project_id = $1',
        [projectId],
      ),
    ]);

    const mappedCount = await query<{ cnt: string }>(
      `SELECT count(*) cnt FROM hour_entries WHERE project_id = $1 AND COALESCE(mpp_phase_task,'') <> ''`,
      [projectId],
    );
    const totalCount = await query<{ cnt: string }>(
      'SELECT count(*) cnt FROM hour_entries WHERE project_id = $1', [projectId]
    );

    const phaseNames = hourBuckets.map(b => b.phase).filter(p => p !== 'Unphased');
    const mppItems = [...mppPhases, ...mppTasks, ...mppSubTasks];
    const suggestions = suggestMappings(phaseNames, mppItems);

    return NextResponse.json(
      {
        success: true,
        hourBuckets: hourBuckets.map(b => ({ phase: b.phase, hours: Number(b.hours), entries: Number(b.entries) })),
        mppPhases, mppTasks, mppSubTasks, suggestions,
        stats: { mapped: Number(mappedCount[0]?.cnt || 0), total: Number(totalCount[0]?.cnt || 0) },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, projectId, mappings } = body;

    if (action === 'apply' && Array.isArray(mappings) && projectId) {
      const ids = [...new Set(
        mappings
          .map((m: Record<string, unknown>) => String(m.mppTargetId || '').trim())
          .filter(Boolean),
      )];
      const resolved = ids.length
        ? await query<{ id: string; name: string }>(
            `SELECT id, name FROM (
               SELECT id, name FROM units WHERE project_id = $1 AND id = ANY($2::text[])
               UNION ALL
               SELECT id, name FROM phases WHERE project_id = $1 AND id = ANY($2::text[])
               UNION ALL
               SELECT id, name FROM tasks WHERE project_id = $1 AND id = ANY($2::text[])
               UNION ALL
               SELECT id, name FROM sub_tasks WHERE project_id = $1 AND id = ANY($2::text[])
             ) t`,
            [projectId, ids],
          )
        : [];
      const nameById = new Map(resolved.map((r) => [String(r.id), String(r.name)]));
      const normalizedMappings = mappings
        .map((m: Record<string, unknown>) => {
          const hourPhase = String(m.hourPhase || '').trim();
          const mppTargetId = String(m.mppTargetId || '').trim();
          const fallbackName = String(m.mppTarget || '').trim();
          const mppTarget = nameById.get(mppTargetId) || fallbackName || mppTargetId;
          return { hourPhase, mppTarget };
        })
        .filter((m) => m.hourPhase && m.mppTarget);

      const updated = await bulkApply(projectId, normalizedMappings);
      await syncMappedActualsToTasks(projectId);
      await refreshRollups();
      return NextResponse.json({ success: true, updated });
    }

    if (action === 'auto-match') {
      const pidFilter = projectId
        ? 'WHERE project_id = $1'
        : `WHERE project_id IN (
             SELECT id FROM projects WHERE is_active = true AND has_schedule = true
           )`;
      const pidParams = projectId ? [projectId] : [];

      const [hours, wdPhases, phases, tasks, subTasks] = await Promise.all([
        query<HourEntry>(
          `SELECT id, project_id, COALESCE(phase,'') as phase, COALESCE(task,'') as task,
                  COALESCE(description,'') as description,
                  COALESCE(workday_phase,'') as workday_phase,
                  COALESCE(mpp_phase_task,'') as mpp_phase_task
           FROM hour_entries ${pidFilter}`,
          pidParams,
        ),
        query<WorkdayPhase>(
          `SELECT id, project_id, name, COALESCE(unit,'') as unit
           FROM workday_phases ${pidFilter}`,
          pidParams,
        ),
        query<MppPhase>(
          `SELECT id, project_id, COALESCE(unit_id,'') as unit_id, COALESCE(name,'') as name
           FROM phases ${pidFilter}`,
          pidParams,
        ),
        query<MppTask>(
          `SELECT id, project_id, COALESCE(phase_id,'') as phase_id, COALESCE(unit_id,'') as unit_id, COALESCE(name,'') as name
           FROM tasks ${pidFilter}`,
          pidParams,
        ),
        query<MppSubTask>(
          `SELECT id, project_id, COALESCE(task_id,'') as task_id, COALESCE(phase_id,'') as phase_id, COALESCE(unit_id,'') as unit_id, COALESCE(name,'') as name
           FROM sub_tasks ${pidFilter}`,
          pidParams,
        ),
      ]);

      const { updates, stats } = runMultiGateMatch(hours, wdPhases, phases, tasks, subTasks);
      const applied = await applyMultiGateUpdates(updates);
      await syncMappedActualsToTasks(projectId || undefined);
      await refreshRollups();

      return NextResponse.json({ success: true, applied, stats });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
