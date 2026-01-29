/**
 * @fileoverview Common Utility Functions for PPC V3 Application.
 * 
 * Provides formatting, calculation, and helper utilities used throughout
 * the application for consistent data presentation and processing.
 * 
 * @module lib/utils
 * 
 * @example
 * ```ts
 * import { formatCurrency, formatPercent, calculateVariance } from '@/lib/utils';
 * 
 * const budget = formatCurrency(150000); // "$150,000"
 * const progress = formatPercent(75.5);   // "75.5%"
 * const variance = calculateVariance(100, 120); // 20 (percent over)
 * ```
 */

// ============================================================================
// NUMBER FORMATTING
// ============================================================================

/**
 * Format a number as US currency (USD).
 * Uses Intl.NumberFormat for locale-aware formatting.
 * 
 * @param {number} value - The numeric value to format
 * @returns {string} Formatted currency string (e.g., "$1,234")
 * 
 * @example
 * ```ts
 * formatCurrency(1234567); // "$1,234,567"
 * formatCurrency(0);       // "$0"
 * formatCurrency(-500);    // "-$500"
 * ```
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a number with comma separators.
 * Uses Intl.NumberFormat for locale-aware formatting.
 * 
 * @param {number} value - The numeric value to format
 * @returns {string} Formatted number string (e.g., "1,234,567")
 * 
 * @example
 * ```ts
 * formatNumber(1234567); // "1,234,567"
 * formatNumber(0);       // "0"
 * formatNumber(1000.5);  // "1,000.5"
 * ```
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/**
 * Format a number as a percentage string.
 * 
 * @param {number} value - The percentage value (e.g., 75.5 for 75.5%)
 * @param {number} [decimals=1] - Number of decimal places to show
 * @returns {string} Formatted percentage string (e.g., "75.5%")
 * 
 * @example
 * ```ts
 * formatPercent(75.567);    // "75.6%"
 * formatPercent(100, 0);    // "100%"
 * formatPercent(33.333, 2); // "33.33%"
 * ```
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format a date as a human-readable string.
 * Handles string dates, Date objects, and null/undefined values.
 * 
 * @param {string | Date | null | undefined} date - Date to format
 * @returns {string} Formatted date (e.g., "Jan 15, 2025") or "-" if invalid
 * 
 * @example
 * ```ts
 * formatDate("2025-01-15");           // "Jan 15, 2025"
 * formatDate(new Date(2025, 0, 15));  // "Jan 15, 2025"
 * formatDate(null);                   // "-"
 * formatDate("invalid");              // "-"
 * ```
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

/**
 * Format a date range as a human-readable string.
 * Combines start and end dates with a separator.
 * 
 * @param {string | Date | null} start - Start date
 * @param {string | Date | null} end - End date
 * @returns {string} Formatted range (e.g., "Jan 1, 2025 - Mar 31, 2025")
 * 
 * @example
 * ```ts
 * formatDateRange("2025-01-01", "2025-03-31"); // "Jan 1, 2025 - Mar 31, 2025"
 * formatDateRange(null, null);                 // "-"
 * formatDateRange("2025-01-01", null);         // "Jan 1, 2025 - -"
 * ```
 */
export function formatDateRange(start: string | Date | null, end: string | Date | null): string {
  const startStr = formatDate(start);
  const endStr = formatDate(end);
  if (startStr === '-' && endStr === '-') return '-';
  return `${startStr} - ${endStr}`;
}

// ============================================================================
// CALCULATIONS
// ============================================================================

/**
 * Calculate variance percentage between planned and actual values.
 * Positive result indicates over-plan, negative indicates under-plan.
 * 
 * @param {number} planned - The planned/baseline value
 * @param {number} actual - The actual/current value
 * @returns {number} Variance as a percentage (e.g., 10 for 10% over plan)
 * 
 * @example
 * ```ts
 * calculateVariance(100, 110); // 10 (10% over)
 * calculateVariance(100, 90);  // -10 (10% under)
 * calculateVariance(0, 50);    // 0 (avoid division by zero)
 * ```
 */
export function calculateVariance(planned: number, actual: number): number {
  if (planned === 0) return 0;
  return ((actual - planned) / planned) * 100;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

/**
 * Get a CSS class name based on status text.
 * Maps common status keywords to styling classes.
 * 
 * @param {string} status - Status text to evaluate
 * @returns {string} CSS class name ('status-good', 'status-warning', 'status-bad', or '')
 * 
 * @example
 * ```ts
 * getStatusColorClass("Completed");    // "status-good"
 * getStatusColorClass("In Progress");  // "status-warning"
 * getStatusColorClass("At Risk");      // "status-bad"
 * getStatusColorClass("Unknown");      // ""
 * ```
 */
export function getStatusColorClass(status: string): string {
  const statusLower = status.toLowerCase();
  
  // Good statuses - completed, approved, etc.
  if (statusLower.includes('complete') || statusLower.includes('approved')) {
    return 'status-good';
  }
  
  // Warning statuses - in progress, under review, etc.
  if (statusLower.includes('progress') || statusLower.includes('review')) {
    return 'status-warning';
  }
  
  // Bad statuses - at risk, failed, etc.
  if (statusLower.includes('risk') || statusLower.includes('fail')) {
    return 'status-bad';
  }
  
  return '';
}
