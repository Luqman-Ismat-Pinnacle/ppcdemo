/**
 * @fileoverview Variance Calculation Engine
 * 
 * Core functions for calculating variance between time periods.
 * Used by the variance trending feature to compare metrics over time.
 * 
 * @module lib/variance-engine
 */

import { HourEntry } from '@/types/data';

// ============================================================================
// Types
// ============================================================================

export interface VarianceResult {
  current: number;
  previous: number;
  change: number;           // absolute change (current - previous)
  changePercent: number;    // percentage change
  trend: 'up' | 'down' | 'flat';
  periodLabel: string;      // "vs last week", "vs last month"
}

export type VariancePeriod = 'day' | 'week' | 'month' | 'quarter' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface PeriodComparison {
  current: DateRange;
  previous: DateRange;
  periodLabel: string;
}

export interface MetricsHistory {
  id: string;
  recordedDate: string;
  scope: 'project' | 'phase' | 'task' | 'all';
  scopeId?: string;
  
  // Progress metrics
  totalTasks?: number;
  completedTasks?: number;
  percentComplete?: number;
  
  // Hours metrics
  baselineHours?: number;
  actualHours?: number;
  remainingHours?: number;
  
  // Cost metrics
  baselineCost?: number;
  actualCost?: number;
  remainingCost?: number;
  
  // EVM metrics
  earnedValue?: number;
  plannedValue?: number;
  cpi?: number;
  spi?: number;
  
  // QC metrics
  qcPassRate?: number;
  qcCriticalErrors?: number;
  qcTotalTasks?: number;
  
  createdAt?: string;
  updatedAt?: string;
}

export interface AggregatedMetrics {
  period: string;           // ISO date string or period key
  periodStart: Date;
  periodEnd: Date;
  totalHours: number;
  totalCost: number;
  entryCount: number;
}

// ============================================================================
// Core Variance Calculation
// ============================================================================

/**
 * Calculate variance between two values
 */
export function calculateVariance(
  current: number,
  previous: number,
  periodLabel: string = 'vs previous period'
): VarianceResult {
  const change = current - previous;
  const changePercent = previous !== 0 
    ? ((current - previous) / Math.abs(previous)) * 100 
    : current !== 0 ? 100 : 0;
  
  let trend: 'up' | 'down' | 'flat' = 'flat';
  if (Math.abs(changePercent) > 0.5) {
    trend = change > 0 ? 'up' : 'down';
  }
  
  return {
    current,
    previous,
    change,
    changePercent: Math.round(changePercent * 10) / 10, // Round to 1 decimal
    trend,
    periodLabel
  };
}

/**
 * Get comparison date ranges for a given period type
 */
