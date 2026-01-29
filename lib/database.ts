/**
 * @fileoverview Database Client Configuration
 * 
 * This module provides a unified database client that works with:
 * - Supabase (primary for development/testing)
 * - PostgreSQL (commented out for now; retained for production switch)
 * - Mock client (when no database is configured)
 * 
 * @module lib/database
 */

// import { Pool, PoolClient } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { fromSupabaseFormat } from './supabase';

// Database configuration
// const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Database type
type DatabaseType = 'supabase' | 'mock';
// type DatabaseType = 'postgresql' | 'supabase' | 'mock';

let dbType: DatabaseType = 'mock';
// let pgPool: Pool | null = null;
let supabaseClient: SupabaseClient | null = null;

// Initialize database connection
// PostgreSQL connection (commented out - use Supabase for now)
// if (DATABASE_URL) {
//   dbType = 'postgresql';
//   pgPool = new Pool({
//     connectionString: DATABASE_URL,
//     ssl: { rejectUnauthorized: false },
//     max: 10,
//     idleTimeoutMillis: 30000,
//     connectionTimeoutMillis: 10000,
//   });
// } else if (SUPABASE_URL && SUPABASE_ANON_KEY) {
//   dbType = 'supabase';
//   supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// }

// Supabase connection (enabled)
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
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
  // if (dbType === 'postgresql' && pgPool) {
  //   return await fetchFromPostgreSQL();
  // }
  if (dbType === 'supabase' && supabaseClient) {
    return await fetchFromSupabase();
  }
  return null;
}

// ============================================================================
// POSTGRESQL CONNECTION CODE (COMMENTED OUT - FOR FUTURE USE)
// ============================================================================
// This section contains PostgreSQL connection code that can be enabled
// when switching from Supabase to direct PostgreSQL connection
// ============================================================================

/**
 * Fetch data from Azure PostgreSQL (disabled while testing in Supabase)
 */
// async function fetchFromPostgreSQL() {
//   const client = await pgPool!.connect();
//   try {
//     const result = await Promise.all([
//       client.query('SELECT * FROM portfolios ORDER BY name'),
//       client.query('SELECT * FROM customers ORDER BY name'),
//       client.query('SELECT * FROM sites ORDER BY name'),
//       client.query('SELECT * FROM units ORDER BY name'),
//       client.query('SELECT * FROM projects ORDER BY name'),
//       client.query('SELECT * FROM subprojects ORDER BY name'),
//       client.query('SELECT * FROM phases ORDER BY name'),
//       client.query('SELECT * FROM tasks ORDER BY name'),
//       client.query('SELECT * FROM qc_tasks ORDER BY name'),
//       client.query('SELECT * FROM employees ORDER BY name'),
//       client.query('SELECT * FROM hour_entries ORDER BY date'),
//       client.query('SELECT * FROM milestones ORDER BY planned_date'),
//       client.query('SELECT * FROM deliverables ORDER BY name'),
//       client.query('SELECT * FROM sprints ORDER BY start_date'),
//       client.query('SELECT * FROM sprint_tasks'),
//       client.query('SELECT * FROM epics ORDER BY name'),
//       client.query('SELECT * FROM features ORDER BY name'),
//       client.query('SELECT * FROM user_stories ORDER BY name'),
//       client.query('SELECT * FROM forecasts ORDER BY forecast_date DESC'),
//       client.query('SELECT * FROM snapshots ORDER BY snapshot_date DESC'),
//       client.query('SELECT * FROM change_requests ORDER BY submitted_at DESC'),
//       client.query('SELECT * FROM change_impacts'),
//       client.query('SELECT * FROM project_health ORDER BY updated_at DESC'),
//       client.query('SELECT * FROM project_log ORDER BY entry_date DESC'),
//       client.query('SELECT * FROM project_documents ORDER BY uploaded_at DESC'),
//       client.query('SELECT * FROM task_quantity_entries ORDER BY date'),
//     ]);

//     return {
//       portfolios: result[0].rows,
//       customers: result[1].rows,
//       sites: result[2].rows,
//       units: result[3].rows,
//       projects: result[4].rows,
//       subprojects: result[5].rows,
//       phases: result[6].rows,
//       tasks: result[7].rows,
//       qctasks: result[8].rows,
//       employees: result[9].rows,
//       hours: result[10].rows,
//       milestones: result[11].rows,
//       deliverables: result[12].rows,
//       sprints: result[13].rows,
//       sprintTasks: result[14].rows,
//       epics: result[15].rows,
//       features: result[16].rows,
//       userStories: result[17].rows,
//       forecasts: result[18].rows,
//       snapshots: result[19].rows,
//       changeRequests: result[20].rows,
//       changeImpacts: result[21].rows,
//       projectHealth: result[22].rows,
//       projectLog: result[23].rows,
//       projectDocuments: result[24].rows,
//       taskDependencies: result[25].rows,
//       taskQuantityEntries: result[26].rows,
//     };
//   } finally {
//     client.release();
//   }
// }

