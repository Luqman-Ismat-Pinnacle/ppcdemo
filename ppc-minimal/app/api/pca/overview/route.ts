import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const projects = await query(
      `SELECT id, name, percent_complete, actual_hours, total_hours, scheduled_cost,
              has_schedule, baseline_start, baseline_end, actual_start, actual_end, progress, tf
       FROM projects WHERE is_active = true ORDER BY name`
    );

    const [hourAgg] = await query<{ total: string; mapped: string }>(
      `SELECT COALESCE(SUM(hours),0) total,
              SUM(CASE WHEN COALESCE(mpp_phase_task,'') <> '' THEN hours ELSE 0 END) mapped
       FROM hour_entries`
    );

    const phaseHealth = await query(
      `SELECT project_id, COUNT(*) as phase_count,
              SUM(CASE WHEN percent_complete >= 100 THEN 1 ELSE 0 END) as completed,
              ROUND(AVG(percent_complete)::numeric, 1) as avg_progress
       FROM phases GROUP BY project_id`
    );

    const costSummary = await query(
      `SELECT COALESCE(SUM(actual_cost),0) as total_actual_cost,
              COALESCE(SUM(remaining_cost),0) as total_remaining_cost,
              COALESCE(SUM(scheduled_cost),0) as total_scheduled_cost
       FROM projects WHERE is_active = true`
    );

    return NextResponse.json(
      {
        success: true,
        projects,
        hourSummary: { total: Number(hourAgg.total), mapped: Number(hourAgg.mapped) },
        phaseHealth,
        costSummary: costSummary[0] || {},
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } },
    );
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
