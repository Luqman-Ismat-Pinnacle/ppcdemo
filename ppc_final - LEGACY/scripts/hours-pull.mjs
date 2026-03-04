#!/usr/bin/env node
/**
 * Pull Workday hours for a date range.
 * Calls Supabase Edge Function (workday-hours) or app API.
 *
 * Usage:
 *   node scripts/hours-pull.mjs
 *   node scripts/hours-pull.mjs --from 2025-01-01 --to 2025-01-31
 *   node scripts/hours-pull.mjs --from 2025-01-01 --to 2025-01-31 --project PRJ-123
 *   node scripts/hours-pull.mjs --dry-run
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

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
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

async function main() {
  loadEnvLocal();

  const dryRun = hasFlag('--dry-run');
  const from = argValue('--from') || daysAgo(7);
  const to = argValue('--to') || daysAgo(0);
  const project = argValue('--project');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (dryRun) {
    console.log('[dry-run] Would pull hours:', { from, to, project: project || 'all' });
    return;
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const edgeUrl = `${supabaseUrl}/functions/v1/workday-hours`;
  const body = { startDate: from, endDate: to, ...(project ? { projectId: project } : {}) };

  console.log('Pulling hours:', from, 'to', to, project ? `(project: ${project})` : '');
  const res = await fetch(edgeUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', apikey: supabaseKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Error:', res.status, text);
    process.exit(1);
  }

  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
