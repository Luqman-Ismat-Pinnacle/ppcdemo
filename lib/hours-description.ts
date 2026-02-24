/**
 * Utilities for parsing Workday hour-entry description strings.
 *
 * Expected shape (common):
 *   <charge code> > <phase> > <task> [optional trailing date]
 */

const TRAILING_DATE_PATTERNS: RegExp[] = [
  /\s*\([^)]*\)\s*$/i,
  /\s*\d{4}-\d{1,2}-\d{1,2}\s*$/i,
  /\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i,
  /\s*\d{1,2}-\d{1,2}-\d{2,4}\s*$/i,
  /\s*\d{4}\/\d{1,2}\/\d{1,2}\s*$/i,
  /\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4}\s*$/i,
  /\s*\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{2,4}\s*$/i,
  /\s*\d{1,2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*-\d{2,4}\s*$/i,
];

export function stripDatesFromEnd(input: string): string {
  let out = (input || '').trim();
  if (!out) return '';

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TRAILING_DATE_PATTERNS) {
      const next = out.replace(pattern, '').trimEnd();
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
  }

  return out.trim();
}

export interface ParsedHourDescription {
  source: string;
  normalized: string;
  chargeCode: string;
  phases: string;
  task: string;
}

export function parseHourDescription(raw: string | null | undefined): ParsedHourDescription {
  const source = (raw || '').toString();
  const normalized = stripDatesFromEnd(source);
  const parts = normalized
    .split('>')
    .map((p) => p.trim())
    .filter(Boolean);

  const chargeCode = stripDatesFromEnd(normalized);
  const phases = parts.length >= 2 ? (parts[1] || '') : '';
  const taskRaw = parts.length >= 3 ? parts.slice(2).join(' > ') : '';
  const task = stripDatesFromEnd(taskRaw);

  return {
    source,
    normalized,
    chargeCode,
    phases,
    task,
  };
}
