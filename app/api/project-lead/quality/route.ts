import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [qcRows, monthlyRows, phaseQcRows] = await Promise.all([
      query<{
        project_id: string; project_name: string;
        total_hours: string; qc_hours: string; rework_hours: string; execute_hours: string;
      }>(
        `SELECT
           h.project_id, p.name AS project_name,
           ROUND(SUM(h.hours)::numeric, 1) AS total_hours,
           ROUND(SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) SIMILAR TO '%(qc|quality|review|inspection)%' THEN h.hours ELSE 0 END)::numeric, 1) AS qc_hours,
           ROUND(SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) SIMILAR TO '%(rework|rw|fix|defect)%' THEN h.hours ELSE 0 END)::numeric, 1) AS rework_hours,
           ROUND(SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) NOT SIMILAR TO '%(qc|quality|review|inspection|rework|rw|fix|defect|admin|meeting|training|pto|holiday|overhead)%' THEN h.hours ELSE 0 END)::numeric, 1) AS execute_hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY h.project_id, p.name
         ORDER BY p.name`,
      ),
      query<{
        month: string; qc_hours: string; rework_hours: string; execute_hours: string; total_hours: string;
      }>(
        `SELECT
           TO_CHAR(h.date, 'YYYY-MM') AS month,
           ROUND(SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) SIMILAR TO '%(qc|quality|review|inspection)%' THEN h.hours ELSE 0 END)::numeric, 1) AS qc_hours,
           ROUND(SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) SIMILAR TO '%(rework|rw|fix|defect)%' THEN h.hours ELSE 0 END)::numeric, 1) AS rework_hours,
           ROUND(SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) NOT SIMILAR TO '%(qc|quality|review|inspection|rework|rw|fix|defect|admin|meeting|training|pto|holiday|overhead)%' THEN h.hours ELSE 0 END)::numeric, 1) AS execute_hours,
           ROUND(SUM(h.hours)::numeric, 1) AS total_hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true AND h.date IS NOT NULL
           AND h.date >= CURRENT_DATE - INTERVAL '12 months'
         GROUP BY TO_CHAR(h.date, 'YYYY-MM')
         ORDER BY month`,
      ),
      query<{
        project_id: string; project_name: string; phase_name: string;
        qc_hours: string; rework_hours: string; total_hours: string;
      }>(
        `SELECT
           h.project_id, p.name AS project_name,
           COALESCE(NULLIF(TRIM(h.phase), ''), 'Unassigned') AS phase_name,
           ROUND(SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) SIMILAR TO '%(qc|quality|review|inspection)%' THEN h.hours ELSE 0 END)::numeric, 1) AS qc_hours,
           ROUND(SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) SIMILAR TO '%(rework|rw|fix|defect)%' THEN h.hours ELSE 0 END)::numeric, 1) AS rework_hours,
           ROUND(SUM(h.hours)::numeric, 1) AS total_hours
         FROM hour_entries h
         JOIN projects p ON p.id = h.project_id
         WHERE p.is_active = true AND p.has_schedule = true
         GROUP BY h.project_id, p.name, COALESCE(NULLIF(TRIM(h.phase), ''), 'Unassigned')
         HAVING SUM(CASE WHEN LOWER(COALESCE(h.charge_code, '')) SIMILAR TO '%(qc|quality|review|inspection|rework|rw|fix|defect)%' THEN h.hours ELSE 0 END) > 0
         ORDER BY p.name, phase_name`,
      ),
    ]);

    const totalQc = qcRows.reduce((s, r) => s + Number(r.qc_hours), 0);
    const totalRework = qcRows.reduce((s, r) => s + Number(r.rework_hours), 0);
    const totalExec = qcRows.reduce((s, r) => s + Number(r.execute_hours), 0);
    const totalAll = qcRows.reduce((s, r) => s + Number(r.total_hours), 0);

    return NextResponse.json({
      success: true,
      kpis: {
        totalQcHours: totalQc,
        totalReworkHours: totalRework,
        totalExecuteHours: totalExec,
        qcRatio: totalAll > 0 ? Math.round((totalQc / totalAll) * 1000) / 10 : 0,
        reworkRatio: totalAll > 0 ? Math.round((totalRework / totalAll) * 1000) / 10 : 0,
        costOfQuality: totalAll > 0 ? Math.round(((totalQc + totalRework) / totalAll) * 1000) / 10 : 0,
      },
      byProject: qcRows.map((r) => ({
        project_id: r.project_id, project_name: r.project_name,
        total_hours: Number(r.total_hours), qc_hours: Number(r.qc_hours),
        rework_hours: Number(r.rework_hours), execute_hours: Number(r.execute_hours),
        qc_ratio: Number(r.total_hours) > 0 ? Math.round((Number(r.qc_hours) / Number(r.total_hours)) * 1000) / 10 : 0,
        rework_ratio: Number(r.total_hours) > 0 ? Math.round((Number(r.rework_hours) / Number(r.total_hours)) * 1000) / 10 : 0,
      })),
      monthlyTrend: monthlyRows.map((r) => ({
        month: r.month, qc_hours: Number(r.qc_hours), rework_hours: Number(r.rework_hours),
        execute_hours: Number(r.execute_hours), total_hours: Number(r.total_hours),
      })),
      phaseQuality: phaseQcRows.map((r) => ({
        project_id: r.project_id, project_name: r.project_name, phase_name: r.phase_name,
        qc_hours: Number(r.qc_hours), rework_hours: Number(r.rework_hours),
        total_hours: Number(r.total_hours),
      })),
    }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
