import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const str = (v: unknown) => String(v ?? '');

type WbsItem = {
  id: string;
  table_name: string;
  name: string;
  project_id: string;
  project_name: string;
  unit_name: string;
  phase_name: string;
  level: string;
  baseline_hours: number;
  actual_hours: number;
  remaining_hours: number;
  baseline_count: number;
  baseline_metric: string;
  baseline_uom: string;
  actual_count: number;
  actual_metric: string;
  actual_uom: string;
  actual_count_updated_at: string | null;
  percent_complete: number;
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');

    const pFilter = projectId ? 'AND t.project_id = $1' : '';
    const params = projectId ? [projectId] : [];

    const rows = await query<{
      id: string; table_name: string; name: string; project_id: string;
      project_name: string; unit_name: string; phase_name: string; level: string;
      baseline_hours: string; actual_hours: string; remaining_hours: string;
      baseline_count: string; baseline_metric: string; baseline_uom: string;
      actual_count: string; actual_metric: string; actual_uom: string;
      actual_count_updated_at: string | null; percent_complete: string;
    }>(
      `WITH wbs AS (
        SELECT u.id, 'units' AS table_name, u.name, u.project_id,
               COALESCE(p.name, u.project_id) AS project_name,
               '' AS unit_name, '' AS phase_name, 'unit' AS level,
               COALESCE(u.baseline_hours,0)::text AS baseline_hours,
               COALESCE(u.actual_hours,0)::text AS actual_hours,
               COALESCE(u.remaining_hours,0)::text AS remaining_hours,
               COALESCE(u.baseline_count,0)::text AS baseline_count,
               COALESCE(u.baseline_metric,'') AS baseline_metric,
               COALESCE(u.baseline_uom,'') AS baseline_uom,
               COALESCE(u.actual_count,0)::text AS actual_count,
               COALESCE(u.actual_metric,'') AS actual_metric,
               COALESCE(u.actual_uom,'') AS actual_uom,
               u.actual_count_updated_at::text,
               COALESCE(u.percent_complete,0)::text AS percent_complete
        FROM units u
        JOIN projects p ON p.id = u.project_id
        WHERE p.is_active = true AND p.has_schedule = true ${pFilter}
        UNION ALL
        SELECT ph.id, 'phases', ph.name, ph.project_id,
               COALESCE(p.name, ph.project_id), COALESCE(un.name,''), '', 'phase',
               COALESCE(ph.baseline_hours,0)::text, COALESCE(ph.actual_hours,0)::text,
               COALESCE(ph.remaining_hours,0)::text,
               COALESCE(ph.baseline_count,0)::text, COALESCE(ph.baseline_metric,''),
               COALESCE(ph.baseline_uom,''),
               COALESCE(ph.actual_count,0)::text, COALESCE(ph.actual_metric,''),
               COALESCE(ph.actual_uom,''),
               ph.actual_count_updated_at::text,
               COALESCE(ph.percent_complete,0)::text
        FROM phases ph
        JOIN projects p ON p.id = ph.project_id
        LEFT JOIN units un ON un.id = ph.unit_id
        WHERE p.is_active = true AND p.has_schedule = true ${pFilter.replace(/t\./g, 'ph.')}
        UNION ALL
        SELECT t.id, 'tasks', t.name, t.project_id,
               COALESCE(p.name, t.project_id), COALESCE(un.name,''), COALESCE(ph.name,''), 'task',
               COALESCE(t.baseline_hours,0)::text, COALESCE(t.actual_hours,0)::text,
               COALESCE(t.remaining_hours,0)::text,
               COALESCE(t.baseline_count,0)::text, COALESCE(t.baseline_metric,''),
               COALESCE(t.baseline_uom,''),
               COALESCE(t.actual_count,0)::text, COALESCE(t.actual_metric,''),
               COALESCE(t.actual_uom,''),
               t.actual_count_updated_at::text,
               COALESCE(t.percent_complete,0)::text
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN phases ph ON ph.id = t.phase_id
        LEFT JOIN units un ON un.id = ph.unit_id
        WHERE p.is_active = true AND p.has_schedule = true ${pFilter}
        UNION ALL
        SELECT st.id, 'sub_tasks', st.name, st.project_id,
               COALESCE(p.name, st.project_id), COALESCE(un.name,''), COALESCE(ph.name,''), 'sub_task',
               COALESCE(st.baseline_hours,0)::text, COALESCE(st.actual_hours,0)::text,
               COALESCE(st.remaining_hours,0)::text,
               COALESCE(st.baseline_count,0)::text, COALESCE(st.baseline_metric,''),
               COALESCE(st.baseline_uom,''),
               COALESCE(st.actual_count,0)::text, COALESCE(st.actual_metric,''),
               COALESCE(st.actual_uom,''),
               st.actual_count_updated_at::text,
               COALESCE(st.percent_complete,0)::text
        FROM sub_tasks st
        JOIN projects p ON p.id = st.project_id
        LEFT JOIN tasks tk ON tk.id = st.task_id
        LEFT JOIN phases ph ON ph.id = tk.phase_id
        LEFT JOIN units un ON un.id = ph.unit_id
        WHERE p.is_active = true AND p.has_schedule = true ${pFilter.replace(/t\./g, 'st.')}
      )
      SELECT * FROM wbs ORDER BY project_name, level, name`,
      params,
    );

    const items: WbsItem[] = rows.map((r) => ({
      id: r.id,
      table_name: r.table_name,
      name: r.name,
      project_id: r.project_id,
      project_name: r.project_name,
      unit_name: r.unit_name,
      phase_name: r.phase_name,
      level: r.level,
      baseline_hours: num(r.baseline_hours),
      actual_hours: num(r.actual_hours),
      remaining_hours: num(r.remaining_hours),
      baseline_count: num(r.baseline_count),
      baseline_metric: r.baseline_metric,
      baseline_uom: r.baseline_uom,
      actual_count: num(r.actual_count),
      actual_metric: r.actual_metric,
      actual_uom: r.actual_uom,
      actual_count_updated_at: r.actual_count_updated_at || null,
      percent_complete: num(r.percent_complete),
    }));

    const projects = await query<{ id: string; name: string }>(
      `SELECT id, name FROM projects WHERE is_active = true AND has_schedule = true ORDER BY name`,
    );

    return NextResponse.json({ success: true, items, projects }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'update_actuals') {
      const updates = body.updates as Array<{
        id: string;
        table_name: string;
        actual_count: number;
        actual_metric: string;
        actual_uom: string;
        remaining_hours: number;
      }>;
      if (!Array.isArray(updates) || !updates.length) {
        return NextResponse.json({ success: false, error: 'No updates' }, { status: 400 });
      }

      const allowed = new Set(['units', 'phases', 'tasks', 'sub_tasks']);
      for (const u of updates) {
        if (!allowed.has(u.table_name)) continue;
        await execute(
          `UPDATE ${u.table_name}
           SET actual_count = $1, actual_metric = $2, actual_uom = $3,
               remaining_hours = $4, actual_count_updated_at = NOW()
           WHERE id = $5`,
          [num(u.actual_count), str(u.actual_metric), str(u.actual_uom), num(u.remaining_hours), u.id],
        );
      }

      return NextResponse.json({ success: true, updated: updates.length });
    }

    if (action === 'submit_guardrail') {
      const { id, project_id, record_table, record_id, record_name, predicted_hours, entered_hours, pl_comment, created_by } = body;
      const gid = id || `fg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await execute(
        `INSERT INTO forecast_guardrails (id, project_id, record_table, record_id, record_name, predicted_hours, entered_hours, delta, pl_comment, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending_pca', $10)
         ON CONFLICT (id) DO UPDATE SET
           predicted_hours = EXCLUDED.predicted_hours,
           entered_hours = EXCLUDED.entered_hours,
           delta = EXCLUDED.delta,
           pl_comment = EXCLUDED.pl_comment`,
        [gid, project_id, record_table, record_id, record_name || '', num(predicted_hours), num(entered_hours), num(predicted_hours) - num(entered_hours), pl_comment || '', created_by || 'PL'],
      );
      return NextResponse.json({ success: true, id: gid });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
