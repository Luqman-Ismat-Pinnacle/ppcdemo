import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const projects = await query(
      `SELECT p.id, p.name, p.actual_hours, p.total_hours, p.remaining_hours, p.scheduled_cost,
              p.actual_cost, p.remaining_cost, p.baseline_hours, p.percent_complete, p.progress,
              p.baseline_start, p.baseline_end, p.actual_start, p.actual_end,
              COALESCE(cc.contract_value, 0) as contract_value
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(c.line_amount),0) as contract_value
         FROM customer_contracts c
         WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
       ) cc ON true
       WHERE p.is_active = true AND p.has_schedule = true
       ORDER BY p.name`
    );

    const monthlyHours = await query(
      `SELECT TO_CHAR(h.date, 'YYYY-MM') as month, SUM(h.hours) as hours, SUM(h.actual_cost) as cost,
              SUM(h.actual_revenue) as revenue
       FROM hour_entries h
       JOIN projects p ON p.id = h.project_id
       WHERE h.date IS NOT NULL AND p.is_active = true AND p.has_schedule = true
       GROUP BY TO_CHAR(h.date, 'YYYY-MM') ORDER BY month`
    );

    const [totals] = await query<{
      total_actual: string; total_remaining: string; total_scheduled: string;
      total_actual_hrs: string; total_remaining_hrs: string; total_baseline_hrs: string;
    }>(
      `SELECT COALESCE(SUM(actual_cost),0) total_actual,
              COALESCE(SUM(remaining_cost),0) total_remaining,
              COALESCE(SUM(scheduled_cost),0) total_scheduled,
              COALESCE(SUM(actual_hours),0) total_actual_hrs,
              COALESCE(SUM(remaining_hours),0) total_remaining_hrs,
              COALESCE(SUM(baseline_hours),0) total_baseline_hrs
       FROM projects WHERE is_active = true AND has_schedule = true`
    );

    const [revenueTotals] = await query<{ total_revenue: string }>(
      `SELECT COALESCE(SUM(h.actual_revenue),0) total_revenue
       FROM hour_entries h
       JOIN projects p ON p.id = h.project_id
       WHERE p.is_active = true AND p.has_schedule = true`
    );

    type ProjRow = Record<string, unknown>;
    const projectForecasts = projects.map((p: ProjRow) => {
      const totalHrs = Number(p.total_hours || 0);
      const actualHrs = Number(p.actual_hours || 0);
      const remainHrs = Number(p.remaining_hours || 0);
      const actualCost = Number(p.actual_cost || 0);
      const remainCost = Number(p.remaining_cost || 0);
      const cv = Number(p.contract_value || 0);

      const eac = actualCost + remainCost;
      const cpi = actualCost > 0 && cv > 0 ? cv / actualCost : 0;
      const spi = totalHrs > 0 ? actualHrs / totalHrs : 0;
      const profitMargin = cv > 0 ? ((cv - eac) / cv) * 100 : 0;

      return {
        id: p.id, name: p.name, actualHours: actualHrs, totalHours: totalHrs, remainingHours: remainHrs,
        actualCost, remainingCost: remainCost, contractValue: cv, eac, cpi, spi,
        percentComplete: Number(p.percent_complete || 0),
        profitMargin,
      };
    });

    const totalActual = Number(totals?.total_actual || 0);
    const totalRemaining = Number(totals?.total_remaining || 0);
    const totalEac = totalActual + totalRemaining;
    const totalActualHrs = Number(totals?.total_actual_hrs || 0);
    const totalBaselineHrs = Number(totals?.total_baseline_hrs || 0);
    const totalContractValue = projectForecasts.reduce((sum, p) => sum + Number(p.contractValue || 0), 0);
    const totalRevenue = Number(revenueTotals?.total_revenue || 0);
    const portfolioCpi = totalActual > 0 && totalContractValue > 0 ? totalContractValue / totalActual : 0;
    const portfolioSpi = totalBaselineHrs > 0 ? totalActualHrs / totalBaselineHrs : 0;
    const portfolioProfitMargin = totalContractValue > 0 ? ((totalContractValue - totalEac) / totalContractValue) * 100 : 0;

    return NextResponse.json({
      success: true,
      portfolioKpis: {
        totalActual, totalRemaining, totalEac, totalActualHrs, totalBaselineHrs,
        totalContractValue, totalRevenue,
        cpi: portfolioCpi, spi: portfolioSpi,
        profitMargin: portfolioProfitMargin,
      },
      projectForecasts,
      monthlyTrend: monthlyHours,
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
