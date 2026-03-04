#!/usr/bin/env node
/**
 * Compare Supabase (or any Postgres) public schema against DB 2.17.26.sql.
 * Usage:
 *   SUPABASE_DB_URL='postgresql://...' node scripts/compare-supabase-schema.mjs
 *   # or use DATABASE_URL if it points to the DB you want to check
 *   node scripts/compare-supabase-schema.mjs
 *
 * Get Supabase DB URL: Dashboard → Project Settings → Database → Connection string (URI).
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const canonicalPath = join(rootDir, 'DB 2.17.26.sql');

// Load .env.local so DATABASE_URL / SUPABASE_DB_URL are available when run from repo root
try {
  const envPath = join(rootDir, '.env.local');
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('SUPABASE_DB_URL=') || trimmed.startsWith('DATABASE_URL=')) {
      const eq = trimmed.indexOf('=');
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '').trim();
      if (value && !process.env[key]) process.env[key] = value;
    }
  }
} catch (_) {}

const connectionString =
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Set SUPABASE_DB_URL or DATABASE_URL (in .env.local or env) to the Postgres connection string.');
  console.error('For Supabase: Dashboard → Project Settings → Database → Connection string (URI).');
  process.exit(1);
}

// Parse canonical SQL for CREATE TABLE name ( ... ) and column names
function parseCanonicalSchema(sql) {
  const tables = {};
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s*\(/gi;
  let m;
  while ((m = tableRe.exec(sql)) !== null) {
    const tableName = m[1].toLowerCase();
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < sql.length && depth > 0) {
      const c = sql[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    const block = sql.slice(start, i - 1);
    const columns = [];
    const lineRe = /^\s*["']?(\w+)["']?\s+/gm;
    let lineM;
    while ((lineM = lineRe.exec(block)) !== null) {
      const col = lineM[1].toLowerCase();
      if (!['constraint', 'primary', 'foreign', 'unique', 'check'].includes(col)) {
        columns.push(col);
      }
    }
    tables[tableName] = columns;
  }
  return tables;
}

async function getLiveSchema(client) {
  const res = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_catalog = current_database()
    ORDER BY table_name, ordinal_position
  `);
  const tables = {};
  for (const row of res.rows) {
    const t = row.table_name.toLowerCase();
    if (!tables[t]) tables[t] = [];
    tables[t].push(row.column_name.toLowerCase());
  }
  return tables;
}

function main() {
  const sql = readFileSync(canonicalPath, 'utf8');
  const expected = parseCanonicalSchema(sql);

  const client = new pg.Client({ connectionString });

  client
    .connect()
    .then(() => getLiveSchema(client))
    .then((live) => {
      const expectedTables = new Set(Object.keys(expected));
      const liveTables = new Set(Object.keys(live));

      const missingTables = [...expectedTables].filter((t) => !liveTables.has(t)).sort();
      const extraTables = [...liveTables].filter((t) => !expectedTables.has(t)).sort();

      const missingCols = [];
      const extraCols = [];
      for (const t of expectedTables) {
        if (!liveTables.has(t)) continue;
        const expCols = new Set((expected[t] || []).map((c) => c.toLowerCase()));
        const liveCols = new Set((live[t] || []).map((c) => c.toLowerCase()));
        for (const c of expCols) {
          if (!liveCols.has(c)) missingCols.push({ table: t, column: c });
        }
        for (const c of liveCols) {
          if (!expCols.has(c)) extraCols.push({ table: t, column: c });
        }
      }

      console.log('=== Schema comparison: live DB vs DB 2.17.26.sql ===\n');

      if (missingTables.length) {
        console.log('Missing tables (in canonical, not in DB):');
        missingTables.forEach((t) => console.log('  -', t));
        console.log('');
      } else {
        console.log('All canonical tables exist.\n');
      }

      if (extraTables.length) {
        console.log('Extra tables (in DB, not in canonical):');
        extraTables.forEach((t) => console.log('  +', t));
        console.log('');
      }

      if (missingCols.length) {
        console.log('Missing columns (in canonical, not in DB):');
        missingCols.forEach(({ table, column }) => console.log('  -', table + '.' + column));
        console.log('');
      }

      if (extraCols.length) {
        console.log('Extra columns (in DB, not in canonical):');
        extraCols.forEach(({ table, column }) => console.log('  +', table + '.' + column));
        console.log('');
      }

      const hasDiff =
        missingTables.length || extraTables.length || missingCols.length || extraCols.length;
      if (!hasDiff) {
        console.log('Schema matches DB 2.17.26.sql (tables and columns).');
      } else {
        process.exitCode = 1;
        console.log('Note: "Extra" tables/columns often come from migrations/apply-all-pending.sql or legacy.');
        console.log('"Missing" means the DB does not have tables/columns that DB 2.17.26.sql defines.');
      }
      const isSupabase = connectionString.includes('supabase');
      if (!isSupabase) {
        console.log('\nTo check Supabase specifically: set SUPABASE_DB_URL to your Supabase Postgres URI and run again.');
      }
    })
    .catch((err) => {
      console.error('Error:', err.message);
      process.exit(1);
    })
    .finally(() => client.end());
}

main();
