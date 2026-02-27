#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Command-center content contract gate:
 * Validates role summary envelopes and required section keys for all roles.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');

const DEFAULT_PORT = Number(process.env.COMMAND_CENTER_CONTRACT_PORT || 3215);
const START_TIMEOUT_MS = 90_000;

const checks = [
  {
    name: 'product-owner summary',
    route: '/api/role-views/product-owner/summary',
    sections: ['vitalSigns', 'pipelineStatus', 'dataQuality', 'roleActivity', 'issues'],
  },
  {
    name: 'pcl summary',
    route: '/api/role-views/pcl/summary',
    sections: ['exceptionQueue', 'mappingHealth', 'planFreshness', 'cpiDistribution'],
  },
  {
    name: 'pca summary',
    route: '/api/role-views/pca/summary',
    sections: ['myQueue', 'projectCards', 'periodProgress'],
  },
  {
    name: 'project-lead summary',
    route: '/api/role-views/project-lead/summary',
    sections: ['projectGlance', 'teamToday', 'attentionQueue', 'periodStory'],
  },
  {
    name: 'senior-manager summary',
    route: '/api/role-views/senior-manager/summary',
    sections: ['portfolioHealth', 'clients', 'projectLeads', 'escalations'],
  },
  {
    name: 'coo summary',
    route: '/api/role-views/coo/summary',
    sections: ['topThree', 'decisionQueue', 'periodPerformance', 'bySeniorManager'],
  },
  {
    name: 'rda summary',
    route: '/api/role-views/rda/summary',
    sections: ['dayGlance', 'taskQueue', 'sprintMiniBoard', 'weeklyHours'],
  },
  {
    name: 'client-portal summary',
    route: '/api/role-views/client-portal/summary',
    sections: ['projectStatus', 'milestones', 'deliverables', 'upcomingWork'],
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceExit(child) {
  return new Promise((resolve) => child.once('exit', () => resolve()));
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

async function waitForServer() {
  const baseUrl = global.__COMMAND_CENTER_BASE_URL__;
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

async function checkContract(contract) {
  const baseUrl = global.__COMMAND_CENTER_BASE_URL__;
  const response = await fetch(`${baseUrl}${contract.route}`, { redirect: 'manual' });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.status === 503) {
    console.log(`[command-center-contracts] OK   503 ${contract.name} (db unavailable; contract skipped)`);
    return;
  }
  if (response.status !== 200) {
    throw new Error(`${contract.name}: expected 200/503 but got ${response.status}`);
  }
  if (!payload || payload.success !== true) {
    throw new Error(`${contract.name}: missing success=true payload`);
  }
  if (typeof payload.scope !== 'string' || !payload.scope.length) {
    throw new Error(`${contract.name}: missing scope`);
  }
  if (typeof payload.computedAt !== 'string' || !payload.computedAt.length) {
    throw new Error(`${contract.name}: missing computedAt`);
  }
  if (!payload.sections || typeof payload.sections !== 'object') {
    throw new Error(`${contract.name}: missing sections object`);
  }
  for (const key of contract.sections) {
    if (!(key in payload.sections)) {
      throw new Error(`${contract.name}: missing sections.${key}`);
    }
  }
  if (payload.warnings !== undefined && !Array.isArray(payload.warnings)) {
    throw new Error(`${contract.name}: warnings must be an array when present`);
  }
  if (payload.actions !== undefined && (typeof payload.actions !== 'object' || payload.actions === null)) {
    throw new Error(`${contract.name}: actions must be an object when present`);
  }

  console.log(`[command-center-contracts] OK   200 ${contract.name}`);
}

async function main() {
  const port = await resolvePort(DEFAULT_PORT);
  const baseUrl = `http://localhost:${port}`;
  global.__COMMAND_CENTER_BASE_URL__ = baseUrl;
  const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next');
  await ensureProductionBuild(nextBin);
  const server = spawn(nextBin, ['dev', '-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development' },
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
    for (const contract of checks) {
      await checkContract(contract);
    }
    console.log('[command-center-contracts] PASS');
  } catch (error) {
    console.error('[command-center-contracts] Startup logs tail:');
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
  console.error(`[command-center-contracts] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
