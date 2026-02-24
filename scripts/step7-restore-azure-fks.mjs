#!/usr/bin/env node
import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const FKS = [
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

const client = new pg.Client({
  connectionString: process.env.POSTGRES_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
let n = 0;
for (const fk of FKS) {
  try {
    await client.query(`ALTER TABLE "${fk.table}" ADD CONSTRAINT "${fk.name}" ${fk.def}`);
    n++;
  } catch (e) {
    if (e.code !== '42710' && e.code !== '42P01') throw e;
  }
}
console.log('Azure: re-added', n, 'FK constraints');
await client.end();