export function getComparisonDates(
  period: VariancePeriod,
  referenceDate: Date = new Date(),
  customRange?: DateRange
): PeriodComparison {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  
  let currentStart: Date;
  let currentEnd: Date;
  let previousStart: Date;
  let previousEnd: Date;
  let periodLabel: string;
  
  switch (period) {
    case 'day':
      currentStart = new Date(today);
      currentEnd = new Date(today);
      previousStart = new Date(today);
      previousStart.setDate(previousStart.getDate() - 1);
      previousEnd = new Date(previousStart);
      periodLabel = 'vs yesterday';
      break;
      
    case 'week':
      // Current week (Sunday to Saturday)
      const dayOfWeek = today.getDay();
      currentStart = new Date(today);
      currentStart.setDate(currentStart.getDate() - dayOfWeek);
      currentEnd = new Date(today);
      
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 7);
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      periodLabel = 'vs last week';
      break;
      
    case 'month':
      currentStart = new Date(today.getFullYear(), today.getMonth(), 1);
      currentEnd = new Date(today);
      
      previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      previousEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      periodLabel = 'vs last month';
      break;
      
    case 'quarter':
      const currentQuarter = Math.floor(today.getMonth() / 3);
      currentStart = new Date(today.getFullYear(), currentQuarter * 3, 1);
      currentEnd = new Date(today);
      
      const previousQuarterStart = currentQuarter === 0 
        ? new Date(today.getFullYear() - 1, 9, 1)  // Q4 of previous year
        : new Date(today.getFullYear(), (currentQuarter - 1) * 3, 1);
      previousStart = previousQuarterStart;
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      periodLabel = 'vs last quarter';
      break;
      
    case 'custom':
      if (!customRange) {
        throw new Error('Custom range requires from and to dates');
      }
      currentStart = new Date(customRange.from);
      currentEnd = new Date(customRange.to);
      
      const daysDiff = Math.ceil((currentEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
      previousEnd = new Date(currentStart);
      previousEnd.setDate(previousEnd.getDate() - 1);
      previousStart = new Date(previousEnd);
      previousStart.setDate(previousStart.getDate() - daysDiff);
      periodLabel = 'vs previous period';
      break;
      
    default:
      throw new Error(`Unknown period: ${period}`);
  }
  
  return {
    current: { from: currentStart, to: currentEnd },
    previous: { from: previousStart, to: previousEnd },
    periodLabel
  };
}

// ============================================================================
// Hours Aggregation
// ============================================================================

/**
 * Aggregate hours by period (day, week, month, quarter)
 */
export function aggregateHoursByPeriod(
  hours: HourEntry[],
  period: VariancePeriod
): Map<string, AggregatedMetrics> {
  const aggregated = new Map<string, AggregatedMetrics>();
  
  for (const entry of hours) {
    if (!entry.date) continue;
    
    const entryDate = new Date(entry.date);
    const periodKey = getPeriodKey(entryDate, period);
    const { start, end } = getPeriodBounds(entryDate, period);
    
    const existing = aggregated.get(periodKey);
    if (existing) {
      existing.totalHours += entry.hours || 0;
      existing.totalCost += entry.actualCost || 0;
      existing.entryCount += 1;
    } else {
      aggregated.set(periodKey, {
        period: periodKey,
        periodStart: start,
        periodEnd: end,
        totalHours: entry.hours || 0,
        totalCost: entry.actualCost || 0,
        entryCount: 1
      });
    }
  }
  
  return aggregated;
}

/**
 * Get a unique key for a period
 */
function getPeriodKey(date: Date, period: VariancePeriod): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  switch (period) {
    case 'day':
      return date.toISOString().split('T')[0];
      
    case 'week':
      // Get the start of the week (Sunday)
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return `${year}-W${getWeekNumber(date).toString().padStart(2, '0')}`;
      
    case 'month':
      return `${year}-${(month + 1).toString().padStart(2, '0')}`;
      
    case 'quarter':
      const quarter = Math.floor(month / 3) + 1;
      return `${year}-Q${quarter}`;
      
    default:
      return date.toISOString().split('T')[0];
  }
}

/**
 * Get period start and end dates
 */