/**
 * Convert snake_case array to camelCase array
 */
function convertArrayToCamelCase<T>(arr: any[]): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => fromSupabaseFormat<T>(item));
}

async function fetchFromSupabase() {
  // Load hierarchy_nodes if available (new consolidated table), otherwise fall back to separate tables
  let hierarchyNodes: { data: any[] | null } = { data: null };
  let workItems: { data: any[] | null } = { data: null };

  try {
    const hierarchyResult = await supabaseClient!.from('hierarchy_nodes').select('*').order('name');
    hierarchyNodes = { data: hierarchyResult.data || null };
  } catch {
    hierarchyNodes = { data: null };
  }

  try {
    const workItemsResult = await supabaseClient!.from('work_items').select('*').order('name');
    workItems = { data: workItemsResult.data || null };
  } catch {
    workItems = { data: null };
  }

  // IMPORTANT: The destructuring order MUST match the Promise.all query order!
  const [
    portfolios,        // 0: portfolios
    customers,         // 1: customers
    sites,             // 2: sites
    units,             // 3: units
    projects,          // 4: projects
    subprojects,       // 5: subprojects
    phases,            // 6: phases
    tasks,             // 7: tasks
    qcTasks,           // 8: qc_tasks
    employees,         // 9: employees
    hourEntries,       // 10: hour_entries
    milestones,        // 11: milestones
    deliverables,      // 12: deliverables
    sprints,           // 13: sprints
    sprintTasks,       // 14: sprint_tasks
    epics,             // 15: epics
    features,          // 16: features
    userStories,       // 17: user_stories
    forecasts,         // 18: forecasts
    snapshots,         // 19: snapshots
    changeRequests,    // 20: change_requests
    changeImpacts,     // 21: change_impacts
    projectHealth,     // 22: project_health
    projectLog,        // 23: project_log
    projectDocuments,  // 24: project_documents
    taskDependencies,  // 25: task_dependencies
    taskQuantityEntries, // 26: task_quantity_entries
    visualSnapshots,    // 27: visual_snapshots
  ] = await Promise.all([
    supabaseClient!.from('portfolios').select('*').order('name'),           // 0
    supabaseClient!.from('customers').select('*').order('name'),            // 1
    supabaseClient!.from('sites').select('*').order('name'),                // 2
    supabaseClient!.from('units').select('*').order('name'),                // 3
    supabaseClient!.from('projects').select('*').order('name'),             // 4
    supabaseClient!.from('subprojects').select('*').order('name'),          // 5
    supabaseClient!.from('phases').select('*').order('name'),               // 6
    supabaseClient!.from('tasks').select('*').order('name'),                // 7
    supabaseClient!.from('qc_tasks').select('*').order('name'),             // 8 - FIXED: was task_dependencies
    supabaseClient!.from('employees').select('*').order('name'),            // 9 - FIXED: was qc_tasks
    supabaseClient!.from('hour_entries').select('*').order('date'),         // 10 - FIXED: was employees
    supabaseClient!.from('milestones').select('*').order('planned_date'),   // 11 - FIXED: was hour_entries
    supabaseClient!.from('deliverables').select('*').order('name'),         // 12
    supabaseClient!.from('sprints').select('*').order('start_date'),        // 13
    supabaseClient!.from('sprint_tasks').select('*'),                       // 14
    supabaseClient!.from('epics').select('*').order('name'),                // 15
    supabaseClient!.from('features').select('*').order('name'),             // 16
    supabaseClient!.from('user_stories').select('*').order('name'),         // 17
    supabaseClient!.from('forecasts').select('*').order('forecast_date', { ascending: false }),   // 18
    supabaseClient!.from('snapshots').select('*').order('snapshot_date', { ascending: false }),   // 19
    supabaseClient!.from('change_requests').select('*').order('submitted_at', { ascending: false }), // 20
    supabaseClient!.from('change_impacts').select('*'),                     // 21
    supabaseClient!.from('project_health').select('*').order('updated_at', { ascending: false }), // 22
    supabaseClient!.from('project_log').select('*').order('entry_date', { ascending: false }),    // 23
    supabaseClient!.from('project_documents').select('*').order('uploaded_at', { ascending: false }), // 24
    supabaseClient!.from('task_dependencies').select('*'),                  // 25 - Moved to end
    supabaseClient!.from('task_quantity_entries').select('*').order('date'), // 26
    supabaseClient!.from('visual_snapshots').select('*').order('snapshot_date', { ascending: false }), // 27
  ]);

  // Use hierarchy_nodes if available, otherwise use separate tables (backward compatibility)
  // DISABLED: We are using separate tables now.
  const hasHierarchyNodes = false; // hierarchyNodes?.data && hierarchyNodes.data.length > 0;
  const hasWorkItems = workItems?.data && workItems.data.length > 0;

  // Extract hierarchy levels from hierarchy_nodes if available
  let extractedPortfolios = portfolios.data || [];
  let extractedCustomers = customers.data || [];
  let extractedSites = sites.data || [];
  let extractedUnits = units.data || [];

  /*
    if (hasHierarchyNodes && hierarchyNodes.data) {
      const nodes = hierarchyNodes.data;
      extractedPortfolios = nodes.filter((n: any) => n.node_type === 'portfolio');
      extractedCustomers = nodes.filter((n: any) => n.node_type === 'customer');
      extractedSites = nodes.filter((n: any) => n.node_type === 'site');
      extractedUnits = nodes.filter((n: any) => n.node_type === 'unit');
    }
  */

  // Extract work items if available
  let extractedEpics = epics.data || [];
  let extractedFeatures = features.data || [];
  let extractedUserStories = userStories.data || [];

  if (hasWorkItems && workItems.data) {
    const items = workItems.data;
    extractedEpics = items.filter((i: any) => i.work_item_type === 'epic');
    extractedFeatures = items.filter((i: any) => i.work_item_type === 'feature');
    extractedUserStories = items.filter((i: any) => i.work_item_type === 'user_story');
  }

  // Convert all data from snake_case to camelCase for frontend
  return {
    hierarchyNodes: hasHierarchyNodes && hierarchyNodes.data ? convertArrayToCamelCase(hierarchyNodes.data) : [],
    workItems: hasWorkItems && workItems.data ? convertArrayToCamelCase(workItems.data) : [],
    portfolios: convertArrayToCamelCase(extractedPortfolios),
    customers: convertArrayToCamelCase(extractedCustomers),
    sites: convertArrayToCamelCase(extractedSites),
    units: convertArrayToCamelCase(extractedUnits),
    projects: convertArrayToCamelCase((projects.data || []) as any[]),
    subprojects: convertArrayToCamelCase((subprojects.data || []) as any[]),
    phases: convertArrayToCamelCase(phases.data || []),
    tasks: convertArrayToCamelCase(tasks.data || []),
    qctasks: convertArrayToCamelCase(qcTasks.data || []),
    employees: convertArrayToCamelCase(employees.data || []),
    hours: convertArrayToCamelCase(hourEntries.data || []),
    milestones: convertArrayToCamelCase(milestones.data || []),
    deliverables: convertArrayToCamelCase(deliverables.data || []),
    sprints: convertArrayToCamelCase(sprints.data || []),
    sprintTasks: convertArrayToCamelCase(sprintTasks.data || []),
    epics: convertArrayToCamelCase(extractedEpics),
    features: convertArrayToCamelCase(extractedFeatures),
    userStories: convertArrayToCamelCase(extractedUserStories),
    forecasts: convertArrayToCamelCase(forecasts.data || []),
    snapshots: convertArrayToCamelCase(snapshots.data || []),
    visualSnapshots: convertArrayToCamelCase(visualSnapshots.data || []),
    changeRequests: convertArrayToCamelCase(changeRequests.data || []),
    changeImpacts: convertArrayToCamelCase(changeImpacts.data || []),
    projectHealth: convertArrayToCamelCase(projectHealth.data || []),
    projectLog: convertArrayToCamelCase(projectLog.data || []),
    projectDocuments: convertArrayToCamelCase(projectDocuments.data || []),
    taskDependencies: convertArrayToCamelCase(taskDependencies.data || []),
    taskQuantityEntries: convertArrayToCamelCase(taskQuantityEntries.data || []),
  };
}

/**
 * Save data to database
 */
export async function saveData(table: string, data: Record<string, unknown>[]) {
  // if (dbType === 'postgresql' && pgPool) {
  //   return await saveToPostgreSQL(table, data);
  // }
  if (dbType === 'supabase' && supabaseClient) {
    return await saveToSupabase(table, data);
  }
  return { success: false, error: 'No database configured' };
}

/**
 * Save data to Supabase
 */
async function saveToSupabase(table: string, data: Record<string, unknown>[]) {
  if (!supabaseClient) {
    return { success: false, error: 'Supabase client not initialized' };
  }

  try {
    const { error } = await supabaseClient.from(table).insert(data);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
