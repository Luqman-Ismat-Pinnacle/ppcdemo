/**
 * @fileoverview Database Client Configuration & Utilities
 * 
 * This module provides:
 * - Database configuration check (PostgreSQL primary, Supabase fallback)
 * - Table name mappings
 * - Case conversion utilities (snake_case <-> camelCase)
 * - Connection status checking
 * 
 * @module lib/supabase
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

type MockSupabaseResponse = { data: null; error: { message: string } };
type MockThenResolver = (value: MockSupabaseResponse) => unknown;
type MockChain = {
  then: (resolve: MockThenResolver) => Promise<unknown>;
} & Record<string, (...args: unknown[]) => MockChain>;

/**
 * Create a mock Supabase client for when env vars are not configured
 */
function createMockSupabaseClient(): SupabaseClient {
  const mockResponse: MockSupabaseResponse = { data: null, error: { message: 'Database not configured' } };
  const mockAuth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async () => mockResponse,
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
  };

  /** Chainable query builder — every method returns `chain` so calls like
   *  .select().eq().eq().gte().order().limit() all work without crashing.
   *  When the chain is awaited (or `.then()` is called) it resolves with mockResponse. */
  const createChain = (): MockChain => {
    const chain = new Proxy({} as MockChain, {
      get(_target, prop: string | symbol) {
        if (prop === 'then') {
          return (resolve: MockThenResolver) => Promise.resolve(resolve(mockResponse));
        }
        if (typeof prop === 'symbol') {
          return undefined;
        }
        return (...args: unknown[]) => {
          void args;
          return chain;
        };
      },
    });
    return chain as MockChain;
  };

  const mockFrom = () => ({
    select: (...args: unknown[]) => {
      void args;
      return createChain();
    },
    insert: (...args: unknown[]) => {
      void args;
      return createChain();
    },
    update: (...args: unknown[]) => {
      void args;
      return createChain();
    },
    upsert: (...args: unknown[]) => {
      void args;
      return createChain();
    },
    delete: (...args: unknown[]) => {
      void args;
      return createChain();
    },
  });

  return {
    auth: mockAuth,
    from: mockFrom,
  } as unknown as SupabaseClient;
}

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const isSupabaseEnvConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Check if PostgreSQL is configured (server-side only)
const DATABASE_URL = typeof window === 'undefined'
  ? (process.env.DATABASE_URL || process.env.AZURE_POSTGRES_CONNECTION_STRING || process.env.POSTGRES_CONNECTION_STRING || '')
  : '';
const isPostgresEnvConfigured = Boolean(DATABASE_URL);

/**
 * Supabase client instance (used as fallback or for auth)
 */
export const supabase = isSupabaseEnvConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
  })
  : createMockSupabaseClient();

/**
 * Check if any database is properly configured (PostgreSQL or Supabase)
 */
export function isSupabaseConfigured(): boolean {
  return isPostgresEnvConfigured || isSupabaseEnvConfigured;
}

/**
 * Check if PostgreSQL is the active database
 */
export function isPostgresActive(): boolean {
  return isPostgresEnvConfigured;
}

/**
 * Database table names - matching the Supabase schema
 */
