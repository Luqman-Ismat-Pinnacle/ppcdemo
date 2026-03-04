import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [
      projectCount,
      spiTrendRow,
      scheduleVarRow,
      varianceRows,
      cascadeRows,
      trendRows,
      milestoneRows,
      efficiencyRows,
    ] = await Promise.all([
      query<{ cnt: string }>('SELECT count(*) cnt FROM projects WHERE is_active = true AND has_schedule = true'),

      query<{ spi: string; trend_hours_pct: string }>(
        `WITH task_agg AS (
           SELECT project_id,
             COALESCE(SUM(COALESCE(actual_hours,0)),0) AS ah,
             COALESCE(SUM(COALESCE(baseline_hours,0)),0) AS bh
           FROM tasks GROUP BY project_id
         ),
         hours_trend AS (
           SELECT
             COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS recent_hours,
             COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '6 months' AND h.date < CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS prior_hours
           FROM hour_entries h
           JOIN projects p ON p.id = h.project_id
           WHERE p.is_active = true AND p.has_schedule = true
         )
         SELECT
           ROUND(CASE WHEN SUM(COALESCE(ta.bh,0)) > 0 THEN SUM(COALESCE(ta.ah,0)) / NULLIF(SUM(COALESCE(ta.bh,0)),0) ELSE 0 END::numeric, 2) AS spi,
           ROUND(CASE WHEN MAX(ht.prior_hours) > 0 THEN ((MAX(ht.recent_hours) - MAX(ht.prior_hours)) / MAX(ht.prior_hours)) * 100 ELSE 0 END::numeric, 1) AS trend_hours_pct
         FROM projects p
         LEFT JOIN task_agg ta ON ta.project_id = p.id
         CROSS JOIN hours_trend ht
         WHERE p.is_active = true AND p.has_schedule = true`,
      ),

      query<{ variance_hours: string; variance_pct: string }>(
        `SELECT
           ROUND(COALESCE(SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)),0)::numeric, 1) AS variance_hours,
           ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN (SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / SUM(COALESCE(t.baseline_hours,0))) * 100
             ELSE 0 END::numeric, 1) AS variance_pct
         FROM tasks t JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true`,
      ),

      query<{
        project_id: string; project_name: string; accountable_owner: string; workstream: string;
        variance_hours: string; variance_pct: string; critical_open: string; avg_progress: string;
        total_hours: string; actual_hours: string; baseline_hours: string; task_count: string;
        spi: string; trend_hours_pct: string; trend_hours_mo: string;
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
             COALESCE(SUM(COALESCE(t.total_hours,0)),0) AS total_hours,
             COALESCE(SUM(COALESCE(t.actual_hours,0)),0) AS actual_hours,
             COALESCE(SUM(COALESCE(t.baseline_hours,0)),0) AS baseline_hours,
             COUNT(t.id)::int AS task_count,
             ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
               THEN SUM(COALESCE(t.actual_hours,0)) / NULLIF(SUM(COALESCE(t.baseline_hours,0)),0) ELSE 0 END::numeric, 2) AS spi,
             ROUND(CASE WHEN COALESCE(ht.prior_hours,0) > 0
               THEN ((COALESCE(ht.recent_hours,0) - COALESCE(ht.prior_hours,0)) / NULLIF(ht.prior_hours,0)) * 100 ELSE 0 END::numeric, 1) AS trend_hours_pct,
             ROUND((COALESCE(ht.recent_hours,0) / 3.0)::numeric, 1) AS trend_hours_mo
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
           variance_pct DESC
         LIMIT 20`,
      ),

      query<{
        project_id: string;
        project_name: string;
        accountable_owner: string;
        customer_id: string | null;
        customer_name: string;
        site_id: string | null;
        site_name: string;
        workstream: string;
        spi: string;
        trend_hours_pct: string;
        variance_pct: string;
        variance_hours: string;
        avg_progress: string;
        actual_hours: string;
        baseline_hours: string;
        task_count: string;
        critical_open: string;
        overdue_count: string;
        schedule_variance_days: string;
      }>(
        `WITH hours_trend AS (
           SELECT
             h.project_id,
             COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS recent_hours,
             COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '6 months' AND h.date < CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS prior_hours
           FROM hour_entries h
           GROUP BY h.project_id
         )
         SELECT
           p.id AS project_id,
           p.name AS project_name,
           COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned') AS accountable_owner,
           p.customer_id,
           COALESCE(NULLIF(TRIM(cu.name), ''), p.customer_id, 'Unassigned Customer') AS customer_name,
           p.site_id,
           COALESCE(NULLIF(TRIM(si.name), ''), p.site_id, 'Unassigned Site') AS site_name,
           COALESCE(
             NULLIF((SELECT u.name FROM units u WHERE u.project_id = p.id ORDER BY u.updated_at DESC NULLS LAST LIMIT 1), ''),
             'Core Program'
           ) AS workstream,
           ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN SUM(COALESCE(t.actual_hours,0)) / NULLIF(SUM(COALESCE(t.baseline_hours,0)),0)
             ELSE 0 END::numeric, 2) AS spi,
           ROUND(CASE WHEN COALESCE(ht.prior_hours,0) > 0
             THEN ((COALESCE(ht.recent_hours,0) - COALESCE(ht.prior_hours,0)) / NULLIF(ht.prior_hours,0)) * 100
             ELSE 0 END::numeric, 1) AS trend_hours_pct,
           ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN (SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / SUM(COALESCE(t.baseline_hours,0))) * 100
             ELSE 0 END::numeric, 1) AS variance_pct,
           ROUND(COALESCE(SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)),0)::numeric, 1) AS variance_hours,
           ROUND(COALESCE(AVG(COALESCE(t.percent_complete,0)),0)::numeric, 1) AS avg_progress,
           ROUND(COALESCE(SUM(COALESCE(t.actual_hours,0)),0)::numeric, 1) AS actual_hours,
           ROUND(COALESCE(SUM(COALESCE(t.baseline_hours,0)),0)::numeric, 1) AS baseline_hours,
           COUNT(t.id)::int::text AS task_count,
           SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END)::int AS critical_open,
           SUM(CASE WHEN t.baseline_end < CURRENT_DATE AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END)::int AS overdue_count,
           (CASE WHEN p.baseline_end IS NOT NULL AND p.baseline_end::date < CURRENT_DATE THEN (CURRENT_DATE - p.baseline_end::date) ELSE 0 END)::int AS schedule_variance_days
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN sites si ON si.id = p.site_id
         LEFT JOIN hours_trend ht ON ht.project_id = p.id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY p.id, p.name, pf.name, p.customer_id, cu.name, p.site_id, si.name, ht.recent_hours, ht.prior_hours
         ORDER BY accountable_owner, customer_name, site_name, p.name`,
      ),

      query<{ month: string; spi: string; trend_hours: string; trend_hours_pct: string; variance_pct: string }>(
        `WITH monthly_hours AS (
           SELECT
             TO_CHAR(DATE_TRUNC('month', h.date), 'YYYY-MM') AS month,
             COALESCE(SUM(COALESCE(h.hours,0)),0) AS ah
           FROM hour_entries h
           JOIN projects p ON p.id = h.project_id
           WHERE p.is_active = true AND p.has_schedule = true
             AND h.date >= CURRENT_DATE - INTERVAL '6 months'
           GROUP BY TO_CHAR(DATE_TRUNC('month', h.date), 'YYYY-MM')
         ),
         baseline AS (
           SELECT
             ROUND(COALESCE(SUM(COALESCE(t.baseline_hours,0)),0)::numeric,1) AS bh,
             ROUND(COALESCE(SUM(COALESCE(t.actual_hours,0)),0)::numeric,1) AS ah_total
           FROM tasks t JOIN projects p ON p.id = t.project_id
           WHERE p.is_active = true AND p.has_schedule = true
         )
         SELECT
           mh.month,
           ROUND(CASE WHEN b.bh > 0 THEN (mh.ah / b.bh) * 6 ELSE 0 END::numeric, 2) AS spi,
           ROUND(mh.ah::numeric, 1) AS trend_hours,
           ROUND(CASE WHEN LAG(mh.ah) OVER (ORDER BY mh.month) > 0
             THEN ((mh.ah - LAG(mh.ah) OVER (ORDER BY mh.month)) / LAG(mh.ah) OVER (ORDER BY mh.month)) * 100
             ELSE 0 END::numeric, 1) AS trend_hours_pct,
           ROUND(CASE WHEN b.bh > 0 THEN ((mh.ah - (b.bh / 6)) / (b.bh / 6)) * 100 ELSE 0 END::numeric, 1) AS variance_pct
         FROM monthly_hours mh CROSS JOIN baseline b
         ORDER BY mh.month`,
      ),

      query<{ status_bucket: string; cnt: string }>(
        `SELECT
           CASE
             WHEN COALESCE(t.percent_complete,0) >= 100 AND (t.actual_end IS NULL OR t.actual_end <= t.baseline_end) THEN 'completed_on_time'
             WHEN COALESCE(t.percent_complete,0) >= 100 THEN 'completed_late'
             WHEN COALESCE(t.percent_complete,0) > 0 AND t.baseline_end >= CURRENT_DATE THEN 'in_progress_on_track'
             WHEN COALESCE(t.percent_complete,0) > 0 THEN 'in_progress_delayed'
             WHEN t.baseline_start <= CURRENT_DATE THEN 'not_started_overdue'
             ELSE 'not_started'
           END AS status_bucket,
           COUNT(*)::int AS cnt
         FROM tasks t JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true AND t.is_milestone = true
         GROUP BY 1`,
      ),

      query<{ charge_category: string; hours: string }>(
        `SELECT
           CASE
             WHEN LOWER(COALESCE(h.charge_code, '')) LIKE '%qc%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%quality%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%rework%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%rw%' THEN 'Quality / Rework'
             WHEN LOWER(COALESCE(h.charge_code, '')) LIKE '%admin%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%meeting%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%training%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%pto%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%holiday%'
               OR LOWER(COALESCE(h.charge_code, '')) LIKE '%overhead%' THEN 'Non-Execute'
             ELSE 'Execute'
           END AS charge_category,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours
         FROM hour_entries h JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY 1`,
      ),
    ]);

    const interventions = varianceRows.map((r, i) => {
      const vpct = Number(r.variance_pct || 0);
      const critOpen = Number(r.critical_open || 0);
      const severity = (vpct >= 35 || critOpen >= 8) ? 'critical' : (vpct >= 20 || critOpen >= 5) ? 'warning' : 'info';
      const priority = (vpct >= 35 || critOpen >= 8) ? 'P1' : (vpct >= 20 || critOpen >= 5) ? 'P2' : 'P3';
      return {
        id: `int-${i + 1}-${r.project_id}`,
        project_id: r.project_id,
        project_name: r.project_name,
        accountable_owner: r.accountable_owner,
        workstream: r.workstream,
        severity,
        intervention_priority: priority,
        variance_signal: `Variance ${vpct.toFixed(1)}% | Critical Open ${critOpen}`,
        recommended_action:
          vpct >= 35 ? 'Immediate executive review with portfolio owner'
          : vpct >= 20 ? 'Directive alignment in next operating cadence'
          : 'Monitor in weekly operating review',
        variance_pct: vpct,
        variance_hours: Number(r.variance_hours || 0),
        actual_hours: Number(r.actual_hours || 0),
        baseline_hours: Number(r.baseline_hours || 0),
        avg_progress: Number(r.avg_progress || 0),
        task_count: Number(r.task_count || 0),
        critical_open: critOpen,
        spi: Number(r.spi || 0),
        trend_hours_pct: Number(r.trend_hours_pct || 0),
        trend_hours_mo: Number(r.trend_hours_mo || 0),
      };
    });

    const criticalExposure = interventions.filter((r) => r.severity === 'critical').length;
    const portfolioSpi = Number(spiTrendRow[0]?.spi || 0);
    const portfolioTrendHoursPct = Number(spiTrendRow[0]?.trend_hours_pct || 0);

    const healthWeights = { spi: 0.35, trend: 0.2, progress: 0.25, variance: 0.2 };
    const avgProgress = interventions.length > 0 ? interventions.reduce((s, r) => s + r.avg_progress, 0) / interventions.length : 0;
    const absVariancePct = Math.abs(Number(scheduleVarRow[0]?.variance_pct || 0));
    const varianceScore = Math.max(0, 100 - absVariancePct * 2);
    const healthScore = Math.round(
      Math.min(portfolioSpi, 1) * 100 * healthWeights.spi +
      Math.max(0, 100 - Math.abs(portfolioTrendHoursPct)) * healthWeights.trend +
      avgProgress * healthWeights.progress +
      varianceScore * healthWeights.variance,
    );

    const milestoneDistribution: Record<string, number> = {
      completed_on_time: 0, completed_late: 0,
      in_progress_on_track: 0, in_progress_delayed: 0,
      not_started: 0, not_started_overdue: 0,
    };
    milestoneRows.forEach((r) => { milestoneDistribution[r.status_bucket] = Number(r.cnt); });

    const effTotalHours = efficiencyRows.reduce((s, r) => s + Number(r.hours || 0), 0);
    const efficiencyBreakdown = efficiencyRows.map((r) => ({
      category: r.charge_category,
      hours: Number(r.hours || 0),
      pct: effTotalHours > 0 ? Math.round((Number(r.hours) / effTotalHours) * 100) : 0,
    }));

    const spiTrendMatrix = interventions.map((r) => ({
      project_name: r.project_name,
      spi: r.spi,
      trend_hours_pct: r.trend_hours_pct,
      severity: r.severity,
      variance_pct: r.variance_pct,
    }));

    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    const healthStatus = (score: number) => (score >= 75 ? 'green' : score >= 55 ? 'yellow' : 'red');
    const healthCascade = cascadeRows.map((r) => {
      const spi = Number(r.spi || 0);
      const variancePct = Number(r.variance_pct || 0);
      const trendHoursPct = Number(r.trend_hours_pct || 0);
      const progress = Number(r.avg_progress || 0);
      const criticalOpen = Number(r.critical_open || 0);
      const overdueCount = Number(r.overdue_count || 0);
      const scheduleVarianceDays = Number(r.schedule_variance_days || 0);

      const baselineHealth = clamp(spi * 100);
      // Schedule Health: credibility of remaining hours burndown vs actual hours charged (per PWA definition).
      // Trust = 100 minus penalties for overdue tasks and schedule slip. Disregards 1-1 reduction.
      const overduePenalty = Math.min(40, overdueCount * 8);
      const varianceDaysPenalty = Math.min(30, scheduleVarianceDays);
      const scheduleHealth = clamp(100 - overduePenalty - varianceDaysPenalty);
      const trendHealth = clamp(100 - Math.abs(trendHoursPct));
      const executionHealth = clamp(progress);
      const overallCompliance = clamp(
        baselineHealth * 0.30 +
        scheduleHealth * 0.30 +
        trendHealth * 0.15 +
        executionHealth * 0.25 -
        (criticalOpen >= 6 ? 12 : criticalOpen >= 3 ? 6 : 0),
      );

      return {
        project_id: r.project_id,
        project_name: r.project_name,
        accountable_owner: r.accountable_owner,
        customer_id: r.customer_id || 'Unassigned Customer',
        customer_name: r.customer_name || 'Unassigned Customer',
        site_id: r.site_id || 'Unassigned Site',
        site_name: r.site_name || 'Unassigned Site',
        workstream: r.workstream || 'Core Program',
        spi: spi,
        trend_hours_pct: trendHoursPct,
        variance_pct: variancePct,
        variance_hours: Number(r.variance_hours || 0),
        avg_progress: progress,
        actual_hours: Number(r.actual_hours || 0),
        baseline_hours: Number(r.baseline_hours || 0),
        task_count: Number(r.task_count || 0),
        critical_open: criticalOpen,
        baseline_health: Math.round(baselineHealth),
        schedule_health: Math.round(scheduleHealth),
        trend_health: Math.round(trendHealth),
        execution_health: Math.round(executionHealth),
        overall_compliance: Math.round(overallCompliance),
        baseline_light: healthStatus(baselineHealth),
        schedule_light: healthStatus(scheduleHealth),
        trend_light: healthStatus(trendHealth),
        execution_light: healthStatus(executionHealth),
        overall_light: healthStatus(overallCompliance),
      };
    });

    return NextResponse.json({
      success: true,
      kpis: {
        activeProjects: Number(projectCount[0]?.cnt || 0),
        interventionItems: interventions.length,
        criticalExposure,
        scheduleVarianceHours: Number(scheduleVarRow[0]?.variance_hours || 0),
        hoursVariancePct: Number(scheduleVarRow[0]?.variance_pct || 0),
        portfolioSpi,
        portfolioTrendHoursPct,
        healthScore,
      },
      interventionQueue: interventions,
      trend: trendRows.map((r) => ({
        month: r.month,
        spi: Number(r.spi || 0),
        trend_hours: Number(r.trend_hours || 0),
        trend_hours_pct: Number(r.trend_hours_pct || 0),
        variance_pct: Number(r.variance_pct || 0),
      })),
      milestoneDistribution,
      efficiencyBreakdown,
      spiTrendMatrix,
      healthCascade,
      updatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
