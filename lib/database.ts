/**
 * @fileoverview Database Client Configuration
 * 
 * This module provides a unified database client that works with:
 * - Azure PostgreSQL (preferred for production)
 * - Supabase (fallback/legacy)
 * - Mock client (when no database is configured)
 * 
 * @module lib/database
 */

import { Pool, PoolClient } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Database configuration
const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Database type
type DatabaseType = 'postgresql' | 'supabase' | 'mock';

let dbType: DatabaseType = 'mock';
let pgPool: Pool | null = null;
let supabaseClient: SupabaseClient | null = null;

// Initialize database connection
if (DATABASE_URL) {
  dbType = 'postgresql';
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
} else if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  dbType = 'supabase';
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
 * Fetch all data from database
 */
export async function fetchAllData() {
  if (dbType === 'postgresql' && pgPool) {
    return await fetchFromPostgreSQL();
  } else if (dbType === 'supabase' && supabaseClient) {
    return await fetchFromSupabase();
  }
  return null;
}

/**
 * Fetch data from Azure PostgreSQL
 */
async function fetchFromPostgreSQL() {
  const client = await pgPool!.connect();
  try {
    const result = await Promise.all([
      client.query('SELECT * FROM portfolios ORDER BY name'),
      client.query('SELECT * FROM customers ORDER BY name'),
      client.query('SELECT * FROM sites ORDER BY name'),
      client.query('SELECT * FROM units ORDER BY name'),
      client.query('SELECT * FROM projects ORDER BY name'),
      client.query('SELECT * FROM subprojects ORDER BY name'),
      client.query('SELECT * FROM phases ORDER BY name'),
      client.query('SELECT * FROM charge_codes ORDER BY code'),
      client.query('SELECT * FROM tasks ORDER BY name'),
      client.query('SELECT * FROM subtasks ORDER BY name'),
      client.query('SELECT * FROM qctasks ORDER BY name'),
      client.query('SELECT * FROM employees ORDER BY name'),
      client.query('SELECT * FROM hours ORDER BY date'),
      client.query('SELECT * FROM milestones ORDER BY due_date'),
      client.query('SELECT * FROM deliverables ORDER BY name'),
      client.query('SELECT * FROM deliverables_tracker ORDER BY updated_at DESC'),
      client.query('SELECT * FROM changelog ORDER BY timestamp DESC'),
    ]);

    return {
      portfolios: result[0].rows,
      customers: result[1].rows,
      sites: result[2].rows,
      units: result[3].rows,
      projects: result[4].rows,
      subprojects: result[5].rows,
      phases: result[6].rows,
      chargecodes: result[7].rows,
      tasks: result[8].rows,
      subtasks: result[9].rows,
      qctasks: result[10].rows,
      employees: result[11].rows,
      hours: result[12].rows,
      milestones: result[13].rows,
      deliverables: result[14].rows,
      deliverablesTracker: result[15].rows,
      changelog: result[16].rows,
    };
  } finally {
    client.release();
  }
}

/**
 * Fetch data from Supabase (legacy)
 */
async function fetchFromSupabase() {
  const [
    portfolios,
    customers,
    sites,
    units,
    projects,
    subprojects,
    phases,
    chargecodes,
    tasks,
    subtasks,
    qctasks,
    employees,
    hours,
    milestones,
    deliverables,
    deliverablesTracker,
    changelog,
  ] = await Promise.all([
    supabaseClient!.from('portfolios').select('*').order('name'),
    supabaseClient!.from('customers').select('*').order('name'),
    supabaseClient!.from('sites').select('*').order('name'),
    supabaseClient!.from('units').select('*').order('name'),
    supabaseClient!.from('projects').select('*').order('name'),
    supabaseClient!.from('subprojects').select('*').order('name'),
    supabaseClient!.from('phases').select('*').order('name'),
    supabaseClient!.from('chargecodes').select('*').order('code'),
    supabaseClient!.from('tasks').select('*').order('name'),
    supabaseClient!.from('subtasks').select('*').order('name'),
    supabaseClient!.from('qctasks').select('*').order('name'),
    supabaseClient!.from('employees').select('*').order('name'),
    supabaseClient!.from('hours').select('*').order('date'),
    supabaseClient!.from('milestones').select('*').order('due_date'),
    supabaseClient!.from('deliverables').select('*').order('name'),
    supabaseClient!.from('deliverables_tracker').select('*').order('updated_at', { ascending: false }),
    supabaseClient!.from('changelog').select('*').order('timestamp', { ascending: false }),
  ]);

  return {
    portfolios: portfolios.data || [],
    customers: customers.data || [],
    sites: sites.data || [],
    units: units.data || [],
    projects: projects.data || [],
    subprojects: subprojects.data || [],
    phases: phases.data || [],
    chargecodes: chargecodes.data || [],
    tasks: tasks.data || [],
    subtasks: subtasks.data || [],
    qctasks: qctasks.data || [],
    employees: employees.data || [],
    hours: hours.data || [],
    milestones: milestones.data || [],
    deliverables: deliverables.data || [],
    deliverablesTracker: deliverablesTracker.data || [],
    changelog: changelog.data || [],
  };
}

/**
 * Save data to database
 */
export async function saveData(table: string, data: any[]) {
  if (dbType === 'postgresql' && pgPool) {
    return await saveToPostgreSQL(table, data);
  } else if (dbType === 'supabase' && supabaseClient) {
    return await saveToSupabase(table, data);
  }
  throw new Error('No database configured');
}

async function saveToPostgreSQL(table: string, data: any[]) {
  const client = await pgPool!.connect();
  try {
    await client.query('BEGIN');
    
    // Delete existing data
    await client.query(`DELETE FROM ${table}`);
    
    // Insert new data
    if (data.length > 0) {
      const columns = Object.keys(data[0]);
      const values = data.map((row, i) => 
        `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(',')})`
      ).join(',');
      
      const query = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values}`;
      const params = data.flatMap(row => columns.map(col => row[col]));
      
      await client.query(query, params);
    }
    
    await client.query('COMMIT');
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function saveToSupabase(table: string, data: any[]) {
  // Delete existing
  await supabaseClient!.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  // Insert new
  if (data.length > 0) {
    const { error } = await supabaseClient!.from(table).insert(data);
    if (error) throw error;
  }
  
  return { success: true };
}

// Export for backward compatibility
export { supabaseClient as supabase };
export const isSupabaseConfigured = isDatabaseConfigured;
