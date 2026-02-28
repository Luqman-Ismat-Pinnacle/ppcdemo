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
