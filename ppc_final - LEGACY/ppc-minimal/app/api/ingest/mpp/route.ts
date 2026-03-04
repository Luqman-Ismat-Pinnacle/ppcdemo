import { NextRequest, NextResponse } from 'next/server';
import { execute, refreshRollups } from '@/lib/db';
import { mapMppOutput } from '@/lib/ingest/mpp-mapper';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function batchUpsert(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return 0;
  let total = 0;
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const cols = Object.keys(batch[0]);
    const vals: unknown[] = [];
    const tuples: string[] = [];
    batch.forEach((row, ri) => {
      const ph = cols.map((c, ci) => { vals.push(row[c] ?? null); return `$${ri * cols.length + ci + 1}`; });
      tuples.push(`(${ph.join(',')})`);
    });
    const update = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
    await execute(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT (id) DO UPDATE SET ${update}`,
      vals,
    );
    total += batch.length;
  }
  return total;
}

/**
 * POST /api/ingest/mpp
 * Body: { projectId: string, tasks: [...parser output...] }
 * Replaces all schedule data for the project, then runs rollups.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, tasks: parserTasks } = body as { projectId: string; tasks: Record<string, unknown>[] };
    if (!projectId || !Array.isArray(parserTasks)) {
      return json({ error: 'projectId and tasks[] required' }, 400);
    }

    const mapped = mapMppOutput(parserTasks, projectId);

    // Atomic replace: delete existing schedule data for this project, then insert new
    await execute('DELETE FROM sub_tasks WHERE project_id = $1', [projectId]);
    await execute('DELETE FROM tasks WHERE project_id = $1', [projectId]);
    await execute('DELETE FROM phases WHERE project_id = $1', [projectId]);
    await execute('DELETE FROM units WHERE project_id = $1', [projectId]);

    const counts = {
      units: await batchUpsert('units', mapped.units),
      phases: await batchUpsert('phases', mapped.phases),
      tasks: await batchUpsert('tasks', mapped.tasks),
      sub_tasks: await batchUpsert('sub_tasks', mapped.sub_tasks),
    };

    await execute('UPDATE projects SET has_schedule = true, updated_at = NOW() WHERE id = $1', [projectId]);

    try { await refreshRollups(); } catch { /* non-fatal */ }

    return json({ success: true, ...counts });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}
