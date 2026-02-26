#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');

const DEFAULT_PORT = Number(process.env.ROLE_SMOKE_PORT || 3211);
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
  const baseUrl = global.__ROLE_SMOKE_BASE_URL__;
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/status`, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for server at ${baseUrl}`);
}

async function checkPath(pathname) {
  const baseUrl = global.__ROLE_SMOKE_BASE_URL__;
  try {
    const response = await fetch(`${baseUrl}${pathname}`, { redirect: 'manual' });
    return { ok: response.status < 500, pathname, status: response.status };
  } catch (err) {
    return { ok: false, pathname, status: 0, reason: err instanceof Error ? err.message : 'request failed' };
  }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function resolvePort(startPort) {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = startPort + offset;
    if (await isPortOpen(port)) return port;
  }
  throw new Error(`No free port found near ${startPort}`);
}

async function ensureProductionBuild(nextBin) {
  const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
  if (fs.existsSync(buildIdPath)) return;
  await new Promise((resolve, reject) => {
    const build = spawn(nextBin, ['build'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });
    build.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next build failed with code ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  const port = await resolvePort(DEFAULT_PORT);
  const baseUrl = `http://127.0.0.1:${port}`;
  global.__ROLE_SMOKE_BASE_URL__ = baseUrl;
  const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next');
  await ensureProductionBuild(nextBin);
  const server = spawn(nextBin, ['start', '-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
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
