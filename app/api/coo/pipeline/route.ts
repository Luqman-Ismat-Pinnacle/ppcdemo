import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [opportunityRows, activeRows, chargeRows, monthlyRows, totalsRow] = await Promise.all([
      // Opportunity projects: name contains "[O]"
      query<{
        id: string; name: string; owner: string; customer_id: string | null;
        has_schedule: boolean; is_active: boolean;
        actual_hours: string; total_hours: string; remaining_hours: string;
        actual_cost: string; remaining_cost: string;
        baseline_hours: string; percent_complete: string;
        baseline_start: string | null; baseline_end: string | null;
        actual_start: string | null; actual_end: string | null;
        contract_value: string; headcount: string; task_count: string;
      }>(
        `SELECT
           p.id, p.name,
           COALESCE(NULLIF(TRIM(po.name), ''), 'Unassigned') AS owner,
           p.customer_id,
           p.has_schedule, p.is_active,
           COALESCE(p.actual_hours,0)::text AS actual_hours,
           COALESCE(p.total_hours,0)::text AS total_hours,
           COALESCE(p.remaining_hours,0)::text AS remaining_hours,
           COALESCE(p.actual_cost,0)::text AS actual_cost,
           COALESCE(p.remaining_cost,0)::text AS remaining_cost,
           COALESCE(p.baseline_hours,0)::text AS baseline_hours,
           COALESCE(p.percent_complete,0)::text AS percent_complete,
           p.baseline_start::text, p.baseline_end::text,
           p.actual_start::text, p.actual_end::text,
           COALESCE(cc.cv, 0)::text AS contract_value,
           COALESCE(hc.cnt, 0)::text AS headcount,
           COALESCE(tc.cnt, 0)::text AS task_count
         FROM projects p
         LEFT JOIN portfolios po ON po.id = p.portfolio_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(c.line_amount),0) AS cv
           FROM customer_contracts c
           WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
         ) cc ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT h.employee_id)::int AS cnt
           FROM hour_entries h WHERE h.project_id = p.id
         ) hc ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS cnt FROM tasks t WHERE t.project_id = p.id
         ) tc ON true
         WHERE p.name LIKE '%[O]%'
         ORDER BY p.name`,
      ),

      // Count of active (non-opportunity) projects for comparison
      query<{ cnt: string }>(
        `SELECT COUNT(*)::int AS cnt FROM projects
         WHERE is_active = true AND has_schedule = true AND name NOT LIKE '%[O]%'`,
      ),

      // Charge hours on opportunity projects
      query<{ charge_code: string; hours: string }>(
        `SELECT
           COALESCE(NULLIF(TRIM(h.charge_code), ''), 'Unspecified') AS charge_code,
           ROUND(SUM(h.hours)::numeric, 1) AS hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.name LIKE '%[O]%'
         GROUP BY 1 ORDER BY SUM(h.hours) DESC LIMIT 12`,
      ),

      // Monthly hours on opportunity projects
      query<{ month: string; hours: string; cost: string }>(
        `SELECT
           TO_CHAR(h.date, 'YYYY-MM') AS month,
           ROUND(SUM(h.hours)::numeric, 1) AS hours,
           ROUND(SUM(COALESCE(h.actual_cost,0))::numeric, 0) AS cost
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.name LIKE '%[O]%' AND h.date IS NOT NULL
         GROUP BY TO_CHAR(h.date, 'YYYY-MM')
         ORDER BY month`,
      ),

      // Portfolio totals based on posted entries (source-of-truth for invested cost/hours)
      query<{ invested_hours: string; invested_cost: string; invested_projects: string }>(
        `SELECT
           ROUND(COALESCE(SUM(COALESCE(h.hours,0)),0)::numeric, 1) AS invested_hours,
           ROUND(COALESCE(SUM(COALESCE(h.actual_cost,0)),0)::numeric, 0) AS invested_cost,
           COUNT(DISTINCT CASE
             WHEN COALESCE(h.hours,0) > 0 OR COALESCE(h.actual_cost,0) > 0
             THEN h.project_id
             ELSE NULL
           END)::int::text AS invested_projects
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.name LIKE '%[O]%'`,
      ),
    ]);

    const opportunities = opportunityRows.map((r) => {
      const actualCost = Number(r.actual_cost || 0);
      const remainCost = Number(r.remaining_cost || 0);
      const cv = Number(r.contract_value || 0);
      const eac = actualCost + remainCost;
      const actualHrs = Number(r.actual_hours || 0);
      const baselineHrs = Number(r.baseline_hours || 0);
      const stage = r.has_schedule
        ? (Number(r.percent_complete || 0) > 0 ? 'In Execution' : 'Planned')
        : (actualHrs > 0 ? 'Pre-Planning' : 'Prospect');
      return {
        id: r.id, name: r.name, owner: r.owner,
        customer_id: r.customer_id || 'Unknown',
        has_schedule: r.has_schedule, is_active: r.is_active,
        stage,
        actualHours: actualHrs,
        totalHours: Number(r.total_hours || 0),
        remainingHours: Number(r.remaining_hours || 0),
        baselineHours: baselineHrs,
        actualCost, remainingCost: remainCost, contractValue: cv, eac,
        percentComplete: Number(r.percent_complete || 0),
        headcount: Number(r.headcount || 0),
        taskCount: Number(r.task_count || 0),
        profitMargin: cv > 0 ? Math.round(((cv - eac) / cv) * 100 * 10) / 10 : 0,
      };
    });

    const totalPipelineValue = opportunities.reduce((s, o) => s + o.contractValue, 0);
    const totalActualCost = Number(totalsRow[0]?.invested_cost || 0);
    const totalHoursInvested = Number(totalsRow[0]?.invested_hours || 0);
    const withSchedule = opportunities.filter((o) => o.has_schedule).length;
    const opportunitiesWithInvestment = Number(totalsRow[0]?.invested_projects || 0);
    const investmentRatioPct = totalPipelineValue > 0 ? (totalActualCost / totalPipelineValue) * 100 : 0;
    const avgHoursPerInvestedOpportunity = opportunitiesWithInvestment > 0 ? totalHoursInvested / opportunitiesWithInvestment : 0;

    const stageDist: Record<string, number> = {};
    opportunities.forEach((o) => { stageDist[o.stage] = (stageDist[o.stage] || 0) + 1; });

    const customerDist: Record<string, { projects: number; value: number; hours: number }> = {};
    opportunities.forEach((o) => {
      const c = o.customer_id;
      if (!customerDist[c]) customerDist[c] = { projects: 0, value: 0, hours: 0 };
      customerDist[c].projects++;
      customerDist[c].value += o.contractValue;
      customerDist[c].hours += o.actualHours;
    });
    const byCustomer = Object.entries(customerDist).map(([id, v]) => ({ customer_id: id, ...v })).sort((a, b) => b.value - a.value);

    return NextResponse.json({
      success: true,
      kpis: {
        totalOpportunities: opportunities.length,
        activePrograms: Number(activeRows[0]?.cnt || 0),
        totalPipelineValue,
        totalActualCost,
        totalHoursInvested,
        withSchedule,
        avgCompletion: opportunities.length > 0 ? Math.round(opportunities.reduce((s, o) => s + o.percentComplete, 0) / opportunities.length) : 0,
        opportunitiesWithInvestment,
        investmentRatioPct: Math.round(investmentRatioPct * 1000) / 1000,
        avgHoursPerInvestedOpportunity: Math.round(avgHoursPerInvestedOpportunity * 10) / 10,
      },
      opportunities,
      stageDist,
      byCustomer,
      chargeBreakdown: chargeRows.map((r) => ({ charge_code: r.charge_code, hours: Number(r.hours) })),
      monthlyTrend: monthlyRows.map((r) => ({ month: r.month, hours: Number(r.hours), cost: Number(r.cost) })),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