export const TABLES = {
  EMPLOYEES: 'employees',
  PORTFOLIOS: 'portfolios',
  CUSTOMERS: 'customers',
  SITES: 'sites',
  UNITS: 'units',
  PROJECTS: 'projects',
  SUBPROJECTS: 'subprojects',
  PHASES: 'phases',
  TASKS: 'tasks',
  QC_TASKS: 'qc_tasks',
  DELIVERABLES: 'deliverables',
  HOUR_ENTRIES: 'hour_entries',
  MILESTONES: 'milestones',
  CALENDARS: 'calendars',
  PROJECT_HEALTH: 'project_health',
  PROJECT_LOG: 'project_log',
  TASK_DEPENDENCIES: 'task_dependencies',
  SNAPSHOTS: 'snapshots',
  VISUAL_SNAPSHOTS: 'visual_snapshots',
  CHANGE_REQUESTS: 'change_requests',
  CHANGE_IMPACTS: 'change_impacts',
  TASK_QUANTITY_ENTRIES: 'task_quantity_entries',
  APPROVAL_RECORDS: 'approval_records',
  PROGRESS_CLAIMS: 'progress_claims',
  COST_CATEGORIES: 'cost_categories',
  PROJECT_MAPPINGS: 'project_mappings',
  COST_TRANSACTIONS: 'cost_transactions',
  RESOURCE_CALENDARS: 'resource_calendars',
  SPRINTS: 'sprints',
  EPICS: 'epics',
  FEATURES: 'features',
  USER_STORIES: 'user_stories',
  PROJECT_DOCUMENTS: 'project_documents',
  ENGINE_LOGS: 'engine_logs',
} as const;

export type TableName = typeof TABLES[keyof typeof TABLES];

/**
 * Map from app data keys to Supabase table names
 */
export const DATA_KEY_TO_TABLE: Record<string, TableName> = {
  employees: TABLES.EMPLOYEES,
  portfolios: TABLES.PORTFOLIOS,
  customers: TABLES.CUSTOMERS,
  sites: TABLES.SITES,
  units: TABLES.UNITS,
  projects: TABLES.PROJECTS,
  subprojects: TABLES.SUBPROJECTS,
  phases: TABLES.PHASES,
  tasks: TABLES.TASKS,
  qctasks: TABLES.QC_TASKS,
  deliverables: TABLES.DELIVERABLES,
  hours: TABLES.HOUR_ENTRIES,
  milestonesTable: TABLES.MILESTONES,
  projectHealth: TABLES.PROJECT_HEALTH,
  projectLog: TABLES.PROJECT_LOG,
  // Note: changeLog is an in-memory structure, not persisted to database
  taskDependencies: TABLES.TASK_DEPENDENCIES,
  snapshots: TABLES.SNAPSHOTS,
  visualSnapshots: TABLES.VISUAL_SNAPSHOTS,
  changeRequests: TABLES.CHANGE_REQUESTS,
  changeImpacts: TABLES.CHANGE_IMPACTS,
  taskQuantityEntries: TABLES.TASK_QUANTITY_ENTRIES,
  approvalRecords: TABLES.APPROVAL_RECORDS,
  progressClaims: TABLES.PROGRESS_CLAIMS,
  costCategories: TABLES.COST_CATEGORIES,
  projectMappings: TABLES.PROJECT_MAPPINGS,
  costTransactions: TABLES.COST_TRANSACTIONS,
  calendars: TABLES.CALENDARS,
  resourceCalendars: TABLES.RESOURCE_CALENDARS,
  sprints: TABLES.SPRINTS,
  epics: TABLES.EPICS,
  features: TABLES.FEATURES,
  userStories: TABLES.USER_STORIES,
  projectDocuments: TABLES.PROJECT_DOCUMENTS,
};

/**
 * Map from app field names to Supabase column names (snake_case)
 */
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Map from Supabase column names to app field names (camelCase)
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert object keys from camelCase to snake_case for Supabase
 */
export function toSupabaseFormat<T extends object>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = value;
  }
  return result;
}

/**
 * Convert object keys from snake_case to camelCase for app
 */
export function fromSupabaseFormat<T>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    result[camelKey] = value;
  }
  return result as T;
}

/**
 * Fetch all records from a table
 */
export async function fetchAll<T>(table: TableName): Promise<T[]> {
  if (!isSupabaseConfigured()) {
    logger.warn(`Supabase not configured. Cannot fetch from ${table}.`);
    return [];
  }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error(`Error fetching from ${table}`, error);
    return [];
  }

  // Convert from snake_case to camelCase
  return (data || []).map(row => fromSupabaseFormat<T>(row as Record<string, unknown>));
}

