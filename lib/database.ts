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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
type DbRow = Record<string, unknown>;
type PgErrorLike = { code?: string; message?: string };

type DatabaseType = 'postgresql' | 'supabase' | 'mock';

function detectDatabaseType(): DatabaseType {
  if (isPostgresConfigured()) return 'postgresql';
  // Server-side API routes should still run when anon key is absent or RLS-restricted.
  if (SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY)) return 'supabase';
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

export type FetchMode = 'full' | 'shell';

export interface FetchScope {
  role?: string;
  email?: string;
  employeeId?: string;
  /** Phase 10.4: Server-side project filter */
  projectId?: string;
  /** Phase 10.4: Server-side date range (ISO YYYY-MM-DD) */
  from?: string;
  to?: string;
}

/** Shell tables: minimal for nav, filters, and initial render */
const SHELL_TABLES = ['portfolios', 'customers', 'sites', 'projects', 'employees'] as const;

/**
 * Fetch all data from database
 * @param mode - 'shell' for minimal nav/filter data; 'full' for complete data
 * @param scope - optional role-scoped filtering (RDA, COO)
 */
export async function fetchAllData(mode: FetchMode = 'full', scope?: FetchScope | null) {
  if (dbType === 'postgresql') {
    return await fetchFromPostgreSQL(mode, scope);
  }
  if (dbType === 'supabase') {
    return await fetchFromSupabase(mode, scope);
  }
  return null;
}

// ============================================================================
// POSTGRESQL IMPLEMENTATION
// ============================================================================

const HOUR_ENTRIES_MONTHS_LIMIT = parseInt(process.env.HOUR_ENTRIES_MONTHS_LIMIT || '24', 10);
const HOUR_ENTRIES_MAX_ROWS = parseInt(process.env.HOUR_ENTRIES_MAX_ROWS || '0', 10);

function emptyShellResult(): Record<string, unknown[]> {
  return {
    hierarchyNodes: [],
    workItems: [],
    portfolios: [],
    customers: [],
    sites: [],
    units: [],
    projects: [],
    subprojects: [],
    phases: [],
    tasks: [],
    qctasks: [],
    employees: [],
    hours: [],
    milestones: [],
    deliverables: [],
    sprints: [],
    sprintTasks: [],
    epics: [],
    features: [],
    userStories: [],
    forecasts: [],
    snapshots: [],
    visualSnapshots: [],
    changeRequests: [],
    changeImpacts: [],
    projectHealth: [],
    projectLog: [],
    projectDocuments: [],
    projectDocumentRecords: [],
    projectDocumentVersions: [],
    customerContracts: [],
    workdayPhases: [],
    moPeriodNotes: [],
    taskDependencies: [],
    taskQuantityEntries: [],
  };
}

