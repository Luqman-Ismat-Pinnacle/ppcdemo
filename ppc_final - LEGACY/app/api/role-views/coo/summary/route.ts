import { NextResponse } from 'next/server';
import { basePortfolioSummary, safeRows, asNumber, severityRank, ageLabel } from '@/lib/role-summary-db';
import { buildPeriodHoursSummary } from '@/lib/calculations/selectors';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await basePortfolioSummary();
  const [
    escalationsRows,
    smRows,
    moversRows,
    fallbackMoversRows,
    portfolioRollupRows,
    projectsRollupRows,
    hourEntriesRollupRows,
    milestoneBucketsRows,
    efficiencyRows,
  ] = await Promise.all([
    safeRows(
      `SELECT id, severity, title, message, created_at
       FROM alert_events
       WHERE COALESCE(status,'open') = 'open'
       ORDER BY created_at ASC
       LIMIT 40`,
    ),
    safeRows(
      `SELECT COALESCE(role_key,'senior_manager') AS manager, COUNT(*)::int AS alert_count
       FROM workflow_audit_log
       WHERE event_type = 'alert_status_update'
       GROUP BY 1
       ORDER BY 2 DESC
       LIMIT 12`,
    ),
    safeRows(
      `SELECT COALESCE(p.name, ph.project_id, ph.id::text) AS name, COALESCE(ph.health_score, 0)::float AS health
       FROM project_health ph
       LEFT JOIN projects p ON p.id = ph.project_id
       WHERE ph.project_id IN (
         SELECT id FROM projects WHERE COALESCE(has_schedule, false) = true
         UNION
         SELECT DISTINCT project_id FROM hour_entries WHERE project_id IS NOT NULL
       )
       ORDER BY ph.updated_at DESC NULLS LAST
       LIMIT 20`,
    ),
    safeRows(
      `SELECT
         COALESCE(p.name, p.id::text) AS name,
         COALESCE(
           CASE
             WHEN p.cpi IS NOT NULL OR p.spi IS NOT NULL
               THEN (COALESCE(p.cpi, 0.8) * 50.0) + (COALESCE(p.spi, 0.8) * 50.0)
             WHEN p.percent_complete IS NOT NULL
               THEN p.percent_complete
             ELSE 0
           END,
           0
         )::float AS health
       FROM projects p
       WHERE COALESCE(p.has_schedule, false) = true
          OR EXISTS (SELECT 1 FROM hour_entries he WHERE he.project_id = p.id)
       ORDER BY p.updated_at DESC NULLS LAST
       LIMIT 50`,
    ),
    safeRows(
      `SELECT
         COALESCE(SUM(baseline_hours), 0)::float AS baseline_hours,
         COALESCE(SUM(actual_hours), 0)::float AS actual_hours,
         COALESCE(SUM(remaining_hours), 0)::float AS remaining_hours,
         COALESCE(SUM(baseline_hours * (percent_complete / 100.0)), 0)::float AS ev_hours,
         COALESCE(SUM(
           baseline_hours *
           CASE
             WHEN baseline_start_date IS NOT NULL
               AND baseline_end_date IS NOT NULL
               AND baseline_end_date > baseline_start_date
             THEN LEAST(
               1.0,
               GREATEST(
                 0.0,
                 (DATE_PART('epoch', CURRENT_DATE::timestamp - baseline_start_date::timestamp) / 86400.0) /
                 NULLIF(DATE_PART('epoch', baseline_end_date::timestamp - baseline_start_date::timestamp) / 86400.0, 0)
               )
             )
             ELSE 0.0
           END
         ), 0)::float AS pv_hours
       FROM portfolios
       WHERE COALESCE(is_active, true) = true`,
    ),
    safeRows(
      `SELECT
         COALESCE(SUM(p.baseline_hours), 0)::float AS baseline_hours,
         COALESCE(SUM(p.actual_hours), 0)::float AS actual_hours,
         COALESCE(SUM(p.remaining_hours), 0)::float AS remaining_hours,
         COALESCE(SUM(p.baseline_hours * COALESCE(p.percent_complete, 0) / 100.0), 0)::float AS ev_hours,
         COALESCE(SUM(
           p.baseline_hours *
           CASE
             WHEN p.baseline_start_date IS NOT NULL
               AND p.baseline_end_date IS NOT NULL
               AND p.baseline_end_date > p.baseline_start_date
             THEN LEAST(
               1.0,
               GREATEST(
                 0.0,
                 (DATE_PART('epoch', CURRENT_DATE::timestamp - p.baseline_start_date::timestamp) / 86400.0) /
                 NULLIF(DATE_PART('epoch', p.baseline_end_date::timestamp - p.baseline_start_date::timestamp) / 86400.0, 0)
               )
             )
             ELSE 0.0
           END
         ), 0)::float AS pv_hours
       FROM projects p
       WHERE COALESCE(p.is_active, true) = true`,
    ),
    safeRows(
      `SELECT
         COALESCE(SUM(he.hours), 0)::float AS actual_hours
       FROM hour_entries he`,
    ),
    safeRows(
      `SELECT
         COUNT(*) FILTER (
           WHERE actual_date IS NOT NULL
             AND COALESCE(variance_days, 0) <= 0
         ) AS completed_on_time,
         COUNT(*) FILTER (
           WHERE actual_date IS NOT NULL
             AND COALESCE(variance_days, 0) > 0
         ) AS completed_delayed,
         COUNT(*) FILTER (
           WHERE actual_date IS NULL
             AND COALESCE(percent_complete, 0) > 0
             AND COALESCE(variance_days, 0) <= 0
         ) AS in_progress_forecasted_on_time,
         COUNT(*) FILTER (
           WHERE actual_date IS NULL
             AND COALESCE(percent_complete, 0) > 0
             AND COALESCE(variance_days, 0) > 0
         ) AS in_progress_forecasted_delayed,
         COUNT(*) FILTER (
           WHERE actual_date IS NULL
             AND COALESCE(percent_complete, 0) = 0
             AND COALESCE(variance_days, 0) <= 0
         ) AS not_started_forecasted_on_time,
         COUNT(*) FILTER (
           WHERE actual_date IS NULL
             AND COALESCE(percent_complete, 0) = 0
             AND COALESCE(variance_days, 0) > 0
         ) AS not_started_forecasted_delayed
       FROM milestones`,
    ),
    safeRows(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN UPPER(COALESCE(charge_type, charge_code, '')) IN ('EX', 'EXECUTE', 'BILLABLE')
             THEN hours
             ELSE 0
           END
         ), 0)::float AS execute_hours,
         COALESCE(SUM(
           CASE
             WHEN UPPER(COALESCE(charge_type, charge_code, '')) IN ('QC', 'RW')
             THEN hours
             ELSE 0
           END
         ), 0)::float AS quality_hours,
         COALESCE(SUM(
           CASE
             WHEN UPPER(COALESCE(charge_type, charge_code, '')) NOT IN ('EX', 'EXECUTE', 'BILLABLE', 'QC', 'RW')
             THEN hours
             ELSE 0
           END
         ), 0)::float AS non_execute_hours,
         COALESCE(SUM(hours), 0)::float AS total_hours
       FROM hour_entries`,
    ),
  ]);

  const resolvedMovers = moversRows.length > 0 ? moversRows : fallbackMoversRows;

  const queue = escalationsRows
    .map((row) => ({
      id: String(row.id || ''),
      severity: String(row.severity || 'info').toLowerCase(),
      title: String(row.title || 'Alert'),
      detail: String(row.message || ''),
      age: ageLabel(String(row.created_at || '')),
    }))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 7);

  const topThree = {
    portfolioHealth: Math.max(0, 100 - (base.overdueTasks * 2 + base.criticalAlerts * 8)),
    periodEfficiency: Math.max(0, Math.round(base.mappingCoverage)),
    decisionsRequired: queue.length,
  };

  const portfolioRollup = portfolioRollupRows[0] || {};
  const projectsRollup = projectsRollupRows[0] || {};
  const hourEntriesRollup = hourEntriesRollupRows[0] || {};
  const baselineHours = asNumber(portfolioRollup.baseline_hours) || asNumber(projectsRollup.baseline_hours);
  const actualHours = asNumber(portfolioRollup.actual_hours) || asNumber(projectsRollup.actual_hours) || asNumber(hourEntriesRollup.actual_hours);
  const remainingHours = asNumber(portfolioRollup.remaining_hours) || asNumber(projectsRollup.remaining_hours);
  const evHours = asNumber(portfolioRollup.ev_hours) || asNumber(projectsRollup.ev_hours);
  const pvHours = asNumber(portfolioRollup.pv_hours) || asNumber(projectsRollup.pv_hours);

  const hoursSummary = buildPeriodHoursSummary([{ baseline: baselineHours, actual: actualHours }]);
  const workingDaysApprox = 10; // Approximate two-week period; refined in period-review API.
  const hoursFteEquivalent = workingDaysApprox > 0 ? hoursSummary.added / 8 / workingDaysApprox : 0;

  const actualPercentComplete = baselineHours > 0 ? (evHours / baselineHours) * 100 : 0;
  const plannedPercentComplete = baselineHours > 0 ? (pvHours / baselineHours) * 100 : 0;
  const scheduleDeltaHours = evHours - pvHours;

  const milestoneAgg = milestoneBucketsRows[0] || {};
  const milestoneStatus = {
    completedOnTime: asNumber(milestoneAgg.completed_on_time),
    completedDelayed: asNumber(milestoneAgg.completed_delayed),
    inProgressForecastedOnTime: asNumber(milestoneAgg.in_progress_forecasted_on_time),
    inProgressForecastedDelayed: asNumber(milestoneAgg.in_progress_forecasted_delayed),
    notStartedForecastedOnTime: asNumber(milestoneAgg.not_started_forecasted_on_time),
    notStartedForecastedDelayed: asNumber(milestoneAgg.not_started_forecasted_delayed),
  };

  const efficiencyAgg = efficiencyRows[0] || {};
  const executeHours = asNumber(efficiencyAgg.execute_hours);
  const qualityHours = asNumber(efficiencyAgg.quality_hours);
  const nonExecuteHours = asNumber(efficiencyAgg.non_execute_hours);
  const totalEffHours = Math.max(0, asNumber(efficiencyAgg.total_hours));
  const executePct = totalEffHours > 0 ? (executeHours / totalEffHours) * 100 : 0;
  const qualityPct = totalEffHours > 0 ? (qualityHours / totalEffHours) * 100 : 0;
  const nonExecutePct = totalEffHours > 0 ? (nonExecuteHours / totalEffHours) * 100 : 0;

  const response = {
    success: true,
    scope: 'coo:command-center',
    computedAt: base.computedAt,
    sections: {
      topThree,
      decisionQueue: queue,
      periodPerformance: {
        completionRate: base.totalTasks > 0 ? Math.round(((base.totalTasks - base.overdueTasks) / base.totalTasks) * 100) : 100,
        openCommitments: base.openCommitments,
        topMovers: resolvedMovers.slice(0, 6).map((row) => ({
          name: String(row.name || ''),
          health: asNumber(row.health),
        })),
      },
      bySeniorManager: smRows.map((row) => ({
        manager: String(row.manager || 'Senior Manager'),
        projectCount: 0,
        avgHealth: null,
        alertCount: asNumber(row.alert_count),
      })),
      commandCenter: {
        hoursVariance: {
          plan: hoursSummary.plan,
          actual: hoursSummary.actual,
          added: hoursSummary.added,
          reduced: hoursSummary.reduced,
          deltaHours: hoursSummary.deltaHours,
          deltaPct: hoursSummary.deltaPct,
          fteEquivalent: hoursFteEquivalent,
          baselineHours,
          remainingHours,
        },
        scheduleVariance: {
          actualPercentComplete,
          plannedPercentComplete,
          deltaPercentPoints: actualPercentComplete - plannedPercentComplete,
          deltaHours: scheduleDeltaHours,
          evHours,
          pvHours,
        },
        periodEfficiencySummary: {
          executePct,
          qualityPct,
          nonExecutePct,
          totalHours: totalEffHours,
        },
        milestoneStatus,
      },
    },
    warnings: resolvedMovers.length ? [] : ['Top project health movers unavailable; neither project_health nor projects health proxies returned rows.'],
    actions: {
      commitments: { href: '/role-views/coo/commitments', method: 'GET' as const },
      alerts: { href: '/api/alerts?status=open', method: 'GET' as const },
    },
  };
  return NextResponse.json(response);
}
