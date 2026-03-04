#!/usr/bin/env node
/**
 * @fileoverview Trigger alert scan endpoint from CLI/cron.
 *
 * Usage:
 * - ALERT_SCAN_BASE_URL=https://example.com ALERT_SCAN_TOKEN=secret npm run alerts:scan
 * - node scripts/run-alert-scan.mjs --base-url https://example.com --token secret
 */

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return '';
  return process.argv[idx + 1] || '';
}

const baseUrl = (getArg('--base-url') || process.env.ALERT_SCAN_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '').trim();
const token = (getArg('--token') || process.env.ALERT_SCAN_TOKEN || '').trim();

if (!baseUrl) {
  console.error('[alerts:scan] Missing base URL. Provide --base-url or ALERT_SCAN_BASE_URL.');
  process.exit(1);
}
if (!token) {
  console.error('[alerts:scan] Missing token. Provide --token or ALERT_SCAN_TOKEN.');
  process.exit(1);
}

const targetUrl = `${baseUrl.replace(/\/$/, '')}/api/alerts/scan`;

async function run() {
  const response = await fetch(targetUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    const message = payload?.error || `HTTP ${response.status}`;
    console.error(`[alerts:scan] Failed: ${message}`);
    process.exit(1);
  }

  const created = Number(payload?.created || 0);
  console.log(`[alerts:scan] Success. Created ${created} alert(s).`);
  const summaries = Array.isArray(payload?.summaries) ? payload.summaries : [];
  summaries.forEach((summary) => {
    console.log(` - ${summary.scope}: created=${summary.created}, evaluated=${summary.evaluated}`);
  });
}

run().catch((error) => {
  console.error(`[alerts:scan] Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
