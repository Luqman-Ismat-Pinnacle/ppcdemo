import { NextRequest, NextResponse } from 'next/server';
import { execute, query, refreshRollups } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type ConnectionAction =
  | 'seed_defaults'
  | 'test_connection'
  | 'test_all'
  | 'sync_workday'
  | 'refresh_db_rollups';

type ActionResult = {
  connectionKey: string;
  ok: boolean;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  message: string;
};

const DEFAULT_CONNECTIONS = [
  {
    key: 'azure_postgres',
    name: 'Azure PostgreSQL',
    description: 'Primary application database connection.',
    type: 'database',
    ownerEmail: 'luqman.ismat@pinnaclereliability.com',
  },
  {
    key: 'workday_sync',
    name: 'Workday Sync',
    description: 'Workday import and sync pipeline for people/projects/hours/contracts.',
    type: 'integration',
    ownerEmail: 'luqman.ismat@pinnaclereliability.com',
  },
  {
    key: 'azure_devops',
    name: 'Azure DevOps',
    description: 'Repository and pipeline integration.',
    type: 'integration',
    ownerEmail: 'luqman.ismat@pinnaclereliability.com',
  },
  {
    key: 'auth0',
    name: 'Auth0',
    description: 'Authentication and identity provider.',
    type: 'auth',
    ownerEmail: 'luqman.ismat@pinnaclereliability.com',
  },
  {
    key: 'azure_blob_docs',
    name: 'Azure Blob Storage',
    description: 'Project document storage container.',
    type: 'storage',
    ownerEmail: 'luqman.ismat@pinnaclereliability.com',
  },
];

async function seedDefaults() {
  for (const conn of DEFAULT_CONNECTIONS) {
    await execute(
      `INSERT INTO integration_connections
       (connection_key, display_name, description, connection_type, status, owner_email, is_active)
       VALUES ($1, $2, $3, $4, 'unknown', $5, true)
       ON CONFLICT (connection_key) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         description = EXCLUDED.description,
         connection_type = EXCLUDED.connection_type,
         owner_email = EXCLUDED.owner_email,
         is_active = true,
         updated_at = NOW()`,
      [conn.key, conn.name, conn.description, conn.type, conn.ownerEmail],
    );
  }
}

async function updateConnectionHealth(result: ActionResult) {
  const isHealthy = result.status === 'healthy';
  await execute(
    `UPDATE integration_connections
     SET status = $2,
         last_error = CASE WHEN $3 THEN NULL ELSE $4 END,
         last_sync_at = NOW(),
         last_success_at = CASE WHEN $3 THEN NOW() ELSE last_success_at END,
         updated_at = NOW()
     WHERE connection_key = $1`,
    [result.connectionKey, result.status, isHealthy, result.message],
  );
}

async function testAzurePostgres(): Promise<ActionResult> {
  try {
    await query('SELECT 1 AS ok');
    return { connectionKey: 'azure_postgres', ok: true, status: 'healthy', message: 'Database query succeeded.' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Database query failed';
    return { connectionKey: 'azure_postgres', ok: false, status: 'down', message };
  }
}

async function testWorkday(): Promise<ActionResult> {
  try {
    const user = process.env.WORKDAY_ISU_USER;
    const pass = process.env.WORKDAY_ISU_PASS;
    if (!user || !pass) {
      return {
        connectionKey: 'workday_sync',
        ok: false,
        status: 'degraded',
        message: 'Missing WORKDAY_ISU_USER/WORKDAY_ISU_PASS.',
      };
    }

    const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    const url = 'https://services1.myworkday.com/ccx/service/customreport2/pinnacle/ISU_PowerBI_HCM/RPT_-_Employees?Include_Terminated_Workers=1&format=json';
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: auth },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return {
        connectionKey: 'workday_sync',
        ok: false,
        status: res.status >= 500 ? 'down' : 'degraded',
        message: `Workday request failed (${res.status}).`,
      };
    }
    return { connectionKey: 'workday_sync', ok: true, status: 'healthy', message: 'Workday endpoint reachable.' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Workday test failed';
    return { connectionKey: 'workday_sync', ok: false, status: 'down', message };
  }
}

async function testAzureDevOps(): Promise<ActionResult> {
  try {
    const org = process.env.AZURE_DEVOPS_ORGANIZATION;
    const project = process.env.AZURE_DEVOPS_PROJECT;
    const pat = process.env.AZURE_DEVOPS_PAT;
    if (!org || !project || !pat) {
      return {
        connectionKey: 'azure_devops',
        ok: false,
        status: 'degraded',
        message: 'Missing AZURE_DEVOPS_ORGANIZATION/AZURE_DEVOPS_PROJECT/AZURE_DEVOPS_PAT.',
      };
    }

    const auth = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
    const url = `https://dev.azure.com/${org}/_apis/projects/${project}?api-version=7.0`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: auth },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return {
        connectionKey: 'azure_devops',
        ok: false,
        status: res.status >= 500 ? 'down' : 'degraded',
        message: `Azure DevOps check failed (${res.status}).`,
      };
    }
    return { connectionKey: 'azure_devops', ok: true, status: 'healthy', message: 'Azure DevOps API reachable.' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Azure DevOps test failed';
    return { connectionKey: 'azure_devops', ok: false, status: 'down', message };
  }
}

