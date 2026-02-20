/**
 * @fileoverview Workday Sync API Route
 *
 * Calls Azure Functions (primary) or Supabase Edge Functions (fallback) to sync data.
 * Supports: employees, projects (hierarchy), hours (chunked by date).
 * With stream: true and syncType: 'unified', returns NDJSON stream.
 */

import { NextRequest, NextResponse } from 'next/server';
import { isPostgresConfigured, query as pgQuery } from '@/lib/postgres';

const WINDOW_DAYS = 7;
const DEFAULT_HOURS_DAYS_BACK = 7;
const MAX_HOURS_DAYS_BACK = 730;
const MIN_HOURS_DAYS_BACK = 1;

// Azure Functions HTTP trigger URL (set this in env vars)
const AZURE_FUNCTION_URL = process.env.AZURE_FUNCTION_URL || '';
const AZURE_FUNCTION_KEY = process.env.AZURE_FUNCTION_KEY || '';

// Supabase Edge Functions (fallback)
const EDGE_FUNCTIONS = {
  'employees': 'workday-employees',
  'projects': 'workday-projects',
  'hours': 'workday-hours',
} as const;

type SyncType = keyof typeof EDGE_FUNCTIONS;

interface WorkdayRequestBody {
  syncType?: SyncType | 'unified';
  action?: string;
  hoursDaysBack?: number | string;
}

interface ProjectRecord {
  id: string;
  name?: string;
  project_id?: string;
  status?: string;
  is_active?: boolean | null;
  active?: boolean | null;
}

interface EdgeFunctionResult {
  success: boolean;
  error?: string;
  summary?: {
    synced?: number;
    [key: string]: unknown;
  };
  stats?: {
    hours?: number;
    [key: string]: unknown;
  };
  logs?: string[];
}

interface AzureFunctionStepResult {
  success?: boolean;
  summary?: unknown;
  [key: string]: unknown;
}

interface AzureFunctionResponse {
  success?: boolean;
  summary?: Record<string, unknown>;
  results?: Record<string, AzureFunctionStepResult>;
}

/** Build step results from flat summary for older Azure deployments that don't return results. */
function buildResultsFromSummary(summary: Record<string, unknown>): Record<string, AzureFunctionStepResult> {
  const results: Record<string, AzureFunctionStepResult> = {};
  if (summary.employees != null) results.employees = { success: true, summary: summary.employees };
  if (summary.hierarchy != null) results.hierarchy = { success: true, summary: summary.hierarchy };
  if (summary.hours != null) {
    const h = summary.hours as Record<string, unknown>;
    results.hours = {
      success: (h.chunksFail as number) === 0,
      summary: {
        chunksOk: h.chunksOk,
        chunksFail: h.chunksFail,
        totalHours: h.totalHours,
        totalFetched: h.totalFetched,
        lastError: h.lastError,
      },
    };
  }
  if (summary.matching != null) results.matching = { success: true, summary: summary.matching };
  if (summary.customerContracts != null) {
    const cc = summary.customerContracts as Record<string, unknown>;
    results.customerContracts = { success: !cc.error, summary: summary.customerContracts };
  }
  return results;
}

interface HourEntryRow {
  id: string;
  project_id?: string;
  description?: string;
}

