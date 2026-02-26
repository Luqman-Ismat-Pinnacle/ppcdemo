#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.ROLE_SMOKE_PORT || 3211);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 90_000;

const checks = [
  '/role-views',
  '/role-views/pcl',
  '/role-views/pcl/wbs',
  '/role-views/pca',
  '/role-views/pca/plan-uploads',
  '/role-views/pca/wbs',
  '/role-views/project-lead',
  '/role-views/project-lead/schedule',
  '/role-views/project-lead/forecast',
  '/role-views/project-lead/documents',
  '/role-views/senior-manager',
  '/role-views/coo',
  '/role-views/coo/ai',
  '/role-views/rda',
  '/role-views/rda/schedule',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceExit(child) {
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

async function waitForServer() {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/status`, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for server at ${BASE_URL}`);
}

async function checkPath(pathname) {
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, { redirect: 'manual' });
    return { ok: response.status < 500, pathname, status: response.status };
  } catch (err) {
    return { ok: false, pathname, status: 0, reason: err instanceof Error ? err.message : 'request failed' };
  }
}

async function main() {
  const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next');
  const server = spawn(nextBin, ['start', '-p', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
  });

  let startupLogs = '';
  server.stdout.on('data', (d) => { startupLogs += d.toString(); });
  server.stderr.on('data', (d) => { startupLogs += d.toString(); });

  try {
    await waitForServer();
    const results = [];
    for (const pathname of checks) {
      results.push(await checkPath(pathname));
    }

    const failures = results.filter((result) => !result.ok);
    for (const result of results) {
      if (result.ok) console.log(`[role-smoke] OK   ${result.status} ${result.pathname}`);
      else console.error(`[role-smoke] FAIL ${result.status} ${result.pathname}`);
    }

    if (failures.length > 0) {
      throw new Error(`Role workstation smoke checks failed for ${failures.length} route(s)`);
    }

    console.log('[role-smoke] PASS');
  } catch (error) {
    console.error(startupLogs || '(no startup logs)');
    throw error;
  } finally {
    server.kill('SIGTERM');
    await Promise.race([onceExit(server), sleep(2000)]);
    if (server.exitCode === null) {
      server.kill('SIGKILL');
      await Promise.race([onceExit(server), sleep(1000)]);
    }
  }
}

main().catch((error) => {
  console.error(`[role-smoke] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
