import { NextRequest, NextResponse } from 'next/server';
import { query, execute, isValidTable, refreshRollups } from '@/lib/db';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

type RouteContext = { params: Promise<{ table: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { table } = await ctx.params;
  if (!isValidTable(table)) return json({ error: 'Invalid table' }, 400);

  try {
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 1000, 5000);
    const offset = Number(url.searchParams.get('offset')) || 0;
    const projectId = url.searchParams.get('project_id');

    let sql = `SELECT * FROM ${table}`;
    const params: unknown[] = [];

    if (projectId && table !== 'employees' && table !== 'portfolios') {
      params.push(projectId);
      sql += ` WHERE project_id = $1`;
    }

    sql += ` ORDER BY created_at DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const rows = await query(sql, params);
    const countSql = projectId && table !== 'employees' && table !== 'portfolios'
      ? `SELECT count(*) as total FROM ${table} WHERE project_id = $1`
      : `SELECT count(*) as total FROM ${table}`;
    const countParams = projectId && table !== 'employees' && table !== 'portfolios' ? [projectId] : [];
    const [{ total }] = await query<{ total: string }>(countSql, countParams);

    return json({ rows, total: Number(total), limit, offset });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { table } = await ctx.params;
  if (!isValidTable(table)) return json({ error: 'Invalid table' }, 400);

  try {
    const body = await req.json();
    const records: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
    if (records.length === 0) return json({ error: 'Empty payload' }, 400);

    let upserted = 0;
    const BATCH = 50;

    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const cols = Object.keys(batch[0]);
      const values: unknown[] = [];
      const tuples: string[] = [];

      batch.forEach((row, ri) => {
        const placeholders = cols.map((col, ci) => {
          values.push(row[col] ?? null);
          return `$${ri * cols.length + ci + 1}`;
        });
        tuples.push(`(${placeholders.join(',')})`);
      });

      const updateSet = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
      const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')}
        ON CONFLICT (id) DO UPDATE SET ${updateSet}`;

      await execute(sql, values);
      upserted += batch.length;
    }

    const rollupTables = new Set(['sub_tasks','tasks','phases','units','projects','sites','customers','portfolios']);
    if (rollupTables.has(table)) {
      try { await refreshRollups(); } catch { /* non-fatal */ }
    }

    return json({ success: true, count: upserted });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { table } = await ctx.params;
  if (!isValidTable(table)) return json({ error: 'Invalid table' }, 400);

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id param required' }, 400);

    const count = await execute(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return json({ success: true, deleted: count });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
}
