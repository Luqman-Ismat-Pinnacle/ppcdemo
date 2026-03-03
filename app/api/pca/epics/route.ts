import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function ensureTables() {
  await execute(
    `CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, phase_id TEXT, project_id TEXT,
      description TEXT, status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
  );
  await execute(
    `CREATE TABLE IF NOT EXISTS features (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, epic_id TEXT, project_id TEXT,
      description TEXT, status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
  );
  await execute('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS epic_id TEXT');
  await execute('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS feature_id TEXT');
}

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const phaseId = searchParams.get('phaseId');

    let epicFilter = 'WHERE 1=1';
    const params: string[] = [];
    if (projectId) {
      params.push(projectId);
      epicFilter += ` AND e.project_id = $${params.length}`;
    }
    if (phaseId) {
      params.push(phaseId);
      epicFilter += ` AND e.phase_id = $${params.length}`;
    }

    const epics = await query(
      `SELECT e.*, COALESCE(ph.name, '') AS phase_name,
              (SELECT COUNT(*) FROM tasks t WHERE t.epic_id = e.id)::int AS task_count
       FROM epics e
       LEFT JOIN phases ph ON ph.id = e.phase_id
       ${epicFilter}
       ORDER BY e.created_at DESC`,
      params,
    );

    const epicIds = epics.map((e) => String(e.id));
    let features: Record<string, unknown>[] = [];
    if (epicIds.length > 0) {
      const ph = epicIds.map((_, i) => `$${i + 1}`).join(',');
      features = await query(
        `SELECT f.*, COALESCE(e.name, '') AS epic_name,
                (SELECT COUNT(*) FROM tasks t WHERE t.feature_id = f.id)::int AS task_count
         FROM features f
         LEFT JOIN epics e ON e.id = f.epic_id
         WHERE f.epic_id IN (${ph})
         ORDER BY f.created_at DESC`,
        epicIds,
      );
    }

    return NextResponse.json({ success: true, epics, features }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    const { action } = body;

    if (action === 'createEpic') {
      const id = `epic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO epics (id, name, phase_id, project_id, description) VALUES ($1,$2,$3,$4,$5)`,
        [id, body.name, body.phaseId || null, body.projectId || null, body.description || null],
      );
      return NextResponse.json({ success: true, id });
    }

    if (action === 'createFeature') {
      const id = `feat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO features (id, name, epic_id, project_id, description) VALUES ($1,$2,$3,$4,$5)`,
        [id, body.name, body.epicId, body.projectId || null, body.description || null],
      );
      return NextResponse.json({ success: true, id });
    }

    if (action === 'updateEpic') {
      const { id, name, description, status } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await execute(
        `UPDATE epics SET name = COALESCE($1, name), description = COALESCE($2, description),
         status = COALESCE($3, status) WHERE id = $4`,
        [name ?? null, description ?? null, status ?? null, id],
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'updateFeature') {
      const { id, name, description, status } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await execute(
        `UPDATE features SET name = COALESCE($1, name), description = COALESCE($2, description),
         status = COALESCE($3, status) WHERE id = $4`,
        [name ?? null, description ?? null, status ?? null, id],
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'deleteEpic') {
      await execute('DELETE FROM epics WHERE id = $1', [body.id]);
      return NextResponse.json({ success: true });
    }

    if (action === 'deleteFeature') {
      await execute('DELETE FROM features WHERE id = $1', [body.id]);
      return NextResponse.json({ success: true });
    }

    if (action === 'assignTaskToEpic') {
      const { taskId, epicId } = body;
      if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      await execute('UPDATE tasks SET epic_id = $1, feature_id = NULL WHERE id = $2', [epicId || null, taskId]);
      return NextResponse.json({ success: true });
    }

    if (action === 'assignTaskToFeature') {
      const { taskId, featureId, epicId } = body;
      if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });
      await execute('UPDATE tasks SET feature_id = $1, epic_id = COALESCE($2, epic_id) WHERE id = $3', [featureId || null, epicId || null, taskId]);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
