import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Senior Manager summary: portfolio-level KPIs, projects, client risk, cost trend,
 * milestone distribution, efficiency breakdown, and action items.
 * TODO: Add portfolio scoping when auth/manager identity is available.
 */
export async function GET() {
  try {
    const [
      projectRows,
      clientRiskRows,
      costTrendRows,
      milestoneRows,
      efficiencyRows,
      actionRows,
    ] = await Promise.all([
      query<{
        id: string; name: string; owner: string; customer_name: string;
        actual_cost: string; remaining_cost: string; contract_value: string;
        actual_hours: string; baseline_hours: string; total_hours: string;
        percent_complete: string; critical_open: string; spi: string;
        trend_hours_pct: string; variance_pct: string;
      }>(
        `WITH hours_trend AS (
           SELECT h.project_id,
             COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS recent_hours,
             COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '6 months' AND h.date < CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) AS prior_hours
           FROM hour_entries h GROUP BY h.project_id
         )
         SELECT
           p.id, p.name,
           COALESCE(NULLIF(TRIM(lead.pca_name), ''), COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned')) AS owner,
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           COALESCE(p.actual_cost, 0)::text AS actual_cost,
           COALESCE(p.remaining_cost, 0)::text AS remaining_cost,
           COALESCE(cc.cv, 0)::text AS contract_value,
           COALESCE(p.actual_hours, 0)::text AS actual_hours,
           COALESCE(p.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(p.total_hours, 0)::text AS total_hours,
           COALESCE(p.percent_complete, 0)::text AS percent_complete,
           COALESCE(tc.critical_open, 0)::text AS critical_open,
           ROUND(CASE WHEN COALESCE(SUM(t.baseline_hours),0) > 0
             THEN SUM(COALESCE(t.actual_hours,0)) / NULLIF(SUM(COALESCE(t.baseline_hours,0)),0) ELSE 0 END::numeric, 2)::text AS spi,
           ROUND(CASE WHEN COALESCE(ht.prior_hours,0) > 0
             THEN ((COALESCE(ht.recent_hours,0) - COALESCE(ht.prior_hours,0)) / NULLIF(ht.prior_hours,0)) * 100 ELSE 0 END::numeric, 1)::text AS trend_hours_pct,
           ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN (SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / SUM(COALESCE(t.baseline_hours,0))) * 100 ELSE 0 END::numeric, 1)::text AS variance_pct
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN hours_trend ht ON ht.project_id = p.id
         LEFT JOIN LATERAL (
           SELECT NULLIF(TRIM(e.name), '') AS pca_name
           FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1
         ) lead ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(c.line_amount), 0) AS cv
           FROM customer_contracts c
           WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
         ) cc ON true
         LEFT JOIN LATERAL (
           SELECT SUM(CASE WHEN t2.is_critical = true AND COALESCE(t2.percent_complete,0) < 100 THEN 1 ELSE 0 END)::int AS critical_open
           FROM tasks t2 WHERE t2.project_id = p.id
         ) tc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY p.id, p.name, pf.name, cu.name, lead.pca_name, cc.cv, ht.recent_hours, ht.prior_hours, tc.critical_open
         ORDER BY p.name`,
      ),

      query<{
        customer_name: string; projects: string; total_contract: string;
        total_cost: string; margin_pct: string; at_risk: string;
      }>(
        `SELECT
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           COUNT(DISTINCT p.id)::text AS projects,
           COALESCE(SUM(cc.cv), 0)::text AS total_contract,
           COALESCE(SUM(p.actual_cost) + SUM(p.remaining_cost), 0)::text AS total_cost,
           ROUND(CASE WHEN SUM(cc.cv) > 0
             THEN ((SUM(cc.cv) - (SUM(p.actual_cost) + SUM(p.remaining_cost))) / SUM(cc.cv)) * 100 ELSE 0 END::numeric, 1)::text AS margin_pct,
           SUM(CASE
             WHEN (COALESCE(cc.cv,0) > 0 AND ((COALESCE(cc.cv,0) - (COALESCE(p.actual_cost,0) + COALESCE(p.remaining_cost,0))) / NULLIF(cc.cv,0) * 100) < 10)
               OR (tc.critical_open >= 2) THEN 1 ELSE 0
           END)::text AS at_risk
         FROM projects p
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(c.line_amount), 0) AS cv
           FROM customer_contracts c
           WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
         ) cc ON true
         LEFT JOIN LATERAL (
           SELECT SUM(CASE WHEN t.is_critical = true AND COALESCE(t.percent_complete,0) < 100 THEN 1 ELSE 0 END)::int AS critical_open
           FROM tasks t WHERE t.project_id = p.id
         ) tc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY cu.name`,
      ),

      query<{ month: string; hours: string; cost: string }>(
        `SELECT
           TO_CHAR(h.date, 'YYYY-MM') AS month,
           ROUND(COALESCE(SUM(h.hours), 0)::numeric, 1)::text AS hours,
           ROUND(COALESCE(SUM(h.actual_cost), 0)::numeric, 0)::text AS cost
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date IS NOT NULL AND h.date >= CURRENT_DATE - INTERVAL '12 months'
         GROUP BY TO_CHAR(h.date, 'YYYY-MM')
         ORDER BY month`,
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
         FROM hour_entries h JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY 1`,
      ),

      query<{
        id: string; item_type: string; source: string; title: string; message: string;
        project_name: string; owner: string; priority: string; created_at: string;
      }>(
        `WITH forecast_actions AS (
           SELECT CONCAT('fc-', f.id) AS id, 'forecast' AS item_type, 'PL' AS source,
             CASE WHEN COALESCE(f.status, 'pending') = 'revision_requested' THEN 'Forecast revision requested' ELSE 'Forecast pending review' END AS title,
             COALESCE(NULLIF(TRIM(f.review_comment), ''), COALESCE(NULLIF(TRIM(f.notes), ''), 'No details')) AS message,
             COALESCE(p.name, f.project_id) AS project_name,
             COALESCE(NULLIF(TRIM(lead.pca_name), ''), 'Unassigned') AS owner,
             CASE WHEN COALESCE(f.status, 'pending') = 'revision_requested' THEN 'P1' ELSE 'P2' END AS priority,
             f.created_at::text
           FROM forecasts f
           LEFT JOIN projects p ON p.id = f.project_id
           LEFT JOIN LATERAL (SELECT NULLIF(TRIM(e.name), '') AS pca_name FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1) lead ON true
           WHERE COALESCE(f.status, 'pending') IN ('pending', 'revision_requested')
         ),
         schedule_actions AS (
           SELECT CONCAT('od-', t.id) AS id, 'commitment' AS item_type, 'PCL' AS source,
             'Overdue task requires action' AS title, COALESCE(NULLIF(TRIM(t.name), ''), 'Task') AS message,
             p.name AS project_name, COALESCE(NULLIF(TRIM(lead.pca_name), ''), 'Unassigned') AS owner,
             'P1' AS priority, COALESCE(t.baseline_end::text, NOW()::text)
           FROM tasks t
           JOIN projects p ON p.id = t.project_id
           LEFT JOIN LATERAL (SELECT NULLIF(TRIM(e.name), '') AS pca_name FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1) lead ON true
           WHERE p.is_active = true AND p.has_schedule = true
             AND COALESCE(t.percent_complete, 0) < 100 AND t.baseline_end < CURRENT_DATE
           ORDER BY t.baseline_end ASC LIMIT 10
         ),
         role_notes AS (
           SELECT CONCAT('vn-', v.id) AS id, 'message' AS item_type, COALESCE(NULLIF(TRIM(v.role), ''), 'PCA') AS source,
             'Role message' AS title, COALESCE(NULLIF(TRIM(v.comment), ''), 'No details') AS message,
             COALESCE(NULLIF(TRIM(v.table_name), ''), 'portfolio') AS project_name, '' AS owner,
             CASE WHEN COALESCE(v.status, 'open') = 'open' THEN 'P2' ELSE 'P3' END AS priority, v.created_at::text
           FROM variance_notes v
           WHERE COALESCE(v.role, '') IN ('PCA', 'PCL', 'COO', 'PL', 'SM')
           ORDER BY v.created_at DESC LIMIT 12
         )
         SELECT * FROM (SELECT * FROM forecast_actions UNION ALL SELECT * FROM schedule_actions UNION ALL SELECT * FROM role_notes) x
         ORDER BY CASE x.priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, x.created_at DESC
         LIMIT 40`,
      ),
    ]);

    const projects = projectRows.map((r) => {
      const actual = Number(r.actual_cost || 0);
      const remaining = Number(r.remaining_cost || 0);
      const contract = Number(r.contract_value || 0);
      const eac = actual + remaining;
      const margin = contract > 0 ? Math.round(((contract - eac) / contract) * 1000) / 10 : 0;
      return {
        id: r.id,
        name: r.name,
        owner: r.owner || 'Unassigned',
        customer_name: r.customer_name || 'Unassigned',
        actual_cost: actual,
        remaining_cost: remaining,
        contract_value: contract,
        eac,
        margin,
        actual_hours: Number(r.actual_hours || 0),
        baseline_hours: Number(r.baseline_hours || 0),
        total_hours: Number(r.total_hours || 0),
        percent_complete: Number(r.percent_complete || 0),
        critical_open: Number(r.critical_open || 0),
        spi: Number(r.spi || 0),
        trend_hours_pct: Number(r.trend_hours_pct || 0),
        variance_pct: Number(r.variance_pct || 0),
      };
    });

    const totalContract = projects.reduce((s, p) => s + p.contract_value, 0);
    const totalEac = projects.reduce((s, p) => s + p.eac, 0);
    const totalActualCost = projects.reduce((s, p) => s + p.actual_cost, 0);
    const varianceHours = projects.reduce((s, p) => {
      const v = (p.actual_hours - p.baseline_hours);
      return s + v;
    }, 0);
    const baselineTotal = projects.reduce((s, p) => s + p.baseline_hours, 0);
    const variancePct = baselineTotal > 0 ? Math.round((varianceHours / baselineTotal) * 1000) / 10 : 0;
    const portfolioMargin = totalContract > 0 ? Math.round(((totalContract - totalEac) / totalContract) * 1000) / 10 : 0;
    const atRiskProjects = projects.filter((p) => p.margin < 10 || Math.abs(p.variance_pct) > 10 || p.critical_open >= 2).length;
    const healthyProjects = projects.filter((p) => p.margin >= 15).length;
    const clientsServed = new Set(projects.map((p) => p.customer_name)).size;

    const clientRisk = clientRiskRows.map((r) => ({
      customer_name: r.customer_name || 'Unassigned',
      projects: Number(r.projects || 0),
      total_contract: Number(r.total_contract || 0),
      total_cost: Number(r.total_cost || 0),
      margin_pct: Number(r.margin_pct || 0),
      at_risk: Number(r.at_risk || 0),
    }));

    const costTrend = costTrendRows.map((r) => ({
      month: r.month,
      hours: Number(r.hours || 0),
      cost: Number(r.cost || 0),
    }));

    const milestoneDist: Record<string, number> = {
      on_time: 0, on_track: 0, late: 0, delayed: 0, overdue: 0, upcoming: 0,
    };
    milestoneRows.forEach((r) => { milestoneDist[r.status_bucket] = Number(r.cnt); });

    const effTotal = efficiencyRows.reduce((s, r) => s + Number(r.hours || 0), 0);
    const efficiency = efficiencyRows.map((r) => ({
      category: r.charge_category,
      hours: Number(r.hours || 0),
      pct: effTotal > 0 ? Math.round((Number(r.hours) / effTotal) * 100) : 0,
    }));

    const actionItems = actionRows.map((r) => ({
      id: r.id,
      source_role: r.source || 'PL',
      item_type: r.item_type,
      status: 'pending',
      priority: r.priority || 'P2',
      title: r.title,
      message: r.message,
      project_name: r.project_name,
      owner: r.owner || 'Unassigned',
      created_at: r.created_at,
    }));

    return NextResponse.json(
      {
        success: true,
        kpis: {
          activeProjects: projects.length,
          totalActualCost,
          totalEac,
          totalContract,
          portfolioMargin,
          varianceHours,
          variancePct,
          atRiskProjects,
          healthyProjects,
          clientsServed,
        },
        projects,
        clientRisk,
        costTrend,
        milestoneDist,
        efficiency,
        actionItems,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
