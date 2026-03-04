#!/usr/bin/env node
/**
 * Simple migration: upsert hour_entries, customer_contracts, and workday_phases
 * from Supabase to Azure Postgres. Loads .env.local if present.
 *
 * Usage: node scripts/sync-hours-supabase-to-azure.mjs
 *   (syncs all tables)
 * Usage: node scripts/sync-hours-supabase-to-azure.mjs 2025-12-01 2025-12-31
 *   (syncs all tables; hour_entries only for the given date range, e.g. December 2025)
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
const AZURE_URL = process.env.AZURE_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING || process.env.AZURE_POSTGRES_CONNECTION_STRING;

if (!AZURE_URL || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set in .env.local: POSTGRES_CONNECTION_STRING, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function toPgVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v !== null && (v.constructor?.name === 'Date' || Array.isArray(v))) return JSON.stringify(v);
  if (typeof v === 'object') return v; // e.g. JSONB stays as object; pg will handle
  return v;
}

/**
 * @param {string} tableName
 * @param {number} pageSize
 * @param {{ startDate?: string, endDate?: string }} [opts] - Optional date filter for hour_entries (YYYY-MM-DD). Only applied when tableName === 'hour_entries'.
 */
async function fetchTable(tableName, pageSize = 1000, opts = {}) {
  const all = [];
  let from = 0;
  const { startDate, endDate } = opts;
  const isHourEntries = tableName === 'hour_entries';
  const hasDateFilter = isHourEntries && startDate && endDate;

  while (true) {
    let query = supabase.from(tableName).select('*');
    if (hasDateFilter) {
      query = query.gte('date', startDate).lte('date', endDate);
    }
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw new Error(`${tableName}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function rowVal(r, col) {
  const v = r[col] ?? r[col?.replace(/_/g, '')];
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10); // date
  if (typeof v === 'object' && typeof v.getTime === 'function') return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && (Array.isArray(v) || v.constructor?.name === 'Object')) return JSON.stringify(v);
  return v;
}

async function upsertTable(client, tableName, rows, columns, conflictCol = 'id') {
  if (rows.length === 0) return 0;
  const setClause = columns.filter((c) => c !== conflictCol).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  const batchSize = 200;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch.flatMap((r) => columns.map((c) => toPgVal(rowVal(r, c))));
    const placeholders = batch.map((_, bi) => '(' + columns.map((_, ci) => `$${bi * columns.length + ci + 1}`).join(',') + ')').join(',');
    const sql = `INSERT INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders} ON CONFLICT ("${conflictCol}") DO UPDATE SET ${setClause}`;
    await client.query(sql, values);
    total += batch.length;
  }
  return total;
}

const HOUR_ENTRIES_COLS = [
  'id', 'entry_id', 'employee_id', 'project_id', 'phase_id', 'task_id', 'user_story_id', 'date', 'hours', 'description',
  'workday_phase', 'workday_task', 'actual_cost', 'reported_standard_cost_amt', 'billable_rate', 'billable_amount',
  'standard_cost_rate', 'actual_revenue', 'customer_billing_status', 'invoice_number', 'invoice_status', 'charge_type', 'created_at', 'updated_at'
];

const CUSTOMER_CONTRACTS_COLS = [
  'id', 'project_id', 'line_amount', 'line_from_date', 'currency', 'amount_usd', 'billable_project_raw', 'created_at', 'updated_at'
];

const WORKDAY_PHASES_COLS = [
  'id', 'phase_id', 'project_id', 'unit_id', 'unit', 'parent_id', 'hierarchy_type', 'outline_level', 'employee_id', 'name', 'sequence',
  'methodology', 'description', 'folder', 'start_date', 'end_date', 'baseline_start_date', 'baseline_end_date', 'actual_start_date', 'actual_end_date',
  'percent_complete', 'baseline_hours', 'actual_hours', 'projected_hours', 'remaining_hours', 'baseline_cost', 'actual_cost', 'remaining_cost',
  'total_slack', 'is_summary', 'is_critical', 'predecessors', 'successors', 'comments', 'ev_method', 'is_active', 'created_at', 'updated_at'
];

const EMPLOYEES_COLS = [
  'id', 'employee_id', 'name', 'email', 'job_title', 'management_level', 'manager', 'employee_type', 'role', 'department',
  'senior_manager', 'time_in_job_profile', 'employee_customer', 'employee_site', 'employee_projects', 'is_active'
];

async function main() {
  const startDate = process.argv[2] || null; // e.g. 2025-12-01
  const endDate = process.argv[3] || null;   // e.g. 2025-12-31
  const hourDateFilter = startDate && endDate ? { startDate, endDate } : {};

  const client = new pg.Client({ connectionString: AZURE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // 1. customer_contracts
    const cc = await fetchTable('customer_contracts');
    console.log('customer_contracts: fetched', cc.length);
    const writtenCc = await upsertTable(client, 'customer_contracts', cc, CUSTOMER_CONTRACTS_COLS);
    console.log('customer_contracts: upserted', writtenCc);

    // 2. employees
    const emp = await fetchTable('employees');
    console.log('employees: fetched', emp.length);
    const writtenEmp = await upsertTable(client, 'employees', emp, EMPLOYEES_COLS);
    console.log('employees: upserted', writtenEmp);

    // 3. workday_phases
    const wp = await fetchTable('workday_phases');
    console.log('workday_phases: fetched', wp.length);
    const writtenWp = await upsertTable(client, 'workday_phases', wp, WORKDAY_PHASES_COLS);
    console.log('workday_phases: upserted', writtenWp);

    // 4. hour_entries (null task_id/phase_id to avoid FK issues if Azure tasks/phases differ)
    const he = await fetchTable('hour_entries', 1000, hourDateFilter);
    if (Object.keys(hourDateFilter).length) {
      console.log('hour_entries: fetched', he.length, `(date ${startDate} to ${endDate})`);
    } else {
      console.log('hour_entries: fetched', he.length);
    }
    const heNormalized = he.map((r) => ({ ...r, task_id: null, phase_id: null }));
    const writtenHe = await upsertTable(client, 'hour_entries', heNormalized, HOUR_ENTRIES_COLS);
    console.log('hour_entries: upserted', writtenHe);

    console.log('Done.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
