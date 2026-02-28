/**
 * @fileoverview Centralized filter logic for hierarchy and date filters.
 * Used by data-context and filter components.
 */

import type { SampleData, HierarchyFilter, DateFilter } from '@/types/data';

const PPC_DATE_FILTER_KEY = 'ppc-date-filter';

/** Normalize ID from entity (supports camelCase and snake_case) */
function idOf(entity: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = entity[k as keyof typeof entity];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/**
 * Compute the set of valid project IDs that match the hierarchy filter.
 * When filter is empty, returns all project IDs (no filtering).
 * Supports both ID-based filter (portfolioId, customerId, etc.) and legacy path.
 */
export function getValidProjectIdsFromHierarchyFilter(
  data: Partial<SampleData>,
  filter: HierarchyFilter | null
): Set<string> {
  const projects = (data.projects || []) as unknown as Record<string, unknown>[];
  const allProjectIds = new Set(projects.map((p) => idOf(p, ['id', 'projectId', 'project_id'])).filter(Boolean));

  if (!filter) return allProjectIds;

  // ID-based filter (preferred)
  const hasIdFilter = filter.projectId || filter.portfolioId || filter.customerId || filter.siteId || filter.unitId || filter.phaseId;
  if (hasIdFilter) {
    let valid = allProjectIds;

    if (filter.projectId) {
      valid = new Set(projects
        .filter((p) => idOf(p, ['id', 'projectId', 'project_id']) === filter.projectId)
        .map((p) => idOf(p, ['id', 'projectId', 'project_id']))
        .filter(Boolean));
    } else {
      const sites = (data.sites || []) as unknown as Record<string, unknown>[];
      const customers = (data.customers || []) as unknown as Record<string, unknown>[];

      let validSiteIds: Set<string> | null = null;
      if (filter.siteId) {
        validSiteIds = new Set(sites
          .filter((s) => idOf(s, ['id', 'siteId', 'site_id']) === filter.siteId)
          .map((s) => idOf(s, ['id', 'siteId', 'site_id'])));
      } else if (filter.customerId) {
        const validCustomerIds = new Set(customers
          .filter((c) => idOf(c, ['id', 'customerId', 'customer_id']) === filter.customerId)
          .map((c) => idOf(c, ['id', 'customerId', 'customer_id'])));
        validSiteIds = new Set(sites
          .filter((s) => validCustomerIds.has(idOf(s, ['customerId', 'customer_id'])))
          .map((s) => idOf(s, ['id', 'siteId', 'site_id'])));
      } else if (filter.portfolioId) {
        const validPortfolioCustomerIds = new Set(customers
          .filter((c) => idOf(c, ['portfolioId', 'portfolio_id']) === filter.portfolioId)
          .map((c) => idOf(c, ['id', 'customerId', 'customer_id'])));
        validSiteIds = new Set(sites
          .filter((s) => validPortfolioCustomerIds.has(idOf(s, ['customerId', 'customer_id'])))
          .map((s) => idOf(s, ['id', 'siteId', 'site_id'])));
      }

      if (validSiteIds && validSiteIds.size > 0) {
        valid = new Set(projects
          .filter((p) => validSiteIds!.has(idOf(p, ['siteId', 'site_id'])))
          .map((p) => idOf(p, ['id', 'projectId', 'project_id']))
          .filter(Boolean));
      }
    }

    if (filter.unitId && valid.size > 0) {
      const units = (data.units || []) as unknown as Record<string, unknown>[];
      const unitProjectIds = new Set(units
        .filter((u) => idOf(u, ['id', 'unitId', 'unit_id']) === filter.unitId)
        .map((u) => idOf(u, ['projectId', 'project_id']))
        .filter(Boolean));
      valid = new Set([...valid].filter((pid) => unitProjectIds.has(pid)));
    }
    if (filter.phaseId && valid.size > 0) {
      const phases = (data.phases || []) as unknown as Record<string, unknown>[];
      const phaseProjectIds = new Set(phases
        .filter((ph) => idOf(ph, ['id', 'phaseId', 'phase_id']) === filter.phaseId)
        .map((ph) => idOf(ph, ['projectId', 'project_id']))
        .filter(Boolean));
      valid = new Set([...valid].filter((pid) => phaseProjectIds.has(pid)));
    }
    return valid;
  }

  // Legacy path-based filter (fallback)
  if (filter.path && filter.path.length > 0) {
    return allProjectIds; // Caller will use path-based logic; we don't duplicate it here
  }
  return allProjectIds;
}

/**
 * Get date range from date filter.
 * Returns { from, to } in ISO date format (YYYY-MM-DD).
 */
export function getDateRangeFromFilter(dateFilter: DateFilter | null): { from: string; to: string } {
  const today = new Date();
  const defaultFrom = '2020-01-01';
  const defaultTo = '2030-12-31';

  if (!dateFilter || dateFilter.type === 'all') {
    return { from: defaultFrom, to: defaultTo };
  }

  if (dateFilter.type === 'custom' && dateFilter.from && dateFilter.to) {
    return { from: dateFilter.from, to: dateFilter.to };
  }

  let from: Date;
  let to: Date = new Date(today);

  switch (dateFilter.type) {
    case 'week':
      from = new Date(today);
      from.setDate(from.getDate() - from.getDay());
      break;
    case 'month':
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case 'quarter':
      const q = Math.floor(today.getMonth() / 3) + 1;
      from = new Date(today.getFullYear(), (q - 1) * 3, 1);
      to = new Date(today.getFullYear(), q * 3, 0);
      break;
    case 'ytd':
      from = new Date(today.getFullYear(), 0, 1);
      break;
    case 'year':
      from = new Date(today.getFullYear(), 0, 1);
      to = new Date(today.getFullYear(), 11, 31);
      break;
    default:
      return { from: defaultFrom, to: defaultTo };
  }

  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

/** Presets for simplified date filter (plan: fewer presets) */
export const DATE_FILTER_PRESETS = [
  { label: 'All Time', value: 'all' as const },
  { label: 'This Week', value: 'week' as const },
  { label: 'This Month', value: 'month' as const },
  { label: 'This Quarter', value: 'quarter' as const },
  { label: 'YTD', value: 'ytd' as const },
  { label: 'Last 30 Days', value: 'custom' as const, days: 30 },
  { label: 'Last 90 Days', value: 'custom' as const, days: 90 },
  { label: 'Custom Range', value: 'custom' as const },
] as const;

/** Persist date filter to localStorage */
export function persistDateFilter(filter: DateFilter): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PPC_DATE_FILTER_KEY, JSON.stringify(filter));
  } catch {
    // ignore quota/security errors
  }
}

