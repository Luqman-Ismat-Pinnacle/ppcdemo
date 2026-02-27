#!/usr/bin/env node
/**
 * Full refresh pipeline for Workday phases:
 * 1) Delete current workday_phases in Supabase
 * 2) Trigger Workday pull (Edge Function or API endpoint)
 * 3) Validate refreshed count
 * 4) Migrate Supabase -> Azure Postgres
 *
 * Usage:
 *   node scripts/refresh-workday-phases-and-migrate.mjs
 *   node scripts/refresh-workday-phases-and-migrate.mjs --api-url http://localhost:3000/api/workday
 */

import { readFileSync, existsSync } from 'fs';
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

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

async function triggerViaApi(apiUrl) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ syncType: 'unified', hoursDaysBack: 30 }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Workday API failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/x-ndjson')) {
    const text = await response.text();
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    console.log(`[Workday Refresh] Received ${lines.length} stream events from ${apiUrl}`);
    const done = lines.find((line) => line.includes('"type":"done"'));
    if (done && done.includes('"success":false')) {
      throw new Error(`Unified sync reported failure: ${done}`);
    }
    return;
  }

  const json = await response.json().catch(() => ({}));
  if (json.success === false) throw new Error(json.error || 'Workday API reported failure');
}

async function triggerViaAzureFunction(functionUrl, functionKey) {
  const url = functionKey ? `${functionUrl}?code=${functionKey}` : functionUrl;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hoursDaysBack: 30 }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Azure Function sync failed (${response.status}): ${body.slice(0, 400)}`);
  }
  const json = await response.json().catch(() => ({}));
  if (json.success === false) throw new Error(json.error || 'Azure Function sync reported failure');
}

async function supabaseRest({
  supabaseUrl,
  supabaseKey,
  path,
  method = 'GET',
  extraHeaders = {},
}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Supabase REST ${method} ${path} failed (${response.status}): ${body.slice(0, 400)}`);
  }
  return response;
}

