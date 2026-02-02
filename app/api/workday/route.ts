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

// Helper to call Edge Function with retry logic
async function callEdgeFunction(
  url: string,
  key: string,
  functionName: string,
  body: any,
  options?: { retries?: number; timeoutMs?: number }
): Promise<{ success: boolean; error?: string; summary?: any; stats?: any; logs?: string[] }> {
  const { retries = 2, timeoutMs = 120000 } = options || {};
  const edgeFunctionUrl = `${url}/functions/v1/${functionName}`;
  
  let lastError = '';
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`[Workday Sync] Calling ${functionName}${attempt > 0 ? ` (retry ${attempt})` : ''}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      const edgeResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'apikey': key,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!edgeResponse.ok) {
        const errorText = await edgeResponse.text().catch(() => 'Failed to read error response');
        lastError = `HTTP ${edgeResponse.status}: ${errorText.substring(0, 300)}`;
        console.error(`[Workday Sync] ${functionName} error (attempt ${attempt + 1}):`, lastError);
        
        // Don't retry on 4xx errors (client errors)
        if (edgeResponse.status >= 400 && edgeResponse.status < 500) {
          return { success: false, error: lastError };
        }
        
        // Retry on 5xx errors
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }
        return { success: false, error: lastError };
      }

      const responseText = await edgeResponse.text();
      
      // Handle empty responses
      if (!responseText || responseText.trim() === '') {
        console.warn(`[Workday Sync] ${functionName} returned empty response`);
        return { success: true, summary: { synced: 0 }, stats: { hours: 0 }, logs: ['Empty response from server'] };
      }
      
      try {
        const data = JSON.parse(responseText);
        console.log(`[Workday Sync] ${functionName} succeeded:`, data.summary || data.stats || 'no summary');
        return data;
      } catch (parseError) {
        console.error(`[Workday Sync] ${functionName} JSON parse error:`, parseError, 'Response:', responseText.substring(0, 200));
        return { success: false, error: `Invalid JSON response: ${responseText.substring(0, 100)}` };
      }
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError') {
        lastError = `Request timed out after ${timeoutMs / 1000}s`;
      } else {
        lastError = fetchError.message || 'Network error';
      }
      console.error(`[Workday Sync] ${functionName} fetch error (attempt ${attempt + 1}):`, lastError);
      
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  
  return { success: false, error: lastError || 'Unknown error after retries' };
}

/** Push one NDJSON line to the stream (constant stream = stable, not one big pull). */
function pushLine(controller: ReadableStreamDefaultController<Uint8Array>, obj: object) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'));
}

/**
 * Unified sync as a constant stream: employees -> projects -> hours (chunked by date).
 * Returns NDJSON stream: one JSON object per line. Mapping stays the same; only fetching is chunked.
 * 
 * Improved error handling:
 * - Each step has its own try/catch so failures don't stop subsequent steps
 * - Hours chunks continue even if some fail
 * - Detailed logging for each step with error context
 * - Retry logic for transient failures
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
      let totalHours = 0;
      const failedChunks: string[] = [];

      const logAndPush = (msg: string) => {
        logs.push(msg);
        console.log(`[Workday Sync] ${msg}`);
      };

      // 1. Employees - try/catch to not stop sync if this fails
      try {
        pushLine(controller, { type: 'step', step: 'employees', status: 'started' });
        logAndPush('Starting employees sync...');
        
        const empRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-employees', {}, { retries: 2, timeoutMs: 60000 });
        pushLine(controller, { type: 'step', step: 'employees', status: 'done', result: empRes });
        
        if (!empRes.success) {
          logAndPush(`Employees sync failed: ${empRes.error || 'Unknown error'}`);
          pushLine(controller, { type: 'error', error: `Employees: ${empRes.error}` });
        } else {
          empOk = true;
          const count = empRes.summary?.synced ?? empRes.summary?.total ?? 0;
          logAndPush(`Synced ${count} employees successfully.`);
        }
      } catch (empError: any) {
        const msg = empError?.message ?? String(empError);
        logAndPush(`Employees sync exception: ${msg}`);
        pushLine(controller, { type: 'error', error: `Employees exception: ${msg}` });
      }

      // 2. Projects (hierarchy) - try/catch to not stop sync if this fails
      try {
        pushLine(controller, { type: 'step', step: 'projects', status: 'started' });
        logAndPush('Starting hierarchy sync (portfolios, customers, sites, projects)...');
        
        const projRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-projects', {}, { retries: 2, timeoutMs: 90000 });
        pushLine(controller, { type: 'step', step: 'projects', status: 'done', result: projRes });
        
        if (!projRes.success) {
          logAndPush(`Hierarchy sync failed: ${projRes.error || 'Unknown error'}`);
          pushLine(controller, { type: 'error', error: `Hierarchy: ${projRes.error}` });
        } else {
          projOk = true;
          logAndPush(`Synced hierarchy: ${projRes.summary?.portfolios ?? 0} portfolios, ${projRes.summary?.customers ?? 0} customers, ${projRes.summary?.sites ?? 0} sites, ${projRes.summary?.projects ?? 0} projects.`);
        }
      } catch (projError: any) {
        const msg = projError?.message ?? String(projError);
        logAndPush(`Hierarchy sync exception: ${msg}`);
        pushLine(controller, { type: 'error', error: `Hierarchy exception: ${msg}` });
      }

      // 3. Hours in date windows - each chunk is independent, failures don't stop others
      // Sync BACKWARDS from current date (most recent first) so users get latest data immediately
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - hoursDaysBack);
      const totalChunks = Math.ceil(hoursDaysBack / WINDOW_DAYS);

      logAndPush(`Starting hours sync (newest to oldest): ${totalChunks} chunks over ${hoursDaysBack} days (${end.toISOString().split('T')[0]} back to ${start.toISOString().split('T')[0]})`);
      pushLine(controller, { type: 'step', step: 'hours', status: 'started', totalChunks });
      
      for (let i = 0; i < totalChunks; i++) {
        // Work backwards: chunk 0 = most recent, chunk N = oldest
        const chunkEnd = new Date(end);
        chunkEnd.setDate(end.getDate() - i * WINDOW_DAYS);
        const chunkStart = new Date(chunkEnd);
        chunkStart.setDate(chunkStart.getDate() - WINDOW_DAYS + 1);
        if (chunkStart < start) chunkStart.setTime(start.getTime());
        const startStr = chunkStart.toISOString().split('T')[0];
        const endStr = chunkEnd.toISOString().split('T')[0];

        pushLine(controller, { type: 'step', step: 'hours', status: 'chunk', chunk: i + 1, totalChunks, startDate: startStr, endDate: endStr });
        
        try {
          const hoursRes = await callEdgeFunction(
            supabaseUrl, 
            supabaseServiceKey, 
            'workday-hours', 
            { startDate: startStr, endDate: endStr },
            { retries: 1, timeoutMs: 90000 } // Longer timeout for hours
          );
          
          const chunkHours = hoursRes.stats?.hours ?? hoursRes.summary?.synced ?? 0;
          totalHours += chunkHours;
          
          if (hoursRes.success) {
            hoursChunksOk++;
            pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: hoursRes.stats, success: true });
          } else {
            hoursChunksFail++;
            const errorMsg = hoursRes.error || 'Unknown error';
            failedChunks.push(`${startStr} to ${endStr}: ${errorMsg}`);
            logAndPush(`Hours chunk ${i + 1}/${totalChunks} (${startStr}–${endStr}) failed: ${errorMsg}`);
            pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: null, success: false, error: errorMsg });
            pushLine(controller, { type: 'error', error: `Hours ${startStr}–${endStr}: ${errorMsg}` });
          }
        } catch (chunkErr: any) {
          hoursChunksFail++;
          const msg = chunkErr?.message ?? String(chunkErr);
          failedChunks.push(`${startStr} to ${endStr}: ${msg}`);
          logAndPush(`Hours chunk ${i + 1}/${totalChunks} (${startStr}–${endStr}) exception: ${msg}`);
          pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: null, success: false, error: msg });
          pushLine(controller, { type: 'error', error: `Hours ${startStr}–${endStr}: ${msg}` });
        }
        
        // Small delay between chunks to not overwhelm the server
        if (i < totalChunks - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
      
      pushLine(controller, { type: 'step', step: 'hours', status: 'done', totalHours });
      logAndPush(`Hours sync complete: ${totalHours} entries from ${hoursChunksOk}/${totalChunks} successful chunks.`);
      
      if (hoursChunksFail > 0) {
        logAndPush(`${hoursChunksFail} hour window(s) had issues. Data from successful windows was saved.`);
        if (failedChunks.length > 0 && failedChunks.length <= 5) {
          logs.push(`Failed periods: ${failedChunks.join('; ')}`);
        } else if (failedChunks.length > 5) {
          logs.push(`Failed periods (showing first 5): ${failedChunks.slice(0, 5).join('; ')} (and ${failedChunks.length - 5} more)`);
        }
      }

      // 4. Match hours entries to tasks
      let tasksMatched = 0;
      let unitsMatched = 0;
      try {
        pushLine(controller, { type: 'step', step: 'matching', status: 'started' });
        logAndPush('Starting hours-to-tasks matching...');
        
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // Fetch unassigned hours - try with workday columns, fall back to phase_id
        let unassignedHours: any[] = [];
        try {
          const { data } = await supabase
            .from('hour_entries')
            .select('id, project_id, phase_id, workday_phase, workday_task')
            .is('task_id', null);
          unassignedHours = data || [];
        } catch (e) {
          // workday columns might not exist
          const { data } = await supabase
            .from('hour_entries')
            .select('id, project_id, phase_id')
            .is('task_id', null);
          unassignedHours = data || [];
          logAndPush('workday_phase/workday_task columns not available, using phase_id fallback');
        }
        
        if (unassignedHours && unassignedHours.length > 0) {
          // Fetch all tasks and units
          const { data: tasks } = await supabase.from('tasks').select('id, project_id, name');
          const { data: units } = await supabase.from('units').select('id, project_id, name');
          
          // Also fetch descriptions from hours for matching
          const { data: hoursWithDesc } = await supabase
            .from('hour_entries')
            .select('id, project_id, description')
            .is('task_id', null);
          
          // Group tasks by project_id
          const tasksByProject = new Map<string, any[]>();
          (tasks || []).forEach((task: any) => {
            if (!task.project_id || !task.name) return;
            const existing = tasksByProject.get(task.project_id) || [];
            existing.push(task);
            tasksByProject.set(task.project_id, existing);
          });
          
          // Group units by project_id
          const unitsByProject = new Map<string, any[]>();
          (units || []).forEach((unit: any) => {
            if (!unit.project_id || !unit.name) return;
            const existing = unitsByProject.get(unit.project_id) || [];
            existing.push(unit);
            unitsByProject.set(unit.project_id, existing);
          });
          
          // Normalize for matching
          const normalize = (s: string) => (s ?? '').toString().trim().toLowerCase();
          
          // Match hours: check if task name is contained in hour description
          const hoursToUpdate: { id: string; task_id: string }[] = [];
          
          for (const h of (hoursWithDesc || [])) {
            if (!h.project_id) continue;
            const description = normalize(h.description || '');
            if (!description) continue;
            
            // Get tasks for this project
            const projectTasks = tasksByProject.get(h.project_id) || [];
            
            // Check if any task name is contained in the description
            let matched = false;
            for (const task of projectTasks) {
              const taskName = normalize(task.name);
              if (taskName && description.includes(taskName)) {
                hoursToUpdate.push({ id: h.id, task_id: task.id });
                tasksMatched++;
                matched = true;
                break;
              }
            }
            
            if (matched) continue;
            
            // Fallback: check units
            const projectUnits = unitsByProject.get(h.project_id) || [];
            for (const unit of projectUnits) {
              const unitName = normalize(unit.name);
              if (unitName && description.includes(unitName)) {
                hoursToUpdate.push({ id: h.id, task_id: unit.id });
                unitsMatched++;
                break;
              }
            }
          }
          
          // Update in batches
          const BATCH_SIZE = 100;
          for (let i = 0; i < hoursToUpdate.length; i += BATCH_SIZE) {
            const batch = hoursToUpdate.slice(i, i + BATCH_SIZE);
            for (const update of batch) {
              await supabase.from('hour_entries').update({ task_id: update.task_id }).eq('id', update.id);
            }
          }
          
          const totalMatched = tasksMatched + unitsMatched;
          const stillUnmatched = (hoursWithDesc?.length || 0) - totalMatched;
          logAndPush(`Matching complete: ${tasksMatched} to tasks, ${unitsMatched} to units, ${stillUnmatched} unmatched (by checking if task name is in description)`);
          pushLine(controller, { type: 'step', step: 'matching', status: 'done', tasksMatched, unitsMatched, stillUnmatched });
        } else {
          logAndPush('No unassigned hours entries to match');
          pushLine(controller, { type: 'step', step: 'matching', status: 'done', tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0 });
        }
        
        // 5. Aggregate actual_cost and actual_hours from hours to tasks
        pushLine(controller, { type: 'step', step: 'aggregation', status: 'started' });
        logAndPush('Aggregating actual hours and cost to tasks...');
        
        // Get all hours with task_id and aggregate
        const { data: allMatchedHours } = await supabase
          .from('hour_entries')
          .select('task_id, hours, actual_cost, reported_standard_cost_amt')
          .not('task_id', 'is', null);
        
        if (allMatchedHours && allMatchedHours.length > 0) {
          const taskAggregates = new Map<string, { actualHours: number; actualCost: number }>();
          
          for (const h of allMatchedHours) {
            const existing = taskAggregates.get(h.task_id) || { actualHours: 0, actualCost: 0 };
            const hours = Number(h.hours) || 0;
            const cost = Number(h.actual_cost ?? h.reported_standard_cost_amt) || 0;
            taskAggregates.set(h.task_id, {
              actualHours: existing.actualHours + hours,
              actualCost: existing.actualCost + cost,
            });
          }
          
          // Update tasks with aggregated values
          let tasksUpdated = 0;
          for (const [taskId, agg] of taskAggregates) {
            const { error } = await supabase
              .from('tasks')
              .update({ actual_hours: agg.actualHours, actual_cost: agg.actualCost })
              .eq('id', taskId);
            if (!error) tasksUpdated++;
          }
          
          logAndPush(`Aggregation complete: updated ${tasksUpdated} tasks with actual hours/cost`);
          pushLine(controller, { type: 'step', step: 'aggregation', status: 'done', tasksUpdated });
        } else {
          logAndPush('No matched hours to aggregate');
          pushLine(controller, { type: 'step', step: 'aggregation', status: 'done', tasksUpdated: 0 });
        }
      } catch (matchErr: any) {
        const msg = matchErr?.message ?? String(matchErr);
        logAndPush(`Hours-to-tasks matching/aggregation failed: ${msg}`);
        pushLine(controller, { type: 'error', error: `Matching/Aggregation: ${msg}` });
      }

      // Build final summary
      const syncSummary = {
        employees: empOk ? 'success' : 'failed',
        hierarchy: projOk ? 'success' : 'failed', 
        hours: hoursChunksOk > 0 ? `${hoursChunksOk}/${totalChunks} succeeded` : 'all failed',
        totalHours,
        matching: { tasksMatched, unitsMatched },
      };
      logs.push(`Summary: Employees=${syncSummary.employees}, Hierarchy=${syncSummary.hierarchy}, Hours=${syncSummary.hours} (${totalHours} entries), Matched=${tasksMatched} tasks + ${unitsMatched} units`);

      // Consider sync successful if:
      // - employees + projects succeeded, OR
      // - at least one hours chunk succeeded (partial success = success so UI doesn't show red when Supabase wrote data)
      const success = (empOk && projOk) || hoursChunksOk > 0;
      pushLine(controller, { type: 'done', success, logs, summary: syncSummary, totalHours });
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

/** Hours-only sync as NDJSON stream (chunked by date window; mapping unchanged). 
 * Syncs BACKWARDS from current date (most recent first).
 */
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
          // Work backwards: chunk 0 = most recent, chunk N = oldest
          const chunkEnd = new Date(end);
          chunkEnd.setDate(end.getDate() - i * WINDOW_DAYS);
          const chunkStart = new Date(chunkEnd);
          chunkStart.setDate(chunkStart.getDate() - WINDOW_DAYS + 1);
          if (chunkStart < start) chunkStart.setTime(start.getTime());
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
