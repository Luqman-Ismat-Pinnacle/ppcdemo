'use client';

/**
 * Shared utilities for data transformation layer.
 */

import type { SampleData, CostTransaction } from '@/types/data';

/**
 * Safely convert any value to a finite number.
 * Returns 0 for null, undefined, NaN, Infinity, non-numeric strings.
 */
export const safeNum = (v: any): number => {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) ? n : 0;
};

export const normalizeId = (value: unknown): string => String(value ?? '').trim();

export const hasTruthyPlanFlag = (value: unknown): boolean => {
  return value === true || value === 1 || String(value ?? '').toLowerCase() === 'true' || String(value ?? '') === '1';
};

export const getPlannedProjectIdSet = (data: Partial<SampleData>): Set<string> => {
  const planned = new Set<string>();
  (data.projects || []).forEach((project: any) => {
    const id = normalizeId(project?.id ?? project?.projectId);
    if (!id) return;
    const hasSchedule = hasTruthyPlanFlag(project?.has_schedule ?? project?.hasSchedule);
    if (hasSchedule) planned.add(id);
  });
  ((data as any).projectDocuments || []).forEach((doc: any) => {
    const id = normalizeId(doc?.projectId ?? doc?.project_id);
    if (id) planned.add(id);
  });
  return planned;
};

/**
 * Normalize any date value to canonical "YYYY-MM-DD" so week lookups and grouping work
 * regardless of format (ISO with time, date-only string, or Date object from API).
 */
export function normalizeDateString(value: string | Date | number | null | undefined): string | null {
  if (value == null) return null;
  const d = typeof value === 'object' && 'getTime' in value ? value : new Date(value as string | number);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/**
 * Memoization cache for expensive calculations
 */
const memoizedCalculations = new Map<string, unknown>();

/**
 * Memoize expensive calculations to avoid recomputation
 */
export function memoize<T>(key: string, fn: () => T, dependencies: unknown[]): T {
  const depKey = JSON.stringify(dependencies);
  const cacheKey = `${key}_${depKey}`;

  if (memoizedCalculations.has(cacheKey)) {
    return memoizedCalculations.get(cacheKey) as T;
  }

  const result = fn();
  memoizedCalculations.set(cacheKey, result);
  return result;
}

/**
 * Clear memoization cache (useful for testing or memory management)
 */
export function clearMemoizationCache(): void {
  memoizedCalculations.clear();
}

// Cost aggregation types
export type CostAggregation = {
  actual: number;
  forecast: number;
};

export type CostAggregationMaps = {
  byProject: Map<string, CostAggregation>;
  byPhase: Map<string, CostAggregation>;
  byTask: Map<string, CostAggregation>;
};

export const buildCostAggregations = (transactions: CostTransaction[] = []): CostAggregationMaps => {
  const byProject = new Map<string, CostAggregation>();
  const byPhase = new Map<string, CostAggregation>();
  const byTask = new Map<string, CostAggregation>();

  const add = (map: Map<string, CostAggregation>, key?: string, actualAmount = 0, forecastAmount = 0) => {
    if (!key) return;
    const existing = map.get(key) || { actual: 0, forecast: 0 };
    map.set(key, {
      actual: existing.actual + actualAmount,
      forecast: existing.forecast + forecastAmount,
    });
  };

  transactions.forEach((tx) => {
    const amount = Number(tx.amount || 0);
    const actualAmount = tx.isAccrual ? 0 : amount;
    const forecastAmount = tx.isAccrual ? amount : 0;
    add(byProject, tx.projectId, actualAmount, forecastAmount);
    add(byPhase, tx.phaseId, actualAmount, forecastAmount);
    add(byTask, tx.taskId, actualAmount, forecastAmount);
  });

  return { byProject, byPhase, byTask };
};

/**
 * Shared week mapping utility with memoization
 */
const weekMappingCache = new Map<string, {
  weekMap: Map<string, string>;
  weekIndexMap: Map<string, number>;
  rawWeeks: string[];
  formattedWeeks: string[];
}>();

export function buildWeekMappings(dates: (string | Date | number)[]): {
  weekMap: Map<string, string>;
  weekIndexMap: Map<string, number>;
  rawWeeks: string[];
  formattedWeeks: string[];
} {
  const normalized = dates.map(d => normalizeDateString(d)).filter((d): d is string => d != null);
  const sortedDates = [...new Set(normalized)].sort().join(',');
  const cacheKey = `weekMappings_${sortedDates}`;

  if (weekMappingCache.has(cacheKey)) {
    return weekMappingCache.get(cacheKey)!;
  }

  const weekMap = new Map<string, string>();
  const uniqueDates = [...new Set(normalized)].sort();

  uniqueDates.forEach((dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;

    const day = d.getDay();
    const mondayDate = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), mondayDate);
    const weekKey = monday.toISOString().split('T')[0];
    weekMap.set(dateStr, weekKey);
  });

  const rawWeeks = [...new Set(weekMap.values())].sort();

  const formattedWeeks = rawWeeks.map(week => {
    const d = new Date(week);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const weekIndexMap = new Map<string, number>();
  rawWeeks.forEach((week, idx) => weekIndexMap.set(week, idx));

  const result = { weekMap, weekIndexMap, rawWeeks, formattedWeeks };

  if (weekMappingCache.size > 50) {
    const firstKey = weekMappingCache.keys().next().value;
    if (firstKey) weekMappingCache.delete(firstKey);
  }
  weekMappingCache.set(cacheKey, result);

  return result;
}
