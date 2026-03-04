import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [forecasts, projects, monthlyByProject, phaseRows, phaseLines] = await Promise.all([
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
        id: string; name: string; owner: string;
        actual_hours: string; baseline_hours: string; remaining_hours: string; total_hours: string;
        actual_cost: string; remaining_cost: string; contract_value: string;
        percent_complete: string; baseline_end: string;
      }>(
        `SELECT
           p.id, p.name,
           COALESCE(NULLIF(TRIM(lead.pca_name), ''), COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned')) AS owner,
           COALESCE(p.actual_hours, 0)::text AS actual_hours,
           COALESCE(p.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(p.remaining_hours, 0)::text AS remaining_hours,
           COALESCE(p.total_hours, 0)::text AS total_hours,
           COALESCE(p.actual_cost, 0)::text AS actual_cost,
           COALESCE(p.remaining_cost, 0)::text AS remaining_cost,
           COALESCE(cc.cv, 0)::text AS contract_value,
           COALESCE(p.percent_complete, 0)::text AS percent_complete,
           p.baseline_end::text
         FROM projects p
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
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
        project_id: string; month: string; hours: string; cost: string; revenue: string;
      }>(
        `SELECT
           h.project_id,
           TO_CHAR(h.date, 'YYYY-MM') AS month,
           COALESCE(SUM(h.hours), 0)::text AS hours,
           COALESCE(SUM(h.actual_cost), 0)::text AS cost,
           COALESCE(SUM(h.actual_revenue), 0)::text AS revenue
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true
           AND p.has_schedule = true
           AND h.date IS NOT NULL
           AND h.date >= CURRENT_DATE - INTERVAL '12 months'
         GROUP BY h.project_id, TO_CHAR(h.date, 'YYYY-MM')
         ORDER BY h.project_id, month`,
      ),
      query<{
        phase_id: string; project_id: string; phase_name: string; unit_name: string;
        baseline_hours: string; actual_hours: string; remaining_hours: string;
        actual_cost: string; remaining_cost: string; scheduled_cost: string;
      }>(
        `SELECT
           ph.id AS phase_id,
           ph.project_id,
           ph.name AS phase_name,
           COALESCE(u.name, '') AS unit_name,
           COALESCE(ph.baseline_hours, 0)::text AS baseline_hours,
           COALESCE(ph.actual_hours, 0)::text AS actual_hours,
           COALESCE(ph.remaining_hours, 0)::text AS remaining_hours,
           COALESCE(ph.actual_cost, 0)::text AS actual_cost,
           COALESCE(ph.remaining_cost, 0)::text AS remaining_cost,
           COALESCE(ph.scheduled_cost, 0)::text AS scheduled_cost
         FROM phases ph
         LEFT JOIN units u ON u.id = ph.unit_id
         JOIN projects p ON p.id = ph.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         ORDER BY ph.project_id, u.name NULLS LAST, ph.name`,
      ),
      query<{
        id: string; forecast_id: string; project_id: string; phase_id: string;
        unit_name: string; phase_name: string;
        baseline_hours: string; actual_hours: string; current_remaining_hours: string;
        delta_hours: string; revised_remaining_hours: string; revised_eac_hours: string;
        current_eac_cost: string; delta_cost: string; revised_eac_cost: string;
        rationale: string; sort_order: string;
      }>(
        `SELECT
           id, forecast_id, project_id, COALESCE(phase_id, '') AS phase_id,
           COALESCE(unit_name, '') AS unit_name, phase_name,
           COALESCE(baseline_hours, 0)::text AS baseline_hours,
           COALESCE(actual_hours, 0)::text AS actual_hours,
           COALESCE(current_remaining_hours, 0)::text AS current_remaining_hours,
           COALESCE(delta_hours, 0)::text AS delta_hours,
           COALESCE(revised_remaining_hours, 0)::text AS revised_remaining_hours,
           COALESCE(revised_eac_hours, 0)::text AS revised_eac_hours,
           COALESCE(current_eac_cost, 0)::text AS current_eac_cost,
           COALESCE(delta_cost, 0)::text AS delta_cost,
           COALESCE(revised_eac_cost, 0)::text AS revised_eac_cost,
           COALESCE(rationale, '') AS rationale,
           COALESCE(sort_order, 0)::text AS sort_order
         FROM forecast_phase_lines
         ORDER BY forecast_id, sort_order, phase_name`,
      ),
    ]);

    const trendByProject: Record<string, { month: string; hours: number; cost: number; revenue: number }[]> = {};
    monthlyByProject.forEach((row) => {
      if (!trendByProject[row.project_id]) trendByProject[row.project_id] = [];
      trendByProject[row.project_id].push({
        month: row.month,
        hours: Number(row.hours),
        cost: Number(row.cost),
        revenue: Number(row.revenue),
      });
    });

    const phaseCatalogByProject: Record<string, {
      phase_id: string;
      phase_name: string;
      unit_name: string;
      baseline_hours: number;
      actual_hours: number;
      remaining_hours: number;
      actual_cost: number;
      remaining_cost: number;
      scheduled_cost: number;
    }[]> = {};

    phaseRows.forEach((row) => {
      if (!phaseCatalogByProject[row.project_id]) phaseCatalogByProject[row.project_id] = [];
      phaseCatalogByProject[row.project_id].push({
        phase_id: row.phase_id,
        phase_name: row.phase_name,
        unit_name: row.unit_name,
        baseline_hours: Number(row.baseline_hours),
        actual_hours: Number(row.actual_hours),
        remaining_hours: Number(row.remaining_hours),
        actual_cost: Number(row.actual_cost),
        remaining_cost: Number(row.remaining_cost),
        scheduled_cost: Number(row.scheduled_cost),
      });
    });

    const phaseLinesByForecast: Record<string, {
      id: string;
      forecast_id: string;
      project_id: string;
      phase_id: string;
      unit_name: string;
      phase_name: string;
      baseline_hours: number;
      actual_hours: number;
      current_remaining_hours: number;
      delta_hours: number;
      revised_remaining_hours: number;
      revised_eac_hours: number;
      current_eac_cost: number;
      delta_cost: number;
      revised_eac_cost: number;
      rationale: string;
      sort_order: number;
    }[]> = {};

    phaseLines.forEach((row) => {
      if (!phaseLinesByForecast[row.forecast_id]) phaseLinesByForecast[row.forecast_id] = [];
      phaseLinesByForecast[row.forecast_id].push({
        id: row.id,
        forecast_id: row.forecast_id,
        project_id: row.project_id,
        phase_id: row.phase_id,
        unit_name: row.unit_name,
        phase_name: row.phase_name,
        baseline_hours: Number(row.baseline_hours),
        actual_hours: Number(row.actual_hours),
        current_remaining_hours: Number(row.current_remaining_hours),
        delta_hours: Number(row.delta_hours),
        revised_remaining_hours: Number(row.revised_remaining_hours),
        revised_eac_hours: Number(row.revised_eac_hours),
        current_eac_cost: Number(row.current_eac_cost),
        delta_cost: Number(row.delta_cost),
        revised_eac_cost: Number(row.revised_eac_cost),
        rationale: row.rationale,
        sort_order: Number(row.sort_order),
      });
    });

    return NextResponse.json({
      success: true,
      forecasts: forecasts.map((f) => ({
        id: f.id, project_id: f.project_id, project_name: f.project_name, owner: f.owner,
        submitted_by: f.submitted_by,
        forecast_hours: Number(f.forecast_hours), forecast_cost: Number(f.forecast_cost),
        baseline_hours: Number(f.baseline_hours), baseline_cost: Number(f.baseline_cost),
        forecast_end_date: f.forecast_end_date, period: f.period, notes: f.notes,
        status: f.status, reviewed_by: f.reviewed_by, review_comment: f.review_comment,
        reviewed_at: f.reviewed_at, created_at: f.created_at,
      })),
      projects: projects.map((p) => ({
        id: p.id, name: p.name, owner: p.owner,
        actual_hours: Number(p.actual_hours), baseline_hours: Number(p.baseline_hours),
        remaining_hours: Number(p.remaining_hours), total_hours: Number(p.total_hours),
        actual_cost: Number(p.actual_cost), remaining_cost: Number(p.remaining_cost),
        contract_value: Number(p.contract_value), percent_complete: Number(p.percent_complete),
        baseline_end: p.baseline_end,
      })),
      monthlyTrendByProject: trendByProject,
      phaseCatalogByProject,
      phaseLinesByForecast,
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;
    const phaseLines = Array.isArray(body.phaseLines) ? body.phaseLines : [];

    const insertPhaseLines = async (forecastId: string, projectId: string, lines: Array<Record<string, unknown>>) => {
      if (!lines.length) return;
      for (let i = 0; i < lines.length; i += 1) {
        const row = lines[i];
        const lineId = `fpl-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
        await query(
          `INSERT INTO forecast_phase_lines (
             id, forecast_id, project_id, phase_id, unit_name, phase_name,
             baseline_hours, actual_hours, current_remaining_hours, delta_hours,
             revised_remaining_hours, revised_eac_hours, current_eac_cost, delta_cost, revised_eac_cost,
             rationale, sort_order
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10,
             $11, $12, $13, $14, $15,
             $16, $17
           )`,
          [
            lineId,
            forecastId,
            projectId,
            String(row.phase_id || ''),
            String(row.unit_name || ''),
            String(row.phase_name || ''),
            Number(row.baseline_hours || 0),
            Number(row.actual_hours || 0),
            Number(row.current_remaining_hours || 0),
            Number(row.delta_hours || 0),
            Number(row.revised_remaining_hours || 0),
            Number(row.revised_eac_hours || 0),
            Number(row.current_eac_cost || 0),
            Number(row.delta_cost || 0),
            Number(row.revised_eac_cost || 0),
            String(row.rationale || ''),
            Number(row.sort_order || i),
          ],
        );
      }
    };

    if (action === 'submit') {
      const id = `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { projectId, forecastHours, forecastCost, baselineHours, baselineCost, forecastEndDate, period, notes, submittedBy } = body;
      await query(
        `INSERT INTO forecasts (id, project_id, submitted_by, forecast_hours, forecast_cost, baseline_hours, baseline_cost, forecast_end_date, period, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
        [id, projectId, submittedBy || 'PL', Number(forecastHours || 0), Number(forecastCost || 0), Number(baselineHours || 0), Number(baselineCost || 0), forecastEndDate || null, period || '', notes || ''],
      );
      await insertPhaseLines(id, String(projectId), phaseLines as Array<Record<string, unknown>>);
      return NextResponse.json({ success: true, id });
    }

    if (action === 'update') {
      const { forecastId, projectId, forecastHours, forecastCost, forecastEndDate, notes } = body;
      await query(
        `UPDATE forecasts SET forecast_hours = $1, forecast_cost = $2, forecast_end_date = $3, notes = $4, status = 'pending', reviewed_by = NULL, review_comment = NULL, reviewed_at = NULL
         WHERE id = $5 AND status IN ('pending', 'revision_requested')`,
        [Number(forecastHours || 0), Number(forecastCost || 0), forecastEndDate || null, notes || '', forecastId],
      );
      await query(`DELETE FROM forecast_phase_lines WHERE forecast_id = $1`, [forecastId]);
      await insertPhaseLines(String(forecastId), String(projectId || ''), phaseLines as Array<Record<string, unknown>>);
      return NextResponse.json({ success: true });
    }

    if (action === 'approve' || action === 'deny' || action === 'revision') {
      const statusMap: Record<string, string> = { approve: 'approved', deny: 'denied', revision: 'revision_requested' };
      await query(
        `UPDATE forecasts SET status = $1, reviewed_by = $2, review_comment = $3, reviewed_at = NOW() WHERE id = $4`,
        [statusMap[action], body.reviewedBy || 'SM', body.reviewComment || '', body.forecastId],
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
