export function parseFlexibleDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (value > 1e12) return new Date(value); // epoch ms
    if (value > 1e9) return new Date(value * 1000); // epoch sec
    if (value > 20000 && value < 80000) {
      // Excel serial date (days since 1899-12-30)
      return new Date(Math.round((value - 25569) * 86400 * 1000));
    }
    return null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const mppEpoch = raw.match(/^\/Date\(([-+]?\d+)\)\/$/i);
  if (mppEpoch) {
    const ms = Number(mppEpoch[1]);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    return parseFlexibleDate(n);
  }

  const isoDate = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoDate) {
    const y = Number(isoDate[1]);
    const m = Number(isoDate[2]);
    const d = Number(isoDate[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, m - 1, d));
  }

  const slashDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashDate) {
    const a = Number(slashDate[1]);
    const b = Number(slashDate[2]);
    const yRaw = Number(slashDate[3]);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    // Heuristic: if first token > 12, treat as DD/MM, else MM/DD.
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(Date.UTC(y, month - 1, day));
  }

  // Normalize timezone offsets like +0000 -> +00:00 before parsing.
  const normalized = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function toIsoDateOnly(value: unknown): string | null {
  const d = parseFlexibleDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

