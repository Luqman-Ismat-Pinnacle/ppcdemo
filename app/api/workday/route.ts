/**
 * @fileoverview Workday Sync API Route
 *
 * Calls Supabase Edge Functions to sync data.
 * Supports: employees, projects (hierarchy), hours (chunked by date), ledger.
 * With stream: true and syncType: 'unified', returns a constant stream (NDJSON) for stability.
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

const WINDOW_DAYS = 30;
const DEFAULT_HOURS_DAYS_BACK = 90;

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
    const stream = body.stream === true;
    const hoursDaysBack = Math.min(365, Math.max(30, Number(body.hoursDaysBack) || DEFAULT_HOURS_DAYS_BACK));

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

    // Unified Sync Logic: sequential or stream (constant stream = more stable, no big pull)
    if (syncType === 'unified') {
      if (stream) {
        return unifiedSyncStream(supabaseUrl, supabaseServiceKey, hoursDaysBack);
      }
      console.log('[Workday Sync] Starting Unified Sync sequence...');
      const results: any[] = [];
      const logs: string[] = [];
      let success = true;

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

      logs.push('--- Step 2: Syncing Hierarchy & Projects ---');
      const projRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-projects', {});
      results.push({ step: 'hierarchy', result: projRes });
      logs.push(...(projRes.errors || []));
      if (!projRes.success) {
        success = false;
        logs.push(`Error in hierarchy sync: ${projRes.error}`);
      } else {
        logs.push(`Synced: ${projRes.summary?.portfolios || 0} Portfolios, ${projRes.summary?.customers || 0} Customers, ${projRes.summary?.sites || 0} Sites, ${projRes.summary?.projects || 0} Projects.`);
      }

      logs.push('--- Step 3: Syncing Hours & Cost Actuals ---');
      const hoursRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-hours', {});
      results.push({ step: 'hours', result: hoursRes });
      logs.push(...(hoursRes.logs || []));
      if (!hoursRes.success) {
        success = false;
        logs.push(`Error in hours sync: ${hoursRes.error}`);
      } else {
        const fetched = hoursRes.stats?.fetched ?? 0;
        if (fetched === 0) {
          logs.push('No labor transactions in the selected date range. No new hour data to sync.');
        } else {
          logs.push(`Synced ${hoursRes.stats?.hours || 0} hour entries with costs.`);
        }
      }

      logs.push('--- Step 4: Skipping Ledger Sync (Memory Limit Issues) ---');
      logs.push('Ledger sync disabled due to worker memory limits.');
      logs.push('Hours sync includes cost data for WBS Gantt integration.');
      logs.push('Use individual ledger functions if needed: workday-ledger-stream or workday-ledger-chunked');

      const hoursFetched = results.find((r: any) => r.step === 'hours')?.result?.stats?.fetched ?? -1;
      return NextResponse.json({
        success,
        syncType: 'unified',
        summary: { totalSteps: 3, results, noNewHours: hoursFetched === 0 },
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

    // Hours-only with stream: chunk by date and stream progress (same mapping, constant stream)
    if (syncType === 'hours' && stream) {
      return hoursOnlyStream(supabaseUrl, supabaseServiceKey, hoursDaysBack);
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

/** Push one NDJSON line to the stream (constant stream = stable, not one big pull). */
function pushLine(controller: ReadableStreamDefaultController<Uint8Array>, obj: object) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'));
}

/**
 * Unified sync as a constant stream: employees -> projects -> hours (chunked by date).
 * Returns NDJSON stream: one JSON object per line. Mapping stays the same; only fetching is chunked.
 */
