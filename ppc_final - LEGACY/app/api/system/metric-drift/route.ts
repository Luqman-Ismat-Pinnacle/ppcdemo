import { NextResponse } from 'next/server';
import { getPool } from '@/lib/postgres';

export const dynamic = 'force-dynamic';

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractStoredCpi(health: Record<string, unknown> | null): number | null {
  if (!health) return null;
  const candidates = [
    health.cpi,
    health.cost_performance_index,
    health.costPerformanceIndex,
    health.performance_index,
  ];
  for (const value of candidates) {
    const n = asNumber(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export async function GET() {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ success: false, error: 'PostgreSQL not configured' }, { status: 503 });
  }

  try {
    const result = await pool.query(
      `
      WITH ev AS (
        SELECT
          t.project_id,
          SUM(COALESCE(t.baseline_hours, 0) * (COALESCE(t.percent_complete, 0) / 100.0)) AS earned_value
        FROM tasks t
        WHERE t.project_id IS NOT NULL
        GROUP BY t.project_id
      ),
      ac AS (
        SELECT
          h.project_id,
          SUM(COALESCE(h.total_hours, 0)) AS actual_cost
        FROM hour_entries h
        WHERE h.project_id IS NOT NULL
        GROUP BY h.project_id
      )
      SELECT
        p.id AS project_id,
        p.name AS project_name,
        COALESCE(ev.earned_value, 0) AS earned_value,
        COALESCE(ac.actual_cost, 0) AS actual_cost,
        row_to_json(ph) AS health_row
      FROM projects p
      LEFT JOIN ev ON ev.project_id = p.id
      LEFT JOIN ac ON ac.project_id = p.id
      LEFT JOIN project_health ph ON ph.project_id = p.id
      WHERE COALESCE(p.status,'active') ILIKE 'active%'
      LIMIT 150
      `,
    );

    const drifts = (result.rows || []).map((row) => {
      const earnedValue = asNumber(row.earned_value);
      const actualCost = asNumber(row.actual_cost);
      const computedCpi = actualCost > 0 ? earnedValue / actualCost : null;
      const healthRow = row.health_row && typeof row.health_row === 'object' ? (row.health_row as Record<string, unknown>) : null;
      const storedCpi = extractStoredCpi(healthRow);
      const delta = computedCpi !== null && storedCpi !== null ? Math.abs(computedCpi - storedCpi) : null;
      return {
        projectId: String(row.project_id || ''),
        projectName: String(row.project_name || ''),
        storedCpi,
        computedCpi,
        delta,
        drifted: delta !== null ? delta > 0.05 : false,
      };
    });

    return NextResponse.json({
      success: true,
      computedAt: new Date().toISOString(),
      rows: drifts.filter((row) => row.storedCpi !== null || row.computedCpi !== null),
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compute drift',
      rows: [],
    }, { status: 500 });
  }
}
