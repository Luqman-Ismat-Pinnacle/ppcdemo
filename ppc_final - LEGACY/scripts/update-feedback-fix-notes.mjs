#!/usr/bin/env node
/**
 * Update feedback_items with specific fix notes for items that were fixed in code.
 * Run after implementing fixes. Usage: DATABASE_URL='...' node scripts/update-feedback-fix-notes.mjs
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || process.env.AZURE_POSTGRES_CONNECTION_STRING;
if (!DATABASE_URL) {
  console.error('Set DATABASE_URL');
  process.exit(1);
}

const FIX_NOTES = {
  19: 'Fixed: Guarded totalHours with asNumber(lifecycle?.totalHours ?? 0).toFixed(1) on /insights/tasks to prevent runtime error.',
  24: 'Fixed: Same as #19 – numeric guards for task lifecycle display.',
  26: 'Fixed: Milestone risk now flagged when beyond baseline date. buildMilestones sets varianceDays when planned date is past with no actual; status set to At Risk.',
  27: 'WBS Unit/Phase: WBS is built from wbsData; ensure MPP/plan includes unit and phase hierarchy when loading.',
  28: 'Fixed: Resource heatmap uses roles from project plan (assignedResource) instead of employee names.',
  31: 'Fixed: Sprint view uses (Number(group.totalHours) || 0).toFixed(0) to prevent totalHours.toFixed runtime error.',
  33: 'Fixed: WBS Gantt column already renamed Work → Total Hrs.',
  34: 'Eff% in WBS is already hours-based: efficiency = (actualHours/baselineHours)*100.',
  36: 'TF column shows Total Float from CPM when Run CPM is on; otherwise from task totalFloat.',
  37: 'Fixed: Added CPI column to WBS Gantt (EV/AC = baselineCost * percentComplete/100 / actualCost).',
  38: 'Fixed: Day filter changed to Week on WBS Gantt timeline.',
  39: 'Heatmap uses filteredData.tasks; global date filter in app applies to filteredData. Ensure date filter is set in header.',
  42: 'Fixed: Same as #31 – null-safe totalHours on sprint view.',
  43: 'Runtime error (eO before init): Likely minified variable order; if it recurs, check useCallback/useMemo order in wbs-gantt-v2.',
  44: 'Fixed: Sprint view totalHours coerced with Number() to prevent toFixed runtime error.',
};

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const client = await pool.connect();
  try {
    for (const [id, note] of Object.entries(FIX_NOTES)) {
      const existing = await client.query('SELECT notes FROM feedback_items WHERE id = $1', [id]);
      if (existing.rows.length === 0) continue;
      const prev = existing.rows[0].notes || '';
      const newNotes = prev ? `${prev}\n${note}` : note;
      await client.query('UPDATE feedback_items SET notes = $1, updated_at = NOW() WHERE id = $2', [newNotes, id]);
      console.log(`Updated #${id}`);
    }
    console.log('Done.');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