async function testAuth0(): Promise<ActionResult> {
  try {
    const issuer = process.env.AUTH0_ISSUER_BASE_URL;
    const clientId = process.env.AUTH0_CLIENT_ID;
    const clientSecret = process.env.AUTH0_CLIENT_SECRET;
    const secret = process.env.AUTH0_SECRET;
    if (!issuer || !clientId || !clientSecret || !secret) {
      return {
        connectionKey: 'auth0',
        ok: false,
        status: 'degraded',
        message: 'Missing one or more Auth0 env vars.',
      };
    }
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return {
        connectionKey: 'auth0',
        ok: false,
        status: res.status >= 500 ? 'down' : 'degraded',
        message: `Auth0 discovery check failed (${res.status}).`,
      };
    }
    return { connectionKey: 'auth0', ok: true, status: 'healthy', message: 'Auth0 discovery endpoint reachable.' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Auth0 test failed';
    return { connectionKey: 'auth0', ok: false, status: 'down', message };
  }
}

async function testAzureBlobDocs(): Promise<ActionResult> {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONN_STRING;
  if (!connStr) {
    return {
      connectionKey: 'azure_blob_docs',
      ok: false,
      status: 'degraded',
      message: 'Missing AZURE_STORAGE_CONNECTION_STRING.',
    };
  }
  return { connectionKey: 'azure_blob_docs', ok: true, status: 'healthy', message: 'Storage connection string configured.' };
}

async function testByKey(connectionKey: string): Promise<ActionResult> {
  switch (connectionKey) {
    case 'azure_postgres':
      return testAzurePostgres();
    case 'workday_sync':
      return testWorkday();
    case 'azure_devops':
      return testAzureDevOps();
    case 'auth0':
      return testAuth0();
    case 'azure_blob_docs':
      return testAzureBlobDocs();
    default:
      return {
        connectionKey,
        ok: false,
        status: 'unknown',
        message: `No test implemented for '${connectionKey}'.`,
      };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '') as ConnectionAction;
    const connectionKey = String(body?.connectionKey || '').trim();

    if (!action) {
      return NextResponse.json({ success: false, error: 'action is required' }, { status: 400 });
    }

    if (action === 'seed_defaults') {
      await seedDefaults();
      return NextResponse.json({ success: true, message: 'Default connections seeded.' });
    }

    if (action === 'refresh_db_rollups') {
      try {
        await refreshRollups();
      } catch {
        await execute('SELECT refresh_rollups()');
      }
      const result: ActionResult = {
        connectionKey: 'azure_postgres',
        ok: true,
        status: 'healthy',
        message: 'Database rollups refreshed.',
      };
      await updateConnectionHealth(result);
      return NextResponse.json({ success: true, result });
    }

    if (action === 'sync_workday') {
      const syncResponse = await fetch(`${request.nextUrl.origin}/api/sync/workday`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack: 30 }),
      });
      const payload = await syncResponse.json().catch(() => ({}));
      const ok = syncResponse.ok && Boolean(payload?.success);
      const result: ActionResult = {
        connectionKey: 'workday_sync',
        ok,
        status: ok ? 'healthy' : 'down',
        message: ok ? 'Workday sync completed.' : String(payload?.error || 'Workday sync failed.'),
      };
      await updateConnectionHealth(result);
      return NextResponse.json({ success: ok, result, payload }, { status: ok ? 200 : 500 });
    }

    if (action === 'test_connection') {
      if (!connectionKey) {
        return NextResponse.json({ success: false, error: 'connectionKey is required' }, { status: 400 });
      }
      const result = await testByKey(connectionKey);
      await updateConnectionHealth(result);
      return NextResponse.json({ success: result.ok, result }, { status: result.ok ? 200 : 500 });
    }

    if (action === 'test_all') {
      const keys = DEFAULT_CONNECTIONS.map((c) => c.key);
      const results: ActionResult[] = [];
      for (const key of keys) {
        const result = await testByKey(key);
        results.push(result);
        await updateConnectionHealth(result);
      }
      const success = results.every((r) => r.ok);
      return NextResponse.json({ success, results }, { status: success ? 200 : 500 });
    }

    return NextResponse.json({ success: false, error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to execute action';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
