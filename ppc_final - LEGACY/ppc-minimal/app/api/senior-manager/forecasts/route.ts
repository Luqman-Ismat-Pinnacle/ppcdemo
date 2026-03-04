import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Senior Manager Forecast Review: forecasts for approval, with full context
 * and analytics on how forecasts affect portfolio margin, client exposure,
 * delivery risk, and financial health.
 */
export async function GET() {
  try {
    const [forecastRows, projectRows, phaseLines] = await Promise.all([
      query<{
        id: string; project_id: string; project_name: string; owner: string;
        submitted_by: string; forecast_hours: string; forecast_cost: string;
        baseline_hours: string; baseline_cost: string; forecast_end_date: string;
        period: string; notes: string; status: string;
        reviewed_by: string; review_comment: string; reviewed_at: string;
        created_at: string;
      }>(
        `SELECT
           f.id, f.project_id,
           COALESCE(p.name, f.project_id) AS project_name,
           COALESCE(NULLIF(TRIM(lead.pca_name), ''), COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned')) AS owner,
           COALESCE(f.submitted_by, '') AS submitted_by,
           COALESCE(f.forecast_hours, 0)::text AS forecast_hours,
           COALESCE(f.forecast_cost, 0)::text AS forecast_cost,
           COALESCE(f.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(f.baseline_cost, 0)::text AS baseline_cost,
           f.forecast_end_date::text,
           COALESCE(f.period, '') AS period,
           COALESCE(f.notes, '') AS notes,
           COALESCE(f.status, 'pending') AS status,
           COALESCE(f.reviewed_by, '') AS reviewed_by,
           COALESCE(f.review_comment, '') AS review_comment,
           f.reviewed_at::text,
           f.created_at::text
         FROM forecasts f
         LEFT JOIN projects p ON p.id = f.project_id
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         LEFT JOIN LATERAL (
           SELECT NULLIF(TRIM(e.name), '') AS pca_name
           FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email)
           ORDER BY e.updated_at DESC NULLS LAST LIMIT 1
         ) lead ON true
         ORDER BY f.created_at DESC
         LIMIT 200`,
      ),

      query<{
        id: string; name: string; owner: string; customer_name: string;
        actual_hours: string; baseline_hours: string; remaining_hours: string;
        actual_cost: string; remaining_cost: string; contract_value: string;
        percent_complete: string; baseline_end: string;
      }>(
        `SELECT
           p.id, p.name,
           COALESCE(NULLIF(TRIM(lead.pca_name), ''), COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned')) AS owner,
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           COALESCE(p.actual_hours, 0)::text AS actual_hours,
           COALESCE(p.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(p.remaining_hours, 0)::text AS remaining_hours,
           COALESCE(p.actual_cost, 0)::text AS actual_cost,
           COALESCE(p.remaining_cost, 0)::text AS remaining_cost,
           COALESCE(cc.cv, 0)::text AS contract_value,
           COALESCE(p.percent_complete, 0)::text AS percent_complete,
           p.baseline_end::text
         FROM projects p
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN LATERAL (
           SELECT NULLIF(TRIM(e.name), '') AS pca_name
           FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email)
           ORDER BY e.updated_at DESC NULLS LAST LIMIT 1
         ) lead ON true
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(c.line_amount), 0) AS cv
           FROM customer_contracts c
           WHERE c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
         ) cc ON true
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY p.name`,
      ),

      query<{
        forecast_id: string; project_id: string; phase_name: string; unit_name: string;
        baseline_hours: string; actual_hours: string; current_remaining_hours: string;
        delta_hours: string; revised_eac_hours: string;
        current_eac_cost: string; delta_cost: string; revised_eac_cost: string;
        rationale: string; sort_order: string;
      }>(
        `SELECT fpl.forecast_id, fpl.project_id, fpl.phase_name, COALESCE(fpl.unit_name, '') AS unit_name,
           COALESCE(fpl.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(fpl.actual_hours, 0)::text AS actual_hours,
           COALESCE(fpl.current_remaining_hours, 0)::text AS current_remaining_hours,
           COALESCE(fpl.delta_hours, 0)::text AS delta_hours,
           COALESCE(fpl.revised_eac_hours, 0)::text AS revised_eac_hours,
           COALESCE(fpl.current_eac_cost, 0)::text AS current_eac_cost,
           COALESCE(fpl.delta_cost, 0)::text AS delta_cost,
           COALESCE(fpl.revised_eac_cost, 0)::text AS revised_eac_cost,
           COALESCE(fpl.rationale, '') AS rationale,
           COALESCE(fpl.sort_order, 0)::text AS sort_order
         FROM forecast_phase_lines fpl
         ORDER BY fpl.forecast_id, fpl.sort_order`,
      ),
    ]);

    const projects = projectRows.map((r) => ({
      id: r.id,
      name: r.name,
      owner: r.owner || 'Unassigned',
      customer_name: r.customer_name || 'Unassigned',
      actual_hours: Number(r.actual_hours || 0),
      baseline_hours: Number(r.baseline_hours || 0),
      remaining_hours: Number(r.remaining_hours || 0),
      actual_cost: Number(r.actual_cost || 0),
      remaining_cost: Number(r.remaining_cost || 0),
      contract_value: Number(r.contract_value || 0),
      percent_complete: Number(r.percent_complete || 0),
      baseline_end: r.baseline_end,
    }));

    const projectById = new Map(projects.map((p) => [p.id, p]));
    const forecastEacByProject = new Map<string, number>();

    const forecasts = forecastRows.map((r) => ({
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      owner: r.owner || 'Unassigned',
      submitted_by: r.submitted_by,
      forecast_hours: Number(r.forecast_hours || 0),
      forecast_cost: Number(r.forecast_cost || 0),
      baseline_hours: Number(r.baseline_hours || 0),
      baseline_cost: Number(r.baseline_cost || 0),
      forecast_end_date: r.forecast_end_date,
      period: r.period,
      notes: r.notes,
      status: r.status || 'pending',
      reviewed_by: r.reviewed_by,
      review_comment: r.review_comment,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at || '',
    }));

    const phaseLinesByForecast: Record<string, Array<{
      phase_name: string; unit_name: string;
      baseline_hours: number; actual_hours: number; current_remaining_hours: number;
      delta_hours: number; revised_eac_hours: number;
      current_eac_cost: number; delta_cost: number; revised_eac_cost: number;
      rationale: string;
    }>> = {};
    phaseLines.forEach((row) => {
      if (!phaseLinesByForecast[row.forecast_id]) phaseLinesByForecast[row.forecast_id] = [];
      phaseLinesByForecast[row.forecast_id].push({
        phase_name: row.phase_name,
        unit_name: row.unit_name,
        baseline_hours: Number(row.baseline_hours || 0),
        actual_hours: Number(row.actual_hours || 0),
        current_remaining_hours: Number(row.current_remaining_hours || 0),
        delta_hours: Number(row.delta_hours || 0),
        revised_eac_hours: Number(row.revised_eac_hours || 0),
        current_eac_cost: Number(row.current_eac_cost || 0),
        delta_cost: Number(row.delta_cost || 0),
        revised_eac_cost: Number(row.revised_eac_cost || 0),
        rationale: row.rationale || '',
      });
    });

    const totalContract = projects.reduce((s, p) => s + p.contract_value, 0);
    const currentEac = projects.reduce((s, p) => s + p.actual_cost + p.remaining_cost, 0);
    const currentMargin = totalContract > 0 ? ((totalContract - currentEac) / totalContract) * 100 : 0;

    forecasts.filter((f) => f.status === 'approved').forEach((f) => {
      forecastEacByProject.set(f.project_id, f.forecast_cost);
    });
    const portfolioEacWithForecasts = projects.reduce((s, p) => {
      const fc = forecastEacByProject.get(p.id);
      return s + (fc ?? p.actual_cost + p.remaining_cost);
    }, 0);
    const portfolioMarginWithForecasts = totalContract > 0 ? ((totalContract - portfolioEacWithForecasts) / totalContract) * 100 : 0;

    const pendingForecasts = forecasts.filter((f) => f.status === 'pending' || f.status === 'revision_requested');
    const ifAllPendingApproved = projects.reduce((s, p) => {
      const pending = pendingForecasts.find((f) => f.project_id === p.id);
      const eac = pending ? pending.forecast_cost : (forecastEacByProject.get(p.id) ?? p.actual_cost + p.remaining_cost);
      return s + eac;
    }, 0);
    const marginIfAllPendingApproved = totalContract > 0 ? ((totalContract - ifAllPendingApproved) / totalContract) * 100 : 0;

    const byCustomer: Array<{ customer_name: string; contract: number; current_eac: number; forecast_eac: number; margin_now: number; margin_with_forecasts: number; projects: number }> = [];
    const custMap = new Map<string, { contract: number; current_eac: number; forecast_eac: number; projects: Set<string> }>();
    projects.forEach((p) => {
      const c = custMap.get(p.customer_name) || { contract: 0, current_eac: 0, forecast_eac: 0, projects: new Set<string>() };
      c.contract += p.contract_value;
      c.current_eac += p.actual_cost + p.remaining_cost;
      const fc = forecastEacByProject.get(p.id) ?? (p.actual_cost + p.remaining_cost);
      const pending = pendingForecasts.find((f) => f.project_id === p.id);
      c.forecast_eac += pending ? pending.forecast_cost : fc;
      c.projects.add(p.id);
      custMap.set(p.customer_name, c);
    });
    custMap.forEach((v, name) => {
      byCustomer.push({
        customer_name: name,
        contract: v.contract,
        current_eac: v.current_eac,
        forecast_eac: v.forecast_eac,
        margin_now: v.contract > 0 ? ((v.contract - v.current_eac) / v.contract) * 100 : 0,
        margin_with_forecasts: v.contract > 0 ? ((v.contract - v.forecast_eac) / v.contract) * 100 : 0,
        projects: v.projects.size,
      });
    });

    const scheduleImpact = forecasts
      .filter((f) => f.forecast_end_date && f.status === 'pending')
      .map((f) => {
        const p = projectById.get(f.project_id);
        const baselineEnd = p?.baseline_end ? new Date(p.baseline_end).getTime() : 0;
        const forecastEnd = new Date(f.forecast_end_date).getTime();
        const slipDays = baselineEnd > 0 ? Math.round((forecastEnd - baselineEnd) / 86400000) : 0;
        return { project_name: f.project_name, slip_days: slipDays, forecast_end: f.forecast_end_date };
      })
      .filter((x) => x.slip_days > 0);

    return NextResponse.json(
      {
        success: true,
        forecasts,
        projects,
        phaseLinesByForecast,
        analytics: {
          totalContract,
          currentEac,
          currentMargin,
          portfolioEacWithForecasts,
          portfolioMarginWithForecasts,
          marginIfAllPendingApproved,
          eacDeltaIfAllApproved: ifAllPendingApproved - portfolioEacWithForecasts,
          byCustomer,
          scheduleImpact,
          pendingCount: pendingForecasts.length,
          approvedCount: forecasts.filter((f) => f.status === 'approved').length,
          revisionRequestedCount: forecasts.filter((f) => f.status === 'revision_requested').length,
        },
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, forecastId, reviewedBy, reviewComment } = body;

    if (!['approve', 'deny', 'revision'].includes(action) || !forecastId) {
      return NextResponse.json({ success: false, error: 'action and forecastId required' }, { status: 400 });
    }

    const statusMap: Record<string, string> = {
      approve: 'approved',
      deny: 'denied',
      revision: 'revision_requested',
    };

    await query(
      `UPDATE forecasts SET status = $1, reviewed_by = $2, review_comment = $3, reviewed_at = NOW() WHERE id = $4`,
      [statusMap[action], reviewedBy || 'Senior Manager', reviewComment || '', forecastId],
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