interface TaskLikeRow {
  id: string;
  project_id?: string;
  name?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseBody(value: unknown): WorkdayRequestBody {
  if (!isObject(value)) return {};
  return value as WorkdayRequestBody;
}

export async function POST(req: NextRequest) {
  try {
    const body = parseBody(await req.json().catch(() => ({})));
    const syncType = body.syncType as SyncType | 'unified';
    const action = body.action;
    const hoursDaysBack = Math.min(MAX_HOURS_DAYS_BACK, Math.max(MIN_HOURS_DAYS_BACK, Number(body.hoursDaysBack) || DEFAULT_HOURS_DAYS_BACK));

    // Handle get-available-projects action
    if (action === 'get-available-projects') {
      return handleGetProjects();
    }

    // Unified Sync: try Azure Function first, fallback to Supabase Edge Functions
    if (syncType === 'unified') {
      if (AZURE_FUNCTION_URL) {
        return azureFunctionSyncStream(hoursDaysBack);
      }
      // Fallback to Supabase Edge Functions
      return supabaseUnifiedSyncStream(hoursDaysBack);
    }

    // Hours-only
    if (syncType === 'hours') {
      if (AZURE_FUNCTION_URL) {
        return azureFunctionSyncStream(hoursDaysBack);
      }
      return supabaseHoursOnlyStream(hoursDaysBack);
    }

    // Individual sync types
    if (!syncType || !EDGE_FUNCTIONS[syncType as keyof typeof EDGE_FUNCTIONS]) {
      return NextResponse.json(
        { success: false, error: `Invalid sync type. Must be one of: ${Object.keys(EDGE_FUNCTIONS).join(', ')} or 'unified'` },
        { status: 400 }
      );
    }

    if (AZURE_FUNCTION_URL) {
      return azureFunctionSyncStream(hoursDaysBack);
    }

    // Supabase fallback for individual sync types
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: 'No sync backend configured' }, { status: 500 });
    }
    const edgeFunctionName = EDGE_FUNCTIONS[syncType as keyof typeof EDGE_FUNCTIONS];
    const result = await callEdgeFunction(supabaseUrl, supabaseServiceKey, edgeFunctionName, body);
    return NextResponse.json({ success: result.success, syncType, summary: result.summary, logs: result.logs || [], error: result.error });

  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('Workday sync error:', message);
    return NextResponse.json({ success: false, error: message || 'Unknown error' }, { status: 500 });
  }
}

// ============================================================================
// GET PROJECTS (PostgreSQL primary, Supabase fallback)
// ============================================================================

// Keywords that indicate an inactive record (case-insensitive, server-side mirror of lib/active-filters)
const INACTIVE_KW = ['inactive', 'terminated', 'disabled', 'closed', 'cancelled', 'canceled', 'archived', 'suspended', 'deactivated', 'removed', 'offboarded'];

function isProjectActive(p: ProjectRecord): boolean {
  const active = p.is_active ?? p.active;
  if (active === false) return false;
  const status = (p.status || '').toLowerCase();
  if (INACTIVE_KW.some(kw => status.includes(kw))) return false;
  const name = (p.name || '').toLowerCase();
  if (INACTIVE_KW.some(kw => name.includes(kw))) return false;
  return true;
}

async function handleGetProjects() {
  try {
    if (isPostgresConfigured()) {
      const result = await pgQuery('SELECT id, name, project_id, customer_id, site_id, has_schedule, status, is_active FROM projects ORDER BY name');
      const projectRows = (result.rows || []) as ProjectRecord[];
      const projectOptions = projectRows.filter(isProjectActive).map((p) => ({
        id: p.id,
        name: p.name || p.id,
        secondary: p.project_id || 'Workday Project',
        type: 'project',
      }));
      return NextResponse.json({ success: true, workday_projects: projectOptions, summary: { projects: projectOptions.length } });
    }

    // Supabase fallback
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ success: false, error: 'No database configured', workday_projects: [] });
    }
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: projects, error } = await supabase.from('projects').select('id, name, project_id, customer_id, site_id, has_schedule, status, is_active').order('name');
    if (error) return NextResponse.json({ success: false, error: error.message, workday_projects: [] });
    const projectRows = (projects || []) as ProjectRecord[];
    const projectOptions = projectRows.filter(isProjectActive).map((p) => ({
      id: p.id,
      name: p.name || p.id,
      secondary: p.project_id || 'Workday Project',
      type: 'project',
    }));
    return NextResponse.json({ success: true, workday_projects: projectOptions, summary: { projects: projectOptions.length } });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(error), workday_projects: [] }, { status: 500 });
  }
}

// ============================================================================
// AZURE FUNCTION SYNC (NDJSON stream)
// ============================================================================

