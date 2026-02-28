#!/usr/bin/env node
/**
 * Run hours matching automation: workday phases + MPP buckets.
 * Wraps match-hours-to-workday-phases.mjs and match-hours-workday-mpp-buckets.mjs.
 *
 * Usage:
 *   node scripts/hours-match.mjs
 *   node scripts/hours-match.mjs --project PRJ-123
 *   node scripts/hours-match.mjs --dry-run
 *   node scripts/hours-match.mjs --rematch-all
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script, ...args], {
      stdio: 'inherit',
      cwd: join(__dirname, '..'),
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const phaseScript = join(__dirname, 'match-hours-to-workday-phases.mjs');
  const bucketScript = join(__dirname, 'match-hours-workday-mpp-buckets.mjs');

  console.log('Running match-hours-to-workday-phases...');
  await run(phaseScript, args);

  console.log('Running match-hours-workday-mpp-buckets...');
  await run(bucketScript, args);

  console.log('Hours matching complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
