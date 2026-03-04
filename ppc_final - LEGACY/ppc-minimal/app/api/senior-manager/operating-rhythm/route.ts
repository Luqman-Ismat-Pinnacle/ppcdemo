import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Senior Manager Operating Rhythm: throughput, headcount, charge breakdown,
 * milestone status, and labor by project.
 */
export async function GET() {
  try {
    const [weeklyRows, chargeRows, milestoneRows, laborRows, cadenceRows, sprintBurnRows] = await Promise.all([
      query<{ week: string; hours: string; headcount: string }>(
        `SELECT
           TO_CHAR(DATE_TRUNC('week', h.date), 'YYYY-MM-DD') AS week,
           ROUND(COALESCE(SUM(h.hours), 0)::numeric, 1)::text AS hours,
           COUNT(DISTINCT h.employee_id)::text AS headcount
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date IS NOT NULL AND h.date >= CURRENT_DATE - INTERVAL '12 weeks'
         GROUP BY DATE_TRUNC('week', h.date)
         ORDER BY week`,
      ),

      query<{ charge_category: string; hours: string }>(
        `SELECT
           CASE
             WHEN LOWER(COALESCE(h.charge_code, '')) LIKE '%qc%' OR LOWER(COALESCE(h.charge_code, '')) LIKE '%quality%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%rework%' OR LOWER(COALESCE(h.charge_code, '')) LIKE '%rw%' THEN 'Quality / Rework'
             WHEN LOWER(COALESCE(h.charge_code, '')) LIKE '%admin%' OR LOWER(COALESCE(h.charge_code, '')) LIKE '%meeting%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%training%' OR LOWER(COALESCE(h.charge_code, '')) LIKE '%pto%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%holiday%' OR LOWER(COALESCE(h.charge_code, '')) LIKE '%overhead%' THEN 'Non-Execute'
             ELSE 'Execute'
           END AS charge_category,
           ROUND(COALESCE(SUM(h.hours), 0)::numeric, 1)::text AS hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY 1`,
      ),

      query<{ status_bucket: string; cnt: string }>(
        `SELECT
           CASE
             WHEN COALESCE(t.percent_complete,0) >= 100 AND (t.actual_end IS NULL OR t.actual_end <= t.baseline_end) THEN 'on_time'
             WHEN COALESCE(t.percent_complete,0) >= 100 THEN 'late'
             WHEN COALESCE(t.percent_complete,0) > 0 AND t.baseline_end >= CURRENT_DATE THEN 'on_track'
             WHEN COALESCE(t.percent_complete,0) > 0 THEN 'delayed'
             WHEN t.baseline_start <= CURRENT_DATE THEN 'overdue'
             ELSE 'upcoming'
           END AS status_bucket,
           COUNT(*)::int AS cnt
         FROM tasks t JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true AND t.is_milestone = true
         GROUP BY 1`,
      ),

      query<{ project_id: string; project_name: string; hours: string }>(
        `SELECT
           p.id AS project_id,
           p.name AS project_name,
           ROUND(COALESCE(SUM(h.hours), 0)::numeric, 1)::text AS hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date >= CURRENT_DATE - INTERVAL '4 weeks'
         GROUP BY p.id, p.name
         ORDER BY SUM(h.hours) DESC`,
      ),

      query<{ week_start: string; target_hrs: string; actual_hrs: string; adherence_pct: string }>(
        `WITH weekly_actual AS (
           SELECT DATE_TRUNC('week', h.date)::date AS week_start,
             ROUND(COALESCE(SUM(h.hours), 0)::numeric, 1)::text AS actual_hrs
           FROM hour_entries h
           JOIN projects p ON p.id = h.project_id
           WHERE p.is_active = true AND p.has_schedule = true AND h.date IS NOT NULL
             AND h.date >= CURRENT_DATE - INTERVAL '8 weeks'
           GROUP BY DATE_TRUNC('week', h.date)
         ),
         proj_count AS (SELECT COUNT(*) AS n FROM projects WHERE is_active = true AND has_schedule = true)
         SELECT
           wa.week_start::text,
           (pc.n * 40)::text AS target_hrs,
           wa.actual_hrs,
           ROUND(CASE WHEN (pc.n * 40) > 0 THEN (wa.actual_hrs::numeric / (pc.n * 40)) * 100 ELSE 0 END::numeric, 1)::text AS adherence_pct
         FROM weekly_actual wa
         CROSS JOIN proj_count pc
         ORDER BY wa.week_start DESC
         LIMIT 8`,
      ),

      query<{ sprint_name: string; project_name: string; planned_hrs: string; actual_hrs: string; burn_pct: string }>(
        `SELECT
           s.name AS sprint_name,
           p.name AS project_name,
           ROUND(COALESCE(SUM(t.baseline_hours), 0)::numeric, 1)::text AS planned_hrs,
           ROUND(COALESCE(SUM(t.actual_hours), 0)::numeric, 1)::text AS actual_hrs,
           ROUND(CASE WHEN SUM(t.baseline_hours) > 0 THEN (SUM(t.actual_hours) / SUM(t.baseline_hours)) * 100 ELSE 0 END::numeric, 1)::text AS burn_pct
         FROM sprints s
         JOIN sprint_tasks st ON st.sprint_id = s.id
         JOIN tasks t ON t.id = st.task_id
         JOIN projects p ON p.id = s.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY s.id, s.name, p.name
         ORDER BY s.start_date DESC NULLS LAST
         LIMIT 20`,
      ),
    ]);

    const totalHours = weeklyRows.reduce((s, r) => s + Number(r.hours || 0), 0);
    const chargeTotal = chargeRows.reduce((s, r) => s + Number(r.hours || 0), 0);
    const executeHours = chargeRows.find((r) => r.charge_category === 'Execute')?.hours || '0';
    const executeRatio = chargeTotal > 0 ? Math.round((Number(executeHours) / chargeTotal) * 1000) / 10 : 0;
    const avgWeeklyHours = weeklyRows.length > 0 ? totalHours / weeklyRows.length : 0;
    const headcountMax = Math.max(...weeklyRows.map((r) => Number(r.headcount || 0)), 0);

    const milestoneDist: Record<string, number> = {
      on_time: 0, on_track: 0, late: 0, delayed: 0, overdue: 0, upcoming: 0,
    };
    milestoneRows.forEach((r) => { milestoneDist[r.status_bucket] = Number(r.cnt); });
    const milestoneTotal = Object.values(milestoneDist).reduce((a, b) => a + b, 0);
    const onTimeRate = milestoneTotal > 0 && (milestoneDist.on_time + milestoneDist.on_track) > 0
      ? Math.round(((milestoneDist.on_time + milestoneDist.on_track) / milestoneTotal) * 1000) / 10
      : 0;

    const chargeBreakdown = chargeRows.map((r) => ({
      category: r.charge_category,
      hours: Number(r.hours || 0),
      pct: chargeTotal > 0 ? Math.round((Number(r.hours) / chargeTotal) * 100) : 0,
    }));

    const laborByProject = laborRows.map((r) => ({
      project_id: r.project_id,
      project_name: r.project_name,
      hours: Number(r.hours || 0),
    }));

    const cadenceAdherence = cadenceRows.map((r) => ({
      week_start: r.week_start,
      target_hrs: Number(r.target_hrs || 0),
      actual_hrs: Number(r.actual_hrs || 0),
      adherence_pct: Number(r.adherence_pct || 0),
    }));

    const sprintBurn = sprintBurnRows.map((r) => ({
      sprint_name: r.sprint_name,
      project_name: r.project_name,
      planned_hrs: Number(r.planned_hrs || 0),
      actual_hrs: Number(r.actual_hrs || 0),
      burn_pct: Number(r.burn_pct || 0),
    }));

    return NextResponse.json(
      {
        success: true,
        kpis: {
          totalHours,
          executeRatio,
          avgWeeklyHours: Math.round(avgWeeklyHours * 10) / 10,
          headcount: headcountMax,
          milestoneOnTimeRate: onTimeRate,
        },
        weeklyThroughput: weeklyRows.map((r) => ({
          week: r.week,
          hours: Number(r.hours || 0),
          headcount: Number(r.headcount || 0),
        })),
        chargeBreakdown,
        milestoneDist,
        laborByProject,
        cadenceAdherence,
        sprintBurn,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