async function syncAzureTablesToSupabase({
  supabaseUrl,
  supabaseKey,
  azureDbUrl,
  tables,
}) {
  const client = new pg.Client({
    connectionString: azureDbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const projectResponse = await supabaseRest({
      supabaseUrl,
      supabaseKey,
      path: 'projects?select=id',
      method: 'GET',
    });
    const supabaseProjects = await projectResponse.json().catch(() => []);
    const validProjectIds = new Set((Array.isArray(supabaseProjects) ? supabaseProjects : []).map((row) => String(row.id || '')));

    for (const table of tables) {
      const result = await client.query(`SELECT * FROM ${table}`);
      let rows = result.rows || [];
      if (table === 'workday_phases' || table === 'customer_contracts') {
        const before = rows.length;
        rows = rows.filter((row) => {
          const projectId = String(row.project_id || '');
          return !projectId || validProjectIds.has(projectId);
        });
        const dropped = before - rows.length;
        if (dropped > 0) {
          console.log(`[Workday Refresh] Skipped ${dropped} ${table} rows due to missing Supabase project FK.`);
        }
      }
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify(chunk),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Supabase upsert failed for ${table} (${response.status}): ${body.slice(0, 400)}`);
        }
      }
      console.log(`[Workday Refresh] Synced Azure -> Supabase table ${table}: ${rows.length} rows`);
    }
  } finally {
    await client.end();
  }
}

async function fetchSupabaseTableAll({ supabaseUrl, supabaseKey, table, pageSize = 1000 }) {
  const all = [];
  let offset = 0;
  while (true) {
    const response = await supabaseRest({
      supabaseUrl,
      supabaseKey,
      path: `${table}?select=*&limit=${pageSize}&offset=${offset}`,
      method: 'GET',
    });
    const rows = await response.json().catch(() => []);
    const chunk = Array.isArray(rows) ? rows : [];
    if (!chunk.length) break;
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function upsertRowsToAzure({ azureDbUrl, table, rows }) {
  if (!rows.length) return 0;
  const client = new pg.Client({
    connectionString: azureDbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const columns = Array.from(
      rows.reduce((acc, row) => {
        Object.keys(row || {}).forEach((k) => acc.add(k));
        return acc;
      }, new Set()),
    ).filter(Boolean);
    if (!columns.includes('id')) throw new Error(`Table ${table} rows missing id`);
    const updateCols = columns.filter((col) => col !== 'id');
    const batchSize = 300;
    let written = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = [];
      const placeholders = batch.map((row, rowIndex) => {
        const rowPlaceholders = columns.map((col, colIndex) => {
          values.push(row[col] ?? null);
          return `$${rowIndex * columns.length + colIndex + 1}`;
        });
        return `(${rowPlaceholders.join(', ')})`;
      });
      const sql = `
        INSERT INTO ${table} (${columns.join(', ')})
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (id)
        DO UPDATE SET ${updateCols.map((col) => `${col} = EXCLUDED.${col}`).join(', ')}
      `;
      await client.query(sql, values);
      written += batch.length;
    }
    return written;
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvLocal();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiUrl = argValue('--api-url') || process.env.WORKDAY_SYNC_API_URL || '';
  const azureFunctionUrl = process.env.AZURE_FUNCTION_URL || process.env.AZURE_WORKDAY_SYNC_URL || '';
  const azureFunctionKey = process.env.AZURE_FUNCTION_KEY || '';
  const azureDbUrl =
    process.env.AZURE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_CONNECTION_STRING ||
    process.env.AZURE_POSTGRES_CONNECTION_STRING;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase env vars. Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or anon key).');
  }

  console.log('[Workday Refresh] Deleting current Supabase workday_phases...');
  await supabaseRest({
    supabaseUrl,
    supabaseKey: supabaseServiceKey,
    path: 'workday_phases?id=not.is.null',
    method: 'DELETE',
  });

  if (apiUrl) {
    console.log(`[Workday Refresh] Triggering unified sync via ${apiUrl}...`);
    await triggerViaApi(apiUrl);
  } else if (azureFunctionUrl) {
    console.log('[Workday Refresh] Triggering unified sync via Azure Function URL from env...');
    await triggerViaAzureFunction(azureFunctionUrl, azureFunctionKey);
    if (!azureDbUrl) {
      throw new Error('Azure DB URL missing for Azure->Supabase reconciliation.');
    }
    console.log('[Workday Refresh] Reconciling Supabase from Azure source tables...');
    await syncAzureTablesToSupabase({
      supabaseUrl,
      supabaseKey: supabaseServiceKey,
      azureDbUrl,
      tables: ['workday_phases'],
    });
  } else {
    throw new Error(
      'Missing workday sync endpoint. Set WORKDAY_SYNC_API_URL or AZURE_FUNCTION_URL in .env.local, or pass --api-url.',
    );
  }

  const countResponse = await supabaseRest({
    supabaseUrl,
    supabaseKey: supabaseServiceKey,
    path: 'workday_phases?select=id',
    method: 'GET',
    extraHeaders: { Prefer: 'count=exact' },
  });
  const countHeader = countResponse.headers.get('content-range') || '';
  const count = Number(countHeader.split('/')[1] || 0);
  console.log(`[Workday Refresh] Supabase workday_phases count after sync: ${count ?? 0}`);

  if (!count || count <= 0) {
    throw new Error('Supabase workday_phases count is 0 after sync. Aborting Azure migration.');
  }

  if (!azureDbUrl) {
    throw new Error('Azure DB URL missing for Supabase->Azure migration.');
  }
  console.log('[Workday Refresh] Running Supabase -> Azure migration (REST/PG mode)...');
  const supabaseContracts = await fetchSupabaseTableAll({
    supabaseUrl,
    supabaseKey: supabaseServiceKey,
    table: 'customer_contracts',
  });
  const supabasePhases = await fetchSupabaseTableAll({
    supabaseUrl,
    supabaseKey: supabaseServiceKey,
    table: 'workday_phases',
  });
  const writtenContracts = await upsertRowsToAzure({
    azureDbUrl,
    table: 'customer_contracts',
    rows: supabaseContracts,
  });
  const writtenPhases = await upsertRowsToAzure({
    azureDbUrl,
    table: 'workday_phases',
    rows: supabasePhases,
  });
  console.log(`[Workday Refresh] Migrated customer_contracts rows: ${writtenContracts}`);
  console.log(`[Workday Refresh] Migrated workday_phases rows: ${writtenPhases}`);
  console.log('[Workday Refresh] Completed successfully.');
}

main().catch((error) => {
  console.error('[Workday Refresh] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
