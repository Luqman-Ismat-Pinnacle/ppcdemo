/**
 * Multi-gate matching engine for hour entries → workday phases / MPP tasks.
 * Ported and consolidated from scripts/match-hours-workday-mpp-buckets.mjs
 * and scripts/match-hours-to-workday-phases.mjs.
 *
 * Gates:
 *   1  hour_entries.phase → workday_phases.name  (normalized exact + fuzzy)
 *   2  hour_entries.task  → MPP task/phase name   (hierarchy-aware fuzzy)
 *   3  MPP task/phase     → workday phase bucket  (reverse alignment)
 *   4  Bucket-constrained fill for missed entries
 *   5  Learned project-local text reuse from already-mapped entries
 */

const MIN_SCORE_STRICT = 0.72;
const MIN_SCORE_FUZZY = 0.78;
const MIN_UNIQUENESS_GAP = 0.04;

const SHORT_CODE_ALIAS: Record<string, string> = {
  itm: 'internal team meetings',
  gps: 'general project support',
  pri: 'project reporting invoicing',
  sch: 'project schedule resource management',
  tex: 'technical excellence',
  nbill: 'non billable time',
};

export function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalize(v: string): string {
  let text = normalize(v);
  if (!text) return '';
  text = text
    .replace(/\b\d{3,6}\b/g, ' ')
    .replace(/\b(mnc|plan|nbill|tm)\b/g, ' ')
    .replace(/\b[a-z]{1,4}\.\w+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [code, alias] of Object.entries(SHORT_CODE_ALIAS)) {
    if (new RegExp(`\\b${code}\\b`).test(text)) {
      text = `${text} ${alias}`.trim();
    }
  }
  return normalize(text);
}

export function tokenize(text: string): Set<string> {
  return new Set(canonicalize(text).split(' ').filter(Boolean));
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function editSimilarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}

/**
 * Combined similarity: Jaccard + coverage weighting (matching main app logic).
 */
export function similarity(a: string, b: string): number {
  const aa = canonicalize(a), bb = canonicalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) {
    return Math.max(0.9, Math.min(aa.length, bb.length) / Math.max(aa.length, bb.length));
  }
  const at = tokenize(aa), bt = tokenize(bb);
  if (!at.size || !bt.size) return 0;
  let inter = 0;
  for (const t of at) if (bt.has(t)) inter++;
  const union = at.size + bt.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  const cover = Math.max(inter / at.size, inter / bt.size);
  return jaccard * 0.7 + cover * 0.3;
}

export interface Candidate {
  id: string;
  name: string;
  normName?: string;
  [key: string]: unknown;
}

interface ChooseBestResult {
  candidate?: Candidate;
  score: number;
  secondScore: number;
  ambiguous: boolean;
}

export function chooseBest(
  text: string,
  candidates: Candidate[],
  minScore = MIN_SCORE_FUZZY,
  minGap = MIN_UNIQUENESS_GAP,
): ChooseBestResult | null {
  const target = canonicalize(text);
  if (!target) return null;
  let best: Candidate | null = null;
  let bestScore = 0;
  let secondBestScore = 0;
  for (const c of candidates) {
    const name = c.normName || canonicalize(c.name);
    if (!name) continue;
    const score = similarity(target, name);
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      best = c;
      if (score >= 0.999) break;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }
  if (!best || bestScore < minScore) return null;
  if (bestScore < 0.999 && bestScore - secondBestScore < minGap) {
    return { ambiguous: true, score: bestScore, secondScore: secondBestScore };
  }
  return { candidate: best, score: bestScore, secondScore: secondBestScore, ambiguous: false };
}

/* ========================================================================
   Original simple suggestMappings (kept for backward compat with UI)
   ======================================================================== */

export interface MatchSuggestion {
  hourPhase: string;
  mppTarget: string;
  mppTargetId: string;
  confidence: number;
  method: 'exact' | 'jaccard' | 'edit' | 'similarity';
}

