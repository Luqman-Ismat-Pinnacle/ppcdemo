/**
 * @fileoverview PostgreSQL Connection Pool
 * 
 * Provides a shared connection pool for Azure PostgreSQL.
 * Used by API routes (server-side only).
 * 
 * @module lib/postgres
 */

import { Pool, types } from 'pg';

// ── Type Parsers ──────────────────────────────────────────────────────────
// By default, node-postgres (`pg`) returns NUMERIC/DECIMAL columns as strings
// to preserve arbitrary precision. Supabase's client auto-converts them to JS
// numbers. To match Supabase behavior and prevent NaN issues downstream, we
// register custom type parsers for all numeric PostgreSQL OIDs.
//
// OIDs:  20 = INT8 (bigint), 700 = FLOAT4, 701 = FLOAT8,
//        1700 = NUMERIC (decimal), 23 = INT4, 21 = INT2
types.setTypeParser(20, (val: string) => {            // INT8 / bigint
  const n = Number(val);
  return Number.isSafeInteger(n) ? n : val;           // Keep string if too large
});
types.setTypeParser(700, (val: string) => parseFloat(val));  // FLOAT4
types.setTypeParser(701, (val: string) => parseFloat(val));  // FLOAT8
types.setTypeParser(1700, (val: string) => {          // NUMERIC / decimal
  const n = parseFloat(val);
  return isFinite(n) ? n : 0;
});

const DATABASE_URL = process.env.DATABASE_URL
  || process.env.AZURE_POSTGRES_CONNECTION_STRING
  || process.env.POSTGRES_CONNECTION_STRING;

let pool: Pool | null = null;

/**
 * Get the shared PostgreSQL connection pool (lazy singleton).
 * Returns null if DATABASE_URL is not configured.
 */
export function getPool(): Pool | null {
  if (!DATABASE_URL) return null;

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL] Pool error:', err.message);
    });
  }

  return pool;
}

/**
 * Check if PostgreSQL is configured
 */
export function isPostgresConfigured(): boolean {
  return Boolean(DATABASE_URL);
}

/**
 * Execute a query using the pool
 */
export async function query(text: string, params?: any[]) {
  const p = getPool();
  if (!p) throw new Error('PostgreSQL not configured');
  return p.query(text, params);
}

/**
 * Execute multiple queries in a single client (for transactions or connection reuse)
 */
export async function withClient<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const p = getPool();
  if (!p) throw new Error('PostgreSQL not configured');
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
