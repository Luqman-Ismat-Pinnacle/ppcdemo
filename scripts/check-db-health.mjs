#!/usr/bin/env node
/**
 * Quick DB health check for key PPC tables and mapping coverage.
 *
 * Usage:
 *   node scripts/check-db-health.mjs
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) process.env[key] = value;
  }
}

async function scalar(client, sql) {
  const { rows } = await client.query(sql);
  return rows[0] ? Number(Object.values(rows[0])[0] || 0) : 0;
}

async function main() {
  loadEnvLocal();
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.AZURE_POSTGRES_CONNECTION_STRING ||
    process.env.POSTGRES_CONNECTION_STRING ||
    process.env.AZURE_DATABASE_URL;

  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL/AZURE_POSTGRES_CONNECTION_STRING/POSTGRES_CONNECTION_STRING.');
  }

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const checks = [
      ['employees', 'SELECT COUNT(*) AS count FROM employees'],
      ['projects', 'SELECT COUNT(*) AS count FROM projects'],
      ['tasks', 'SELECT COUNT(*) AS count FROM tasks'],
      ['hour_entries', 'SELECT COUNT(*) AS count FROM hour_entries'],
      ['customer_contracts', 'SELECT COUNT(*) AS count FROM customer_contracts'],
      ['workday_phases', 'SELECT COUNT(*) AS count FROM workday_phases'],
      ['qc_tasks', 'SELECT COUNT(*) AS count FROM qc_tasks'],
    ];

    console.log('DB Health Check');
    console.log('===============');
    for (const [label, sql] of checks) {
      const count = await scalar(client, sql);
      console.log(`${label.padEnd(20)} ${String(count).padStart(8)}`);
    }

    const mappedHours = await scalar(client, 'SELECT COUNT(*) FROM hour_entries WHERE workday_phase_id IS NOT NULL');
    const totalHours = await scalar(client, 'SELECT COUNT(*) FROM hour_entries');
    const pct = totalHours > 0 ? ((mappedHours / totalHours) * 100).toFixed(2) : '0.00';
    console.log('---------------');
    console.log(`hours mapped to workday_phase_id: ${mappedHours}/${totalHours} (${pct}%)`);

    const phaseNameFilled = await scalar(client, "SELECT COUNT(*) FROM hour_entries WHERE COALESCE(phases, '') <> ''");
    console.log(`hours with phase text populated:  ${phaseNameFilled}/${totalHours}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('DB health check failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
