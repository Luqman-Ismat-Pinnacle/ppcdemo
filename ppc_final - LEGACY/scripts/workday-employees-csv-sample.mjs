#!/usr/bin/env node
/**
 * Fetches the Workday employees report as CSV and prints:
 * - Header row
 * - First data row
 *
 * Usage: node scripts/workday-employees-csv-sample.mjs
 */

import { readFileSync, existsSync } from 'fs';
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
  'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Employees?Include_Terminated_Workers=1&format=csv';

if (!user || !pass) {
  console.error('Need WORKDAY_ISU_USER and WORKDAY_ISU_PASS in .env.local');
  process.exit(1);
}

const credentials = Buffer.from(`${user}:${pass}`).toString('base64');
const res = await fetch(url, {
  headers: { Accept: 'text/csv', Authorization: `Basic ${credentials}` },
});

if (!res.ok) {
  console.error('Workday CSV error:', res.status, (await res.text()).slice(0, 400));
  process.exit(1);
}

const text = await res.text();
const lines = text.split(/\r?\n/).filter(Boolean);

console.log('CSV lines:', lines.length);
console.log('\nHEADER:');
console.log(lines[0] || '');
console.log('\nFIRST ROW:');
console.log(lines[1] || '');

