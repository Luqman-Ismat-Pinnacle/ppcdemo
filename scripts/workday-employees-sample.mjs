#!/usr/bin/env node
/**
 * Fetches the same Workday employees report the Supabase Edge Function uses
 * and prints the first record (all keys and values) so we can see exact field names.
 *
 * Usage: node scripts/workday-employees-sample.mjs
 * Output: scripts/workday-employees-sample.json (and logs to console)
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const user = process.env.WORKDAY_ISU_USER;
const pass = process.env.WORKDAY_ISU_PASS;
const url =
  'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Employees?Include_Terminated_Workers=1&format=json';

if (!user || !pass) {
  console.error('Need WORKDAY_ISU_USER and WORKDAY_ISU_PASS in .env.local');
  process.exit(1);
}

const credentials = Buffer.from(`${user}:${pass}`).toString('base64');
const res = await fetch(url, {
  headers: { Accept: 'application/json', Authorization: `Basic ${credentials}` },
});

if (!res.ok) {
  console.error('Workday API error:', res.status, await res.text());
  process.exit(1);
}

const data = await res.json();
let records = Array.isArray(data) ? data : data.Report_Entry ?? [];
if (!Array.isArray(records)) {
  const key = Object.keys(data).find((k) => Array.isArray(data[k]) && data[k].length > 0);
  if (key) records = data[key];
}

console.log('Top-level keys in response:', Object.keys(data));
console.log('Record count:', records.length);

if (records.length === 0) {
  console.log('No records. Full response (truncated):', JSON.stringify(data, null, 2).slice(0, 2000));
  process.exit(0);
}

const first = records[0];
console.log('\n--- First record: all keys (in order) ---');
console.log(Object.keys(first).join(', '));

console.log('\n--- First record: each key => value ---');
const keyValues = {};
for (const k of Object.keys(first)) {
  const v = first[k];
  keyValues[k] = v;
  const display = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
  console.log(k, '=>', display.length > 120 ? display.slice(0, 120) + '...' : display);
}

const outPath = resolve(process.cwd(), 'scripts/workday-employees-sample.json');
writeFileSync(outPath, JSON.stringify({ responseTopLevelKeys: Object.keys(data), recordCount: records.length, firstRecord: keyValues }, null, 2), 'utf8');
console.log('\n--- Full first record written to:', outPath);
