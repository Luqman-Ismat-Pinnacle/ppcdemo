/**
 * @fileoverview Workday Sync API Route
 * 
 * Calls Supabase Edge Functions to sync data.
 * Supports: employees, projects, phases, tasks
 */

import { NextRequest, NextResponse } from 'next/server';

const EDGE_FUNCTIONS = {
  'employees': 'workday-employees',
  'projects': 'workday-projects',
  'phases': 'workday-phases',
  'tasks': 'workday-tasks',
  'hours': 'workday-hours',
} as const;

type SyncType = keyof typeof EDGE_FUNCTIONS;

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const syncType = body.syncType as SyncType | 'unified';
    const records = body.records || [];

    // Unified Sync Logic: Call 3 Edge Functions sequentially
    if (syncType === 'unified') {
      console.log('[Workday Sync] Starting Unified Sync sequence...');
      const results: any[] = [];
      const logs: string[] = [];
      let success = true;

      // 1. Employees (creates Portfolios)
      logs.push('--- Step 1: Syncing Employees & Portfolios ---');
      const empRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-employees', {});
      results.push({ step: 'employees', result: empRes });
      logs.push(...(empRes.logs || []));
      if (!empRes.success) {
        success = false;
        logs.push(`Error in employees sync: ${empRes.error}`);
      } else {
        logs.push(`Synced ${empRes.summary?.synced || 0} employees.`);
      }

      // 2. Projects (creates Customers, Sites, updates Portfolios)
      // NOTE: Projects/hierarchy only. No Tasks/Phases.
      logs.push('--- Step 2: Syncing Hierarchy (Portfolios, Customers, Sites) ---');
      const projRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-projects', {});
      results.push({ step: 'hierarchy', result: projRes });
      logs.push(...(projRes.errors || []));
      if (!projRes.success) {
        success = false;
        logs.push(`Error in hierarchy sync: ${projRes.error}`);
      } else {
        logs.push(`Synced Hierarchy: ${projRes.summary?.portfolios || 0} Portfolios, ${projRes.summary?.customers || 0} Customers, ${projRes.summary?.sites || 0} Sites.`);
      }

      // 3. Hours (creates Tasks too)
      logs.push('--- Step 3: Syncing Hours & Tasks (Last 30 Days) ---');
      logs.push('Refreshing memory/cooldown for 5 seconds...');

      // Cooldown to prevent memory spikes on Edge
      await new Promise(resolve => setTimeout(resolve, 5000));

      const hrsRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-hours', {});
      results.push({ step: 'hours', result: hrsRes });
      logs.push(...(hrsRes.errors || []));
      if (!hrsRes.success) {
        success = false;
        logs.push(`Error in hours sync: ${hrsRes.error}`);
      } else {
        logs.push(`Synced ${hrsRes.stats?.hours || 0} hours, ${hrsRes.stats?.tasks || 0} tasks created.`);
      }

      return NextResponse.json({
        success,
        syncType: 'unified',
        summary: { totalSteps: 3, results },
        logs
      });
    }

    if (!syncType || !EDGE_FUNCTIONS[syncType as keyof typeof EDGE_FUNCTIONS]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid sync type. Must be one of: ${Object.keys(EDGE_FUNCTIONS).join(', ')} or 'unified'`
        },
        { status: 400 }
      );
    }

    const edgeFunctionName = EDGE_FUNCTIONS[syncType as keyof typeof EDGE_FUNCTIONS];
    const result = await callEdgeFunction(supabaseUrl, supabaseServiceKey, edgeFunctionName, body);

    return NextResponse.json({
      success: result.success,
      syncType,
      summary: result.summary,
      logs: result.logs || [],
      error: result.error
    });

  } catch (error: any) {
    console.error('Workday sync error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

// Helper to call Edge Function
async function callEdgeFunction(url: string, key: string, functionName: string, body: any) {
  const edgeFunctionUrl = `${url}/functions/v1/${functionName}`;
  console.log(`[Workday Sync] Calling ${functionName}`);

  const edgeResponse = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'apikey': key,
    },
    body: JSON.stringify(body),
  });

  if (!edgeResponse.ok) {
    const errorText = await edgeResponse.text();
    console.error(`Edge Function ${functionName} error:`, edgeResponse.status, errorText);
    return { success: false, error: `Error ${edgeResponse.status}: ${errorText.substring(0, 200)}` };
  }

  return await edgeResponse.json();
}



export async function GET() {
  return NextResponse.json({
    available: true,
    syncTypes: Object.keys(EDGE_FUNCTIONS),
    message: 'POST { syncType, records } to sync data',
  });
}
