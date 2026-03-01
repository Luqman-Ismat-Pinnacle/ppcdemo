import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL not set');
    pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000 });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const result = await getPool().query(sql, params);
  return result.rowCount ?? 0;
}

export async function refreshRollups(): Promise<void> {
  await getPool().query('SELECT refresh_rollups()');
}

const VALID_TABLES = new Set([
  'employees', 'portfolios', 'customers', 'sites', 'projects',
  'units', 'phases', 'tasks', 'sub_tasks',
  'hour_entries', 'customer_contracts', 'project_documents',
  'sprints', 'sprint_tasks', 'notifications', 'workday_phases',
]);

export function isValidTable(name: string): boolean {
  return VALID_TABLES.has(name);
}

export { getPool };