function azureFunctionSyncStream(hoursDaysBack: number): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const logs: string[] = [];

      const logAndPush = (msg: string) => {
        logs.push(msg);
        console.log(`[Workday Sync] ${msg}`);
      };

      try {
        pushLine(controller, { type: 'step', step: 'azure-function', status: 'started' });
        logAndPush('Calling Azure Function for full Workday sync...');

        const url = AZURE_FUNCTION_KEY
          ? `${AZURE_FUNCTION_URL}?code=${AZURE_FUNCTION_KEY}`
          : AZURE_FUNCTION_URL;

        const abortController = new AbortController();
        // Azure allows much longer timeouts than Supabase Edge; use 20 min for full sync including hours chunks
        const timeoutMs = 20 * 60 * 1000;
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hoursDaysBack }),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Failed to read response');
          logAndPush(`Azure Function returned HTTP ${response.status}: ${errorText.substring(0, 500)}`);
          pushLine(controller, { type: 'error', error: `Azure Function HTTP ${response.status}: ${errorText.substring(0, 300)}` });
          pushLine(controller, { type: 'done', success: false, logs });
          controller.close();
          return;
        }

        const data = (await response.json()) as AzureFunctionResponse;
        logAndPush(`Azure Function sync completed: ${JSON.stringify(data.summary || {})}`);

        // Emit step events for each component (employees, hierarchy, hours, matching, customerContracts)
        const results = data.results || (data.summary && buildResultsFromSummary(data.summary));
        if (results) {
          const stepOrder = ['employees', 'hierarchy', 'hours', 'matching', 'customerContracts'];
          for (const step of stepOrder) {
            const result = results[step];
            if (!result) continue;
            const success = result.success !== false;
            const summary = result.summary || result;
            if (step === 'hours' && result.summary?.lastError) {
              pushLine(controller, { type: 'step', step, status: 'chunk_done', success: false, error: result.summary.lastError });
            }
            pushLine(controller, {
              type: 'step',
              step,
              status: 'done',
              result: { success, summary },
              totalHours: step === 'hours' ? (result.summary?.totalHours ?? result.summary?.totalFetched) : undefined,
              ...(step === 'hours' && result.summary?.chunksFail > 0 ? { error: result.summary.lastError } : {}),
            });
          }
        }

        pushLine(controller, { type: 'done', success: data.success !== false, logs, summary: data.summary || data });
      } catch (err: unknown) {
        const msg = err instanceof Error
          ? (err.name === 'AbortError' ? 'Azure Function timed out after 20 minutes' : (err.message || String(err)))
          : String(err);
        logAndPush(`Azure Function error: ${msg}`);
        pushLine(controller, { type: 'error', error: msg });
        pushLine(controller, { type: 'done', success: false, logs });
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}

// ============================================================================
// MATCHING (PostgreSQL – after Azure Function sync completes)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function runPostgresMatching(): Promise<{ tasksMatched: number; unitsMatched: number; stillUnmatched: number }> {
  if (!isPostgresConfigured()) return { tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0 };

  const unassigned = await pgQuery("SELECT id, project_id, description FROM hour_entries WHERE task_id IS NULL");
  if (!unassigned.rows.length) return { tasksMatched: 0, unitsMatched: 0, stillUnmatched: 0 };

  const tasks = await pgQuery("SELECT id, project_id, name FROM tasks");
  const units = await pgQuery("SELECT id, project_id, name FROM units");

  const tasksByProject = new Map<string, TaskLikeRow[]>();
  (tasks.rows as TaskLikeRow[]).forEach((t) => {
    if (!t.project_id || !t.name) return;
    const arr = tasksByProject.get(t.project_id) || [];
    arr.push(t);
    tasksByProject.set(t.project_id, arr);
  });

  const unitsByProject = new Map<string, TaskLikeRow[]>();
  (units.rows as TaskLikeRow[]).forEach((u) => {
    if (!u.project_id || !u.name) return;
    const arr = unitsByProject.get(u.project_id) || [];
    arr.push(u);
    unitsByProject.set(u.project_id, arr);
  });

  const normalize = (s: string) => (s ?? '').toString().trim().toLowerCase();
  let tasksMatched = 0;
  let unitsMatched = 0;
  const updates: { id: string; task_id: string }[] = [];

  for (const h of unassigned.rows as HourEntryRow[]) {
    if (!h.project_id) continue;
    const desc = normalize(h.description || '');
    if (!desc) continue;

    let matched = false;
    for (const task of (tasksByProject.get(h.project_id) || [])) {
      if (normalize(task.name) && desc.includes(normalize(task.name))) {
        updates.push({ id: h.id, task_id: task.id });
        tasksMatched++;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const unit of (unitsByProject.get(h.project_id) || [])) {
      if (normalize(unit.name) && desc.includes(normalize(unit.name))) {
        updates.push({ id: h.id, task_id: unit.id });
        unitsMatched++;
        break;
      }
    }
  }

  // Batch update
  for (const u of updates) {
    await pgQuery('UPDATE hour_entries SET task_id = $1 WHERE id = $2', [u.task_id, u.id]);
  }

  return { tasksMatched, unitsMatched, stillUnmatched: unassigned.rows.length - tasksMatched - unitsMatched };
}

