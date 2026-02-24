#!/usr/bin/env node
/**
 * 1. Delete all rows in employees (Supabase + Azure)
 * 2. Add new columns on both (Azure via SQL; Supabase: run printed SQL in Dashboard if needed)
 * 3. Invoke workday-employees Edge Function
 * 4. Sync employees from Supabase to Azure (runs full sync script)
 *
 * Usage: node scripts/employee-reset-and-sync.mjs
 * Requires .env.local: POSTGRES_CONNECTION_STRING, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const FK_CACHE_PATH = resolve(process.cwd(), 'scripts/.employee-fk-definitions.json');

// Fallback when cache is missing (e.g. first run exited before save). Matches DB 2.17.26 / Azure schema.
const FALLBACK_EMPLOYEE_FKS = [
  { table: 'hour_entries', name: 'hour_entries_employee_id_fkey', def: 'FOREIGN KEY (employee_id) REFERENCES employees(id)' },
  { table: 'portfolios', name: 'portfolios_employee_id_fkey', def: 'FOREIGN KEY (employee_id) REFERENCES employees(id)' },
  { table: 'customers', name: 'customers_employee_id_fkey', def: 'FOREIGN KEY (employee_id) REFERENCES employees(id)' },
  { table: 'sites', name: 'sites_employee_id_fkey', def: 'FOREIGN KEY (employee_id) REFERENCES employees(id)' },
  { table: 'units', name: 'units_employee_id_fkey', def: 'FOREIGN KEY (employee_id) REFERENCES employees(id)' },
  { table: 'phases', name: 'phases_employee_id_fkey', def: 'FOREIGN KEY (employee_id) REFERENCES employees(id)' },
  { table: 'tasks', name: 'tasks_assigned_resource_id_fkey', def: 'FOREIGN KEY (assigned_resource_id) REFERENCES employees(id)' },
  { table: 'projects', name: 'projects_manager_id_fkey', def: 'FOREIGN KEY (manager_id) REFERENCES employees(id)' },
  { table: 'workday_phases', name: 'workday_phases_employee_id_fkey', def: 'FOREIGN KEY (employee_id) REFERENCES employees(id)' },
];

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const AZURE_URL = (process.env.AZURE_DATABASE_URL || process.env.POSTGRES_CONNECTION_STRING || '').trim();
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

if (!AZURE_URL || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set in .env.local: POSTGRES_CONNECTION_STRING, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function deleteAllSupabaseEmployees() {
  const pageSize = 500;
  let totalDeleted = 0;
  while (true) {
    const { data: ids, error: selectError } = await supabase.from('employees').select('id').limit(pageSize);
    if (selectError) throw new Error(`Supabase select employees: ${selectError.message}`);
    if (!ids?.length) break;
    const idList = ids.map((r) => r.id);
    const { error: deleteError } = await supabase.from('employees').delete().in('id', idList);
    if (deleteError) throw new Error(`Supabase delete employees: ${deleteError.message}`);
    totalDeleted += idList.length;
    if (ids.length < pageSize) break;
  }
  return totalDeleted;
}

const SUPABASE_ALTER_SQL = `
ALTER TABLE employees ADD COLUMN IF NOT EXISTS senior_manager TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS time_in_job_profile TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_customer TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_site TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_projects TEXT;
`;

async function getEmployeeFkConstraints(client) {
  const r = await client.query(`
    SELECT c.conrelid::regclass::text AS table_name, c.conname AS constraint_name, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.confrelid = 'public.employees'::regclass AND c.contype = 'f'
  `);
  return r.rows.map((row) => {
    const table = row.table_name.replace(/^"?(public\.)?"?/i, '').replace(/"/g, '');
    return { table, name: row.constraint_name, def: row.def };
  });
}

async function main() {
  const cwd = resolve(process.cwd());

  console.log('1. Azure: drop all FKs referencing employees, then delete all employees...');
  const azureClient = new pg.Client({ connectionString: AZURE_URL, ssl: { rejectUnauthorized: false } });
  await azureClient.connect();
  let droppedFks = [];
  try {
    droppedFks = await getEmployeeFkConstraints(azureClient);
    if (droppedFks.length === 0 && existsSync(FK_CACHE_PATH)) {
      droppedFks = JSON.parse(readFileSync(FK_CACHE_PATH, 'utf8'));
      console.log('   (Using saved FK list from previous run; constraints already dropped.)');
    }
    for (const fk of droppedFks) {
      await azureClient.query(`ALTER TABLE "${fk.table}" DROP CONSTRAINT IF EXISTS "${fk.name}"`);
    }
    if (droppedFks.length > 0) writeFileSync(FK_CACHE_PATH, JSON.stringify(droppedFks, null, 0));
    console.log('   Dropped', droppedFks.length, 'FK constraint(s) referencing employees.');
    const del = await azureClient.query('DELETE FROM employees');
    console.log('   Azure: deleted', del.rowCount, 'employees');
  } finally {
    await azureClient.end();
  }

  console.log('2. Deleting all employees in Supabase...');
  try {
    const supabaseDeleted = await deleteAllSupabaseEmployees();
    console.log('   Supabase: deleted', supabaseDeleted, 'rows');
  } catch (err) {
    if (err?.message?.includes('foreign key') || err?.code === '23503') {
      console.error('   Supabase delete failed: employees are referenced by other tables.');
      console.log('   Run the SQL in scripts/supabase-drop-employee-fks.sql in Supabase Dashboard → SQL Editor.');
      console.log('   Then run this script again.');
      process.exit(1);
    }
    throw err;
  }

  console.log('3. Adding new columns on Azure...');
  const azureClient2 = new pg.Client({ connectionString: AZURE_URL, ssl: { rejectUnauthorized: false } });
  await azureClient2.connect();
  try {
    for (const stmt of SUPABASE_ALTER_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
      await azureClient2.query(stmt);
    }
    console.log('   Azure: columns added (or already exist).');
  } finally {
    await azureClient2.end();
  }

  console.log('4. Adding new columns on Supabase (via CLI migration)...');
  const push = spawnSync('npx', ['supabase', 'db', 'push'], { cwd, encoding: 'utf8' });
  if (push.status !== 0) {
    console.log('   Supabase CLI push failed or project not linked. Run this SQL in Supabase Dashboard → SQL Editor:');
    console.log(SUPABASE_ALTER_SQL);
    console.log('   Then run: node scripts/employee-reset-and-sync.mjs --sync-only');
    process.exit(1);
  }
  console.log('   Supabase: migrations applied.');

  console.log('5. Invoking workday-employees Edge Function...');
  const fnUrl = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/workday-employees';
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('   Edge Function error:', res.status, text);
    process.exit(1);
  }
  console.log('   Result:', text.slice(0, 400));

  console.log('6. Syncing from Supabase to Azure (employees + other tables)...');
  const child = spawnSync('node', ['scripts/sync-hours-supabase-to-azure.mjs'], { cwd, stdio: 'inherit', shell: false });
  if (child.status !== 0) process.exit(child.status || 1);

  console.log('7. Azure: re-add FKs referencing employees...');
  const toReAdd = droppedFks.length > 0 ? droppedFks : FALLBACK_EMPLOYEE_FKS;
  const azureClient3 = new pg.Client({ connectionString: AZURE_URL, ssl: { rejectUnauthorized: false } });
  await azureClient3.connect();
  try {
    let reAdded = 0;
    for (const fk of toReAdd) {
      try {
        await azureClient3.query(`ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.name}" ${fk.def}`);
        reAdded++;
      } catch (e) {
        if (e.code === '42710') {} // already exists
        else if (e.code === '42P01') {} // table does not exist, skip
        else throw e;
      }
    }
    console.log('   Re-added', reAdded, 'constraint(s).');
  } finally {
    await azureClient3.end();
  }
  console.log('Done.');
  console.log('');
  console.log('If you dropped FKs on Supabase in step 2, re-add them in Supabase Dashboard → SQL Editor');
  console.log('(run the ADD CONSTRAINT statements for hour_entries, portfolios, phases, tasks, etc. that reference employees).');
}

async function runSyncOnly() {
  console.log('5. Invoking workday-employees Edge Function...');
  const fnUrl = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/workday-employees';
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('   Edge Function error:', res.status, text);
    process.exit(1);
  }
  console.log('   Result:', text.slice(0, 400));

  console.log('6. Syncing from Supabase to Azure (employees + other tables)...');
  const cwd = resolve(process.cwd());
  const child = spawnSync('node', ['scripts/sync-hours-supabase-to-azure.mjs'], { cwd, stdio: 'inherit', shell: false });
  if (child.status !== 0) process.exit(child.status || 1);
  console.log('Done.');
}

const syncOnly = process.argv.includes('--sync-only');
if (syncOnly) {
  runSyncOnly().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