/**
 * Fetch all data from all tables
 */
export async function fetchAllData(): Promise<Record<string, unknown[]>> {
  if (!isSupabaseConfigured()) {
    return {};
  }

  const results: Record<string, unknown[]> = {};

  for (const [dataKey, tableName] of Object.entries(DATA_KEY_TO_TABLE)) {
    try {
      const data = await fetchAll(tableName);
      results[dataKey] = data;
    } catch (err) {
      logger.error(`Error fetching ${dataKey}`, err);
      results[dataKey] = [];
    }
  }

  return results;
}

/**
 * Insert records into a table
 */
export async function insertRecords<T extends object>(
  table: TableName,
  records: T[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  if (records.length === 0) {
    return { success: true, count: 0 };
  }

  // Convert to snake_case
  const supabaseRecords = records.map(r => toSupabaseFormat(r));

  const { data, error } = await supabase
    .from(table)
    .insert(supabaseRecords)
    .select();

  if (error) {
    logger.error(`Error inserting into ${table}`, error);
    return { success: false, count: 0, error: error.message };
  }

  return { success: true, count: data?.length || 0 };
}

/**
 * Upsert records into a table (insert or update)
 */
export async function upsertRecords<T extends object>(
  table: TableName,
  records: T[],
  onConflict: string = 'id'
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  if (records.length === 0) {
    return { success: true, count: 0 };
  }

  // Convert to snake_case
  const supabaseRecords = records.map(r => toSupabaseFormat(r));

  const { data, error } = await supabase
    .from(table)
    .upsert(supabaseRecords, { onConflict })
    .select();

  if (error) {
    const errorMeta = error as unknown as Record<string, unknown>;
    const errorPayload = {
      message: error.message,
      detail: error.details,
      hint: error.hint,
      code: error.code,
      table: errorMeta.table,
      constraint: errorMeta.constraint,
    };
    logger.error(`Error upserting into ${table}`, errorPayload);
    const errorMessage = error.message || error.details || JSON.stringify(error, Object.getOwnPropertyNames(error)) || 'Unknown error';
    return { success: false, count: 0, error: errorMessage };
  }

  return { success: true, count: data?.length || 0 };
}

/**
 * Update a single record in a table
 */
export async function updateRecord<T extends object>(
  table: TableName,
  id: string,
  updates: Partial<T>
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  // Convert to snake_case
  const supabaseUpdates = toSupabaseFormat(updates as Record<string, unknown>);

  const { error } = await supabase
    .from(table)
    .update(supabaseUpdates)
    .eq('id', id);

  if (error) {
    logger.error(`Error updating ${table}`, error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Delete records from a table
 */
export async function deleteRecords(
  table: TableName,
  ids: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, count: 0, error: 'Supabase not configured' };
  }

  if (ids.length === 0) {
    return { success: true, count: 0 };
  }

  const { error, count } = await supabase
    .from(table)
    .delete()
    .in('id', ids);

  if (error) {
    logger.error(`Error deleting from ${table}`, error);
    return { success: false, count: 0, error: error.message };
  }

  return { success: true, count: count || ids.length };
}

/**
 * Clear all records from a table
 */
export async function clearTable(
  table: TableName
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  const { error } = await supabase
    .from(table)
    .delete()
    .neq('id', ''); // Delete all records

  if (error) {
    logger.error(`Error clearing ${table}`, error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Sync local data with Supabase
 * This replaces all data in a table with the provided records
 */
export async function syncTable<T extends object>(
  dataKey: string,
  records: T[]
): Promise<{ success: boolean; count: number; error?: string }> {
  const tableName = DATA_KEY_TO_TABLE[dataKey];

  if (!tableName) {
    return { success: false, count: 0, error: `Unknown data key: ${dataKey}` };
  }

  if (!isSupabaseConfigured()) {
    // Return success but no actual sync (allows app to work without Supabase)
    return { success: true, count: records.length, error: 'Supabase not configured - local only' };
  }

  try {
    // Use upsert instead of clear + insert to avoid duplicate key issues
    if (records.length > 0) {
      return await upsertRecords(tableName, records, 'id');
    }

    return { success: true, count: 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, count: 0, error: message };
  }
}

/**
 * Sync multiple tables with Supabase
 */
export async function syncAllData(
  data: Record<string, unknown[]>
): Promise<{ success: boolean; errors: string[] }> {
  if (!isSupabaseConfigured()) {
    return { success: true, errors: ['Supabase not configured - local only'] };
  }

  const errors: string[] = [];

  for (const [dataKey, records] of Object.entries(data)) {
    if (!DATA_KEY_TO_TABLE[dataKey]) continue;

    const result = await syncTable(dataKey, records as Record<string, unknown>[]);
    if (!result.success && result.error) {
      errors.push(`${dataKey}: ${result.error}`);
    }
  }

  return { success: errors.length === 0, errors };
}

// ============================================================================
// CONNECTION STATUS
// ============================================================================

/**
 * Database connection status
 */
export type ConnectionStatus = 'connected' | 'degraded' | 'disconnected';

/**
 * Connection check result
 */
export interface ConnectionCheckResult {
  status: ConnectionStatus;
  latency: number | null;  // in ms
  lastChecked: string;
  error: string | null;
  details: {
    supabaseConfigured: boolean;
    authStatus: 'authenticated' | 'anonymous' | 'error';
    databaseReachable: boolean;
  };
}

/**
 * Check database connection status
 * Tests PostgreSQL (primary) or Supabase (fallback)
 */
export async function checkConnectionStatus(): Promise<ConnectionCheckResult> {
  const startTime = Date.now();
  const result: ConnectionCheckResult = {
    status: 'disconnected',
    latency: null,
    lastChecked: new Date().toISOString(),
    error: null,
    details: {
      supabaseConfigured: isPostgresEnvConfigured || isSupabaseEnvConfigured,
      authStatus: 'anonymous',
      databaseReachable: false,
    },
  };

  if (!isSupabaseConfigured()) {
    result.error = 'No database configured (set DATABASE_URL or NEXT_PUBLIC_SUPABASE_URL)';
    return result;
  }

  try {
    // PostgreSQL check (server-side)
    if (isPostgresEnvConfigured && typeof window === 'undefined') {
      try {
        const { getPool } = await import('./postgres');
        const pool = getPool();
        if (pool) {
          const client = await pool.connect();
          try {
            await client.query('SELECT 1');
            result.details.databaseReachable = true;
            result.status = 'connected';
            result.details.authStatus = 'anonymous'; // PostgreSQL doesn't use Supabase auth
          } finally {
            client.release();
          }
        }
      } catch (pgErr: unknown) {
        result.error = `PostgreSQL: ${pgErr instanceof Error ? pgErr.message : 'Unknown error'}`;
        result.status = 'degraded';
      }
    } else if (isSupabaseEnvConfigured) {
      // Supabase fallback
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError) {
        result.details.authStatus = 'error';
      } else if (session) {
        result.details.authStatus = 'authenticated';
      } else {
        result.details.authStatus = 'anonymous';
      }

      const { error: dbError } = await supabase.from('employees').select('id').limit(1);
      if (dbError) {
        if (dbError.code === '42P01' || dbError.message.includes('does not exist')) {
          result.details.databaseReachable = true;
          result.status = 'connected';
        } else {
          result.error = `Database: ${dbError.message}`;
          result.status = 'degraded';
        }
      } else {
        result.details.databaseReachable = true;
        result.status = 'connected';
      }
    }

    result.latency = Date.now() - startTime;
  } catch (err) {
    result.latency = Date.now() - startTime;
    result.error = err instanceof Error ? err.message : 'Unknown connection error';
    result.status = 'disconnected';
  }

  return result;
}
