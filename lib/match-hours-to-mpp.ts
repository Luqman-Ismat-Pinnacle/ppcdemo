/**
 * Match hour entries (Workday) to MPP task/unit names using the hour "Description" field.
 * Keyword-based: we check that the description CONTAINS (or fuzzy-contains) the task/unit
 * name's keywords, not that the entire string matches. ~5% error margin per keyword.
 */

const ERROR_MARGIN = 0.05; // 5%: keyword similarity >= 0.95 to count as "found"
const MIN_KEYWORD_SCORE = 0.95; // 95% of MPP name keywords must appear in description

/**
 * Tokenize into keywords: lowercase, split on non-word chars, drop empty and very short.
 */
function tokenize(s: string | null | undefined): string[] {
  if (s == null || typeof s !== 'string') return [];
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\W+/)
    .filter((w) => w.length >= 2); // skip single chars
}

/**
 * Levenshtein distance (edit distance) between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Similarity in [0, 1] for a single word. Used for keyword-level fuzzy match.
 */
function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

/**
 * Score how many of nameKeywords appear in descKeywords (exact or fuzzy with 5% margin).
 * Returns fraction in [0, 1]: matched keywords / total name keywords.
 */
function keywordMatchScore(descKeywords: string[], nameKeywords: string[]): number {
  if (nameKeywords.length === 0) return 0;
  const minSim = 1 - ERROR_MARGIN;
  let matched = 0;
  for (const nk of nameKeywords) {
    const found = descKeywords.some(
      (dk) => dk === nk || wordSimilarity(dk, nk) >= minSim
    );
    if (found) matched += 1;
  }
  return matched / nameKeywords.length;
}

export interface MppConvertedData {
  tasks?: Array<{ id?: string; taskId?: string; name?: string; taskName?: string; unitId?: string; unit_id?: string }>;
  units?: Array<{ id?: string; unitId?: string; name?: string }>;
}

/**
 * For each hour entry, check if hour.description (or Description) CONTAINS the keywords
 * of any MPP task/unit name. Matching is keyword-based: at least 95% of the task/unit
 * name's keywords must appear in the description (exact or fuzzy with 5% margin).
 * Assigns the matched task id (or first task under matched unit) to the hour.
 */
export function matchHoursToMppNames(
  hours: any[],
  mppData: MppConvertedData
): { hours: any[]; matchedCount: number } {
  const tasks = mppData.tasks || [];
  const units = mppData.units || [];

  // (name string -> taskId); we'll also store name -> keywords for scoring
  const nameToTaskId = new Map<string, string>();
  const nameToKeywords = new Map<string, string[]>();
  tasks.forEach((t: any) => {
    const name = (t.name ?? t.taskName ?? '').toString().trim();
    const taskId = t.id ?? t.taskId ?? '';
    if (name && taskId && !nameToTaskId.has(name)) {
      nameToTaskId.set(name, taskId);
      nameToKeywords.set(name, tokenize(name));
    }
  });
  const unitIdToFirstTaskId = new Map<string, string>();
  const unitIds = new Set(units.map((u: any) => u.id ?? u.unitId).filter(Boolean));
  tasks.forEach((t: any) => {
    const uId = t.unitId ?? t.unit_id ?? '';
    if (uId && unitIds.has(uId) && !unitIdToFirstTaskId.has(uId)) {
      unitIdToFirstTaskId.set(uId, t.id ?? t.taskId ?? '');
    }
  });
  units.forEach((u: any) => {
    const name = (u.name ?? '').toString().trim();
    const uId = u.id ?? u.unitId ?? '';
    const taskId = unitIdToFirstTaskId.get(uId);
    if (name && taskId && !nameToTaskId.has(name)) {
      nameToTaskId.set(name, taskId);
      nameToKeywords.set(name, tokenize(name));
    }
  });

  const names = Array.from(nameToTaskId.keys());
  let matchedCount = 0;

  const updatedHours = hours.map((h: any) => {
    const descRaw = h.description ?? h.Description ?? '';
    const descKeywords = tokenize(descRaw);
    if (descKeywords.length === 0) return h;

    let bestScore = 0;
    let bestTaskId: string | null = null;
    for (const name of names) {
      const nameKws = nameToKeywords.get(name) ?? [];
      if (nameKws.length === 0) continue;
      const score = keywordMatchScore(descKeywords, nameKws);
      if (score >= MIN_KEYWORD_SCORE && score > bestScore) {
        bestScore = score;
        bestTaskId = nameToTaskId.get(name) ?? null;
      }
    }
    if (bestTaskId == null) return h;

    matchedCount += 1;
    return {
      ...h,
      taskId: bestTaskId,
      task_id: bestTaskId,
    };
  });

  return { hours: updatedHours, matchedCount };
}
