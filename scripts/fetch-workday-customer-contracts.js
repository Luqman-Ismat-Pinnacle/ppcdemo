#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * One-off: fetch Workday Customer Contract Lines report and print record count + sample rows.
 * Loads WORKDAY_ISU_USER, WORKDAY_ISU_PASS from .env.local (or env). Run from repo root.
 *
 * Usage: node scripts/fetch-workday-customer-contracts.js
 */

const fs = require('fs');
const path = require('path');

// Load .env.local from project root
function loadEnvLocal() {
  const root = path.resolve(__dirname, '..');
  const envPath = path.join(root, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key) process.env[key] = value;
  });
}

loadEnvLocal();

const USER = process.env.WORKDAY_ISU_USER || '';
const PASS = process.env.WORKDAY_ISU_PASS || '';
const URL =
  process.env.WORKDAY_CUSTOMER_CONTRACTS_URL ||
  'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/mandie.burnett/RPT_-_Find_Customer_Contract_Lines_-_Revenue?New_Business=0&Renewable=0&format=json';

async function main() {
  if (!USER || !PASS) {
    console.error('Missing WORKDAY_ISU_USER or WORKDAY_ISU_PASS.');
    console.error('  Option 1: Add them to .env.local (same values as in Azure Function app settings).');
    console.error('  Option 2: Run with env: WORKDAY_ISU_USER=... WORKDAY_ISU_PASS=... node scripts/fetch-workday-customer-contracts.js');
    process.exit(1);
  }

  const auth = Buffer.from(`${USER}:${PASS}`).toString('base64');
  console.log('Fetching:', URL.slice(0, 90) + '...');
  const res = await fetch(URL, {
    headers: { Accept: 'application/json', Authorization: `Basic ${auth}` },
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('HTTP', res.status, text.slice(0, 500));
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    console.error('Body (first 300 chars):', text.slice(0, 300));
    process.exit(1);
  }

  const records = data.Report_Entry || data.report_Entry || data.ReportEntry || [];
  console.log('\nTop-level keys:', Object.keys(data).join(', '));
  console.log('Report_Entry count:', records.length);

  if (records.length === 0) {
    console.log('\nNo records. Sample of raw response (first 500 chars):');
    console.log(JSON.stringify(data).slice(0, 500));
    return;
  }

  console.log('\nFirst record keys:', Object.keys(records[0]).join(', '));
  console.log('\nSample rows (first 3):');
  records.slice(0, 3).forEach((r, i) => {
    console.log('\n--- Row', i + 1, '---');
    console.log(JSON.stringify(r, null, 2));
  });

  // Fields we use in sync
  const first = records[0];
  console.log('\nFields used by sync (first row):');
  console.log('  Line_Amount:', first.Line_Amount ?? first.line_amount);
  console.log('  Line_From_Date:', first.Line_From_Date ?? first.line_from_date);
  console.log('  Currency:', first.Currency ?? first.currency);
  console.log('  Billable_Project:', (first.Billable_Project ?? first.billable_project ?? '').toString().slice(0, 80));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
