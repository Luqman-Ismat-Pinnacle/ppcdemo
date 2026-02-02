/**
 * @fileoverview Workday Sync API Route
 *
 * Calls Supabase Edge Functions to sync data.
 * Supports: employees, projects (hierarchy), hours (chunked by date).
 * General ledger sync removed. With stream: true and syncType: 'unified', returns NDJSON stream.
 */

import { NextRequest, NextResponse } from 'next/server';

const EDGE_FUNCTIONS = {
  'employees': 'workday-employees',
  'projects': 'workday-projects',
  'hours': 'workday-hours',
  'sync': 'workday-sync'
} as const;

type SyncType = keyof typeof EDGE_FUNCTIONS;

const WINDOW_DAYS = 30;
const DEFAULT_HOURS_DAYS_BACK = 365;
const MAX_HOURS_DAYS_BACK = 730;

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
    const hoursDaysBack = Math.min(MAX_HOURS_DAYS_BACK, Math.max(30, Number(body.hoursDaysBack) || DEFAULT_HOURS_DAYS_BACK));

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

    // Unified Sync Logic: always use stream (constant stream = more stable, no big pull)
    if (syncType === 'unified') {
      return unifiedSyncStream(supabaseUrl, supabaseServiceKey, hoursDaysBack);
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

    // Hours-only: always use stream (chunk by date and stream progress)
    if (syncType === 'hours') {
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
      let empOk = false;
      let projOk = false;
      let hoursChunksOk = 0;
      let hoursChunksFail = 0;

      try {
        // 1. Employees
        pushLine(controller, { type: 'step', step: 'employees', status: 'started' });
        const empRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-employees', {});
        pushLine(controller, { type: 'step', step: 'employees', status: 'done', result: empRes });
        if (!empRes.success) {
          logs.push(`Error in employees sync: ${empRes.error}`);
        } else {
          empOk = true;
          logs.push(`Synced ${empRes.summary?.synced ?? 0} employees.`);
        }

        // 2. Projects (hierarchy)
        pushLine(controller, { type: 'step', step: 'projects', status: 'started' });
        const projRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-projects', {});
        pushLine(controller, { type: 'step', step: 'projects', status: 'done', result: projRes });
        if (!projRes.success) {
          logs.push(`Error in hierarchy sync: ${projRes.error}`);
        } else {
          projOk = true;
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
          try {
            const hoursRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-hours', { startDate: startStr, endDate: endStr });
            totalHours += hoursRes.stats?.hours ?? 0;
            pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: hoursRes.stats });
            if (hoursRes.success) {
              hoursChunksOk++;
            } else {
              hoursChunksFail++;
              logs.push(`Hour window ${startStr}–${endStr} failed: ${hoursRes.error || 'unknown'}`);
            }
          } catch (chunkErr: any) {
            hoursChunksFail++;
            const msg = chunkErr?.message ?? String(chunkErr);
            logs.push(`Hour window ${startStr}–${endStr} error: ${msg}`);
            pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: null });
          }
        }
        pushLine(controller, { type: 'step', step: 'hours', status: 'done', totalHours });
        logs.push(`Synced ${totalHours} hour entries (${hoursChunksOk}/${totalChunks} windows succeeded).`);
        if (hoursChunksFail > 0) {
          logs.push(`Note: ${hoursChunksFail} of ${totalChunks} hour windows had issues. Data from successful windows was saved.`);
        }
      } catch (err: any) {
        logs.push(err?.message ?? String(err));
        pushLine(controller, { type: 'error', error: err?.message ?? String(err) });
      }

      // Consider sync successful if employees + projects + at least one hours chunk succeeded (partial success = success so UI doesn't show red when Supabase wrote data)
      const success = empOk && projOk && hoursChunksOk > 0;
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
    message: 'POST { syncType } to sync data. All syncs use streaming NDJSON. Optional hoursDaysBack (default 365, max 730). General ledger removed.',
  });
}
