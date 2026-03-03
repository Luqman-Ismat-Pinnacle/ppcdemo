import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function ensureTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS intervention_items (
      id TEXT PRIMARY KEY, project_id TEXT, project_name TEXT,
      source TEXT DEFAULT 'pcl_exception', severity TEXT DEFAULT 'warning',
      priority TEXT DEFAULT 'P3', reason TEXT, recommended_action TEXT,
      pcl_notes TEXT, coo_notes TEXT, status TEXT DEFAULT 'pcl_review',
      variance_pct NUMERIC(8,2) DEFAULT 0, actual_cost NUMERIC(14,2) DEFAULT 0,
      scheduled_cost NUMERIC(14,2) DEFAULT 0, actual_hours NUMERIC(12,2) DEFAULT 0,
      total_hours NUMERIC(12,2) DEFAULT 0, percent_complete NUMERIC(5,2) DEFAULT 0,
      escalated_by TEXT, approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  );
}

export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const rows = status
      ? await query(
          'SELECT * FROM intervention_items WHERE status = $1 ORDER BY created_at DESC',
          [status],
        )
      : await query('SELECT * FROM intervention_items ORDER BY created_at DESC');

    return NextResponse.json({ success: true, items: rows }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json();
    const { action } = body;

    if (action === 'escalate') {
      const id = `intv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      await execute(
        `INSERT INTO intervention_items
          (id, project_id, project_name, source, severity, priority, reason,
           recommended_action, pcl_notes, status, variance_pct, actual_cost,
           scheduled_cost, actual_hours, total_hours, percent_complete, escalated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pcl_review',$10,$11,$12,$13,$14,$15,$16)`,
        [
          id,
          body.projectId || null,
          body.projectName || null,
          body.source || 'pcl_exception',
          body.severity || 'warning',
          body.priority || 'P3',
          body.reason || null,
          body.recommendedAction || null,
          body.pclNotes || null,
          Number(body.variancePct || 0),
          Number(body.actualCost || 0),
          Number(body.scheduledCost || 0),
          Number(body.actualHours || 0),
          Number(body.totalHours || 0),
          Number(body.percentComplete || 0),
          body.escalatedBy || null,
        ],
      );
      return NextResponse.json({ success: true, id });
    }

    if (action === 'update') {
      const { id, severity, priority, recommendedAction, pclNotes } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await execute(
        `UPDATE intervention_items SET
           severity = COALESCE($1, severity),
           priority = COALESCE($2, priority),
           recommended_action = COALESCE($3, recommended_action),
           pcl_notes = COALESCE($4, pcl_notes)
         WHERE id = $5`,
        [severity ?? null, priority ?? null, recommendedAction ?? null, pclNotes ?? null, id],
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'approve') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await execute(
        `UPDATE intervention_items SET status = 'approved', approved_at = NOW() WHERE id = $1`,
        [id],
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'dismiss') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await execute(
        `UPDATE intervention_items SET status = 'dismissed' WHERE id = $1`,
        [id],
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'resolve') {
      const { id } = body;
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
      await execute(
        `UPDATE intervention_items SET status = 'resolved' WHERE id = $1`,
        [id],
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
