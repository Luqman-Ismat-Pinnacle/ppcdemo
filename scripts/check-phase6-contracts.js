#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Phase 6 contract gate:
 * - boots production server
 * - validates Phase 6 API payloads and guard behavior
 * - uses non-destructive requests only
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.PHASE6_CONTRACT_PORT || 3212);
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
  console.log(`[phase6-contracts] OK   ${response.status} ${name}`);
}

function isArray(value) {
  return Array.isArray(value);
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

    await request('POST /api/data/mapping listMappingSuggestions missing project', '/api/data/mapping', {
      method: 'POST',
      body: JSON.stringify({ action: 'listMappingSuggestions' }),
    }, (res, payload) => {
      if (res.status !== 400) return { ok: false, reason: `expected 400, got ${res.status}` };
      if (!payload || payload.success !== false) return { ok: false, reason: 'expected success=false payload' };
      return { ok: true };
    });

    await request('POST /api/data/mapping listMappingSuggestions invalid status', '/api/data/mapping', {
      method: 'POST',
      body: JSON.stringify({ action: 'listMappingSuggestions', projectId: 'phase6-contract-test', status: 'bad_status' }),
    }, (res, payload) => {
      if (res.status !== 400) return { ok: false, reason: `expected 400, got ${res.status}` };
      if (!payload || payload.success !== false) return { ok: false, reason: 'expected success=false payload' };
      return { ok: true };
    });

    await request('POST /api/data/mapping mappingSuggestionsStats missing project', '/api/data/mapping', {
      method: 'POST',
      body: JSON.stringify({ action: 'mappingSuggestionsStats' }),
    }, (res, payload) => {
      if (res.status !== 400) return { ok: false, reason: `expected 400, got ${res.status}` };
      if (!payload || payload.success !== false) return { ok: false, reason: 'expected success=false payload' };
      return { ok: true };
    });

    await request('GET /api/tasks/assign default summary', '/api/tasks/assign?days=30', {
      method: 'GET',
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503, got ${res.status}` };
      if (res.status === 503) return { ok: true };
      const okShape = payload
        && payload.success === true
        && payload.summary
        && isArray(payload.recentChanges)
        && isArray(payload.topReassigned)
        && isArray(payload.sourceBreakdown)
        && isArray(payload.projectBreakdown);
      return okShape ? { ok: true } : { ok: false, reason: 'response missing expected assignment analytics fields' };
    });

    await request('GET /api/tasks/assign project scoped summary', '/api/tasks/assign?days=30&projectId=phase6-contract-test', {
      method: 'GET',
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503, got ${res.status}` };
      if (res.status === 503) return { ok: true };
      const okShape = payload
        && payload.success === true
        && payload.summary
        && isArray(payload.projectBreakdown);
      return okShape ? { ok: true } : { ok: false, reason: 'response missing expected projectBreakdown' };
    });

    await request('GET /api/tasks/assign employee scoped summary', '/api/tasks/assign?days=30&employeeId=phase6-contract-test', {
      method: 'GET',
    }, (res, payload) => {
      if (!(res.status === 200 || res.status === 503)) return { ok: false, reason: `expected 200/503, got ${res.status}` };
      if (res.status === 503) return { ok: true };
      const okShape = payload
        && payload.success === true
        && payload.summary
        && isArray(payload.assignments);
      return okShape ? { ok: true } : { ok: false, reason: 'response missing expected employee assignment shape' };
    });

    await request('GET /api/alerts/scan unauthorized', '/api/alerts/scan', {
      method: 'GET',
    }, (res, payload) => {
      if (res.status !== 401) return { ok: false, reason: `expected 401, got ${res.status}` };
      if (!payload || payload.success !== false) return { ok: false, reason: 'expected success=false payload' };
      return { ok: true };
    });

    console.log('[phase6-contracts] PASS');
  } catch (error) {
    console.error('[phase6-contracts] Startup logs tail:');
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
  console.error(`[phase6-contracts] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
