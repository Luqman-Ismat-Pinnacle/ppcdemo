#!/usr/bin/env node
/**
 * Wipe Azure Postgres, recreate from ppc-minimal schema, migrate data from Supabase.
 * Uses .env.local from repo root (legacy) for DATABASE_URL (Azure), SUPABASE_*, etc.
 *
 * Usage: node scripts/migrate-supabase-to-azure-ppc-minimal.mjs
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const ppcMinimalDir = resolve(rootDir, 'ppc-minimal');

// Load .env.local from root (legacy env has Azure + Supabase)
for (const p of [resolve(rootDir, '.env.local'), resolve(ppcMinimalDir, '.env.local')]) {
  if (existsSync(p)) {
    const content = readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
    break;
  }
}

const AZURE_URL = process.env.DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING || process.env.AZURE_POSTGRES_CONNECTION_STRING;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

if (!AZURE_URL || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set in .env.local: DATABASE_URL (Azure), NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function fetchTable(tableName, pageSize = 1000, filter = {}) {
  const all = [];
  let from = 0;
  const { startDate, endDate } = filter;
  const isHourEntries = tableName === 'hour_entries';
  const hasDateFilter = isHourEntries && startDate && endDate;

  while (true) {
    let query = supabase.from(tableName).select('*');
    if (hasDateFilter) query = query.gte('date', startDate).lte('date', endDate);
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
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (typeof v === 'object' && typeof v.getTime === 'function') return v.toISOString().slice(0, 10);
  return v;
}

const DATA_ONLY = process.argv.includes('--data-only');

async function main() {
  const client = new pg.Client({
    connectionString: AZURE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000,
    statement_timeout: 120000,
  });
  await client.connect();

  try {
    if (!DATA_ONLY) {
      // 1. Wipe and recreate schema
      console.log('Loading schema from ppc-minimal/db/schema.sql...');
      const schemaPath = resolve(ppcMinimalDir, 'db', 'schema.sql');
      if (!existsSync(schemaPath)) {
        console.error('Schema not found:', schemaPath);
        process.exit(1);
      }
      const schemaSql = readFileSync(schemaPath, 'utf8');
      console.log('Executing schema (DROP + CREATE)...');
      await client.query(schemaSql);
      console.log('Schema applied.');
    } else {
      console.log('--data-only: skipping schema, migrating data only.');
    }

    // 2. Migrate employees (map Supabase -> ppc-minimal) — batch insert
    const empRows = await fetchTable('employees');
    console.log('employees: fetched', empRows.length);
    if (empRows.length > 0) {
      const cols = ['id', 'employee_id', 'name', 'email', 'time_in_job_profile', 'management_level', 'employee_type', 'senior_manager', 'job_title', 'is_active', 'manager', 'employee_customer', 'employee_site', 'employee_project', 'department'];
      const BATCH = 100;
      for (let i = 0; i < empRows.length; i += BATCH) {
        const batch = empRows.slice(i, i + BATCH);
        const values = batch.flatMap((r) => [
          rowVal(r, 'id'),
          rowVal(r, 'employee_id'),
          rowVal(r, 'name'),
          rowVal(r, 'email'),
          rowVal(r, 'time_in_job_profile'),
          rowVal(r, 'management_level'),
          rowVal(r, 'employee_type'),
          rowVal(r, 'senior_manager'),
          rowVal(r, 'job_title'),
          r.is_active !== false,
          rowVal(r, 'manager'),
          rowVal(r, 'employee_customer'),
          rowVal(r, 'employee_site'),
          rowVal(r, 'employee_project') ?? rowVal(r, 'employee_projects'),
          rowVal(r, 'department'),
        ]);
        const ph = batch.map((_, bi) => '(' + cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(',') + ')').join(',');
        await client.query(
          `INSERT INTO employees (${cols.join(',')}) VALUES ${ph} ON CONFLICT (id) DO NOTHING`,
          values
        );
        console.log(`employees: inserted ${Math.min(i + BATCH, empRows.length)}/${empRows.length}`);
      }
      console.log('employees: done');
    }

    // 2b. Migrate hierarchy (portfolios -> customers -> sites -> projects) for FK dependencies
    const hierarchyCols = {
      portfolios: ['id', 'name', 'is_active', 'comments', 'baseline_start', 'baseline_end', 'actual_start', 'actual_end', 'baseline_hours', 'actual_hours', 'remaining_hours', 'total_hours', 'actual_cost', 'remaining_cost', 'scheduled_cost', 'projected_hours', 'days', 'tf', 'percent_complete', 'progress'],
      customers: ['id', 'portfolio_id', 'name', 'is_active', 'comments', 'baseline_start', 'baseline_end', 'actual_start', 'actual_end', 'baseline_hours', 'actual_hours', 'remaining_hours', 'total_hours', 'actual_cost', 'remaining_cost', 'scheduled_cost', 'projected_hours', 'days', 'tf', 'percent_complete', 'progress'],
      sites: ['id', 'name', 'location', 'customer_id', 'portfolio_id', 'is_active', 'comments', 'baseline_start', 'baseline_end', 'actual_start', 'actual_end', 'baseline_hours', 'actual_hours', 'remaining_hours', 'total_hours', 'actual_cost', 'remaining_cost', 'scheduled_cost', 'projected_hours', 'days', 'tf', 'percent_complete', 'progress'],
      projects: ['id', 'name', 'site_id', 'customer_id', 'portfolio_id', 'pca_email', 'is_active', 'has_schedule', 'comments', 'baseline_start', 'baseline_end', 'actual_start', 'actual_end', 'baseline_hours', 'actual_hours', 'remaining_hours', 'total_hours', 'actual_cost', 'remaining_cost', 'scheduled_cost', 'projected_hours', 'days', 'tf', 'percent_complete', 'progress'],
    };
    for (const t of ['portfolios', 'customers', 'sites', 'projects']) {
      try {
        const rows = await fetchTable(t);
        if (rows.length === 0) continue;
        console.log(`${t}: fetched`, rows.length);
        const cols = hierarchyCols[t];
        for (const r of rows) {
          const vals = cols.map((c) => rowVal(r, c));
          await client.query(
            `INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (id) DO NOTHING`,
            vals
          ).catch((err) => { if (err.code !== '23503') console.warn(`${t} insert:`, err.message); });
        }
        console.log(`${t}: inserted`, rows.length);
      } catch (err) {
        console.warn(`${t}: skip (${err.message})`);
      }
    }

    // 3. Migrate customer_contracts
    const ccRows = await fetchTable('customer_contracts');
    console.log('customer_contracts: fetched', ccRows.length);
    if (ccRows.length > 0) {
      for (const r of ccRows) {
        const lineAmount = Number(r.line_amount ?? r.amount_usd ?? 0);
        const lineDate = rowVal(r, 'line_date') ?? rowVal(r, 'line_from_date');
        await client.query(
          `INSERT INTO customer_contracts (id, project_id, line_amount, line_date, currency, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET line_amount=EXCLUDED.line_amount, line_date=EXCLUDED.line_date`,
          [rowVal(r, 'id'), rowVal(r, 'project_id'), lineAmount, lineDate, rowVal(r, 'currency') || 'USD', rowVal(r, 'created_at'), rowVal(r, 'updated_at')]
        );
      }
      console.log('customer_contracts: inserted', ccRows.length);
    }

    // 4. Migrate workday_phases (map Supabase columns to ppc-minimal) — batch
    const wpRows = await fetchTable('workday_phases');
    console.log('workday_phases: fetched', wpRows.length);
    if (wpRows.length > 0) {
      const wcols = ['id', 'project_id', 'unit', 'name', 'baseline_start', 'baseline_end', 'actual_start', 'actual_end', 'percent_complete', 'baseline_hours', 'actual_hours', 'remaining_hours', 'actual_cost', 'remaining_cost', 'is_active', 'comments', 'total_hours', 'days', 'scheduled_cost', 'progress', 'tf', 'projected_hours'];
      const BATCH = 200;
      for (let i = 0; i < wpRows.length; i += BATCH) {
        const batch = wpRows.slice(i, i + BATCH);
        const values = batch.flatMap((r) => [
          rowVal(r, 'id'),
          rowVal(r, 'project_id'),
          rowVal(r, 'unit'),
          rowVal(r, 'name'),
          rowVal(r, 'baseline_start') ?? rowVal(r, 'baseline_start_date'),
          rowVal(r, 'baseline_end') ?? rowVal(r, 'baseline_end_date'),
          rowVal(r, 'actual_start') ?? rowVal(r, 'actual_start_date'),
          rowVal(r, 'actual_end') ?? rowVal(r, 'actual_end_date'),
          rowVal(r, 'percent_complete'),
          rowVal(r, 'baseline_hours'),
          rowVal(r, 'actual_hours'),
          rowVal(r, 'remaining_hours'),
          rowVal(r, 'actual_cost'),
          rowVal(r, 'remaining_cost'),
          r.is_active !== false,
          rowVal(r, 'comments'),
          rowVal(r, 'total_hours'),
          rowVal(r, 'days'),
          rowVal(r, 'scheduled_cost'),
          rowVal(r, 'progress'),
          rowVal(r, 'tf'),
          rowVal(r, 'projected_hours'),
        ]);
        const ph = batch.map((_, bi) => '(' + wcols.map((_, ci) => `$${bi * wcols.length + ci + 1}`).join(',') + ')').join(',');
        await client.query(`INSERT INTO workday_phases (${wcols.join(',')}) VALUES ${ph} ON CONFLICT (id) DO NOTHING`, values);
        console.log(`workday_phases: inserted ${Math.min(i + BATCH, wpRows.length)}/${wpRows.length}`);
      }
      console.log('workday_phases: done');
    }

    // 5. Migrate hour_entries (ppc-minimal has phase, task as TEXT; map workday_phase/workday_task) — batch
    const heRows = await fetchTable('hour_entries');
    console.log('hour_entries: fetched', heRows.length);
    if (heRows.length > 0) {
      const heCols = ['id', 'employee_id', 'project_id', 'phase', 'task', 'charge_code', 'description', 'date', 'hours', 'actual_cost', 'workday_phase', 'workday_task', 'actual_revenue', 'billing_status', 'created_at', 'updated_at'];
      const BATCH = 200;
      for (let i = 0; i < heRows.length; i += BATCH) {
        const batch = heRows.slice(i, i + BATCH);
        const values = batch.flatMap((r) => [
          rowVal(r, 'id'),
          rowVal(r, 'employee_id'),
          rowVal(r, 'project_id'),
          rowVal(r, 'phase') ?? rowVal(r, 'phase_id'),
          rowVal(r, 'task') ?? rowVal(r, 'task_id'),
          rowVal(r, 'charge_code'),
          rowVal(r, 'description'),
          rowVal(r, 'date'),
          Number(r.hours ?? 0),
          Number(r.actual_cost ?? 0),
          rowVal(r, 'workday_phase'),
          rowVal(r, 'workday_task'),
          Number(r.actual_revenue ?? 0),
          rowVal(r, 'billing_status') ?? rowVal(r, 'customer_billing_status'),
          rowVal(r, 'created_at'),
          rowVal(r, 'updated_at'),
        ]);
        const ph = batch.map((_, bi) => '(' + heCols.map((_, ci) => `$${bi * heCols.length + ci + 1}`).join(',') + ')').join(',');
        try {
          await client.query(`INSERT INTO hour_entries (${heCols.join(',')}) VALUES ${ph} ON CONFLICT (id) DO NOTHING`, values);
        } catch (e) {
          if (e.code === '23503') {
            for (const r of batch) {
              const vals = [rowVal(r, 'id'), null, rowVal(r, 'project_id'), rowVal(r, 'phase') ?? rowVal(r, 'phase_id'), rowVal(r, 'task') ?? rowVal(r, 'task_id'), rowVal(r, 'charge_code'), rowVal(r, 'description'), rowVal(r, 'date'), Number(r.hours ?? 0), Number(r.actual_cost ?? 0), rowVal(r, 'workday_phase'), rowVal(r, 'workday_task'), Number(r.actual_revenue ?? 0), rowVal(r, 'billing_status') ?? rowVal(r, 'customer_billing_status'), rowVal(r, 'created_at'), rowVal(r, 'updated_at')];
              await client.query(`INSERT INTO hour_entries (${heCols.join(',')}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING`, vals).catch(() => {});
            }
          } else throw e;
        }
        console.log(`hour_entries: inserted ${Math.min(i + BATCH, heRows.length)}/${heRows.length}`);
      }
      console.log('hour_entries: done');
    }

    console.log('Migration complete.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
