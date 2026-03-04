#!/usr/bin/env node
/**
 * Fetch feedback_items that represent runtime errors (for fixing in code).
 * Outputs JSON to stdout. Usage:
 *   node --env-file=.env.local scripts/fetch-feedback-runtime-errors.mjs
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || process.env.AZURE_POSTGRES_CONNECTION_STRING || process.env.POSTGRES_CONNECTION_STRING;

if (!DATABASE_URL) {
  console.error(JSON.stringify({ error: 'Set DATABASE_URL or AZURE_POSTGRES_CONNECTION_STRING' }));
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('postgres') ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        id,
        item_type AS "itemType",
        title,
        description,
        page_path AS "pagePath",
        error_message AS "errorMessage",
        runtime_error_name AS "runtimeErrorName",
        runtime_stack AS "runtimeStack",
        status,
        source,
        created_at AS "createdAt"
      FROM feedback_items
      WHERE source = 'runtime'
         OR runtime_error_name IS NOT NULL
         OR (error_message IS NOT NULL AND error_message != '')
      ORDER BY created_at DESC
      LIMIT 100
    `);
    console.log(JSON.stringify({ count: rows.length, items: rows }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message }));
  process.exit(1);
});