// ============================================================================
// SUPABASE FALLBACK FUNCTIONS (kept for backward compat)
// ============================================================================

/** Push one NDJSON line */
function pushLine(controller: ReadableStreamDefaultController<Uint8Array>, obj: object) {
  controller.enqueue(new TextEncoder().encode(JSON.stringify(obj) + '\n'));
}

async function callEdgeFunction(
  url: string, key: string, functionName: string, body: Record<string, unknown>,
  options?: { retries?: number; timeoutMs?: number }
): Promise<EdgeFunctionResult> {
  const { retries = 2, timeoutMs = 120000 } = options || {};
  const edgeFunctionUrl = `${url}/functions/v1/${functionName}`;
  let lastError = '';

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const edgeResponse = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'apikey': key },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!edgeResponse.ok) {
        const errorText = await edgeResponse.text().catch(() => 'Failed to read error response');
        lastError = `HTTP ${edgeResponse.status}: ${errorText.substring(0, 300)}`;
        if (edgeResponse.status >= 400 && edgeResponse.status < 500) return { success: false, error: lastError };
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
        return { success: false, error: lastError };
      }

      const responseText = await edgeResponse.text();
      if (!responseText?.trim()) return { success: true, summary: { synced: 0 }, stats: { hours: 0 }, logs: ['Empty response'] };
      try { return JSON.parse(responseText); } catch { return { success: false, error: `Invalid JSON: ${responseText.substring(0, 100)}` }; }
    } catch (fetchError: unknown) {
      if (fetchError instanceof Error) {
        lastError = fetchError.name === 'AbortError' ? `Timed out after ${timeoutMs / 1000}s` : (fetchError.message || 'Network error');
      } else {
        lastError = 'Network error';
      }
      if (attempt < retries) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
    }
  }
  return { success: false, error: lastError || 'Unknown error after retries' };
}

