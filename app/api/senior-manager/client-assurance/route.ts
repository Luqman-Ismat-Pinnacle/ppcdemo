import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Senior Manager Client Assurance: distinct from Financial Health.
 * Focus: SLA tracking, escalation signals, key deliverables, client satisfaction,
 * contract amendments, change orders, and client-facing risk.
 */
export async function GET() {
  try {
    const [clientRows, projectRows, escalationRows, deliverableRows, amendmentRows] = await Promise.all([
      query<{
        customer_name: string; customer_id: string; projects: string;
        total_contract: string; total_eac: string; margin_pct: string;
        at_risk: string; escalation_count: string; total_variance_hrs: string;
        avg_progress: string; critical_open: string;
      }>(
        `WITH cust_base AS (
           SELECT
             cu.id, cu.name,
             COUNT(DISTINCT p.id) AS proj_cnt,
             COALESCE(SUM(cc.cv), 0) AS total_contract,
             COALESCE(SUM(p.actual_cost) + SUM(p.remaining_cost), 0) AS total_eac,
             SUM(CASE WHEN (COALESCE(cc.cv,0) > 0 AND ((COALESCE(cc.cv,0) - (COALESCE(p.actual_cost,0) + COALESCE(p.remaining_cost,0))) / NULLIF(cc.cv,0) * 100) < 10)
               OR (tc.critical_open >= 2) THEN 1 ELSE 0 END) AS at_risk,
             SUM(CASE WHEN tc.critical_open >= 3 OR (COALESCE(cc.cv,0) > 0 AND ((COALESCE(cc.cv,0) - (COALESCE(p.actual_cost,0) + COALESCE(p.remaining_cost,0))) / NULLIF(cc.cv,0) * 100) < 0) THEN 1 ELSE 0 END) AS escalation_count,
             COALESCE(SUM(tc.critical_open), 0) AS critical_open
           FROM projects p
           LEFT JOIN customers cu ON cu.id = p.customer_id
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
           GROUP BY cu.id, cu.name
         ),
         cust_var AS (
           SELECT p.customer_id,
             ROUND(COALESCE(SUM(t.actual_hours - t.baseline_hours), 0)::numeric, 1)::text AS total_variance_hrs,
             ROUND(COALESCE(AVG(p.percent_complete), 0)::numeric, 1)::text AS avg_progress
           FROM projects p
           LEFT JOIN tasks t ON t.project_id = p.id
           WHERE p.is_active = true AND p.has_schedule = true
           GROUP BY p.customer_id
         )
         SELECT
           COALESCE(NULLIF(TRIM(cb.name), ''), 'Unassigned') AS customer_name,
           cb.id AS customer_id,
           cb.proj_cnt::text AS projects,
           cb.total_contract::text AS total_contract,
           cb.total_eac::text AS total_eac,
           ROUND(CASE WHEN cb.total_contract > 0
             THEN ((cb.total_contract - cb.total_eac) / cb.total_contract) * 100 ELSE 0 END::numeric, 1)::text AS margin_pct,
           cb.at_risk::text AS at_risk,
           cb.escalation_count::text AS escalation_count,
           COALESCE(cv.total_variance_hrs, '0') AS total_variance_hrs,
           COALESCE(cv.avg_progress, '0') AS avg_progress,
           cb.critical_open::text AS critical_open
         FROM cust_base cb
         LEFT JOIN cust_var cv ON cv.customer_id = cb.id`,
      ),

      query<{
        id: string; name: string; customer_name: string; owner: string;
        margin: string; variance_pct: string; critical_open: string;
        percent_complete: string;
      }>(
        `SELECT
           p.id, p.name,
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           COALESCE(NULLIF(TRIM(lead.pca_name), ''), COALESCE(NULLIF(TRIM(pf.name), ''), 'Unassigned')) AS owner,
           ROUND(CASE WHEN cc.cv > 0
             THEN ((cc.cv - (COALESCE(p.actual_cost,0) + COALESCE(p.remaining_cost,0))) / cc.cv) * 100 ELSE 0 END::numeric, 1)::text AS margin,
           ROUND(CASE WHEN SUM(COALESCE(t.baseline_hours,0)) > 0
             THEN (SUM(COALESCE(t.actual_hours,0) - COALESCE(t.baseline_hours,0)) / SUM(COALESCE(t.baseline_hours,0))) * 100 ELSE 0 END::numeric, 1)::text AS variance_pct,
           COALESCE(tc.critical_open, 0)::text AS critical_open,
           COALESCE(p.percent_complete, 0)::text AS percent_complete
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         LEFT JOIN portfolios pf ON pf.id = p.portfolio_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         LEFT JOIN LATERAL (SELECT NULLIF(TRIM(e.name), '') AS pca_name FROM employees e WHERE LOWER(e.email) = LOWER(p.pca_email) LIMIT 1) lead ON true
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
         GROUP BY p.id, p.name, cu.name, pf.name, lead.pca_name, cc.cv, tc.critical_open, p.percent_complete, p.actual_cost, p.remaining_cost
         ORDER BY cu.name, p.name`,
      ),

      query<{
        id: string; project_name: string; customer_name: string; signal: string; severity: string;
      }>(
        `WITH proj_risk AS (
           SELECT
             p.id, p.name,
             COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
             COALESCE(cc.cv, 0) AS cv,
             COALESCE(p.actual_cost,0) + COALESCE(p.remaining_cost,0) AS eac,
             COALESCE(tc.critical_open, 0) AS critical_open,
             COALESCE(SUM(t.actual_hours - t.baseline_hours), 0) AS var_hrs
           FROM projects p
           LEFT JOIN customers cu ON cu.id = p.customer_id
           LEFT JOIN tasks t ON t.project_id = p.id
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
           GROUP BY p.id, p.name, cu.name, cc.cv, tc.critical_open, p.actual_cost, p.remaining_cost
         )
         SELECT
           id, name AS project_name, customer_name,
           CASE
             WHEN critical_open >= 3 THEN 'Critical path at risk'
             WHEN cv > 0 AND ((cv - eac) / NULLIF(cv,0) * 100) < 0 THEN 'Negative margin'
             WHEN var_hrs > 200 THEN 'Significant variance'
             ELSE 'Schedule slip'
           END AS signal,
           CASE
             WHEN critical_open >= 3 OR (cv > 0 AND ((cv - eac) / NULLIF(cv,0) * 100) < 0) THEN 'critical'
             ELSE 'warning'
           END AS severity
         FROM proj_risk
         WHERE critical_open >= 2
           OR (cv > 0 AND ((cv - eac) / NULLIF(cv,0) * 100) < 5)
           OR var_hrs > 150
         ORDER BY severity DESC
         LIMIT 100`,
      ),

      query<{
        project_id: string; project_name: string; customer_name: string; task_name: string;
        baseline_end: string; percent_complete: string; status: string;
      }>(
        `SELECT
           p.id AS project_id, p.name AS project_name,
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           t.name AS task_name,
           t.baseline_end::text,
           COALESCE(t.percent_complete, 0)::text AS percent_complete,
           CASE
             WHEN COALESCE(t.percent_complete,0) >= 100 THEN 'complete'
             WHEN t.baseline_end < CURRENT_DATE THEN 'overdue'
             WHEN t.baseline_end < CURRENT_DATE + INTERVAL '14 days' THEN 'at_risk'
             ELSE 'on_track'
           END AS status
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         WHERE p.is_active = true AND p.has_schedule = true
           AND t.is_milestone = true
         ORDER BY t.baseline_end ASC NULLS LAST
         LIMIT 80`,
      ),

      query<{
        project_id: string; project_name: string; customer_name: string; line_amount: string; line_date: string;
      }>(
        `SELECT
           COALESCE(c.project_id, '') AS project_id,
           COALESCE(p.name, c.project_id) AS project_name,
           COALESCE(NULLIF(TRIM(cu.name), ''), 'Unassigned') AS customer_name,
           c.line_amount::text,
           c.line_date::text
         FROM customer_contracts c
         LEFT JOIN projects p ON p.id = c.project_id
         LEFT JOIN customers cu ON cu.id = p.customer_id
         WHERE c.line_date >= CURRENT_DATE - INTERVAL '6 months'
         ORDER BY c.line_date DESC
         LIMIT 50`,
      ),
    ]);

    const clientsServed = clientRows.length;
    const atRiskClients = clientRows.filter((r) => Number(r.at_risk || 0) > 0).length;
    const escalationSignals = clientRows.reduce((s, r) => s + Number(r.escalation_count || 0), 0);
    const avgClientMargin = clientsServed > 0
      ? clientRows.reduce((s, r) => s + Number(r.margin_pct || 0), 0) / clientsServed
      : 0;

    const clients = clientRows.map((r) => ({
      customer_name: r.customer_name || 'Unassigned',
      customer_id: r.customer_id,
      projects: Number(r.projects || 0),
      total_contract: Number(r.total_contract || 0),
      total_eac: Number(r.total_eac || 0),
      margin_pct: Number(r.margin_pct || 0),
      at_risk: Number(r.at_risk || 0),
      escalation_count: Number(r.escalation_count || 0),
      total_variance_hrs: Number(r.total_variance_hrs || 0),
      avg_progress: Number(r.avg_progress || 0),
      critical_open: Number(r.critical_open || 0),
    }));

    const projects = projectRows.map((r) => ({
      id: r.id,
      name: r.name,
      customer_name: r.customer_name || 'Unassigned',
      owner: r.owner || 'Unassigned',
      margin: Number(r.margin || 0),
      variance_pct: Number(r.variance_pct || 0),
      critical_open: Number(r.critical_open || 0),
      percent_complete: Number(r.percent_complete || 0),
    }));

    const escalations = escalationRows.map((r) => ({
      id: r.id,
      project_name: r.project_name,
      customer_name: r.customer_name || 'Unassigned',
      signal: r.signal,
      severity: r.severity || 'warning',
    }));

    const deliverables = deliverableRows.map((r) => ({
      project_id: r.project_id,
      project_name: r.project_name,
      customer_name: r.customer_name || 'Unassigned',
      task_name: r.task_name,
      baseline_end: r.baseline_end,
      percent_complete: Number(r.percent_complete || 0),
      status: r.status || 'on_track',
    }));

    const amendments = amendmentRows.map((r) => ({
      project_id: r.project_id,
      project_name: r.project_name,
      customer_name: r.customer_name || 'Unassigned',
      line_amount: Number(r.line_amount || 0),
      line_date: r.line_date,
    }));

    return NextResponse.json(
      {
        success: true,
        kpis: {
          clientsServed,
          atRiskClients,
          escalationSignals,
          avgClientMargin: Math.round(avgClientMargin * 10) / 10,
        },
        clients,
        projects,
        escalations,
        deliverables,
        amendments,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
