import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const [[totals]] = await Promise.all([
      query<{ total_projects: string; with_plans: string }>(
        `SELECT
           COUNT(*) AS total_projects,
           SUM(CASE WHEN has_schedule = true THEN 1 ELSE 0 END) AS with_plans
         FROM projects WHERE is_active = true`
      ),
    ]);

    const [hourAgg] = await query<{ total: string; mapped: string; unmapped: string }>(
      `SELECT
         COALESCE(SUM(h.hours), 0) AS total,
         SUM(CASE WHEN COALESCE(h.mpp_phase_task,'') <> '' THEN h.hours ELSE 0 END) AS mapped,
         SUM(CASE WHEN COALESCE(h.mpp_phase_task,'') = '' THEN h.hours ELSE 0 END) AS unmapped
       FROM hour_entries h
       JOIN projects p ON p.id = h.project_id
       WHERE p.is_active = true AND p.has_schedule = true`
    );

    const totalHrs = Number(hourAgg?.total || 0);
    const mappedHrs = Number(hourAgg?.mapped || 0);
    const unmappedHrs = Number(hourAgg?.unmapped || 0);
    const coveragePct = totalHrs > 0 ? Math.round((mappedHrs / totalHrs) * 1000) / 10 : 0;

    const projectCoverage = await query(
      `SELECT h.project_id, p.name AS project_name,
              NULL::text AS pca_name,
              SUM(h.hours) AS total_hours,
              SUM(CASE WHEN COALESCE(h.mpp_phase_task,'') <> '' THEN h.hours ELSE 0 END) AS mapped_hours,
              SUM(CASE WHEN COALESCE(h.mpp_phase_task,'') = '' THEN h.hours ELSE 0 END) AS unmapped_hours,
              ROUND(
                CASE WHEN SUM(h.hours) > 0
                  THEN 100.0 * SUM(CASE WHEN COALESCE(h.mpp_phase_task,'') <> '' THEN h.hours ELSE 0 END) / SUM(h.hours)
                  ELSE 0
                END, 1
              ) AS coverage_pct
       FROM hour_entries h
       JOIN projects p ON p.id = h.project_id
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY h.project_id, p.name
       HAVING SUM(h.hours) > 0
       ORDER BY unmapped_hours DESC
       LIMIT 40`
    );

    const planFreshness = await query(
      `SELECT p.id AS project_id, p.name AS project_name,
              NULL::text AS pca_name,
              MAX(pd.uploaded_at) AS last_upload,
              CASE WHEN MAX(pd.uploaded_at) IS NOT NULL
                THEN EXTRACT(DAY FROM NOW() - MAX(pd.uploaded_at))::int
                ELSE NULL
              END AS days_since_upload
       FROM projects p
       LEFT JOIN project_documents pd ON pd.project_id = p.id
       WHERE p.is_active = true AND p.has_schedule = true
       GROUP BY p.id, p.name
       ORDER BY last_upload ASC NULLS FIRST
       LIMIT 30`
    );

    const projectFiles = await query(
      `SELECT
         p.id AS project_id,
         p.name AS project_name,
         COUNT(pd.id)::int AS file_count,
         MAX(pd.uploaded_at) AS last_upload,
         latest.id AS latest_file_id,
         latest.file_name AS latest_file_name
       FROM projects p
       LEFT JOIN project_documents pd ON pd.project_id = p.id
       LEFT JOIN LATERAL (
         SELECT pd2.id, pd2.file_name
         FROM project_documents pd2
         WHERE pd2.project_id = p.id
         ORDER BY pd2.uploaded_at DESC NULLS LAST
         LIMIT 1
       ) latest ON true
       WHERE p.is_active = true
       GROUP BY p.id, p.name, latest.id, latest.file_name
       ORDER BY file_count DESC, last_upload DESC NULLS LAST, p.name
       LIMIT 60`
    );

    return NextResponse.json(
      {
        success: true,
        kpis: {
          totalProjects: Number(totals.total_projects),
          withPlans: Number(totals.with_plans),
          coveragePct,
          totalHours: totalHrs,
          mappedHours: mappedHrs,
          unmappedHours: unmappedHrs,
        },
        projectCoverage,
        planFreshness,
        projectFiles,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
