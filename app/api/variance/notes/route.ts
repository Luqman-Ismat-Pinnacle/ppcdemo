import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

async function ensureVarianceTable() {
  await execute(
    `CREATE TABLE IF NOT EXISTS variance_notes (
      id TEXT PRIMARY KEY,
      role TEXT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      baseline_value NUMERIC(14,2),
      current_value NUMERIC(14,2),
      variance_value NUMERIC(14,2),
      status TEXT DEFAULT 'open',
      comment TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  );
}

export async function GET(req: NextRequest) {
  try {
    await ensureVarianceTable();
    const url = new URL(req.url);
    const role = (url.searchParams.get('role') || '').trim().toUpperCase();
    const rows = await query(
      role
        ? `SELECT * FROM variance_notes WHERE UPPER(COALESCE(role, '')) = $1 ORDER BY created_at DESC LIMIT 300`
        : `SELECT * FROM variance_notes ORDER BY created_at DESC LIMIT 300`,
      role ? [role] : [],
    );
    return NextResponse.json({ success: true, notes: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureVarianceTable();
    const body = await req.json();
    const role = String(body.role || '').toUpperCase() || null;
    const tableName = String(body.table_name || '').trim();
    const recordId = String(body.record_id || '').trim();
    const metricKey = String(body.metric_key || '').trim();
    const baseline = body.baseline_value == null || body.baseline_value === '' ? null : Number(body.baseline_value);
    const current = body.current_value == null || body.current_value === '' ? null : Number(body.current_value);
    const variance = Number.isFinite(Number(body.variance_value))
      ? Number(body.variance_value)
      : (baseline != null && current != null ? current - baseline : null);
    const comment = body.comment == null ? null : String(body.comment);
    const createdBy = body.created_by == null ? null : String(body.created_by);
    const status = body.status == null ? 'open' : String(body.status);

    if (!tableName || !recordId || !metricKey) {
      return NextResponse.json({ success: false, error: 'table_name, record_id, and metric_key are required' }, { status: 400 });
    }

    const id = `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await execute(
      `INSERT INTO variance_notes
       (id, role, table_name, record_id, metric_key, baseline_value, current_value, variance_value, status, comment, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, role, tableName, recordId, metricKey, baseline, current, variance, status, comment, createdBy],
    );
    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