function getPeriodBounds(date: Date, period: VariancePeriod): { start: Date; end: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  switch (period) {
    case 'day':
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      return { start: dayStart, end: dayEnd };
      
    case 'week':
      const weekStart = new Date(date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      return { start: weekStart, end: weekEnd };
      
    case 'month':
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return { start: monthStart, end: monthEnd };
      
    case 'quarter':
      const quarterNum = Math.floor(month / 3);
      const quarterStart = new Date(year, quarterNum * 3, 1);
      const quarterEnd = new Date(year, (quarterNum + 1) * 3, 0, 23, 59, 59, 999);
      return { start: quarterStart, end: quarterEnd };
      
    default:
      return { start: date, end: date };
  }
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ============================================================================
// Metrics History Comparison
// ============================================================================

/**
 * Get metrics for a specific period from history
 */
export function getMetricsForPeriod(
  metricsHistory: MetricsHistory[],
  dateRange: DateRange,
  scope: string = 'all',
  scopeId?: string
): MetricsHistory | null {
  // Filter by scope
  let filtered = metricsHistory.filter(m => m.scope === scope);
  if (scopeId) {
    filtered = filtered.filter(m => m.scopeId === scopeId);
  }
  
  // Find the most recent record within the date range
  const fromDate = dateRange.from.toISOString().split('T')[0];
  const toDate = dateRange.to.toISOString().split('T')[0];
  
  const inRange = filtered.filter(m => {
    const recordDate = m.recordedDate;
    return recordDate >= fromDate && recordDate <= toDate;
  });
  
  if (inRange.length === 0) return null;
  
  // Return the most recent
  return inRange.sort((a, b) => 
    new Date(b.recordedDate).getTime() - new Date(a.recordedDate).getTime()
  )[0];
}

/**
 * Calculate variance for a specific metric between two periods
 */
export function calculateMetricVariance(
  metricName: keyof MetricsHistory,
  currentMetrics: MetricsHistory | null,
  previousMetrics: MetricsHistory | null,
  periodLabel: string
): VarianceResult | null {
  if (!currentMetrics || !previousMetrics) return null;
  
  const current = currentMetrics[metricName] as number | undefined;
  const previous = previousMetrics[metricName] as number | undefined;
  
  if (current === undefined || previous === undefined) return null;
  
  return calculateVariance(current, previous, periodLabel);
}

/**
 * Get hours variance between two periods
 */
export function getHoursVariance(
  hours: HourEntry[],
  period: VariancePeriod,
  referenceDate: Date = new Date()
): VarianceResult {
  const comparison = getComparisonDates(period, referenceDate);
  
  // Filter hours for current period
  const currentHours = hours.filter(h => {
    const date = new Date(h.date);
    return date >= comparison.current.from && date <= comparison.current.to;
  });
  
  // Filter hours for previous period
  const previousHours = hours.filter(h => {
    const date = new Date(h.date);
    return date >= comparison.previous.from && date <= comparison.previous.to;
  });
  
  const currentTotal = currentHours.reduce((sum, h) => sum + (h.hours || 0), 0);
  const previousTotal = previousHours.reduce((sum, h) => sum + (h.hours || 0), 0);
  
  return calculateVariance(currentTotal, previousTotal, comparison.periodLabel);
}

/**
 * Get cost variance between two periods
 */
export function getCostVariance(
  hours: HourEntry[],
  period: VariancePeriod,
  referenceDate: Date = new Date()
): VarianceResult {
  const comparison = getComparisonDates(period, referenceDate);
  
  const currentHours = hours.filter(h => {
    const date = new Date(h.date);
    return date >= comparison.current.from && date <= comparison.current.to;
  });
  
  const previousHours = hours.filter(h => {
    const date = new Date(h.date);
    return date >= comparison.previous.from && date <= comparison.previous.to;
  });
  
  const currentTotal = currentHours.reduce((sum, h) => sum + (h.actualCost || 0), 0);
  const previousTotal = previousHours.reduce((sum, h) => sum + (h.actualCost || 0), 0);
  
  return calculateVariance(currentTotal, previousTotal, comparison.periodLabel);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format variance for display
 */
export function formatVariance(variance: VarianceResult, format: 'percent' | 'number' | 'currency' | 'hours' = 'percent'): string {
  const sign = variance.change >= 0 ? '+' : '';
  
  switch (format) {
    case 'percent':
      return `${sign}${variance.changePercent.toFixed(1)}%`;
    case 'number':
      return `${sign}${variance.change.toFixed(0)}`;
    case 'currency':
      return `${sign}$${Math.abs(variance.change).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case 'hours':
      return `${sign}${variance.change.toFixed(1)} hrs`;
    default:
      return `${sign}${variance.changePercent.toFixed(1)}%`;
  }
}

/**
 * Get trend icon
 */
export function getTrendIcon(trend: 'up' | 'down' | 'flat'): string {
  switch (trend) {
    case 'up': return '▲';
    case 'down': return '▼';
    case 'flat': return '●';
  }
}

/**
 * Get trend color class (for styling)
 */
export function getTrendColor(
  trend: 'up' | 'down' | 'flat',
  invertColors: boolean = false
): 'positive' | 'negative' | 'neutral' {
  if (trend === 'flat') return 'neutral';
  
  if (invertColors) {
    // For metrics where down is good (costs, errors)
    return trend === 'down' ? 'positive' : 'negative';
  }
  
  // For metrics where up is good (progress, revenue)
  return trend === 'up' ? 'positive' : 'negative';
}

/**
 * Get period display name
 */
export function getPeriodDisplayName(period: VariancePeriod): string {
  switch (period) {
    case 'day': return 'Day';
    case 'week': return 'Week';
    case 'month': return 'Month';
    case 'quarter': return 'Quarter';
    case 'custom': return 'Custom';
  }
}