/** Restore date filter from localStorage */
export function restoreDateFilter(): DateFilter | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PPC_DATE_FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DateFilter;
    if (parsed && typeof parsed.type === 'string') return parsed;
  } catch {
    // ignore parse errors
  }
  return null;
}

// ============================================================================
// URL PERSISTENCE (Phase 10.3)
// ============================================================================

export const FILTER_URL_PARAMS = {
  project: 'project',
  portfolio: 'portfolio',
  unit: 'unit',
  phase: 'phase',
  from: 'from',
  to: 'to',
  datePreset: 'datePreset',
} as const;

/** Parse hierarchy and date filters from URL search params. */
export function parseFiltersFromSearchParams(
  params: URLSearchParams | { get: (key: string) => string | null }
): {
  hierarchyFilter: HierarchyFilter | null;
  dateFilter: DateFilter | null;
} {
  const get = (k: string) => params.get(k)?.trim() || '';

  const project = get(FILTER_URL_PARAMS.project);
  const portfolio = get(FILTER_URL_PARAMS.portfolio);
  const unit = get(FILTER_URL_PARAMS.unit);
  const phase = get(FILTER_URL_PARAMS.phase);
  const from = get(FILTER_URL_PARAMS.from);
  const to = get(FILTER_URL_PARAMS.to);
  const datePreset = get(FILTER_URL_PARAMS.datePreset);

  let hierarchyFilter: HierarchyFilter | null = null;
  if (project || portfolio || unit || phase) {
    hierarchyFilter = {};
    if (portfolio) hierarchyFilter.portfolioId = portfolio;
    if (project) hierarchyFilter.projectId = project;
    if (unit) hierarchyFilter.unitId = unit;
    if (phase) hierarchyFilter.phaseId = phase;
  }

  let dateFilter: DateFilter | null = null;
  if (from && to) {
    dateFilter = { type: 'custom', from, to };
  } else if (datePreset && ['all', 'week', 'month', 'quarter', 'ytd', 'year'].includes(datePreset)) {
    dateFilter = { type: datePreset as DateFilter['type'] };
  }

  return { hierarchyFilter, dateFilter };
}

/** Build URL search params string from current filters. Preserves existing params not related to filters. */
export function buildFilterSearchParams(
  hierarchyFilter: HierarchyFilter | null,
  dateFilter: DateFilter | null,
  existingParams?: URLSearchParams
): string {
  const next = new URLSearchParams(existingParams ?? '');

  const project = hierarchyFilter?.projectId ?? '';
  const portfolio = hierarchyFilter?.portfolioId ?? '';
  const unit = hierarchyFilter?.unitId ?? '';
  const phase = hierarchyFilter?.phaseId ?? '';

  const isCustom = dateFilter?.type === 'custom' && dateFilter.from && dateFilter.to;
  const datePreset = dateFilter?.type && dateFilter.type !== 'all' && !isCustom ? dateFilter.type : '';

  const filterKeys = Object.values(FILTER_URL_PARAMS);
  filterKeys.forEach((k) => next.delete(k));

  if (project) next.set(FILTER_URL_PARAMS.project, project);
  if (portfolio) next.set(FILTER_URL_PARAMS.portfolio, portfolio);
  if (unit) next.set(FILTER_URL_PARAMS.unit, unit);
  if (phase) next.set(FILTER_URL_PARAMS.phase, phase);
  if (isCustom && dateFilter?.from && dateFilter?.to) {
    next.set(FILTER_URL_PARAMS.from, dateFilter.from);
    next.set(FILTER_URL_PARAMS.to, dateFilter.to);
  } else if (datePreset) {
    next.set(FILTER_URL_PARAMS.datePreset, datePreset);
  }

  return next.toString();
}
