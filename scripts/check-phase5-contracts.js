#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Phase 5 contract gate:
 * - boots production server
 * - validates critical API behavior for expected status/shape
 * - uses non-destructive requests only
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.CONTRACT_PORT || 3211);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 90_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceExit(child) {
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
  });
}

async function waitForServer() {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/status`, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // continue polling
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for server at ${BASE_URL}`);
}

async function request(name, pathname, init, assert) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    redirect: 'manual',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init && init.headers ? init.headers : {}),
    },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const result = assert(response, payload);
  if (!result.ok) {
    throw new Error(`${name}: ${result.reason}`);
  }
  console.log(`[phase5-contracts] OK   ${response.status} ${name}`);
}

async function main() {
  const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next');
  const server = spawn(nextBin, ['start', '-p', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
    },
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

    await request('GET /api/data', '/api/data', { method: 'GET' }, (res, payload) => {
      if (res.status !== 200) return { ok: false, reason: `expected 200, got ${res.status}` };
      const okShape = payload && Object.prototype.hasOwnProperty.call(payload, 'data');
      return okShape ? { ok: true } : { ok: false, reason: 'response missing data field' };
    });

    await request('POST /api/data/sync invalid', '/api/data/sync', {
      method: 'POST',
      body: JSON.stringify({}),
    }, (res) => {
      if (res.status === 400 || res.status === 422 || res.status === 501 || res.status === 503) return { ok: true };
      return { ok: false, reason: `expected validation/service guard, got ${res.status}` };
    });

    await request('POST /api/data/mapping invalid action', '/api/data/mapping', {
      method: 'POST',
      body: JSON.stringify({ action: 'not_real_action' }),
    }, (res, payload) => {
      if (res.status !== 400) return { ok: false, reason: `expected 400, got ${res.status}` };
      if (!payload || payload.success !== false) return { ok: false, reason: 'expected success=false payload' };
      return { ok: true };
    });

    await request('POST /api/workday invalid', '/api/workday', {
      method: 'POST',
      body: JSON.stringify({ syncType: 'invalid_sync' }),
    }, (res) => {
      if (res.status === 400 || res.status === 500 || res.status === 503) return { ok: true };
      return { ok: false, reason: `expected guarded failure, got ${res.status}` };
    });

    await request('POST /api/project-documents invalid', '/api/project-documents', {
      method: 'POST',
      body: JSON.stringify({ action: 'invalid' }),
    }, (res) => {
      if (res.status === 400 || res.status === 405 || res.status === 500 || res.status === 503) return { ok: true };
      return { ok: false, reason: `expected guarded failure, got ${res.status}` };
    });

    await request('POST /api/feedback invalid', '/api/feedback', {
      method: 'POST',
      body: JSON.stringify({}),
    }, (res) => {
      if (res.status === 400 || res.status === 422 || res.status === 500 || res.status === 503) return { ok: true };
      return { ok: false, reason: `expected validation/service guard, got ${res.status}` };
    });

    await request('GET /api/alerts list', '/api/alerts?status=open&limit=5', {
      method: 'GET',
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503, got ${res.status}` };
      if (res.status === 503) return { ok: true };
      if (!payload || payload.success !== true || !Array.isArray(payload.alerts)) {
        return { ok: false, reason: 'expected success=true with alerts[]' };
      }
      return { ok: true };
    });

    await request('POST /api/tasks/assign invalid', '/api/tasks/assign', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'x' }),
    }, (res, payload) => {
      if (res.status !== 400) return { ok: false, reason: `expected 400, got ${res.status}` };
      if (!payload || payload.success !== false) return { ok: false, reason: 'expected success=false payload' };
      return { ok: true };
    });

    console.log('[phase5-contracts] PASS');
  } catch (error) {
    console.error('[phase5-contracts] Startup logs tail:');
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
  console.error(`[phase5-contracts] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
