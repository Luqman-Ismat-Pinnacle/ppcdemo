/**
 * @fileoverview Database Client Configuration
 * 
 * This module provides a unified database client that works with:
 * - PostgreSQL (primary for production / Azure)
 * - Supabase (fallback for legacy development)
 * - Mock client (when no database is configured)
 * 
 * @module lib/database
 */

import { getPool, isPostgresConfigured, withClient } from './postgres';
import { fromSupabaseFormat } from './supabase';

// Supabase fallback (only used if DATABASE_URL is not set)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
type DbRow = Record<string, unknown>;
type PgErrorLike = { code?: string; message?: string };

type DatabaseType = 'postgresql' | 'supabase' | 'mock';

function detectDatabaseType(): DatabaseType {
  if (isPostgresConfigured()) return 'postgresql';
  if (SUPABASE_URL && SUPABASE_ANON_KEY) return 'supabase';
  return 'mock';
}

const dbType = detectDatabaseType();

// Log which database is active
if (typeof process !== 'undefined') {
  console.log(`[Database] Using ${dbType} database`);
}

/**
 * Check if database is configured
 */
export function isDatabaseConfigured(): boolean {
  return dbType !== 'mock';
}

/**
 * Get database type
 */
export function getDatabaseType(): DatabaseType {
  return dbType;
}

/**
 * Convert snake_case object to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function convertRowToCamelCase<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value;
  }
  return result as T;
}

function convertArrayToCamelCase<T>(arr: DbRow[]): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => convertRowToCamelCase<T>(item));
}

/**
 * Fetch all data from database
 */
export async function fetchAllData() {
  if (dbType === 'postgresql') {
    return await fetchFromPostgreSQL();
  }
  if (dbType === 'supabase') {
    return await fetchFromSupabase();
  }
  return null;
}

// ============================================================================
// POSTGRESQL IMPLEMENTATION
// ============================================================================

async function fetchFromPostgreSQL() {
  return withClient(async (client) => {
    // Helper to safely query a table (returns empty array if table doesn't exist)
    const safeQuery = async (sql: string): Promise<DbRow[]> => {
      try {
        const result = await client.query(sql);
        return result.rows as DbRow[];
      } catch (err: unknown) {
        const pgErr = err as PgErrorLike;
        // Table doesn't exist - return empty array
        if (pgErr.code === '42P01') return [];
        console.error(`[Database] Query error: ${sql.substring(0, 80)}...`, pgErr.message || 'Unknown error');
        return [];
      }
    };

    const [
      portfolios,
      customers,
      sites,
      units,
      projects,
      subprojects,
      phases,
      tasks,
      qcTasks,
      employees,
      hourEntries,
      milestones,
      deliverables,
      sprints,
      sprintTasks,
      epics,
      features,
      userStories,
      forecasts,
      snapshots,
      changeRequests,
      changeImpacts,
      projectHealth,
      projectLog,
      projectDocuments,
      customerContracts,
      workdayPhases,
      taskDependencies,
      taskQuantityEntries,
      visualSnapshots,
    ] = await Promise.all([
      safeQuery('SELECT * FROM portfolios ORDER BY name'),
      safeQuery('SELECT * FROM customers ORDER BY name'),
      safeQuery('SELECT * FROM sites ORDER BY name'),
      safeQuery('SELECT * FROM units ORDER BY name'),
      safeQuery('SELECT * FROM projects ORDER BY name'),
      safeQuery('SELECT * FROM subprojects ORDER BY name'),
      safeQuery('SELECT * FROM phases ORDER BY name'),
      safeQuery('SELECT * FROM tasks ORDER BY name'),
      safeQuery('SELECT * FROM qc_tasks ORDER BY name'),
      safeQuery('SELECT * FROM employees ORDER BY name'),
      safeQuery('SELECT * FROM hour_entries ORDER BY date'),
      safeQuery("SELECT * FROM milestones ORDER BY COALESCE(planned_date, due_date, created_at)"),
      safeQuery('SELECT * FROM deliverables ORDER BY name'),
      safeQuery('SELECT * FROM sprints ORDER BY start_date'),
      safeQuery('SELECT * FROM sprint_tasks'),
      safeQuery('SELECT * FROM epics ORDER BY name'),
      safeQuery('SELECT * FROM features ORDER BY name'),
      safeQuery('SELECT * FROM user_stories ORDER BY name'),
      safeQuery('SELECT * FROM forecasts ORDER BY forecast_date DESC'),
      safeQuery('SELECT * FROM snapshots ORDER BY snapshot_date DESC'),
      safeQuery('SELECT * FROM change_requests ORDER BY submitted_at DESC'),
      safeQuery('SELECT * FROM change_impacts'),
      safeQuery('SELECT * FROM project_health ORDER BY updated_at DESC'),
      safeQuery('SELECT * FROM project_log ORDER BY entry_date DESC'),
      safeQuery('SELECT * FROM project_documents ORDER BY uploaded_at DESC'),
      safeQuery('SELECT * FROM customer_contracts ORDER BY line_from_date DESC'),
      safeQuery('SELECT * FROM workday_phases ORDER BY project_id, unit, name'),
      safeQuery('SELECT * FROM task_dependencies'),
      safeQuery('SELECT * FROM task_quantity_entries ORDER BY date'),
      safeQuery('SELECT * FROM visual_snapshots ORDER BY snapshot_date DESC'),
    ]);

    console.log(`[Database] PostgreSQL fetch complete — ${hourEntries.length} hour entries, ${tasks.length} tasks, ${projects.length} projects, ${employees.length} employees`);

    return {
      hierarchyNodes: [],
      workItems: [],
      portfolios: convertArrayToCamelCase(portfolios),
      customers: convertArrayToCamelCase(customers),
      sites: convertArrayToCamelCase(sites),
      units: convertArrayToCamelCase(units),
      projects: convertArrayToCamelCase(projects),
      subprojects: convertArrayToCamelCase(subprojects),
      phases: convertArrayToCamelCase(phases),
      tasks: convertArrayToCamelCase(tasks),
      qctasks: convertArrayToCamelCase(qcTasks),
      employees: convertArrayToCamelCase(employees),
      hours: convertArrayToCamelCase(hourEntries),
      milestones: convertArrayToCamelCase(milestones),
      deliverables: convertArrayToCamelCase(deliverables),
      sprints: convertArrayToCamelCase(sprints),
      sprintTasks: convertArrayToCamelCase(sprintTasks),
      epics: convertArrayToCamelCase(epics),
      features: convertArrayToCamelCase(features),
      userStories: convertArrayToCamelCase(userStories),
      forecasts: convertArrayToCamelCase(forecasts),
      snapshots: convertArrayToCamelCase(snapshots),
      visualSnapshots: convertArrayToCamelCase(visualSnapshots),
      changeRequests: convertArrayToCamelCase(changeRequests),
      changeImpacts: convertArrayToCamelCase(changeImpacts),
      projectHealth: convertArrayToCamelCase(projectHealth),
      projectLog: convertArrayToCamelCase(projectLog),
      projectDocuments: convertArrayToCamelCase(projectDocuments),
      customerContracts: convertArrayToCamelCase(customerContracts),
      workdayPhases: convertArrayToCamelCase(workdayPhases),
      taskDependencies: convertArrayToCamelCase(taskDependencies),
      taskQuantityEntries: convertArrayToCamelCase(taskQuantityEntries),
    };
  });
}

