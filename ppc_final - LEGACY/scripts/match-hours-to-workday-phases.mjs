#!/usr/bin/env node
/**
 * Match hour_entries to workday_phases using:
 * - same project_id
 * - normalized exact match of hour_entries.phases -> workday_phases.name
 *
 * Usage:
 *   node scripts/match-hours-to-workday-phases.mjs
 *   node scripts/match-hours-to-workday-phases.mjs --rematch-all
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

function hasFlag(flag) {
  return process.argv.includes(flag);
}

async function scalar(client, sql) {
  const { rows } = await client.query(sql);
  return Number(rows?.[0] ? Object.values(rows[0])[0] : 0);
}

async function main() {
  loadEnvLocal();
  const rematchAll = hasFlag('--rematch-all');
  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.AZURE_POSTGRES_CONNECTION_STRING ||
    process.env.POSTGRES_CONNECTION_STRING ||
    process.env.AZURE_DATABASE_URL;

  if (!dbUrl) throw new Error('Missing database connection string env.');

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    if (rematchAll) {
      await client.query('UPDATE hour_entries SET workday_phase_id = NULL');
    }

    const beforeMapped = await scalar(client, 'SELECT COUNT(*) FROM hour_entries WHERE workday_phase_id IS NOT NULL');
    const considered = await scalar(client, "SELECT COUNT(*) FROM hour_entries WHERE COALESCE(phases, '') <> ''");

    const result = await client.query(`
      WITH matched AS (
        SELECT h.id AS hour_id, wp.id AS workday_phase_id
        FROM hour_entries h
        JOIN workday_phases wp
          ON wp.project_id = h.project_id
         AND regexp_replace(lower(trim(COALESCE(h.phases, ''))), '[^a-z0-9 ]', '', 'g')
             = regexp_replace(lower(trim(COALESCE(wp.name, ''))), '[^a-z0-9 ]', '', 'g')
        WHERE COALESCE(h.phases, '') <> ''
          AND h.workday_phase_id IS NULL
      )
      UPDATE hour_entries h
      SET workday_phase_id = matched.workday_phase_id,
          updated_at = NOW()
      FROM matched
      WHERE h.id = matched.hour_id
      RETURNING h.id
    `);

    const matchedCount = result.rowCount || 0;
    const afterMapped = await scalar(client, 'SELECT COUNT(*) FROM hour_entries WHERE workday_phase_id IS NOT NULL');
    const totalHours = await scalar(client, 'SELECT COUNT(*) FROM hour_entries');

    await client.query('COMMIT');
    console.log(`[Hours->WorkdayPhase] considered=${considered} matched_now=${matchedCount}`);
    console.log(`[Hours->WorkdayPhase] mapped_before=${beforeMapped} mapped_after=${afterMapped} total_hours=${totalHours}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[Hours->WorkdayPhase] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
