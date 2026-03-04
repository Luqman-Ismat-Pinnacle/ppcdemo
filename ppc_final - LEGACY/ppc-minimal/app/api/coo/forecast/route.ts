import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [projects, monthlyRows, totalsRow, revenueRow, quarterlyRows, projectTrendRows] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT p.id, p.name, p.actual_hours, p.total_hours, p.remaining_hours, p.scheduled_cost,
                p.actual_cost, p.remaining_cost, p.baseline_hours, p.percent_complete,
                p.baseline_start, p.baseline_end, p.actual_start, p.actual_end,
                COALESCE(cc.contract_value, 0) AS contract_value,
                COALESCE(NULLIF(TRIM(po.name), ''), 'Unassigned') AS owner,
                p.customer_id, p.site_id,
                COALESCE(NULLIF(TRIM(cu.name), ''), p.customer_id, 'Unassigned') AS customer_name
         FROM projects p
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN portfolios po ON po.id = p.portfolio_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(c.line_amount),0) AS contract_value
           FROM customer_contracts c
           WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
         ) cc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY p.name`,
      ),

      query<{ month: string; hours: string; cost: string; revenue: string }>(
        `WITH project_contract AS (
           SELECT
             p.id AS project_id,
             COALESCE(SUM(c.line_amount),0) AS contract_value
           FROM projects p
           LEFT JOIN customer_contracts c
             ON c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
           GROUP BY p.id
         )
         SELECT TO_CHAR(h.date, 'YYYY-MM') AS month,
                ROUND(SUM(h.hours)::numeric, 1) AS hours,
                ROUND(SUM(COALESCE(h.actual_cost,0))::numeric, 0) AS cost,
                ROUND(SUM(
                  COALESCE(
                    NULLIF(h.actual_revenue,0),
                    CASE WHEN COALESCE(p.total_hours,0) > 0
                      THEN COALESCE(pc.contract_value,0) * (COALESCE(h.hours,0) / NULLIF(p.total_hours,0))
                      ELSE 0 END,
                    0
                  )
                )::numeric, 0) AS revenue
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN project_contract pc ON pc.project_id = p.id
         WHERE h.date IS NOT NULL AND p.is_active = true AND p.has_schedule = true
         GROUP BY TO_CHAR(h.date, 'YYYY-MM') ORDER BY month`,
      ),

      query<{
        total_actual: string; total_remaining: string;
        total_actual_hrs: string; total_remaining_hrs: string; total_baseline_hrs: string;
      }>(
        `SELECT COALESCE(SUM(actual_cost),0) total_actual,
                COALESCE(SUM(remaining_cost),0) total_remaining,
                COALESCE(SUM(actual_hours),0) total_actual_hrs,
                COALESCE(SUM(remaining_hours),0) total_remaining_hrs,
                COALESCE(SUM(baseline_hours),0) total_baseline_hrs
         FROM projects WHERE is_active = true AND has_schedule = true`,
      ),

      query<{ total_revenue: string }>(
        `WITH project_contract AS (
           SELECT
             p.id AS project_id,
             COALESCE(SUM(c.line_amount),0) AS contract_value
           FROM projects p
           LEFT JOIN customer_contracts c
             ON c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
           GROUP BY p.id
         )
         SELECT COALESCE(SUM(
           COALESCE(
             NULLIF(h.actual_revenue,0),
             CASE WHEN COALESCE(p.total_hours,0) > 0
               THEN COALESCE(pc.contract_value,0) * (COALESCE(h.hours,0) / NULLIF(p.total_hours,0))
               ELSE 0 END,
             0
           )
         ),0) total_revenue
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN project_contract pc ON pc.project_id = p.id
         WHERE p.is_active = true AND p.has_schedule = true`,
      ),

      query<{ quarter: string; hours: string; cost: string; revenue: string }>(
        `WITH project_contract AS (
           SELECT
             p.id AS project_id,
             COALESCE(SUM(c.line_amount),0) AS contract_value
           FROM projects p
           LEFT JOIN customer_contracts c
             ON c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
           GROUP BY p.id
         )
         SELECT
           TO_CHAR(DATE_TRUNC('quarter', h.date), 'YYYY-"Q"Q') AS quarter,
           ROUND(SUM(h.hours)::numeric, 1) AS hours,
           ROUND(SUM(COALESCE(h.actual_cost,0))::numeric, 0) AS cost,
           ROUND(SUM(
             COALESCE(
               NULLIF(h.actual_revenue,0),
               CASE WHEN COALESCE(p.total_hours,0) > 0
                 THEN COALESCE(pc.contract_value,0) * (COALESCE(h.hours,0) / NULLIF(p.total_hours,0))
                 ELSE 0 END,
               0
             )
           )::numeric, 0) AS revenue
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         LEFT JOIN project_contract pc ON pc.project_id = p.id
         WHERE h.date IS NOT NULL AND p.is_active = true AND p.has_schedule = true
         GROUP BY DATE_TRUNC('quarter', h.date)
         ORDER BY DATE_TRUNC('quarter', h.date)`,
      ),
      query<{ project_id: string; trend_hours_pct: string; trend_hours_mo: string }>(
        `SELECT
           p.id AS project_id,
           ROUND(
             CASE WHEN COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '6 months' AND h.date < CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) > 0
               THEN (
                 COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0)
                 - COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '6 months' AND h.date < CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0)
               ) / NULLIF(COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '6 months' AND h.date < CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0),0) * 100
               ELSE 0
             END::numeric, 1
           ) AS trend_hours_pct,
           ROUND((COALESCE(SUM(CASE WHEN h.date >= CURRENT_DATE - INTERVAL '3 months' THEN COALESCE(h.hours,0) ELSE 0 END),0) / 3.0)::numeric, 1) AS trend_hours_mo
         FROM projects p
         LEFT JOIN hour_entries h ON h.project_id = p.id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY p.id`,
      ),
    ]);

    const t = totalsRow[0] || {};
    const totalActual = Number(t.total_actual || 0);
    const totalRemaining = Number(t.total_remaining || 0);
    const totalEac = totalActual + totalRemaining;
    const totalActualHrs = Number(t.total_actual_hrs || 0);
    const totalBaselineHrs = Number(t.total_baseline_hrs || 0);
    const totalRevenue = Number(revenueRow[0]?.total_revenue || 0);

    const trendByProject = new Map(projectTrendRows.map((r) => [r.project_id, r]));
    const projectForecasts = projects.map((p) => {
      const actualCost = Number(p.actual_cost || 0);
      const remainCost = Number(p.remaining_cost || 0);
      const cv = Number(p.contract_value || 0);
      const eac = actualCost + remainCost;
      const trend = trendByProject.get(String(p.id));
      const actualHrs = Number(p.actual_hours || 0);
      const totalHrs = Number(p.total_hours || 0);
      const baselineHrs = Number(p.baseline_hours || 0);
      const spi = baselineHrs > 0 ? actualHrs / baselineHrs : 0;
      const profitMargin = cv > 0 ? ((cv - eac) / cv) * 100 : 0;
      const eacVariance = cv - eac;
      return {
        id: p.id, name: p.name, owner: p.owner,
        actualHours: actualHrs, totalHours: totalHrs, baselineHours: baselineHrs,
        remainingHours: Number(p.remaining_hours || 0),
        actualCost, remainingCost: remainCost, contractValue: cv, eac,
        trendHoursPct: Number(trend?.trend_hours_pct || 0),
        trendHoursMo: Number(trend?.trend_hours_mo || 0),
        spi: Math.round(spi * 100) / 100,
        percentComplete: Number(p.percent_complete || 0),
        profitMargin: Math.round(profitMargin * 10) / 10,
        eacVariance,
      };
    });

    const totalContractValue = projectForecasts.reduce((s, p) => s + p.contractValue, 0);
    const portfolioSpi = totalBaselineHrs > 0 ? totalActualHrs / totalBaselineHrs : 0;
    const portfolioProfitMargin = totalContractValue > 0 ? ((totalContractValue - totalEac) / totalContractValue) * 100 : 0;
    const burnRate = monthlyRows.length > 0 ? totalActual / monthlyRows.length : 0;
    const portfolioTrendHoursPct = projectForecasts.length > 0 ? projectForecasts.reduce((s, p) => s + Number(p.trendHoursPct || 0), 0) / projectForecasts.length : 0;

    // Scenario projections
    const monthsElapsed = monthlyRows.length || 1;
    const avgMonthlyCost = totalActual / monthsElapsed;
    const avgMonthlyHrs = totalActualHrs / monthsElapsed;
    const remainingMonthsBest = avgMonthlyCost > 0 ? (totalRemaining * 0.85) / avgMonthlyCost : 0;
    const remainingMonthsExpected = avgMonthlyCost > 0 ? totalRemaining / avgMonthlyCost : 0;
    const remainingMonthsWorst = avgMonthlyCost > 0 ? (totalRemaining * 1.2) / avgMonthlyCost : 0;

    const scenarios = {
      best: { eac: totalActual + totalRemaining * 0.85, months: Math.ceil(remainingMonthsBest), margin: totalContractValue > 0 ? ((totalContractValue - (totalActual + totalRemaining * 0.85)) / totalContractValue * 100) : 0 },
      expected: { eac: totalEac, months: Math.ceil(remainingMonthsExpected), margin: portfolioProfitMargin },
      worst: { eac: totalActual + totalRemaining * 1.2, months: Math.ceil(remainingMonthsWorst), margin: totalContractValue > 0 ? ((totalContractValue - (totalActual + totalRemaining * 1.2)) / totalContractValue * 100) : 0 },
    };

    // By-customer aggregation
    const customerMap = new Map<string, { hours: number; cost: number; contract: number; projects: number; customer_name: string }>();
    projectForecasts.forEach((p) => {
      const projectRow = projects.find((pp) => pp.id === p.id) as Record<string, unknown> | undefined;
      const cid = String(projectRow?.customer_id || 'Unknown');
      const cname = String(projectRow?.customer_name || cid || 'Unknown');
      const cur = customerMap.get(cid) || { hours: 0, cost: 0, contract: 0, projects: 0, customer_name: cname };
      cur.hours += p.actualHours;
      cur.cost += p.actualCost;
      cur.contract += p.contractValue;
      cur.projects += 1;
      cur.customer_name = cname;
      customerMap.set(cid, cur);
    });
    const byCustomer = Array.from(customerMap.entries()).map(([id, v]) => ({ customer_id: id, ...v })).sort((a, b) => b.cost - a.cost).slice(0, 10);

    return NextResponse.json({
      success: true,
      portfolioKpis: {
        totalActual, totalRemaining, totalEac, totalActualHrs, totalBaselineHrs,
        totalContractValue, totalRevenue, burnRate: Math.round(burnRate),
        trendHoursPct: Math.round(portfolioTrendHoursPct * 10) / 10,
        spi: Math.round(portfolioSpi * 100) / 100,
        profitMargin: Math.round(portfolioProfitMargin * 10) / 10,
        avgMonthlyCost: Math.round(avgMonthlyCost),
        avgMonthlyHrs: Math.round(avgMonthlyHrs),
      },
      scenarios,
      projectForecasts,
      monthlyTrend: monthlyRows.map((r) => ({ month: r.month, hours: Number(r.hours), cost: Number(r.cost), revenue: Number(r.revenue) })),
      quarterlyTrend: quarterlyRows.map((r) => ({ quarter: r.quarter, hours: Number(r.hours), cost: Number(r.cost), revenue: Number(r.revenue) })),
      byCustomer,
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