// ============================================================================
// SUPABASE FALLBACK IMPLEMENTATION
// ============================================================================

const PAGE_SIZE = 1000;
const MAX_HOUR_ENTRIES = 100000;

type SupabaseQueryResult = Promise<{ data: unknown[] | null; error: unknown }>;
type SupabaseRangeBuilder = {
  range: (from: number, to: number) => SupabaseQueryResult;
};
type SupabaseOrderBuilder = {
  order: (column: string) => SupabaseRangeBuilder;
};
type SupabaseSelectBuilder = {
  select: (columns: string) => SupabaseOrderBuilder;
};
type SupabaseClientLike = {
  from: (table: string) => SupabaseSelectBuilder;
};

async function fetchAllHourEntries(supabaseClient: SupabaseClientLike): Promise<DbRow[]> {
  const all: DbRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseClient
      .from('hour_entries')
      .select('*')
      .order('date')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error('[Database] hour_entries pagination error:', error);
      break;
    }
    const page = (data || []) as DbRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE || all.length >= MAX_HOUR_ENTRIES) break;
    offset += PAGE_SIZE;
  }
  console.log(`[Database] Fetched ${all.length} hour entries (paginated)`);
  return all;
}

function convertArrayFromSupabase<T>(arr: DbRow[]): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => fromSupabaseFormat<T>(item));
}

