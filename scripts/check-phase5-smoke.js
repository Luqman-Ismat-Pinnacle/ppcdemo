#!/usr/bin/env node
/**
 * Phase 5 smoke gate:
 * - boots production server
 * - checks critical pages and APIs return non-5xx responses
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.SMOKE_PORT || 3210);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 90_000;

const checks = [
  '/api/status',
  '/api/data',
  '/api/data/sync',
  '/api/data/mapping',
  '/api/workday',
  '/api/project-documents',
  '/api/feedback',
  '/',
  '/insights/overview',
  '/insights/hours',
  '/insights/mos-page',
  '/insights/tasks',
  '/project-controls/data-management',
  '/project-controls/project-plans',
  '/project-controls/folders',
  '/project-controls/wbs-gantt',
  '/project-management/forecast',
  '/project-management/documentation',
];

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
      const response = await fetch(`${BASE_URL}/api/status`, {
        redirect: 'manual',
      });

      if (response.status < 500) return;
    } catch {
      // keep polling until deadline
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for server at ${BASE_URL}`);
}

async function checkPath(pathname) {
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      redirect: 'manual',
    });

    if (response.status >= 500) {
      return {
        ok: false,
        pathname,
        status: response.status,
        reason: 'server error',
      };
    }

    return { ok: true, pathname, status: response.status };
  } catch (error) {
    return {
      ok: false,
      pathname,
      status: 0,
      reason: error instanceof Error ? error.message : 'request failed',
    };
  }
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

    const results = [];
    for (const pathname of checks) {
      results.push(await checkPath(pathname));
    }

    const failures = results.filter((result) => !result.ok);
    for (const result of results) {
      if (result.ok) {
        console.log(`[phase5-smoke] OK   ${result.status} ${result.pathname}`);
      } else {
        console.error(
          `[phase5-smoke] FAIL ${result.status} ${result.pathname} (${result.reason})`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`Smoke checks failed for ${failures.length} route(s)`);
    }

    console.log('[phase5-smoke] PASS');
  } catch (error) {
    console.error('[phase5-smoke] Startup logs tail:');
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
  console.error(`[phase5-smoke] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
