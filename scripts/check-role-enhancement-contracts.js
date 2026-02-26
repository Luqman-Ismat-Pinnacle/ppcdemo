#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Role enhancement contract gate:
 * Validates key role-workstation APIs introduced/expanded by v2.1.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const fs = require('node:fs');

const DEFAULT_PORT = Number(process.env.ROLE_ENHANCE_CONTRACT_PORT || 3213);
const START_TIMEOUT_MS = 90_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceExit(child) {
  return new Promise((resolve) => child.once('exit', () => resolve()));
}

async function waitForServer() {
  const baseUrl = global.__ROLE_ENHANCE_BASE_URL__;
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/status`, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for server at ${baseUrl}`);
}

async function request(name, pathname, init, assertFn) {
  const baseUrl = global.__ROLE_ENHANCE_BASE_URL__;
  const res = await fetch(`${baseUrl}${pathname}`, {
    redirect: 'manual',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  const check = assertFn(res, payload);
  if (!check.ok) throw new Error(`${name}: ${check.reason}`);
  console.log(`[role-enhance-contracts] OK   ${res.status} ${name}`);
}

async function requestStatus(name, pathname, init, isOk) {
  const baseUrl = global.__ROLE_ENHANCE_BASE_URL__;
  const res = await fetch(`${baseUrl}${pathname}`, {
    redirect: 'manual',
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
  });
  const ok = isOk(res);
  if (!ok) throw new Error(`${name}: unexpected status ${res.status}`);
  console.log(`[role-enhance-contracts] OK   ${res.status} ${name}`);
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
  global.__ROLE_ENHANCE_BASE_URL__ = baseUrl;
  const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next');
  await ensureProductionBuild(nextBin);
  const server = spawn(nextBin, ['start', '-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
  });

  let startupLogs = '';
  const appendLog = (chunk) => {
    startupLogs += chunk.toString();
    if (startupLogs.length > 4000) startupLogs = startupLogs.slice(-4000);
  };
  server.stdout.on('data', appendLog);
  server.stderr.on('data', appendLog);

  try {
    await waitForServer();

    await request('GET /api/data-quality/issues', '/api/data-quality/issues?limit=20', {
      method: 'GET',
      headers: { 'x-role-view': 'pca' },
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503 got ${res.status}` };
      if (res.status === 503) return { ok: true };
      if (!payload || payload.success !== true || !Array.isArray(payload.issues)) return { ok: false, reason: 'expected success + issues[]' };
      return { ok: true };
    });

    await request('GET /api/compliance/matrix', '/api/compliance/matrix?limit=20', {
      method: 'GET',
      headers: { 'x-role-view': 'pcl' },
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503 got ${res.status}` };
      if (res.status === 503) return { ok: true };
      if (!payload || payload.success !== true || !Array.isArray(payload.rows)) return { ok: false, reason: 'expected success + rows[]' };
      return { ok: true };
    });

    await request('GET /api/alerts filtered', '/api/alerts?status=open&limit=20', {
      method: 'GET',
      headers: { 'x-role-view': 'pcl' },
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503 got ${res.status}` };
      if (res.status === 503) return { ok: true };
      if (!payload || payload.success !== true || !Array.isArray(payload.alerts)) return { ok: false, reason: 'expected success + alerts[]' };
      return { ok: true };
    });

    await request('GET /api/commitments list', '/api/commitments?limit=20', {
      method: 'GET',
      headers: { 'x-role-view': 'coo' },
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503 got ${res.status}` };
      if (res.status === 503) return { ok: true };
      if (!payload || payload.success !== true || !Array.isArray(payload.rows)) return { ok: false, reason: 'expected success + rows[]' };
      return { ok: true };
    });

    await request('POST /api/project-documents list', '/api/project-documents', {
      method: 'POST',
      headers: { 'x-role-view': 'project_lead' },
      body: JSON.stringify({ action: 'listDocumentRecords', limit: 20 }),
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503 got ${res.status}` };
      if (res.status === 503) return { ok: true };
      if (!payload || payload.success !== true || !Array.isArray(payload.records)) return { ok: false, reason: 'expected success + records[]' };
      return { ok: true };
    });

    await requestStatus('GET /role-views/pca/plan-uploads', '/role-views/pca/plan-uploads', {
      method: 'GET',
      headers: { 'x-role-view': 'pca' },
    }, (res) => res.status < 500);

    await requestStatus('GET /role-views/project-lead/documents', '/role-views/project-lead/documents', {
      method: 'GET',
      headers: { 'x-role-view': 'project_lead' },
    }, (res) => res.status < 500);

    console.log('[role-enhance-contracts] PASS');
  } catch (error) {
    console.error('[role-enhance-contracts] Startup logs tail:');
    console.error(startupLogs || '(no logs)');
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
  console.error(`[role-enhance-contracts] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
