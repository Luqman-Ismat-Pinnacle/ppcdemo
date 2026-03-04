import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const severity = (searchParams.get('severity') || '').toLowerCase();
    const priority = (searchParams.get('priority') || '').toUpperCase();

    const rows = await query<{
      project_id: string; project_name: string; accountable_owner: string; workstream: string;
      variance_pct: string; variance_hours: string; critical_open: string; avg_progress: string;
      actual_hours: string; baseline_hours: string; remaining_hours: string;
      spi: string; trend_hours_pct: string; trend_hours_mo: string; total_tasks: string; completed_tasks: string;
    }>(
      `WITH hours_trend AS (
         SELECT
           h.project_id,
           COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS recent_hours,
           COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '6 months' AND h.date < CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS prior_hours
         FROM hour_entries h
         GROUP BY h.project_id
       ),
       project_roll AS (
         SELECT
           p.id AS project_id,
           p.name AS project_name,
           COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned') AS accountable_owner,
           COALESCE(
             NULLIF((SELECT u.name FROM units u WHERE u.project_id = p.id ORDER BY u.updated_at DESC NULLS LAST LIMIT 1), ''),
             'Core Program'
           ) AS workstream,
           COALESCE(SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)),0) AS variance_hours,
           CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN (SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / SUM(COALESCE(t.baseline_hours,0))) * 100
             ELSE 0 END AS variance_pct,
           SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END)::int AS critical_open,
           AVG(COALESCE(t.percent_complete,0)) AS avg_progress,
           COALESCE(SUM(COALESCE(t.actual_hours,0)),0) AS actual_hours,
           COALESCE(SUM(COALESCE(t.baseline_hours,0)),0) AS baseline_hours,
           COALESCE(SUM(COALESCE(t.remaining_hours,0)),0) AS remaining_hours,
           ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN SUM(COALESCE(t.actual_hours,0)) / NULLIF(SUM(COALESCE(t.baseline_hours,0)),0) ELSE 0 END::numeric, 2) AS spi,
           ROUND(CASE WHEN COALESCE(ht.prior_hours,0) > 0
             THEN ((COALESCE(ht.recent_hours,0) - COALESCE(ht.prior_hours,0)) / NULLIF(ht.prior_hours,0)) * 100 ELSE 0 END::numeric, 1) AS trend_hours_pct,
           ROUND((COALESCE(ht.recent_hours,0) / 3.0)::numeric, 1) AS trend_hours_mo,
           COUNT(t.id)::int AS total_tasks,
           SUM(CASE WHEN COALESCE(t.percent_complete,0) >= 100 THEN 1 ELSE 0 END)::int AS completed_tasks
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         LEFT JOIN hours_trend ht ON ht.project_id = p.id
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY p.id, p.name, pf.name, ht.recent_hours, ht.prior_hours
       )
       SELECT * FROM project_roll
       ORDER BY
         CASE WHEN variance_pct >= 35 OR critical_open >= 8 THEN 3
              WHEN variance_pct >= 20 OR critical_open >= 5 THEN 2 ELSE 1 END DESC,
         variance_pct DESC`,
    );

    const enriched = rows.map((r, idx) => {
      const vpct = Number(r.variance_pct || 0);
      const critOpen = Number(r.critical_open || 0);
      const sev = (vpct >= 35 || critOpen >= 8) ? 'critical' : (vpct >= 20 || critOpen >= 5) ? 'warning' : 'info';
      const pri = (vpct >= 35 || critOpen >= 8) ? 'P1' : (vpct >= 20 || critOpen >= 5) ? 'P2' : 'P3';
      return {
        id: `vr-${idx + 1}-${r.project_id}`,
        project_id: r.project_id,
        project_name: r.project_name,
        accountable_owner: r.accountable_owner,
        workstream: r.workstream,
        severity: sev,
        intervention_priority: pri,
        variance_pct: vpct,
        variance_hours: Number(r.variance_hours || 0),
        actual_hours: Number(r.actual_hours || 0),
        baseline_hours: Number(r.baseline_hours || 0),
        remaining_hours: Number(r.remaining_hours || 0),
        spi: Number(r.spi || 0),
        trend_hours_pct: Number(r.trend_hours_pct || 0),
        trend_hours_mo: Number(r.trend_hours_mo || 0),
        avg_progress: Number(r.avg_progress || 0),
        total_tasks: Number(r.total_tasks || 0),
        completed_tasks: Number(r.completed_tasks || 0),
        critical_open: critOpen,
        trend: vpct >= 30 ? 'deteriorating' as const : vpct >= 12 ? 'stable' as const : 'recovering' as const,
        root_cause:
          vpct >= 35 ? 'Execution throughput misalignment'
          : critOpen >= 8 ? 'Critical path constraint accumulation'
          : Number(r.avg_progress) < 35 ? 'Progress productivity under target'
          : 'Variance within monitored tolerance',
        recommended_action:
          vpct >= 35 ? 'Initiate executive escalation with accountable owner'
          : critOpen >= 8 ? 'Prioritize critical path recovery actions'
          : 'Maintain operating cadence and monitor',
      };
    });

    const filtered = enriched.filter((r) => {
      if (severity && severity !== 'all' && r.severity !== severity) return false;
      if (priority && priority !== 'ALL' && r.intervention_priority !== priority) return false;
      return true;
    });

    const varianceValues = filtered.map((r) => r.variance_pct);
    const sevDist = { critical: 0, warning: 0, info: 0 };
    filtered.forEach((r) => { sevDist[r.severity as keyof typeof sevDist]++; });

    return NextResponse.json({
      success: true,
      summary: {
        total: filtered.length,
        critical: sevDist.critical,
        warning: sevDist.warning,
        info: sevDist.info,
        p1: filtered.filter((r) => r.intervention_priority === 'P1').length,
        avgVariancePct: varianceValues.length ? varianceValues.reduce((a, b) => a + b, 0) / varianceValues.length : 0,
        totalVarianceHours: filtered.reduce((s, r) => s + r.variance_hours, 0),
      },
      rows: filtered,
      severityDistribution: sevDist,
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
