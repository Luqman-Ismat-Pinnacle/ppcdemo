#!/usr/bin/env node
/**
 * Fetch Workday hours for December 2025 and upsert to Azure Postgres.
 * Uses the same method as the Azure Function: Workday API → hour_entries (and phases/tasks) → Azure.
 * Loads .env.local for POSTGRES_CONNECTION_STRING, WORKDAY_ISU_USER, WORKDAY_ISU_PASS.
 *
 * Usage: node --env-file=.env.local scripts/sync-hours-december-2025-to-azure.mjs
 *   Or:   node scripts/sync-hours-december-2025-to-azure.mjs   (with env already set)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { spawn } from 'child_process';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const START = '2025-12-01';
const END = '2025-12-31';
const syncDir = resolve(process.cwd(), 'azure-functions-workday-sync');

async function main() {
  console.log(`[Sync] Fetching Workday hours ${START} to ${END} and upserting to Azure...`);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      ['-e', `require('./run-sync').runHoursOnlySync('${START}','${END}').then(s=>console.log(JSON.stringify(s,null,2))).catch(e=>{console.error(e);process.exit(1)})`],
      { cwd: syncDir, env: process.env, stdio: 'inherit' }
    );
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Process exited with code ${code}`));
    });
    child.on('error', rejectPromise);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