export function suggestMappings(
  hourPhases: string[],
  mppItems: { id: string; name: string }[],
  threshold = 0.4,
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = [];
  const mppNorm = mppItems.map(item => ({
    ...item,
    norm: normalize(item.name),
    tokens: tokenize(item.name),
    normName: canonicalize(item.name),
  }));

  for (const phase of hourPhases) {
    const norm = normalize(phase);
    if (!norm) continue;

    let best: MatchSuggestion | null = null;

    for (const mpp of mppNorm) {
      if (norm === mpp.norm) {
        best = { hourPhase: phase, mppTarget: mpp.name, mppTargetId: mpp.id, confidence: 1.0, method: 'exact' };
        break;
      }
      const sim = similarity(phase, mpp.name);
      if (sim >= threshold && (!best || sim > best.confidence)) {
        best = {
          hourPhase: phase,
          mppTarget: mpp.name,
          mppTargetId: mpp.id,
          confidence: Math.round(sim * 100) / 100,
          method: 'similarity',
        };
      }
    }
    if (best) suggestions.push(best);
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

/* ========================================================================
   Multi-gate auto-match (server-side batch processing)
   ======================================================================== */

export interface HourEntry {
  id: string;
  project_id: string;
  phase: string;
  task: string;
  description: string;
  workday_phase?: string;
  mpp_phase_task?: string;
}

export interface WorkdayPhase {
  id: string;
  project_id: string;
  name: string;
  unit?: string;
}

export interface MppPhase {
  id: string;
  project_id: string;
  unit_id?: string;
  name: string;
}

export interface MppTask {
  id: string;
  project_id: string;
  phase_id?: string;
  unit_id?: string;
  name: string;
}

export interface GateStats {
  total: number;
  gate1_phase_to_workday: number;
  gate2_hour_to_mpp: number;
  gate3_mpp_to_workday: number;
  gate4_bucket_fill: number;
  gate5_learned_reuse: number;
  skipped_ambiguous: number;
  mapped_before: number;
  mapped_after: number;
}

export interface MappingUpdate {
  id: string;
  workday_phase: string | null;
  mpp_phase_task: string | null;
}

function deriveTaskFromDescription(desc: string): string {
  const text = String(desc || '');
  if (!text.includes('>')) return '';
  const parts = text.split('>').map(p => p.trim()).filter(Boolean);
  return parts.length >= 3 ? parts[2] : parts[parts.length - 1] || '';
}

function extractTaskSuffix(v: string): string {
  const text = String(v || '').trim();
  if (!text) return '';
  if (text.includes(' - ')) return canonicalize(text.split(' - ').slice(1).join(' - '));
  if (text.includes('_')) return canonicalize(text.split('_').slice(-1)[0]);
  return '';
}

function pushMapValue(map: Map<string, Set<string>>, key: string, value: string) {
  if (!value) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key)!.add(value);
}

function uniqueValue(map: Map<string, Set<string>>, key: string): string | null {
  const vals = map.get(key);
  if (!vals || vals.size !== 1) return null;
  return [...vals][0] || null;
}

/**
 * Run multi-gate matching across all hour entries for given data.
 * Returns the list of updates to apply and statistics.
 */
export function runMultiGateMatch(
  hours: HourEntry[],
  workdayPhases: WorkdayPhase[],
  mppPhases: MppPhase[],
  mppTasks: MppTask[],
): { updates: MappingUpdate[]; stats: GateStats } {
  const stats: GateStats = {
    total: hours.length,
    gate1_phase_to_workday: 0,
    gate2_hour_to_mpp: 0,
    gate3_mpp_to_workday: 0,
    gate4_bucket_fill: 0,
    gate5_learned_reuse: 0,
    skipped_ambiguous: 0,
    mapped_before: 0,
    mapped_after: 0,
  };

  const wpByProject = new Map<string, Candidate[]>();
  for (const wp of workdayPhases) {
    const pid = wp.project_id;
    if (!wpByProject.has(pid)) wpByProject.set(pid, []);
    wpByProject.get(pid)!.push({ id: wp.id, name: wp.name, normName: canonicalize(wp.name) });
  }

  const tasksByProject = new Map<string, Candidate[]>();
  const phasesByProject = new Map<string, Candidate[]>();
  const phaseById = new Map<string, MppPhase>();

  for (const p of mppPhases) {
    phaseById.set(p.id, p);
    if (!phasesByProject.has(p.project_id)) phasesByProject.set(p.project_id, []);
    phasesByProject.get(p.project_id)!.push({ id: p.id, name: p.name, normName: canonicalize(p.name) });
  }
  for (const t of mppTasks) {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id)!.push({
      id: t.id, name: t.name, normName: canonicalize(t.name),
      phaseId: t.phase_id, unitId: t.unit_id,
    });
  }

  const learnedWdByPhase = new Map<string, Map<string, Set<string>>>();
  const learnedMppByTask = new Map<string, Map<string, Set<string>>>();
  for (const h of hours) {
    const pid = h.project_id;
    if (!learnedWdByPhase.has(pid)) learnedWdByPhase.set(pid, new Map());
    if (!learnedMppByTask.has(pid)) learnedMppByTask.set(pid, new Map());
    const phaseKey = canonicalize(h.phase);
    const taskKey = canonicalize(h.task || deriveTaskFromDescription(h.description));
    if (phaseKey && h.workday_phase) pushMapValue(learnedWdByPhase.get(pid)!, phaseKey, h.workday_phase);
    if (taskKey && h.mpp_phase_task) pushMapValue(learnedMppByTask.get(pid)!, taskKey, h.mpp_phase_task);
  }

  const updates: MappingUpdate[] = [];

  for (const h of hours) {
    const pid = h.project_id;
    const wdCands = wpByProject.get(pid) || [];
    const taskCands = tasksByProject.get(pid) || [];
    const phaseCands = phasesByProject.get(pid) || [];

    let wd = h.workday_phase || null;
    let mpp = h.mpp_phase_task || null;

    if (wd) stats.mapped_before++;
    if (mpp) stats.mapped_before++;

    // Gate 1: phase → workday phase name
    if (!wd && wdCands.length > 0 && h.phase) {
      const exact = wdCands.find(c => canonicalize(c.name) === canonicalize(h.phase));
      if (exact) {
        wd = exact.name;
        stats.gate1_phase_to_workday++;
      } else {
        const g1 = chooseBest(h.phase, wdCands, MIN_SCORE_STRICT);
        if (g1?.candidate) {
          wd = g1.candidate.name;
          stats.gate1_phase_to_workday++;
        }
      }
    }

    // Gate 2: task text → MPP task/phase (hierarchy-aware)
    if (!mpp) {
      const preferText = h.task || deriveTaskFromDescription(h.description) || h.phase;
      if (preferText) {
        const primary = taskCands.length > 0 ? taskCands : phaseCands;
        const fallback = taskCands.length > 0 ? phaseCands : taskCands;
        const pBest = chooseBest(preferText, primary, MIN_SCORE_FUZZY);
        const fBest = chooseBest(preferText, fallback, MIN_SCORE_FUZZY);

        if (pBest?.candidate) {
          mpp = pBest.candidate.name;
          stats.gate2_hour_to_mpp++;
          if (!wd && wdCands.length > 0) {
            const g3 = chooseBest(pBest.candidate.name, wdCands, MIN_SCORE_STRICT);
            if (g3?.candidate) { wd = g3.candidate.name; stats.gate3_mpp_to_workday++; }
          }
        } else if (fBest?.candidate) {
          mpp = fBest.candidate.name;
          stats.gate2_hour_to_mpp++;
        } else if (pBest?.ambiguous || fBest?.ambiguous) {
          stats.skipped_ambiguous++;
        }
      }
    }

    // Gate 3: reverse — mpp label → workday phase
    if (!wd && mpp && wdCands.length > 0) {
      const g3 = chooseBest(mpp, wdCands, MIN_SCORE_FUZZY);
      if (g3?.candidate) { wd = g3.candidate.name; stats.gate3_mpp_to_workday++; }
    }

    // Gate 4: bucket-constrained fill
    if (!mpp && wd) {
      const all = [...taskCands, ...phaseCands];
      const bucketFiltered = all.filter(c => {
        const g = chooseBest(c.name, wdCands, MIN_SCORE_STRICT);
        return g?.candidate?.name === wd;
      });
      if (bucketFiltered.length > 0) {
        const finalText = h.task || h.phase || wd;
        const g4 = chooseBest(finalText, bucketFiltered, MIN_SCORE_FUZZY);
        if (g4?.candidate) { mpp = g4.candidate.name; stats.gate4_bucket_fill++; }
      }
    }

    // Gate 5: learned project-local text reuse
    if (!wd) {
      const learned = uniqueValue(learnedWdByPhase.get(pid) || new Map(), canonicalize(h.phase));
      if (learned) { wd = learned; stats.gate5_learned_reuse++; }
    }
    if (!mpp) {
      const taskKey = canonicalize(h.task || deriveTaskFromDescription(h.description));
      const taskSuffix = extractTaskSuffix(h.task);
      const learned = uniqueValue(learnedMppByTask.get(pid) || new Map(), taskKey)
        || (taskSuffix ? uniqueValue(learnedMppByTask.get(pid) || new Map(), taskSuffix) : null);
      if (learned) { mpp = learned; stats.gate5_learned_reuse++; }
    }

    if (wd) stats.mapped_after++;
    if (mpp) stats.mapped_after++;

    const changed = (wd || null) !== (h.workday_phase || null) || (mpp || null) !== (h.mpp_phase_task || null);
    if (changed) {
      updates.push({ id: h.id, workday_phase: wd, mpp_phase_task: mpp });
    }
  }

  return { updates, stats };
}
