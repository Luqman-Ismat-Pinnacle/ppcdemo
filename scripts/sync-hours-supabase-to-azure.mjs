#!/usr/bin/env node
/**
 * One-off: fetch hour_entries from Supabase and upsert into Azure Postgres.
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... AZURE_DATABASE_URL=postgresql://... node scripts/sync-hours-supabase-to-azure.mjs
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ibczgmatnptijjvsndxw.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const AZURE_DATABASE_URL = process.env.AZURE_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING;

if (!AZURE_DATABASE_URL) {
  console.error('Set AZURE_DATABASE_URL (or DATABASE_URL) to your Azure Postgres connection string.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const COLS = [
  'id', 'entry_id', 'employee_id', 'project_id', 'phase_id', 'task_id', 'user_story_id',
  'date', 'hours', 'description', 'workday_phase', 'workday_task', 'actual_cost',
  'reported_standard_cost_amt', 'billable_rate', 'billable_amount', 'standard_cost_rate',
  'actual_revenue', 'customer_billing_status', 'invoice_number', 'invoice_status', 'charge_type',
];

function toPgValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

async function fetchAllHourEntries() {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('hour_entries')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) {
      console.error('Supabase error:', error.message);
      throw error;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function upsertToAzure(rows) {
  if (rows.length === 0) {
    console.log('No rows to upsert.');
    return 0;
  }
  // Azure may not have the same task/phase IDs as Supabase; avoid FK violations by
  // clearing task_id and phase_id. workday_phase/workday_task are kept for matching.
  const normalized = rows.map((r) => ({
    ...r,
    task_id: null,
    phase_id: null,
  }));
  const client = new pg.Client({
    connectionString: AZURE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const setClause = COLS.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const batchSize = 200;
  let total = 0;
  for (let i = 0; i < normalized.length; i += batchSize) {
    const batch = normalized.slice(i, i + batchSize);
    const values = batch.flatMap((r) => COLS.map((c) => toPgValue(r[c] ?? r[c.replace(/_/g, '')])));
    const placeholders = batch
      .map((_, bi) => '(' + COLS.map((_, ci) => `$${bi * COLS.length + ci + 1}`).join(',') + ')')
      .join(',');
    const sql = `INSERT INTO hour_entries (${COLS.join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO UPDATE SET ${setClause}`;
    await client.query(sql, values);
    total += batch.length;
  }
  await client.end();
  return total;
}

async function main() {
  console.log('Fetching hour_entries from Supabase...');
  const rows = await fetchAllHourEntries();
  console.log('Fetched', rows.length, 'rows.');
  if (rows.length === 0) {
    console.log('Nothing to sync.');
    return;
  }
  console.log('Upserting to Azure Postgres...');
  const written = await upsertToAzure(rows);
  console.log('Done. Upserted', written, 'hour_entries.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
