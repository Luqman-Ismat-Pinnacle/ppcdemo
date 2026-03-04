#!/usr/bin/env node
/**
 * Push env vars from .env.local to Azure Container App ppc-minimal.
 * Run from repo root. Requires: az CLI logged in, .env.local with Azure + Auth vars.
 *
 * Usage: node scripts/deploy-ppc-minimal-from-env.mjs
 *   (reads .env.local, updates container app env)
 *
 * Does NOT build/push image — use pipeline or: az acr build -t ppc-minimal:latest -r <acr> -f ppc-minimal/Dockerfile ppc-minimal
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const envPath = resolve(rootDir, '.env.local');

if (!existsSync(envPath)) {
  console.error('.env.local not found at', envPath);
  process.exit(1);
}

const content = readFileSync(envPath, 'utf8');
const env = {};
for (const line of content.split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const dbUrl = env.DATABASE_URL || env.POSTGRES_CONNECTION_STRING;
if (!dbUrl) {
  console.error('Missing DATABASE_URL or POSTGRES_CONNECTION_STRING in .env.local');
  process.exit(1);
}

const appName = process.env.PPC_MINIMAL_APP_NAME || 'ppc-minimal';
const resourceGroup = process.env.PPC_MINIMAL_RESOURCE_GROUP || 'rg-syncrud-pdf-inspection';

const pairs = [
  ['NODE_ENV', 'production'],
  ['DATABASE_URL', env.DATABASE_URL || env.POSTGRES_CONNECTION_STRING || ''],
  ['AUTH0_SECRET', env.AUTH0_SECRET || ''],
  ['AUTH0_BASE_URL', env.AUTH0_BASE_URL || ''],
  ['AUTH0_ISSUER_BASE_URL', env.AUTH0_ISSUER_BASE_URL || ''],
  ['AUTH0_CLIENT_ID', env.AUTH0_CLIENT_ID || ''],
  ['AUTH0_CLIENT_SECRET', env.AUTH0_CLIENT_SECRET || ''],
  ['AZURE_STORAGE_CONNECTION_STRING', env.AZURE_STORAGE_CONNECTION_STRING || ''],
  ['AZURE_STORAGE_CONTAINER_NAME', env.AZURE_STORAGE_CONTAINER_NAME || 'project-plans'],
  ['WORKDAY_ISU_USER', env.WORKDAY_ISU_USER || ''],
  ['WORKDAY_ISU_PASS', env.WORKDAY_ISU_PASS || ''],
  ['MPP_PARSER_URL', env.MPP_PARSER_URL || env.NEXT_PUBLIC_MPP_PARSER_URL || ''],
  ['NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL || ''],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''],
].filter(([, v]) => v);

const envArgs = pairs.map(([k, v]) => `${k}=${v}`);
console.log('Updating container app env...');
execSync(
  ['az', 'containerapp', 'update', '-n', appName, '-g', resourceGroup, '--set-env-vars', ...envArgs],
  { stdio: 'inherit' }
);
console.log('Done.');
