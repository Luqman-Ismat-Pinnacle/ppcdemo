/**
 * GET/POST Workday scheduled sync time (stored in app_settings).
 * Timer function runs every 15 min and runs sync when UTC time matches this schedule.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';

const KEY = 'workday_sync_schedule';
const DEFAULT = { hour: 2, minute: 0 };

async function ensureTable() {
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

export async function GET() {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ hour: DEFAULT.hour, minute: DEFAULT.minute, lastRunAt: null });
  }
  try {
    await ensureTable();
    const result = await pgQuery(
      'SELECT value FROM app_settings WHERE key = $1',
      [KEY]
    );
    const row = result.rows?.[0];
    const value = row?.value ?? DEFAULT;
    const hour = typeof value.hour === 'number' ? value.hour : DEFAULT.hour;
    const minute = typeof value.minute === 'number' ? value.minute : DEFAULT.minute;
    return NextResponse.json({
      hour,
      minute,
      lastRunAt: value.lastRunAt ?? null,
    });
  } catch (e) {
    console.error('[workday-schedule] GET error:', e);
    return NextResponse.json({ hour: DEFAULT.hour, minute: DEFAULT.minute, lastRunAt: null });
  }
}

export async function POST(req: NextRequest) {
  if (!isPostgresConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }
  try {
    await ensureTable();
    const body = await req.json().catch(() => ({}));
    let hour = typeof body.hour === 'number' ? body.hour : parseInt(String(body.hour), 10);
    let minute = typeof body.minute === 'number' ? body.minute : parseInt(String(body.minute), 10);
    if (Number.isNaN(hour)) hour = DEFAULT.hour;
    if (Number.isNaN(minute)) minute = DEFAULT.minute;
    hour = Math.max(0, Math.min(23, hour));
    minute = Math.max(0, Math.min(59, minute));

    await pgQuery(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [KEY, JSON.stringify({ hour, minute })]
    );
    return NextResponse.json({ success: true, hour, minute });
  } catch (e) {
    console.error('[workday-schedule] POST error:', e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