async function fetchFromSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

  const hourEntriesPromise = fetchAllHourEntries(supabaseClient as unknown as SupabaseClientLike);

  const [
    portfolios, customers, sites, units, projects, subprojects,
    phases, tasks, qcTasks, employees, milestones, deliverables,
    sprints, sprintTasks, epics, features, userStories,
    forecasts, snapshots, changeRequests, changeImpacts,
    projectHealth, projectLog, projectDocuments,
    customerContracts,
    workdayPhases,
    taskDependencies, taskQuantityEntries, visualSnapshots,
  ] = await Promise.all([
    supabaseClient.from('portfolios').select('*').order('name'),
    supabaseClient.from('customers').select('*').order('name'),
    supabaseClient.from('sites').select('*').order('name'),
    supabaseClient.from('units').select('*').order('name'),
    supabaseClient.from('projects').select('*').order('name'),
    supabaseClient.from('subprojects').select('*').order('name'),
    supabaseClient.from('phases').select('*').order('name'),
    supabaseClient.from('tasks').select('*').order('name'),
    supabaseClient.from('qc_tasks').select('*').order('name'),
    supabaseClient.from('employees').select('*').order('name'),
    supabaseClient.from('milestones').select('*').order('planned_date'),
    supabaseClient.from('deliverables').select('*').order('name'),
    supabaseClient.from('sprints').select('*').order('start_date'),
    supabaseClient.from('sprint_tasks').select('*'),
    supabaseClient.from('epics').select('*').order('name'),
    supabaseClient.from('features').select('*').order('name'),
    supabaseClient.from('user_stories').select('*').order('name'),
    supabaseClient.from('forecasts').select('*').order('forecast_date', { ascending: false }),
    supabaseClient.from('snapshots').select('*').order('snapshot_date', { ascending: false }),
    supabaseClient.from('change_requests').select('*').order('submitted_at', { ascending: false }),
    supabaseClient.from('change_impacts').select('*'),
    supabaseClient.from('project_health').select('*').order('updated_at', { ascending: false }),
    supabaseClient.from('project_log').select('*').order('entry_date', { ascending: false }),
    supabaseClient.from('project_documents').select('*').order('uploaded_at', { ascending: false }),
    supabaseClient.from('customer_contracts').select('*').order('line_from_date', { ascending: false }),
    supabaseClient.from('workday_phases').select('*').order('project_id'),
    supabaseClient.from('task_dependencies').select('*'),
    supabaseClient.from('task_quantity_entries').select('*').order('date'),
    supabaseClient.from('visual_snapshots').select('*').order('snapshot_date', { ascending: false }),
  ]);

  const hourEntriesData = await hourEntriesPromise;

  return {
    hierarchyNodes: [],
    workItems: [],
    portfolios: convertArrayFromSupabase(portfolios.data || []),
    customers: convertArrayFromSupabase(customers.data || []),
    sites: convertArrayFromSupabase(sites.data || []),
    units: convertArrayFromSupabase(units.data || []),
    projects: convertArrayFromSupabase((projects.data || []) as DbRow[]),
    subprojects: convertArrayFromSupabase((subprojects.data || []) as DbRow[]),
    phases: convertArrayFromSupabase(phases.data || []),
    tasks: convertArrayFromSupabase(tasks.data || []),
    qctasks: convertArrayFromSupabase(qcTasks.data || []),
    employees: convertArrayFromSupabase(employees.data || []),
    hours: convertArrayFromSupabase(hourEntriesData || []),
    milestones: convertArrayFromSupabase(milestones.data || []),
    deliverables: convertArrayFromSupabase(deliverables.data || []),
    sprints: convertArrayFromSupabase(sprints.data || []),
    sprintTasks: convertArrayFromSupabase(sprintTasks.data || []),
    epics: convertArrayFromSupabase(epics.data || []),
    features: convertArrayFromSupabase(features.data || []),
    userStories: convertArrayFromSupabase(userStories.data || []),
    forecasts: convertArrayFromSupabase(forecasts.data || []),
    snapshots: convertArrayFromSupabase(snapshots.data || []),
    visualSnapshots: convertArrayFromSupabase(visualSnapshots.data || []),
    changeRequests: convertArrayFromSupabase(changeRequests.data || []),
    changeImpacts: convertArrayFromSupabase(changeImpacts.data || []),
    projectHealth: convertArrayFromSupabase(projectHealth.data || []),
    projectLog: convertArrayFromSupabase(projectLog.data || []),
    projectDocuments: convertArrayFromSupabase(projectDocuments.data || []),
    customerContracts: convertArrayFromSupabase((customerContracts as { data?: unknown[] }).data || []),
    workdayPhases: convertArrayFromSupabase((workdayPhases as { data?: unknown[] }).data || []),
    taskDependencies: convertArrayFromSupabase(taskDependencies.data || []),
    taskQuantityEntries: convertArrayFromSupabase(taskQuantityEntries.data || []),
  };
}

/**
 * Save data to database
 */
export async function saveData(table: string, data: Record<string, unknown>[]) {
  if (dbType === 'postgresql') {
    return await saveToPostgreSQL(table, data);
  }
  if (dbType === 'supabase') {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    try {
      const { error } = await supabaseClient.from(table).insert(data);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
  return { success: false, error: 'No database configured' };
}

async function saveToPostgreSQL(table: string, data: Record<string, unknown>[]) {
  if (data.length === 0) return { success: true };
  try {
    const pool = getPool();
    if (!pool) return { success: false, error: 'PostgreSQL not configured' };

    const columns = Object.keys(data[0]);
    const placeholders = data.map((_, rowIdx) =>
      `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`
    ).join(', ');
    const values = data.flatMap(row => columns.map(col => row[col]));
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT (id) DO NOTHING`;
    await pool.query(sql, values);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
