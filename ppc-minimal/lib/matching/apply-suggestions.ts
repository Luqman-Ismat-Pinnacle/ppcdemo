/**
 * Apply match suggestions by updating hour_entries.
 * Supports both simple (mpp_phase_task only) and full multi-gate updates.
 */

import { execute, query } from '@/lib/db';
import type { MappingUpdate } from './phase-match';

export async function applyMapping(
  projectId: string,
  hourPhase: string,
  mppTargetId: string,
): Promise<number> {
  const count = await execute(
    `UPDATE hour_entries SET mpp_phase_task = $1, updated_at = NOW()
     WHERE project_id = $2 AND LOWER(TRIM(phase)) = LOWER(TRIM($3))`,
    [mppTargetId, projectId, hourPhase],
  );
  return count;
}

export async function bulkApply(
  projectId: string,
  mappings: Array<{ hourPhase: string; mppTargetId: string }>,
): Promise<number> {
  let total = 0;
  for (const m of mappings) {
    total += await applyMapping(projectId, m.hourPhase, m.mppTargetId);
  }
  return total;
}

/**
 * Apply multi-gate match results as a batch using a single CTE update.
 */
export async function applyMultiGateUpdates(updates: MappingUpdate[]): Promise<number> {
  if (updates.length === 0) return 0;

  const BATCH = 500;
  let total = 0;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const payload = JSON.stringify(batch);

    const result = await query<{ cnt: string }>(
      `WITH incoming AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
           id TEXT,
           workday_phase TEXT,
           mpp_phase_task TEXT
         )
       )
       UPDATE hour_entries h
          SET workday_phase = COALESCE(i.workday_phase, h.workday_phase),
              mpp_phase_task = COALESCE(i.mpp_phase_task, h.mpp_phase_task),
              updated_at = NOW()
         FROM incoming i
        WHERE h.id = i.id
        RETURNING h.id`,
      [payload],
    );
    total += result.length;
  }

  return total;
}
