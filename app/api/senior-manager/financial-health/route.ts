import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Senior Manager Financial Health: portfolio-level cost, margin, burn rate,
 * customer exposure, quarterly spend, and project register.
 */
export async function GET() {
  try {
    const [projectRows, monthlyRows, quarterlyRows, customerRows] = await Promise.all([
      query<{
        id: string; name: string; owner: string; customer_name: string;
        actual_cost: string; remaining_cost: string; contract_value: string;
        actual_hours: string; total_hours: string; baseline_hours: string;
        percent_complete: string;
      }>(
        `SELECT
           p.id, p.name,
           COALESCE(NULLIF(TRIM(lead.pca_name), ''), COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned')) AS owner,
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           COALESCE(p.actual_cost, 0)::text AS actual_cost,
           COALESCE(p.remaining_cost, 0)::text AS remaining_cost,
           COALESCE(cc.cv, 0)::text AS contract_value,
           COALESCE(p.actual_hours, 0)::text AS actual_hours,
           COALESCE(p.total_hours, 0)::text AS total_hours,
           COALESCE(p.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(p.percent_complete, 0)::text AS percent_complete
         FROM projects p
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN LATERAL (SELECT NULLIF(TRIM(e.name), '') AS pca_name FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1) lead ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(c.line_amount), 0) AS cv
           FROM customer_contracts c
           WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
         ) cc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY p.name`,
      ),

      query<{ month: string; cost: string; hours: string; revenue: string }>(
        `WITH monthly_raw AS (
           SELECT
             TO_CHAR(h.date, 'YYYY-MM') AS month,
             COALESCE(SUM(h.actual_cost), 0) AS cost,
             COALESCE(SUM(h.hours), 0) AS hours,
             COALESCE(SUM(h.actual_revenue), 0) AS revenue
           FROM hour_entries h
           JOIN projects p ON p.id = h.project_id
           WHERE p.is_active = true AND p.has_schedule = true
             AND h.date IS NOT NULL AND h.date >= CURRENT_DATE - INTERVAL '12 months'
           GROUP BY TO_CHAR(h.date, 'YYYY-MM')
         ),
         totals AS (SELECT SUM(hours) AS th, SUM(revenue) AS tr FROM monthly_raw),
         port AS (
           SELECT COALESCE(SUM(cc.cv), 0) AS tc
           FROM projects p
           LEFT JOIN LATERAL (SELECT COALESCE(SUM(c.line_amount), 0) AS cv FROM customer_contracts c WHERE c.project_id IN (p.id, p.site_id, p.customer_id)) cc ON true
           WHERE p.is_active = true AND p.has_schedule = true
         )
         SELECT
           m.month,
           ROUND(m.cost::numeric, 0)::text AS cost,
           ROUND(m.hours::numeric, 1)::text AS hours,
           ROUND(
             CASE WHEN m.revenue > 0 THEN m.revenue
               WHEN (SELECT th FROM totals) > 0 AND (SELECT tc FROM port) > 0
               THEN m.hours * (SELECT tc FROM port) / NULLIF((SELECT th FROM totals), 0)
               ELSE 0 END::numeric, 0
           )::text AS revenue
         FROM monthly_raw m
         ORDER BY m.month`,
      ),

      query<{ quarter: string; cost: string; hours: string }>(
        `SELECT
           TO_CHAR(DATE_TRUNC('quarter', h.date), 'YYYY-Q') AS quarter,
           ROUND(COALESCE(SUM(h.actual_cost), 0)::numeric, 0)::text AS cost,
           ROUND(COALESCE(SUM(h.hours), 0)::numeric, 1)::text AS hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND h.date IS NOT NULL AND h.date >= CURRENT_DATE - INTERVAL '12 months'
         GROUP BY DATE_TRUNC('quarter', h.date)
         ORDER BY quarter`,
      ),

      query<{
        customer_name: string; contract: string; eac: string; margin_pct: string; projects: string;
      }>(
        `SELECT
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           COALESCE(SUM(cc.cv), 0)::text AS contract,
           COALESCE(SUM(p.actual_cost) + SUM(p.remaining_cost), 0)::text AS eac,
           ROUND(CASE WHEN SUM(cc.cv) > 0
             THEN ((SUM(cc.cv) - (SUM(p.actual_cost) + SUM(p.remaining_cost))) / SUM(cc.cv)) * 100 ELSE 0 END::numeric, 1)::text AS margin_pct,
           COUNT(DISTINCT p.id)::text AS projects
         FROM projects p
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(c.line_amount), 0) AS cv
           FROM customer_contracts c
           WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
         ) cc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY cu.name`,
      ),
    ]);

    const projects = projectRows.map((r) => {
      const actual = Number(r.actual_cost || 0);
      const remaining = Number(r.remaining_cost || 0);
      const contract = Number(r.contract_value || 0);
      const eac = actual + remaining;
      const margin = contract > 0 ? Math.round(((contract - eac) / contract) * 1000) / 10 : 0;
      const burnRate = contract > 0 ? Math.round((actual / contract) * 1000) / 10 : 0;
      const costPerHour = Number(r.actual_hours || 0) > 0 ? actual / Number(r.actual_hours) : 0;
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
        total_hours: Number(r.total_hours || 0),
        baseline_hours: Number(r.baseline_hours || 0),
        percent_complete: Number(r.percent_complete || 0),
        cost_per_hour: Math.round(costPerHour * 100) / 100,
        burn_rate: burnRate,
      };
    });

    const totalContract = projects.reduce((s, p) => s + p.contract_value, 0);
    const totalEac = projects.reduce((s, p) => s + p.eac, 0);
    const totalActual = projects.reduce((s, p) => s + p.actual_cost, 0);
    const totalRemaining = projects.reduce((s, p) => s + p.remaining_cost, 0);
    const portfolioMargin = totalContract > 0 ? Math.round(((totalContract - totalEac) / totalContract) * 1000) / 10 : 0;
    const burnRate = totalContract > 0 ? Math.round((totalActual / totalContract) * 1000) / 10 : 0;
    const projectsAtRisk = projects.filter((p) => p.margin < 10).length;
    const projectsHealthy = projects.filter((p) => p.margin >= 15).length;

    const byCustomer = customerRows.map((r) => ({
      customer_name: r.customer_name || 'Unassigned',
      contract: Number(r.contract || 0),
      eac: Number(r.eac || 0),
      margin_pct: Number(r.margin_pct || 0),
      projects: Number(r.projects || 0),
    }));

    return NextResponse.json(
      {
        success: true,
        kpis: {
          totalContract,
          totalEac,
          totalActual,
          totalRemaining,
          portfolioMargin,
          burnRate,
          projectsAtRisk,
          projectsHealthy,
        },
        projects,
        monthly: monthlyRows.map((r) => ({
          month: r.month,
          cost: Number(r.cost || 0),
          hours: Number(r.hours || 0),
          revenue: Number(r.revenue || 0),
        })),
        quarterly: quarterlyRows.map((r) => ({
          quarter: r.quarter,
          cost: Number(r.cost || 0),
          hours: Number(r.hours || 0),
        })),
        byCustomer,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