function unifiedSyncStream(
  supabaseUrl: string,
  supabaseServiceKey: string,
  hoursDaysBack: number
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const logs: string[] = [];
      let success = true;

      try {
        // 1. Employees
        pushLine(controller, { type: 'step', step: 'employees', status: 'started' });
        const empRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-employees', {});
        pushLine(controller, { type: 'step', step: 'employees', status: 'done', result: empRes });
        if (!empRes.success) {
          success = false;
          logs.push(`Error in employees sync: ${empRes.error}`);
        } else {
          logs.push(`Synced ${empRes.summary?.synced ?? 0} employees.`);
        }

        // 2. Projects (hierarchy)
        pushLine(controller, { type: 'step', step: 'projects', status: 'started' });
        const projRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-projects', {});
        pushLine(controller, { type: 'step', step: 'projects', status: 'done', result: projRes });
        if (!projRes.success) {
          success = false;
          logs.push(`Error in hierarchy sync: ${projRes.error}`);
        } else {
          logs.push(`Synced: ${projRes.summary?.portfolios ?? 0} Portfolios, ${projRes.summary?.customers ?? 0} Customers, ${projRes.summary?.sites ?? 0} Sites, ${projRes.summary?.projects ?? 0} Projects.`);
        }

        // 3. Hours in date windows (constant stream: one window at a time, no big pull)
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - hoursDaysBack);
        const totalChunks = Math.ceil(hoursDaysBack / WINDOW_DAYS);
        let totalHours = 0;

        pushLine(controller, { type: 'step', step: 'hours', status: 'started', totalChunks });
        for (let i = 0; i < totalChunks; i++) {
          const chunkStart = new Date(start);
          chunkStart.setDate(start.getDate() + i * WINDOW_DAYS);
          const chunkEnd = new Date(chunkStart);
          chunkEnd.setDate(chunkEnd.getDate() + WINDOW_DAYS - 1);
          if (chunkEnd > end) chunkEnd.setTime(end.getTime());
          const startStr = chunkStart.toISOString().split('T')[0];
          const endStr = chunkEnd.toISOString().split('T')[0];

          pushLine(controller, { type: 'step', step: 'hours', status: 'chunk', chunk: i + 1, totalChunks, startDate: startStr, endDate: endStr });
          const hoursRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-hours', { startDate: startStr, endDate: endStr });
          totalHours += hoursRes.stats?.hours ?? 0;
          pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: hoursRes.stats });
          if (!hoursRes.success) success = false;
        }
        pushLine(controller, { type: 'step', step: 'hours', status: 'done', totalHours });
        logs.push(`Synced ${totalHours} hour entries (${totalChunks} date windows).`);

        logs.push('Ledger sync skipped (use individual workday-ledger-chunked if needed).');
      } catch (err: any) {
        success = false;
        logs.push(err?.message ?? String(err));
        pushLine(controller, { type: 'error', error: err?.message ?? String(err) });
      }

      pushLine(controller, { type: 'done', success, logs });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** Hours-only sync as NDJSON stream (chunked by date window; mapping unchanged). */
function hoursOnlyStream(
  supabaseUrl: string,
  supabaseServiceKey: string,
  hoursDaysBack: number
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - hoursDaysBack);
      const totalChunks = Math.ceil(hoursDaysBack / WINDOW_DAYS);
      let totalHours = 0;
      let success = true;
      try {
        pushLine(controller, { type: 'step', step: 'hours', status: 'started', totalChunks });
        for (let i = 0; i < totalChunks; i++) {
          const chunkStart = new Date(start);
          chunkStart.setDate(start.getDate() + i * WINDOW_DAYS);
          const chunkEnd = new Date(chunkStart);
          chunkEnd.setDate(chunkEnd.getDate() + WINDOW_DAYS - 1);
          if (chunkEnd > end) chunkEnd.setTime(end.getTime());
          const startStr = chunkStart.toISOString().split('T')[0];
          const endStr = chunkEnd.toISOString().split('T')[0];
          pushLine(controller, { type: 'step', step: 'hours', status: 'chunk', chunk: i + 1, totalChunks, startDate: startStr, endDate: endStr });
          const hoursRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-hours', { startDate: startStr, endDate: endStr });
          totalHours += hoursRes.stats?.hours ?? 0;
          pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: hoursRes.stats });
          if (!hoursRes.success) success = false;
        }
        pushLine(controller, { type: 'step', step: 'hours', status: 'done', totalHours });
      } catch (err: any) {
        success = false;
        pushLine(controller, { type: 'error', error: err?.message ?? String(err) });
      }
      pushLine(controller, { type: 'done', success, totalHours });
      controller.close();
    }
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function GET() {
  return NextResponse.json({
    available: true,
    syncTypes: Object.keys(EDGE_FUNCTIONS),
    message: 'POST { syncType, records } to sync data. Use { syncType: "unified", stream: true } for constant NDJSON stream (more stable). Optional hoursDaysBack (default 90).',
  });
}
