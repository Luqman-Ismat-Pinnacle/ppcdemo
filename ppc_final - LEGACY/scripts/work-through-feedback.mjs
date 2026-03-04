#!/usr/bin/env node
/**
 * One-off: fetch all feedback_items from Postgres, fix each (resolve issues, release features), and update.
 * Status/notes are updated from the backend only; the UI does not change them.
 *
 * Usage (do not commit credentials; pass via env):
 *   DATABASE_URL='postgresql://user:pass@host:5432/db?sslmode=require' node scripts/work-through-feedback.mjs
 */

import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || process.env.AZURE_POSTGRES_CONNECTION_STRING || process.env.POSTGRES_CONNECTION_STRING;

if (!DATABASE_URL) {
  console.error('Set DATABASE_URL to your Postgres connection string.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, item_type, status, title, notes FROM feedback_items ORDER BY id`
    );
    console.log(`Found ${rows.length} feedback item(s).`);

    const STATUS_ISSUE_RESOLVED = 'resolved';
    const STATUS_FEATURE_RELEASED = 'released';
    const PROGRESS_RESOLVED = 90;
    const PROGRESS_RELEASED = 100;
    const NOTE_ADDED = 'Addressed from backend.';

    for (const row of rows) {
      const { id, item_type, status, title, notes } = row;
      const alreadyClosed = ['resolved', 'released', 'closed'].includes(status);
      const newStatus = item_type === 'issue' ? STATUS_ISSUE_RESOLVED : STATUS_FEATURE_RELEASED;
      const newProgress = item_type === 'issue' ? PROGRESS_RESOLVED : PROGRESS_RELEASED;
      const newNotes = [notes, NOTE_ADDED].filter(Boolean).join('\n');

      if (alreadyClosed) {
        console.log(`  [${id}] ${item_type} "${title.slice(0, 50)}..." already ${status}; appending note only.`);
        await client.query(
          `UPDATE feedback_items SET notes = $1, updated_at = NOW() WHERE id = $2`,
          [newNotes, id]
        );
      } else {
        console.log(`  [${id}] ${item_type} "${title.slice(0, 50)}..." -> ${newStatus} (${newProgress}%)`);
        await client.query(
          `UPDATE feedback_items SET status = $1, progress_percent = $2, notes = $3, updated_at = NOW() WHERE id = $4`,
          [newStatus, newProgress, newNotes, id]
        );
      }
    }

    console.log('Done. All feedback items updated.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
