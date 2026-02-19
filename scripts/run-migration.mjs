#!/usr/bin/env node
/**
 * Run a SQL migration file against the configured Postgres database.
 * Usage: node scripts/run-migration.mjs migrations/2026-02-19-projects-total-slack-mpp-varchar.sql
 * Requires: DATABASE_URL or AZURE_POSTGRES_CONNECTION_STRING or POSTGRES_CONNECTION_STRING
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Load .env.local then .env (Next.js style)
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(root, f);
    try {
      const content = readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    } catch (_) {}
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL
  || process.env.AZURE_POSTGRES_CONNECTION_STRING
  || process.env.POSTGRES_CONNECTION_STRING;

async function main() {
  const relPath = process.argv[2];
  if (!relPath) {
    console.error('Usage: node scripts/run-migration.mjs <path-to-migration.sql>');
    process.exit(1);
  }
  const absPath = resolve(root, relPath);
  const sql = readFileSync(absPath, 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.replace(/--[^\n]*/g, '').trim())
    .filter(s => s.length > 0);

  if (!DATABASE_URL) {
    console.error('No database URL. Set DATABASE_URL or AZURE_POSTGRES_CONNECTION_STRING or POSTGRES_CONNECTION_STRING');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const stmt of statements) {
      await client.query(stmt);
      console.log('OK:', stmt.slice(0, 60) + '...');
    }
    console.log('Migration completed.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
