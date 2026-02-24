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
const client = new pg.Client({
  connectionString: process.env.POSTGRES_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
const fks = await client.query(
  "SELECT c.conrelid::regclass::text AS tbl, c.conname FROM pg_constraint c WHERE c.confrelid = 'public.employees'::regclass AND c.contype = 'f'"
);
for (const r of fks.rows) {
  const t = r.tbl.replace(/^"?public\.?"?|"/g, '');
  await client.query(`ALTER TABLE "${t}" DROP CONSTRAINT IF EXISTS "${r.conname}"`);
}
const del = await client.query('DELETE FROM employees');
console.log('Azure: dropped', fks.rows.length, 'FKs, deleted', del.rowCount, 'employees');
await client.end();
