/**
 * @fileoverview Supabase Client Configuration
 * 
 * This module provides the Supabase client for database operations and authentication.
 * IMPORTANT: This client should ONLY be imported by:
 * - app/project-controls/data-management/page.tsx (for data persistence)
 * - app/login/page.tsx (for authentication)
 * - lib/user-context.tsx (for auth state management)
 * 
 * All other application pages should use the Data Context (useData hook) instead.
 * 
 * @module lib/supabase
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

/**
 * Create a mock Supabase client for when env vars are not configured
 * This prevents build errors while allowing the app to function without a database
 */
function createMockSupabaseClient(): SupabaseClient {
  const mockResponse = { data: null, error: { message: 'Supabase not configured' } };
  const mockAuth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithPassword: async () => mockResponse,
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
  };

  const mockFrom = () => ({
    select: () => ({
      limit: () => Promise.resolve(mockResponse),
      order: () => Promise.resolve(mockResponse),
      eq: () => Promise.resolve(mockResponse),
      single: () => Promise.resolve(mockResponse),
    }),
    insert: () => ({ select: () => Promise.resolve(mockResponse) }),
    update: () => ({ eq: () => Promise.resolve(mockResponse) }),
    upsert: () => ({ select: () => Promise.resolve(mockResponse) }),
    delete: () => ({
      eq: () => Promise.resolve(mockResponse),
      neq: () => Promise.resolve(mockResponse),
      in: () => Promise.resolve(mockResponse),
    }),
  });

  return {
    auth: mockAuth,
    from: mockFrom,
  } as unknown as SupabaseClient;
}

// Environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Check if Supabase is configured
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Log warning if not configured (only once)
if (typeof window === 'undefined' && !isConfigured) {
  logger.warn(
    'Supabase environment variables not set. Database features will be unavailable. ' +
    'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.'
  );
}

/**
 * Supabase client instance
 * Use this for all database operations and authentication
 * Returns a mock client if env vars are not configured
 */
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })
  : createMockSupabaseClient();

/**
 * Check if Supabase is properly configured
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
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
    const errorPayload = {
      message: error.message,
      detail: error.details,
      hint: error.hint,
      code: error.code,
      table: (error as any).table,
      constraint: (error as any).constraint,
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
 * Tests:
 * 1. Supabase configuration
 * 2. Auth status
 * 3. Database reachability (simple query)
 */
export async function checkConnectionStatus(): Promise<ConnectionCheckResult> {
  const startTime = Date.now();
  const result: ConnectionCheckResult = {
    status: 'disconnected',
    latency: null,
    lastChecked: new Date().toISOString(),
    error: null,
    details: {
      supabaseConfigured: false,
      authStatus: 'error',
      databaseReachable: false,
    },
  };

  // Check 1: Is Supabase configured?
  if (!isSupabaseConfigured()) {
    result.error = 'Supabase environment variables not configured';
    result.details.supabaseConfigured = false;
    return result;
  }
  result.details.supabaseConfigured = true;

  try {
    // Check 2: Auth status
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError) {
      result.details.authStatus = 'error';
      result.error = `Auth error: ${authError.message}`;
    } else if (session) {
      result.details.authStatus = 'authenticated';
    } else {
      result.details.authStatus = 'anonymous';
    }

    // Check 3: Database reachability (simple query)
    // Try to query a simple table or use a health check endpoint
    const { error: dbError } = await supabase
      .from('employees')
      .select('id')
      .limit(1);

    if (dbError) {
      // Check if it's a "table doesn't exist" error (which means DB is reachable)
      if (dbError.code === '42P01' || dbError.message.includes('does not exist')) {
        result.details.databaseReachable = true;
        result.status = 'connected';
      } else {
        result.details.databaseReachable = false;
        result.error = `Database error: ${dbError.message}`;
        result.status = 'degraded';
      }
    } else {
      result.details.databaseReachable = true;
      result.status = 'connected';
    }

    result.latency = Date.now() - startTime;

    // Determine final status
    if (result.details.databaseReachable && result.details.supabaseConfigured) {
      if (result.details.authStatus === 'error') {
        result.status = 'degraded';
      } else {
        result.status = 'connected';
      }
    } else if (result.details.supabaseConfigured) {
      result.status = 'degraded';
    } else {
      result.status = 'disconnected';
    }

  } catch (err) {
    result.latency = Date.now() - startTime;
    result.error = err instanceof Error ? err.message : 'Unknown connection error';
    result.status = 'disconnected';
  }

  return result;
}
