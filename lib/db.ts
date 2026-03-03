import { Pool } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_CONNECTION_STRING ||
      process.env.AZURE_POSTGRES_CONNECTION_STRING;
    if (!connectionString) throw new Error('DATABASE_URL (or POSTGRES_CONNECTION_STRING) not set');
    const parsedMax = Number(process.env.DB_POOL_MAX || process.env.PGPOOL_MAX || '4');
    const poolMax = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.floor(parsedMax) : 4;
    pool = new Pool({ connectionString, max: poolMax, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
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
  try {
    await getPool().query('SELECT refresh_rollups_dbside()');
  } catch {
    await getPool().query('SELECT refresh_rollups()');
  }
}

const VALID_TABLES = new Set([
  'employees', 'portfolios', 'customers', 'sites', 'projects',
  'units', 'phases', 'tasks', 'sub_tasks',
  'hour_entries', 'customer_contracts', 'project_documents',
  'sprints', 'sprint_tasks', 'notifications', 'workday_phases',
  'forecasts', 'forecast_phase_lines',
  'variance_notes', 'qc_logs',
  'intervention_items', 'epics', 'features',
  'feedback_items', 'integration_connections',
]);

export function isValidTable(name: string): boolean {
  return VALID_TABLES.has(name);
}

export { getPool };
