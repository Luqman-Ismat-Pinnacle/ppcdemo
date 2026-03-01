import { NextRequest, NextResponse } from 'next/server';
import { execute, refreshRollups } from '@/lib/db';
import { mapEmployees, mapProjects, mapHours, mapContracts } from '@/lib/ingest/workday-mapper';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

async function batchUpsert(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return 0;
  let total = 0;
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const cols = Object.keys(batch[0]);
    const vals: unknown[] = [];
    const tuples: string[] = [];
    batch.forEach((row, ri) => {
      const ph = cols.map((c, ci) => { vals.push(row[c] ?? null); return `$${ri * cols.length + ci + 1}`; });
      tuples.push(`(${ph.join(',')})`);
    });
    const update = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');
    await execute(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT (id) DO UPDATE SET ${update}`,
      vals,
    );
    total += batch.length;
  }
  return total;
}

/**
 * POST /api/ingest/workday
 * Body: { type: 'employees' | 'projects' | 'hours' | 'contracts', records: [...] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, records } = body as { type: string; records: Record<string, unknown>[] };
    if (!Array.isArray(records) || records.length === 0) {
      return json({ error: 'records array required' }, 400);
    }

    const result: Record<string, number> = {};

    if (type === 'employees') {
      result.employees = await batchUpsert('employees', mapEmployees(records));
    } else if (type === 'projects') {
      const mapped = mapProjects(records);
      result.portfolios = await batchUpsert('portfolios', mapped.portfolios);
      result.customers = await batchUpsert('customers', mapped.customers);
      result.sites = await batchUpsert('sites', mapped.sites);
      result.projects = await batchUpsert('projects', mapped.projects);
    } else if (type === 'hours') {
      result.hour_entries = await batchUpsert('hour_entries', mapHours(records));
    } else if (type === 'contracts') {
      result.customer_contracts = await batchUpsert('customer_contracts', mapContracts(records));
    } else {
      return json({ error: `Unknown type: ${type}` }, 400);
    }

    try { await refreshRollups(); } catch { /* non-fatal */ }

    return json({ success: true, ...result });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}
