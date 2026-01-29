/**
 * @fileoverview Workday Sync API Route
 * 
 * Calls Supabase Edge Functions to sync data.
 * Supports: employees, projects (hierarchy only: portfolios, customers, sites)
 */

import { NextRequest, NextResponse } from 'next/server';

const EDGE_FUNCTIONS = {
  'employees': 'workday-employees',
  'projects': 'workday-projects',
  'hours': 'workday-hours',
  'ledger': 'workday-ledger-chunked',
  'sync': 'workday-sync'
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
    const action = body.action;
    const records = body.records || [];

    // Handle get-available-projects action - fetch directly from database
    if (action === 'get-available-projects') {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // Fetch all projects from the projects table (Workday projects)
        const { data: projects, error: projectsError } = await supabase
          .from('projects')
          .select('id, name, project_id, customer_id, site_id, has_schedule')
          .order('name');
        
        if (projectsError) {
          console.error('Error fetching projects:', projectsError);
          return NextResponse.json({
            success: false,
            error: projectsError.message,
            workday_projects: []
          });
        }
        
        // Map projects to dropdown options
        const projectOptions = (projects || []).map((project: any) => ({
          id: project.id,
          name: project.name || project.id,
          secondary: project.project_id || 'Workday Project',
          type: 'project'
        }));
        
        return NextResponse.json({
          success: true,
          workday_projects: projectOptions,
          summary: { projects: projectOptions.length }
        });
      } catch (error: any) {
        console.error('Error in get-available-projects:', error);
        return NextResponse.json(
          { success: false, error: error.message, workday_projects: [] },
          { status: 500 }
        );
      }
    }

    // Unified Sync Logic: Call all Workday Edge Functions sequentially
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

      // 3. Hours and Costs (includes actual cost data)
      logs.push('--- Step 3: Syncing Hours & Cost Actuals ---');
      const hoursRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-hours', {});
      results.push({ step: 'hours', result: hoursRes });
      logs.push(...(hoursRes.logs || []));
      if (!hoursRes.success) {
        success = false;
        logs.push(`Error in hours sync: ${hoursRes.error}`);
      } else {
        logs.push(`Synced ${hoursRes.stats?.hours || 0} hour entries with costs.`);
      }

      // 4. Ledger Cost Actuals (DISABLED - Memory Limit Issues)
      logs.push('--- Step 4: Skipping Ledger Sync (Memory Limit Issues) ---');
      logs.push('Ledger sync disabled due to worker memory limits.');
      logs.push('Hours sync includes cost data for WBS Gantt integration.');
      logs.push('Use individual ledger functions if needed: workday-ledger-stream or workday-ledger-chunked');
      
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