async function fetchFromPostgreSQL(mode: FetchMode = 'full', scope?: FetchScope | null) {
  return withClient(async (client) => {
    // Helper to safely query a table (returns empty array if table doesn't exist)
    const safeQuery = async (sql: string, params?: unknown[]): Promise<DbRow[]> => {
      try {
        const result = params?.length ? await client.query(sql, params) : await client.query(sql);
        return result.rows as DbRow[];
      } catch (err: unknown) {
        const pgErr = err as PgErrorLike;
        if (pgErr.code === '42P01') return [];
        console.error(`[Database] Query error: ${sql.substring(0, 80)}...`, pgErr.message || 'Unknown error');
        return [];
      }
    };

    const monthsLimit = Number.isFinite(HOUR_ENTRIES_MONTHS_LIMIT) && HOUR_ENTRIES_MONTHS_LIMIT > 0 ? HOUR_ENTRIES_MONTHS_LIMIT : 24;
    const useDateFilter = monthsLimit > 0;
    const cutoffDate = useDateFilter ? (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - monthsLimit);
      return d.toISOString().slice(0, 10);
    })() : null;
    const maxRows = HOUR_ENTRIES_MAX_ROWS > 0 ? HOUR_ENTRIES_MAX_ROWS : null;

    const isRda = scope?.role === 'rda' && scope?.employeeId;
    const isCoo = scope?.role === 'coo';
    const isPca = scope?.role === 'pca' && scope?.email;
    const isProjectLead = scope?.role === 'project_lead' && scope?.email;
    const projectFilter = scope?.projectId && mode === 'full';
    const dateFrom = scope?.from;
    const dateTo = scope?.to;
    const useServerDateRange = Boolean(dateFrom && dateTo);

    const fetchHourEntries = async (): Promise<DbRow[]> => {
      try {
        const params: unknown[] = [];
        const conditions: string[] = [];
        let paramIdx = 1;
        if (useServerDateRange && dateFrom && dateTo) {
          conditions.push(`date >= $${paramIdx} AND date <= $${paramIdx + 1}`);
          params.push(dateFrom, dateTo);
          paramIdx += 2;
        } else if (useDateFilter && cutoffDate) {
          conditions.push(`date >= $${paramIdx}`);
          params.push(cutoffDate);
          paramIdx += 1;
        }
        if (projectFilter && scope?.projectId) {
          conditions.push(`project_id = $${paramIdx}`);
          params.push(scope.projectId);
          paramIdx += 1;
        }
        if (isRda) {
          conditions.push(`employee_id = $${paramIdx}`);
          params.push(scope!.employeeId);
          paramIdx += 1;
        } else if (isCoo) {
          conditions.push('employee_id IN (SELECT id FROM employees WHERE LOWER(COALESCE(department,\'\')) = \'1111 services\')');
        } else if (hasPcaScope && pcaScopedProjectIds) {
          const placeholders = pcaScopedProjectIds.map((_, i) => `$${paramIdx + i}`).join(',');
          conditions.push(`project_id IN (${placeholders})`);
          params.push(...pcaScopedProjectIds);
          paramIdx += pcaScopedProjectIds.length;
        }
        const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
        const limitClause = maxRows ? ` LIMIT ${maxRows}` : '';
        const result = await client.query(
          `SELECT * FROM hour_entries${whereClause} ORDER BY date${limitClause}`,
          params.length ? params : undefined
        );
        return result.rows as DbRow[];
      } catch (err: unknown) {
        const pgErr = err as PgErrorLike;
        if (pgErr.code === '42P01') return [];
        console.error('[Database] hour_entries query error:', pgErr.message || 'Unknown error');
        return [];
      }
    };

    if (mode === 'shell') {
      const [portfolios, customers, sites, projects, employees] = await Promise.all([
        safeQuery('SELECT * FROM portfolios ORDER BY name'),
        safeQuery('SELECT * FROM customers ORDER BY name'),
        safeQuery('SELECT * FROM sites ORDER BY name'),
        safeQuery('SELECT * FROM projects ORDER BY name'),
        safeQuery('SELECT * FROM employees ORDER BY name'),
      ]);
      const base = emptyShellResult();
      return {
        ...base,
        portfolios: convertArrayToCamelCase(portfolios),
        customers: convertArrayToCamelCase(customers),
        sites: convertArrayToCamelCase(sites),
        projects: convertArrayToCamelCase(projects),
        employees: convertArrayToCamelCase(employees),
      };
    }

    const projId = projectFilter ? scope!.projectId : null;

    let pcaScopedProjectIds: string[] | null = null;
    if ((isPca || isProjectLead) && !projId) {
      const emailCol = isPca ? 'pca_email' : 'project_lead_email';
      const scopedProjects = await safeQuery(
        `SELECT id FROM projects WHERE LOWER(${emailCol}) = LOWER($1)`,
        [scope!.email],
      );
      pcaScopedProjectIds = scopedProjects.map((r) => String(r.id));
      if (pcaScopedProjectIds.length === 0) pcaScopedProjectIds = null;
    }
    const hasPcaScope = pcaScopedProjectIds !== null;
    const pcaProjectInClause = hasPcaScope
      ? `(${pcaScopedProjectIds!.map((_, i) => `$${i + 1}`).join(',')})`
      : '';

    const pcaScopedQuery = (tableSql: string, orderBy: string): Promise<DbRow[]> => {
      if (!hasPcaScope) return safeQuery(`${tableSql} ORDER BY ${orderBy}`);
      return safeQuery(
        `${tableSql} WHERE project_id IN ${pcaProjectInClause} ORDER BY ${orderBy}`,
        pcaScopedProjectIds!,
      );
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
      projectDocumentRecords,
      projectDocumentVersions,
      customerContracts,
      workdayPhases,
      moPeriodNotes,
      taskDependencies,
      taskQuantityEntries,
      visualSnapshots,
    ] = await Promise.all([
      safeQuery('SELECT * FROM portfolios ORDER BY name'),
      safeQuery('SELECT * FROM customers ORDER BY name'),
      safeQuery('SELECT * FROM sites ORDER BY name'),
      projId ? safeQuery('SELECT * FROM units WHERE project_id = $1 ORDER BY name', [projId]) : pcaScopedQuery('SELECT * FROM units', 'name'),
      projId
        ? safeQuery('SELECT * FROM projects WHERE id = $1 ORDER BY name', [projId])
        : hasPcaScope
          ? safeQuery(`SELECT * FROM projects WHERE id IN ${pcaProjectInClause} ORDER BY name`, pcaScopedProjectIds!)
          : safeQuery('SELECT * FROM projects ORDER BY name'),
      projId ? safeQuery('SELECT * FROM subprojects WHERE project_id = $1 ORDER BY name', [projId]) : pcaScopedQuery('SELECT * FROM subprojects', 'name'),
      projId ? safeQuery('SELECT * FROM phases WHERE project_id = $1 ORDER BY name', [projId]) : pcaScopedQuery('SELECT * FROM phases', 'name'),
      isRda
        ? safeQuery('SELECT * FROM tasks WHERE assigned_resource_id = $1 ORDER BY name', [scope!.employeeId])
        : projId
          ? safeQuery('SELECT * FROM tasks WHERE project_id = $1 ORDER BY name', [projId])
          : pcaScopedQuery('SELECT * FROM tasks', 'name'),
      isRda
        ? safeQuery('SELECT * FROM qc_tasks WHERE assigned_to = $1 ORDER BY name', [scope!.employeeId])
        : projId
          ? safeQuery('SELECT * FROM qc_tasks WHERE project_id = $1 ORDER BY name', [projId])
          : pcaScopedQuery('SELECT * FROM qc_tasks', 'name'),
      isCoo ? safeQuery("SELECT * FROM employees WHERE LOWER(COALESCE(department,'')) = '1111 services' ORDER BY name") : safeQuery('SELECT * FROM employees ORDER BY name'),
      fetchHourEntries(),
      projId ? safeQuery("SELECT * FROM milestones WHERE project_id = $1 ORDER BY COALESCE(planned_date, created_at)", [projId]) : pcaScopedQuery('SELECT * FROM milestones', "COALESCE(planned_date, created_at)"),
      projId ? safeQuery('SELECT * FROM deliverables WHERE project_id = $1 ORDER BY name', [projId]) : pcaScopedQuery('SELECT * FROM deliverables', 'name'),
      projId ? safeQuery('SELECT * FROM sprints WHERE project_id = $1 ORDER BY start_date', [projId]) : pcaScopedQuery('SELECT * FROM sprints', 'start_date'),
      safeQuery('SELECT * FROM sprint_tasks'),
      safeQuery('SELECT * FROM epics ORDER BY name'),
      safeQuery('SELECT * FROM features ORDER BY name'),
      safeQuery('SELECT * FROM user_stories ORDER BY name'),
      safeQuery('SELECT * FROM forecasts ORDER BY forecast_date DESC'),
      safeQuery('SELECT * FROM snapshots ORDER BY snapshot_date DESC'),
      projId ? safeQuery('SELECT * FROM change_requests WHERE project_id = $1 ORDER BY submitted_at DESC', [projId]) : pcaScopedQuery('SELECT * FROM change_requests', 'submitted_at DESC'),
      projId ? safeQuery('SELECT * FROM change_impacts WHERE project_id = $1', [projId]) : pcaScopedQuery('SELECT * FROM change_impacts', 'project_id'),
      projId ? safeQuery('SELECT * FROM project_health WHERE project_id = $1 ORDER BY updated_at DESC', [projId]) : pcaScopedQuery('SELECT * FROM project_health', 'updated_at DESC'),
      projId ? safeQuery('SELECT * FROM project_log WHERE project_id = $1 ORDER BY entry_date DESC', [projId]) : pcaScopedQuery('SELECT * FROM project_log', 'entry_date DESC'),
      projId ? safeQuery('SELECT * FROM project_documents WHERE project_id = $1 ORDER BY uploaded_at DESC', [projId]) : pcaScopedQuery('SELECT * FROM project_documents', 'uploaded_at DESC'),
      safeQuery('SELECT * FROM project_document_records ORDER BY updated_at DESC'),
      safeQuery('SELECT * FROM project_document_versions ORDER BY record_id, version_number DESC'),
      safeQuery('SELECT * FROM customer_contracts ORDER BY line_from_date DESC'),
      projId ? safeQuery('SELECT * FROM workday_phases WHERE project_id = $1 ORDER BY project_id, unit, name', [projId]) : pcaScopedQuery('SELECT * FROM workday_phases', 'project_id, unit, name'),
      projId ? safeQuery('SELECT * FROM mo_period_notes WHERE project_id = $1 ORDER BY period_start DESC', [projId]) : pcaScopedQuery('SELECT * FROM mo_period_notes', 'period_start DESC'),
      safeQuery('SELECT * FROM task_dependencies'),
      safeQuery('SELECT * FROM task_quantity_entries ORDER BY date'),
      safeQuery('SELECT * FROM visual_snapshots ORDER BY snapshot_date DESC'),
    ]);

    console.log(`[Database] PostgreSQL fetch complete — ${hourEntries.length} hour entries${useDateFilter ? ` (from ${cutoffDate})` : ''}, ${tasks.length} tasks, ${projects.length} projects, ${employees.length} employees`);

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
      projectDocumentRecords: convertArrayToCamelCase(projectDocumentRecords),
      projectDocumentVersions: convertArrayToCamelCase(projectDocumentVersions),
      customerContracts: convertArrayToCamelCase(customerContracts),
      workdayPhases: convertArrayToCamelCase(workdayPhases),
      moPeriodNotes: convertArrayToCamelCase(moPeriodNotes),
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

async function fetchFromSupabase(mode: FetchMode = 'full', _scope?: FetchScope | null) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !supabaseKey) {
    return null;
  }
  const supabaseClient = createClient(SUPABASE_URL, supabaseKey);

  if (mode === 'shell') {
    const [portfolios, customers, sites, projects, employees] = await Promise.all([
      supabaseClient.from('portfolios').select('*').order('name'),
      supabaseClient.from('customers').select('*').order('name'),
      supabaseClient.from('sites').select('*').order('name'),
      supabaseClient.from('projects').select('*').order('name'),
      supabaseClient.from('employees').select('*').order('name'),
    ]);
    const base = emptyShellResult();
    return {
      ...base,
      portfolios: convertArrayFromSupabase((portfolios.data || []) as DbRow[]),
      customers: convertArrayFromSupabase((customers.data || []) as DbRow[]),
      sites: convertArrayFromSupabase((sites.data || []) as DbRow[]),
      projects: convertArrayFromSupabase((projects.data || []) as DbRow[]),
      employees: convertArrayFromSupabase((employees.data || []) as DbRow[]),
    };
  }

  const hourEntriesPromise = fetchAllHourEntries(supabaseClient as unknown as SupabaseClientLike);

  const [
    portfolios, customers, sites, units, projects, subprojects,
    phases, tasks, qcTasks, employees, milestones, deliverables,
    sprints, sprintTasks, epics, features, userStories,
    forecasts, snapshots, changeRequests, changeImpacts,
    projectHealth, projectLog, projectDocuments,
    projectDocumentRecords, projectDocumentVersions,
    customerContracts,
    workdayPhases,
    moPeriodNotes,
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
    supabaseClient.from('project_document_records').select('*').order('updated_at', { ascending: false }),
    supabaseClient.from('project_document_versions').select('*').order('record_id').order('version_number', { ascending: false }),
    supabaseClient.from('customer_contracts').select('*').order('line_from_date', { ascending: false }),
    supabaseClient.from('workday_phases').select('*').order('project_id'),
    supabaseClient.from('mo_period_notes').select('*').order('period_start', { ascending: false }),
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
    projectDocumentRecords: convertArrayFromSupabase(((projectDocumentRecords as { data?: unknown[] }).data || []) as DbRow[]),
    projectDocumentVersions: convertArrayFromSupabase(((projectDocumentVersions as { data?: unknown[] }).data || []) as DbRow[]),
    customerContracts: convertArrayFromSupabase(((customerContracts as { data?: unknown[] }).data || []) as DbRow[]),
    workdayPhases: convertArrayFromSupabase(((workdayPhases as { data?: unknown[] }).data || []) as DbRow[]),
    moPeriodNotes: convertArrayFromSupabase(((moPeriodNotes as { data?: unknown[] }).data || []) as DbRow[]),
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
