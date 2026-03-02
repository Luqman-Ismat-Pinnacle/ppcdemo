import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [phaseRows] = await Promise.all([
      query<{
        id: string; phase_name: string; project_id: string; project_name: string; customer_name: string; unit_name: string;
        actual_cost: string; remaining_cost: string; baseline_hours: string; actual_hours: string; remaining_hours: string; total_hours: string;
        project_contract_value: string; percent_complete: string; project_total_baseline: string;
      }>(
        `WITH project_contract AS (
           SELECT
             p.id AS project_id,
             COALESCE(SUM(c.line_amount), 0) AS contract_value
           FROM projects p
           LEFT JOIN customer_contracts c
             ON c.project_id IN (p.id, COALESCE(p.site_id, ''), COALESCE(p.customer_id, ''))
           WHERE p.is_active = true AND p.has_schedule = true
           GROUP BY p.id
         ),
         phase_base AS (
           SELECT
             ph.id,
             ph.name AS phase_name,
             ph.project_id,
             p.name AS project_name,
             COALESCE(NULLIF(TRIM(cu.name), ''), p.customer_id, 'Unknown') AS customer_name,
             COALESCE(u.name, '') AS unit_name,
             COALESCE(ph.actual_cost, 0) AS actual_cost,
             COALESCE(ph.remaining_cost, 0) AS remaining_cost,
             COALESCE(ph.baseline_hours, 0) AS baseline_hours,
             COALESCE(ph.actual_hours, 0) AS actual_hours,
             COALESCE(ph.remaining_hours, 0) AS remaining_hours,
             COALESCE(ph.total_hours, 0) AS total_hours,
             COALESCE(ph.percent_complete, 0) AS percent_complete,
             COALESCE(pc.contract_value, 0) AS project_contract_value,
             SUM(COALESCE(ph.baseline_hours, 0)) OVER (PARTITION BY ph.project_id) AS project_total_baseline
           FROM phases ph
           JOIN projects p ON p.id = ph.project_id
           LEFT JOIN units u ON u.id = ph.unit_id
           LEFT JOIN customers cu ON cu.id = p.customer_id
           LEFT JOIN project_contract pc ON pc.project_id = p.id
           WHERE p.is_active = true AND p.has_schedule = true
         )
         SELECT
           id, phase_name, project_id, project_name, customer_name, unit_name,
           actual_cost::text, remaining_cost::text, baseline_hours::text, actual_hours::text, remaining_hours::text, total_hours::text,
           project_contract_value::text, percent_complete::text, project_total_baseline::text
         FROM phase_base
         ORDER BY project_name, unit_name NULLS LAST, phase_name`
      ),
    ]);

    const phases = phaseRows.map((r) => {
      const ac = Number(r.actual_cost); const rc = Number(r.remaining_cost);
      const projCv = Number(r.project_contract_value); const eac = ac + rc;
      const phaseShare = Number(r.project_total_baseline) > 0 ? (Number(r.baseline_hours) / Number(r.project_total_baseline)) : 0;
      const contractAlloc = phaseShare > 0 ? (projCv * phaseShare) : 0;
      return {
        id: r.id,
        name: r.phase_name,
        project_id: r.project_id,
        project_name: r.project_name,
        customer_name: r.customer_name,
        unit_name: r.unit_name,
        actual_cost: ac,
        remaining_cost: rc,
        eac,
        contract_value: contractAlloc,
        margin: contractAlloc > 0 ? Math.round(((contractAlloc - eac) / contractAlloc) * 1000) / 10 : 0,
        burn_rate: contractAlloc > 0 ? Math.round((ac / contractAlloc) * 1000) / 10 : 0,
        cost_per_hour: Number(r.actual_hours) > 0 ? Math.round((ac / Number(r.actual_hours)) * 100) / 100 : 0,
        baseline_hours: Number(r.baseline_hours), actual_hours: Number(r.actual_hours),
        remaining_hours: Number(r.remaining_hours), total_hours: Number(r.total_hours),
        percent_complete: Number(r.percent_complete),
      };
    });

    const totalActual = phases.reduce((s, p) => s + p.actual_cost, 0);
    const totalEac = phases.reduce((s, p) => s + p.eac, 0);
    const totalContract = phases.reduce((s, p) => s + p.contract_value, 0);

    return NextResponse.json({
      success: true,
      kpis: {
        totalActual, totalEac, totalContract,
        totalMargin: totalContract > 0 ? Math.round(((totalContract - totalEac) / totalContract) * 1000) / 10 : 0,
        burnRate: totalContract > 0 ? Math.round((totalActual / totalContract) * 1000) / 10 : 0,
        avgCostPerHour: phases.length > 0 ? Math.round(phases.reduce((s, p) => s + p.cost_per_hour, 0) / phases.length * 100) / 100 : 0,
        contractGap: totalContract - totalEac,
      },
      phases,
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