function supabaseUnifiedSyncStream(hoursDaysBack: number): Response {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ type: 'error', error: 'No sync backend configured' }), { status: 500 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const logs: string[] = [];
      let empOk = false, projOk = false, hoursChunksOk = 0, totalHours = 0;
      const totalChunks = Math.ceil(hoursDaysBack / WINDOW_DAYS);

      // 1. Employees
      try {
        pushLine(controller, { type: 'step', step: 'employees', status: 'started' });
        const empRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-employees', {}, { retries: 2, timeoutMs: 60000 });
        pushLine(controller, { type: 'step', step: 'employees', status: 'done', result: empRes });
        empOk = empRes.success;
      } catch (e: unknown) {
        pushLine(controller, { type: 'error', error: `Employees: ${getErrorMessage(e)}` });
      }

      // 2. Projects
      try {
        pushLine(controller, { type: 'step', step: 'projects', status: 'started' });
        const projRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-projects', {}, { retries: 2, timeoutMs: 90000 });
        pushLine(controller, { type: 'step', step: 'projects', status: 'done', result: projRes });
        projOk = projRes.success;
      } catch (e: unknown) {
        pushLine(controller, { type: 'error', error: `Projects: ${getErrorMessage(e)}` });
      }

      // 3. Hours
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - hoursDaysBack);
      pushLine(controller, { type: 'step', step: 'hours', status: 'started', totalChunks });

      for (let i = 0; i < totalChunks; i++) {
        const chunkEnd = new Date(end);
        chunkEnd.setDate(end.getDate() - i * WINDOW_DAYS);
        const chunkStart = new Date(chunkEnd);
        chunkStart.setDate(chunkStart.getDate() - WINDOW_DAYS + 1);
        if (chunkStart < start) chunkStart.setTime(start.getTime());
        const startStr = chunkStart.toISOString().split('T')[0];
        const endStr = chunkEnd.toISOString().split('T')[0];

        pushLine(controller, { type: 'step', step: 'hours', status: 'chunk', chunk: i + 1, totalChunks, startDate: startStr, endDate: endStr });
        try {
          const hoursRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-hours', { startDate: startStr, endDate: endStr }, { retries: 1, timeoutMs: 90000 });
          totalHours += hoursRes.stats?.hours ?? hoursRes.summary?.synced ?? 0;
          if (hoursRes.success) hoursChunksOk++;
          pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: hoursRes.stats, success: hoursRes.success });
        } catch (e: unknown) {
          pushLine(controller, { type: 'error', error: `Hours ${startStr}-${endStr}: ${getErrorMessage(e)}` });
        }
        if (i < totalChunks - 1) await new Promise(r => setTimeout(r, 200));
      }
      pushLine(controller, { type: 'step', step: 'hours', status: 'done', totalHours });

      const success = (empOk && projOk) || hoursChunksOk > 0;
      pushLine(controller, { type: 'done', success, logs, summary: { employees: empOk ? 'success' : 'failed', hierarchy: projOk ? 'success' : 'failed', hours: `${hoursChunksOk}/${totalChunks}`, totalHours } });
      controller.close();
    }
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}

function supabaseHoursOnlyStream(hoursDaysBack: number): Response {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ type: 'error', error: 'No sync backend configured' }), { status: 500 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const end = new Date(), start = new Date();
      start.setDate(start.getDate() - hoursDaysBack);
      const totalChunks = Math.ceil(hoursDaysBack / WINDOW_DAYS);
      let totalHours = 0, success = true;

      pushLine(controller, { type: 'step', step: 'hours', status: 'started', totalChunks });
      for (let i = 0; i < totalChunks; i++) {
        const chunkEnd = new Date(end);
        chunkEnd.setDate(end.getDate() - i * WINDOW_DAYS);
        const chunkStart = new Date(chunkEnd);
        chunkStart.setDate(chunkStart.getDate() - WINDOW_DAYS + 1);
        if (chunkStart < start) chunkStart.setTime(start.getTime());
        const startStr = chunkStart.toISOString().split('T')[0];
        const endStr = chunkEnd.toISOString().split('T')[0];

        pushLine(controller, { type: 'step', step: 'hours', status: 'chunk', chunk: i + 1, totalChunks, startDate: startStr, endDate: endStr });
        try {
          const hoursRes = await callEdgeFunction(supabaseUrl, supabaseServiceKey, 'workday-hours', { startDate: startStr, endDate: endStr });
          totalHours += hoursRes.stats?.hours ?? 0;
          pushLine(controller, { type: 'step', step: 'hours', status: 'chunk_done', chunk: i + 1, totalChunks, stats: hoursRes.stats });
          if (!hoursRes.success) success = false;
        } catch (err: unknown) {
          success = false;
          pushLine(controller, { type: 'error', error: getErrorMessage(err) });
        }
      }
      pushLine(controller, { type: 'step', step: 'hours', status: 'done', totalHours });
      pushLine(controller, { type: 'done', success, totalHours });
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}

export async function GET() {
  return NextResponse.json({
    available: true,
    backend: AZURE_FUNCTION_URL ? 'azure-functions' : 'supabase-edge-functions',
    syncTypes: Object.keys(EDGE_FUNCTIONS),
    message: 'POST { syncType } or syncType: "unified" to sync.',
  });
}
