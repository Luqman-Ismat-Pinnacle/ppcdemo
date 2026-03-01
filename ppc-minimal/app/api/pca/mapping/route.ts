import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { suggestMappings, runMultiGateMatch } from '@/lib/matching/phase-match';
import type { HourEntry, WorkdayPhase, MppPhase, MppTask } from '@/lib/matching/phase-match';
import { bulkApply, applyMultiGateUpdates } from '@/lib/matching/apply-suggestions';

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
    const mppTasks = await query<{ id: string; name: string }>(
      'SELECT id, name FROM tasks WHERE project_id = $1', [projectId]
    );

    const mappedCount = await query<{ cnt: string }>(
      `SELECT count(*) cnt FROM hour_entries WHERE project_id = $1 AND COALESCE(mpp_phase_task,'') <> ''`,
      [projectId],
    );
    const totalCount = await query<{ cnt: string }>(
      'SELECT count(*) cnt FROM hour_entries WHERE project_id = $1', [projectId]
    );

    const phaseNames = hourBuckets.map(b => b.phase).filter(p => p !== 'Unphased');
    const mppItems = [...mppPhases, ...mppTasks];
    const suggestions = suggestMappings(phaseNames, mppItems);

    return NextResponse.json(
      {
        success: true,
        hourBuckets: hourBuckets.map(b => ({ phase: b.phase, hours: Number(b.hours), entries: Number(b.entries) })),
        mppPhases, mppTasks, suggestions,
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
      const updated = await bulkApply(projectId, mappings);
      return NextResponse.json({ success: true, updated });
    }

    if (action === 'auto-match') {
      const pidFilter = projectId ? 'WHERE project_id = $1' : '';
      const pidParams = projectId ? [projectId] : [];

      const [hours, wdPhases, phases, tasks] = await Promise.all([
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
      ]);

      const { updates, stats } = runMultiGateMatch(hours, wdPhases, phases, tasks);
      const applied = await applyMultiGateUpdates(updates);

      return NextResponse.json({ success: true, applied, stats });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
