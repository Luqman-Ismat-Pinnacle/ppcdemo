import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [
      milestoneRows,
      milestoneDetailRows,
      efficiencyRows,
      topTaskRows,
      laborByRoleRows,
      laborByProjectRows,
      laborByPhaseRows,
      laborByChargeTypeRows,
      chargeBreakdownRows,
      categorizedChargeRows,
      weeklyTrendRows,
      taskLifecycleRows,
      laborTimelineRows,
    ] = await Promise.all([
      // 1. Milestone distribution (6 buckets)
      query<{ bucket: string; cnt: string }>(
        `SELECT
           CASE
             WHEN COALESCE(t.percent_complete,0) >= 100
               AND (t.actual_end IS NULL OR t.actual_end <= t.baseline_end)
               THEN 'Completed On Time'
             WHEN COALESCE(t.percent_complete,0) >= 100 THEN 'Completed Late'
             WHEN COALESCE(t.percent_complete,0) > 0
               AND t.baseline_end >= CURRENT_DATE
               THEN 'In Progress On Track'
             WHEN COALESCE(t.percent_complete,0) > 0 THEN 'In Progress Delayed'
             WHEN t.baseline_start <= CURRENT_DATE THEN 'Not Started Overdue'
             ELSE 'Not Started'
           END AS bucket,
           COUNT(*)::int AS cnt
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true AND t.is_milestone = true
         GROUP BY 1
         ORDER BY 1`,
      ),

      // 2. Milestone detail rows
      query<{
        id: string; name: string; project_name: string;
        baseline_start: string | null; baseline_end: string | null;
        start_date: string | null; end_date: string | null;
        actual_start: string | null; actual_end: string | null;
        percent_complete: string; is_critical: boolean;
        total_float: string | null; comments: string | null;
      }>(
        `SELECT
           t.id, t.name, p.name AS project_name,
           t.baseline_start::text, t.baseline_end::text,
           t.baseline_start::text AS start_date, t.baseline_end::text AS end_date,
           t.actual_start::text, t.actual_end::text,
           COALESCE(t.percent_complete,0)::text AS percent_complete,
           COALESCE(t.is_critical, false) AS is_critical,
           t.total_float::text,
           t.comments
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true AND t.is_milestone = true
         ORDER BY
           CASE
             WHEN COALESCE(t.percent_complete,0) >= 100 THEN 3
             WHEN COALESCE(t.percent_complete,0) > 0 THEN 1
             ELSE 2
           END,
           t.baseline_end ASC NULLS LAST
         LIMIT 100`,
      ),

      // 3. Period efficiency (Execute / Quality / Non-Execute)
      query<{ category: string; hours: string; entry_count: string }>(
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
           END AS category,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours,
           COUNT(*)::int AS entry_count
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY 1
         ORDER BY 1`,
      ),

      // 4. Top task hours movers (baseline vs actual)
      query<{
        task_name: string; project_name: string;
        baseline_hours: string; actual_hours: string; remaining_hours: string;
        variance_hours: string; variance_pct: string; percent_complete: string;
      }>(
        `SELECT
           t.name AS task_name, p.name AS project_name,
           COALESCE(t.baseline_hours,0)::text AS baseline_hours,
           COALESCE(t.actual_hours,0)::text AS actual_hours,
           COALESCE(t.remaining_hours,0)::text AS remaining_hours,
           ROUND((COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0))::numeric, 1)::text AS variance_hours,
           ROUND(
             CASE WHEN COALESCE(t.baseline_hours,0) > 0
               THEN ((COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / t.baseline_hours) * 100
               ELSE 0
             END::numeric, 1
           )::text AS variance_pct,
           COALESCE(t.percent_complete,0)::text AS percent_complete
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND COALESCE(t.baseline_hours,0) > 0
           AND t.is_summary = false AND t.is_milestone = false
         ORDER BY ABS(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) DESC
         LIMIT 25`,
      ),

      // 5. Labor distribution by role
      query<{ role: string; hours: string; headcount: string }>(
        `SELECT
           COALESCE(NULLIF(TRIM(e.job_title), ''), 'Unclassified') AS role,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours,
           COUNT(DISTINCT h.employee_id)::int AS headcount
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN employees e ON e.id = h.employee_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY COALESCE(NULLIF(TRIM(e.job_title), ''), 'Unclassified')
         ORDER BY SUM(h.hours) DESC
         LIMIT 15`,
      ),

      // 6. Labor distribution by project
      query<{ project_name: string; hours: string; headcount: string }>(
        `SELECT
           p.name AS project_name,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours,
           COUNT(DISTINCT h.employee_id)::int AS headcount
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY p.name
         ORDER BY SUM(h.hours) DESC
         LIMIT 15`,
      ),

      // 7. Labor distribution by phase
      query<{ phase: string; hours: string; headcount: string }>(
        `SELECT
           COALESCE(NULLIF(TRIM(h.phase), ''), 'Unspecified') AS phase,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours,
           COUNT(DISTINCT h.employee_id)::int AS headcount
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY COALESCE(NULLIF(TRIM(h.phase), ''), 'Unspecified')
         ORDER BY SUM(h.hours) DESC
         LIMIT 15`,
      ),

      // 8. Labor distribution by charge type
      query<{ charge_type: string; hours: string; headcount: string }>(
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
           END AS charge_type,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours,
           COUNT(DISTINCT h.employee_id)::int AS headcount
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY 1
         ORDER BY SUM(h.hours) DESC`,
      ),

      // 9. Charge code breakdown (for quality/non-execute detail)
      query<{ charge_code: string; hours: string; entry_count: string }>(
        `SELECT
           COALESCE(NULLIF(TRIM(h.charge_code), ''), 'Unspecified') AS charge_code,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours,
           COUNT(*)::int AS entry_count
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY COALESCE(NULLIF(TRIM(h.charge_code), ''), 'Unspecified')
         ORDER BY SUM(h.hours) DESC
         LIMIT 20`,
      ),

      // 10. Categorized charge code detail (for drill-down)
      query<{ category: string; charge_code: string; hours: string; project_name: string }>(
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
           END AS category,
           COALESCE(NULLIF(TRIM(h.charge_code), ''), 'Unspecified') AS charge_code,
           ROUND(SUM(h.hours)::numeric, 1) AS hours,
           p.name AS project_name
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY 1, COALESCE(NULLIF(TRIM(h.charge_code), ''), 'Unspecified'), p.name
         ORDER BY 1, SUM(h.hours) DESC`,
      ),

      // 11. Weekly hours trend (last 12 weeks, with cost and entries)
      query<{ week: string; hours: string; cost: string; entries: string }>(
        `SELECT
           TO_CHAR(DATE_TRUNC('week', h.date), 'YYYY-MM-DD') AS week,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours,
           ROUND(COALESCE(SUM(COALESCE(h.actual_cost,0)),0)::numeric, 0) AS cost,
           COUNT(*)::int AS entries
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date >= CURRENT_DATE - INTERVAL '12 weeks'
         GROUP BY DATE_TRUNC('week', h.date)
         ORDER BY DATE_TRUNC('week', h.date)`,
      ),

      // 12. Task lifecycle: hours by date and charge code, including who charged
      query<{ project_name: string; task_name: string; date: string; charge_code: string; hours: string; employee_names: string | null }>(
        `SELECT
           p.name AS project_name,
           COALESCE(NULLIF(TRIM(h.task), ''), 'Unspecified') AS task_name,
           TO_CHAR(h.date, 'YYYY-MM-DD') AS date,
           COALESCE(NULLIF(TRIM(h.charge_code), ''), 'Unspecified') AS charge_code,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours,
           STRING_AGG(DISTINCT COALESCE(NULLIF(TRIM(e.name), ''), h.employee_id::text, 'Unknown'), ', ') AS employee_names
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN employees e ON e.id = h.employee_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date IS NOT NULL
           AND COALESCE(NULLIF(TRIM(h.task), ''), '') <> ''
         GROUP BY p.name, COALESCE(NULLIF(TRIM(h.task), ''), 'Unspecified'), TO_CHAR(h.date, 'YYYY-MM-DD'), COALESCE(NULLIF(TRIM(h.charge_code), ''), 'Unspecified')
         ORDER BY TO_CHAR(h.date, 'YYYY-MM-DD')`,
      ),

      // 13. Labor timeline for stacked over-time breakdowns
      query<{ week: string; role: string; project_name: string; phase: string; charge_type: string; hours: string }>(
        `SELECT
           TO_CHAR(DATE_TRUNC('week', h.date), 'YYYY-MM-DD') AS week,
           COALESCE(NULLIF(TRIM(e.job_title), ''), 'Unclassified') AS role,
           p.name AS project_name,
           COALESCE(NULLIF(TRIM(h.phase), ''), 'Unspecified') AS phase,
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
           END AS charge_type,
           ROUND(COALESCE(SUM(h.hours),0)::numeric, 1) AS hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN employees e ON e.id = h.employee_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date >= CURRENT_DATE - INTERVAL '16 weeks'
         GROUP BY DATE_TRUNC('week', h.date), role, p.name, phase, charge_type
         ORDER BY DATE_TRUNC('week', h.date)`,
      ),
    ]);

    // Milestone distribution
    const milestoneDistribution: Record<string, number> = {};
    let totalMilestones = 0;
    milestoneRows.forEach((r) => { milestoneDistribution[r.bucket] = Number(r.cnt); totalMilestones += Number(r.cnt); });

    const milestones = milestoneDetailRows.map((r) => {
      const pct = Number(r.percent_complete || 0);
      const blEnd = r.baseline_end;
      const actEnd = r.actual_end;
      const schedEnd = r.end_date;
      let bucket: string;
      if (pct >= 100) {
        bucket = (actEnd && blEnd && actEnd > blEnd) ? 'Completed Late' : 'Completed On Time';
      } else if (pct > 0) {
        bucket = (schedEnd && new Date(schedEnd) >= new Date()) ? 'In Progress On Track' : 'In Progress Delayed';
      } else {
        const sDate = r.start_date || r.baseline_start;
        bucket = (sDate && new Date(sDate) <= new Date()) ? 'Not Started Overdue' : 'Not Started';
      }
      return { ...r, percent_complete: pct, bucket };
    });

    // Efficiency summary
    const effTotal = efficiencyRows.reduce((s, r) => s + Number(r.hours || 0), 0);
    const efficiency = efficiencyRows.map((r) => ({
      category: r.category,
      hours: Number(r.hours || 0),
      entries: Number(r.entry_count || 0),
      pct: effTotal > 0 ? Math.round((Number(r.hours) / effTotal) * 100) : 0,
    }));

    // Task hours
    const topTasks = topTaskRows.map((r, i) => ({
      id: `task-${i}`,
      task_name: r.task_name,
      project_name: r.project_name,
      baseline_hours: Number(r.baseline_hours),
      actual_hours: Number(r.actual_hours),
      remaining_hours: Number(r.remaining_hours),
      variance_hours: Number(r.variance_hours),
      variance_pct: Number(r.variance_pct),
      percent_complete: Number(r.percent_complete),
    }));

    // Labor
    const laborByRole = laborByRoleRows.map((r) => ({
      role: r.role,
      hours: Number(r.hours),
      headcount: Number(r.headcount),
    }));
    const laborByProject = laborByProjectRows.map((r) => ({
      project_name: r.project_name,
      hours: Number(r.hours),
      headcount: Number(r.headcount),
    }));
    const laborByPhase = laborByPhaseRows.map((r) => ({
      phase: r.phase,
      hours: Number(r.hours),
      headcount: Number(r.headcount),
    }));
    const laborByChargeType = laborByChargeTypeRows.map((r) => ({
      charge_type: r.charge_type,
      hours: Number(r.hours),
      headcount: Number(r.headcount),
    }));

    // Charge codes
    const chargeCodes = chargeBreakdownRows.map((r) => ({
      charge_code: r.charge_code,
      hours: Number(r.hours),
      entries: Number(r.entry_count),
    }));

    // Weekly trend
    const weeklyTrend = weeklyTrendRows.map((r) => ({
      week: r.week,
      hours: Number(r.hours),
      cost: Number(r.cost),
      entries: Number(r.entries),
    }));

    const taskLifecycle = taskLifecycleRows.map((r) => ({
      project_name: r.project_name,
      task_name: r.task_name,
      date: r.date,
      charge_code: r.charge_code,
      hours: Number(r.hours),
      employee_names: r.employee_names || '',
    }));
    const laborTimeline = laborTimelineRows.map((r) => ({
      week: r.week,
      role: r.role,
      project_name: r.project_name,
      phase: r.phase,
      charge_type: r.charge_type,
      hours: Number(r.hours),
    }));

    // Portfolio-level efficiency KPIs
    const baselineTotal = topTasks.reduce((s, t) => s + t.baseline_hours, 0);
    const actualTotal = topTasks.reduce((s, t) => s + t.actual_hours, 0);
    const varianceTotal = actualTotal - baselineTotal;
    const efficiencyPct = baselineTotal > 0 ? Math.round((actualTotal / baselineTotal) * 100) : 0;

    // Categorized charge detail grouped by category
    const categorizedCharges: Record<string, { charge_code: string; hours: number; project_name: string }[]> = {};
    categorizedChargeRows.forEach((r) => {
      if (!categorizedCharges[r.category]) categorizedCharges[r.category] = [];
      categorizedCharges[r.category].push({ charge_code: r.charge_code, hours: Number(r.hours), project_name: r.project_name });
    });

    return NextResponse.json({
      success: true,
      milestoneDistribution,
      totalMilestones,
      milestones,
      efficiency,
      efficiencyKpis: { baselineTotal, actualTotal, varianceTotal, efficiencyPct, totalHours: effTotal },
      topTasks,
      laborByRole,
      laborByProject,
      laborByPhase,
      laborByChargeType,
      chargeCodes,
      categorizedCharges,
      weeklyTrend,
      taskLifecycle,
      laborTimeline,
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
