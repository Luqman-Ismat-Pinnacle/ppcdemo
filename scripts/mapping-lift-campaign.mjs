#!/usr/bin/env node
/**
 * Campaign runner:
 * 1) Snapshot baseline metrics
 * 2) Trigger Workday refresh pipeline
 * 3) Run hour-entry matcher with run-id
 * 4) Emit metrics delta + QA sample
 *
 * Usage:
 *   node scripts/mapping-lift-campaign.mjs
 *   node scripts/mapping-lift-campaign.mjs --skip-refresh
 *   node scripts/mapping-lift-campaign.mjs --project 30005
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function runOrThrow(command, args, label) {
  const out = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (out.status !== 0) {
    throw new Error(`${label} failed with exit code ${out.status ?? 'unknown'}`);
  }
}

async function getClient() {
  const dbUrl =
    process.env.DATABASE_URL
    || process.env.AZURE_POSTGRES_CONNECTION_STRING
    || process.env.POSTGRES_CONNECTION_STRING
    || process.env.AZURE_DATABASE_URL;
  if (!dbUrl) throw new Error('Missing DB URL env (DATABASE_URL/AZURE_POSTGRES_CONNECTION_STRING).');
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

async function snapshotMetrics(client, projectFilter) {
  const params = [];
  const whereSql = projectFilter ? 'WHERE project_id = $1' : '';
  if (projectFilter) params.push(projectFilter);

  const totalsRes = await client.query(
    `SELECT
       count(*)::int total,
       count(*) FILTER (WHERE coalesce(workday_phase_id,'') <> '')::int workday_mapped,
       count(*) FILTER (
         WHERE coalesce(task_id,'') <> ''
            OR coalesce(phase_id,'') <> ''
            OR coalesce(mpp_task_phase,'') <> ''
       )::int mpp_mapped,
       count(*) FILTER (
         WHERE coalesce(workday_phase_id,'') <> ''
            OR coalesce(task_id,'') <> ''
            OR coalesce(phase_id,'') <> ''
            OR coalesce(mpp_task_phase,'') <> ''
       )::int any_mapped
     FROM hour_entries
     ${whereSql}`,
    params,
  );

  const perProjectRes = await client.query(
    `SELECT
       project_id,
       count(*)::int total,
       count(*) FILTER (
         WHERE coalesce(workday_phase_id,'') <> ''
            OR coalesce(task_id,'') <> ''
            OR coalesce(phase_id,'') <> ''
            OR coalesce(mpp_task_phase,'') <> ''
       )::int any_mapped
     FROM hour_entries
     ${whereSql}
     GROUP BY project_id`,
    params,
  );

  const totals = totalsRes.rows[0];
  const anyPct = totals.total > 0
    ? Number(((totals.any_mapped / totals.total) * 100).toFixed(2))
    : 0;

  return {
    totals: {
      ...totals,
      any_mapped_pct: anyPct,
    },
    perProject: perProjectRes.rows,
  };
}

function diffByProject(beforeRows, afterRows) {
  const beforeMap = new Map(beforeRows.map((r) => [String(r.project_id), Number(r.any_mapped || 0)]));
  return afterRows
    .map((r) => {
      const pid = String(r.project_id);
      const afterMapped = Number(r.any_mapped || 0);
      const beforeMapped = Number(beforeMap.get(pid) || 0);
      return {
        project_id: pid,
        before_mapped: beforeMapped,
        after_mapped: afterMapped,
        delta: afterMapped - beforeMapped,
        total: Number(r.total || 0),
      };
    })
    .sort((a, b) => b.delta - a.delta);
}

async function qaSample(client, sinceIso, projectFilter, sampleSize = 50) {
  const params = [sinceIso];
  let where = 'WHERE updated_at >= $1';
  if (projectFilter) {
    params.push(projectFilter);
    where += ` AND project_id = $${params.length}`;
  }
  const res = await client.query(
    `SELECT id, project_id, phases, task, workday_phase_id, workday_phase, task_id, phase_id, mpp_task_phase, mpp_phase_unit, updated_at
       FROM hour_entries
      ${where}
        AND (
          coalesce(workday_phase_id,'') <> ''
          OR coalesce(task_id,'') <> ''
          OR coalesce(phase_id,'') <> ''
          OR coalesce(mpp_task_phase,'') <> ''
        )
      ORDER BY random()
      LIMIT ${sampleSize}`,
    params,
  );
  return res.rows;
}

async function main() {
  loadEnvLocal();
  const skipRefresh = hasFlag('--skip-refresh');
  const projectFilter = argValue('--project');
  const runId = `campaign-${new Date().toISOString()}`;
  const matchStartedAt = new Date().toISOString();

  const client = await getClient();
  try {
    const before = await snapshotMetrics(client, projectFilter);
    console.log('[Campaign] Baseline:', JSON.stringify(before.totals));

    if (!skipRefresh) {
      runOrThrow('node', ['scripts/refresh-workday-phases-and-migrate.mjs'], 'Workday refresh');
    } else {
      console.log('[Campaign] Skipping workday refresh (--skip-refresh).');
    }

    const matchArgs = ['scripts/match-hours-workday-mpp-buckets.mjs', '--run-id', runId];
    if (projectFilter) {
      matchArgs.push('--project', projectFilter);
    }
    runOrThrow('node', matchArgs, 'Hours matcher');

    const after = await snapshotMetrics(client, projectFilter);
    const projectDiff = diffByProject(before.perProject, after.perProject)
      .filter((x) => x.delta > 0)
      .slice(0, 20);

    const qaRows = await qaSample(client, matchStartedAt, projectFilter, 50);

    const output = {
      runId,
      projectFilter: projectFilter || null,
      before: before.totals,
      after: after.totals,
      delta: {
        workday_mapped: Number(after.totals.workday_mapped) - Number(before.totals.workday_mapped),
        mpp_mapped: Number(after.totals.mpp_mapped) - Number(before.totals.mpp_mapped),
        any_mapped: Number(after.totals.any_mapped) - Number(before.totals.any_mapped),
        any_mapped_pct: Number((after.totals.any_mapped_pct - before.totals.any_mapped_pct).toFixed(2)),
      },
      topProjectImprovements: projectDiff,
      qaSampleSize: qaRows.length,
      qaSample: qaRows,
    };

    console.log('[Campaign] Result:', JSON.stringify(output, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[Campaign] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

