/**
 * @file wbs-utils.ts
 * @description Advanced WBS Utility Functions
 * 
 * Features:
 * - Earned Value Management (EVM) Metrics (CPI, SPI, CV, SV, TCPI)
 * - Working Day Calendar Logic (skips weekends)
 * - Tree-based Cost Rollup with weighted percent complete
 * - Status color based on CPI/SPI thresholds
 * 
 * @dependencies ../types/wbs
 * @dataflow Used by:
 *   - WBS/Gantt page for hierarchy display
 *   - Forecast page for EVM calculations
 *   - Resource pages for allocation views
 */

import type { 
  WBSItem, 
  WBSTableRow, 
  GanttBar, 
  Employee, 
  WBSItemType 
} from '../types/wbs';
import { WBS_COLORS, WBS_LEVELS } from '../types/wbs';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Standard hours per working day */
const HOURS_PER_DAY = 8;

/** Weekend days (0 = Sunday, 6 = Saturday) */
const WEEKEND_DAYS = [0, 6];

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Earned Value Management Metrics
 */
export interface EVMMetrics {
  /** Planned Value (BCWS - Budgeted Cost of Work Scheduled) */
  pv: number;
  /** Earned Value (BCWP - Budgeted Cost of Work Performed) */
  ev: number;
  /** Actual Cost (ACWP - Actual Cost of Work Performed) */
  ac: number;
  /** Schedule Variance (EV - PV) */
  sv: number;
  /** Cost Variance (EV - AC) */
  cv: number;
  /** Cost Performance Index (EV / AC) */
  cpi: number;
  /** Schedule Performance Index (EV / PV) */
  spi: number;
  /** To Complete Performance Index */
  tcpi: number;
}

// ============================================================================
// SECTION 1: CALENDAR & DATE UTILITIES
// ============================================================================

/**
 * Check if a date is a working day (Monday-Friday)
 * 
 * @param date - Date to check
 * @returns true if Monday-Friday, false if weekend
 * 
 * @example
 * isWorkingDay(new Date('2025-01-06')); // Monday -> true
 * isWorkingDay(new Date('2025-01-04')); // Saturday -> false
 */
export function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  return !WEEKEND_DAYS.includes(day);
}

/**
 * Calculate the number of working days between two dates (inclusive)
 * 
 * @param startDate - Start date (inclusive)
 * @param endDate - End date (inclusive)
 * @returns Number of working days (Mon-Fri)
 * 
 * @example
 * // Monday to Friday = 5 working days
 * calculateWorkingDays(new Date('2025-01-06'), new Date('2025-01-10')); // 5
 */
export function calculateWorkingDays(startDate: Date, endDate: Date): number {
  if (startDate > endDate) return 0;
  
  let count = 0;
  const cur = new Date(startDate);
  
  while (cur <= endDate) {
    if (isWorkingDay(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  
  return count;
}

/**
 * Add working days to a date to find the new end date
 * 
 * @param startDate - Starting date
 * @param days - Number of working days to add
 * @returns New date after adding working days
 * 
 * @example
 * // Add 5 working days to Monday = Friday
 * addWorkingDays(new Date('2025-01-06'), 5); // 2025-01-10
 */
export function addWorkingDays(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  
  if (days <= 0) return result;

  let remaining = days;
  
  // If start is a working day, it counts as day 1
  if (isWorkingDay(result)) remaining--;
  
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result)) remaining--;
  }
  
  return result;
}

/**
 * Standard date formatting for display
 * 
 * @param date - Date to format (can be Date object, string, null, or undefined)
 * @returns Formatted string like "Jan 6, '25" or "-" if invalid
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '-';
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit'
  }).format(d);
}

// ============================================================================
// SECTION 2: COST & EVM CALCULATIONS
// ============================================================================

/**
 * Calculate baseline hours from duration
 * 
 * @param days - Number of days
 * @returns Hours (days * 8)
 */
export function calculateBaselineHours(days: number): number {
  return days * HOURS_PER_DAY;
}

/**
 * Calculate baseline cost from hours and rate
 * 
 * @param baselineHours - Planned hours
 * @param hourlyRate - Rate per hour
 * @returns Total baseline cost
 */
export function calculateBaselineCost(baselineHours: number, hourlyRate: number): number {
  return baselineHours * hourlyRate;
}

/**
 * Calculate actual cost from hours and rate
 * 
 * @param actualHours - Hours worked
 * @param hourlyRate - Rate per hour
 * @returns Total actual cost
 */
export function calculateActualCost(actualHours: number, hourlyRate: number): number {
  return actualHours * hourlyRate;
}

/**
 * Calculate remaining cost from hours and rate
 * 
 * @param remainingHours - Projected remaining hours
 * @param hourlyRate - Rate per hour
 * @returns Total remaining cost
 */
export function calculateRemainingCost(remainingHours: number, hourlyRate: number): number {
  return remainingHours * hourlyRate;
}

/**
 * Calculate task efficiency
 * 
 * @param baselineHours - Planned hours
 * @param actualHours - Hours worked
 * @param remainingHours - Projected remaining hours
 * @returns Efficiency ratio (baseline / total projected)
 */
export function calculateTaskEfficiency(
  baselineHours: number,
  actualHours: number,
  remainingHours: number
): number | null {
  const totalProjected = actualHours + remainingHours;
  if (totalProjected === 0) return null;
  return baselineHours / totalProjected;
}

/**
 * Calculate standard Earned Value Metrics for a single WBS item
 * 
 * @param item - WBS item with cost and progress data
 * @returns EVMMetrics object with all EVM calculations
 * 
 * @example
 * const evm = calculateEVM(task);
 * console.log(`CPI: ${evm.cpi}, SPI: ${evm.spi}`);
 */
export function calculateEVM(item: WBSItem): EVMMetrics {
  const bac = item.baselineCost || 0;  // Budget at Completion
  const ac = item.actualCost || 0;      // Actual Cost
  const percent = (item.percentComplete || 0) / 100;
  
  // Earned Value = BAC * Percent Complete
  const ev = bac * percent;
  
  // Calculate Planned Value based on time elapsed
  // If start/end dates exist, we calculate expected % based on Today vs Start/End
  let plannedPercent = 0;
  
  if (item.startDate && item.endDate) {
    const start = new Date(item.startDate).getTime();
    const end = new Date(item.endDate).getTime();
    const now = new Date().getTime();
    const totalDur = end - start;
    
    if (totalDur > 0) {
      plannedPercent = Math.max(0, Math.min(1, (now - start) / totalDur));
    } else if (now >= end) {
      plannedPercent = 1;
    }
  }
  
  const pv = bac * plannedPercent;

  // Variances
  const cv = ev - ac;  // Cost Variance: Positive = Under budget
  const sv = ev - pv;  // Schedule Variance: Positive = Ahead of schedule
  
  // Performance Indices (with safe division)
  const cpi = ac > 0 ? ev / ac : (ev > 0 ? Infinity : 1);
  const spi = pv > 0 ? ev / pv : (ev > 0 ? Infinity : 1);
  
  // TCPI (To Complete Performance Index) = (BAC - EV) / (BAC - AC)
  // Efficiency needed to complete remaining work within remaining budget
  const remainingBudget = bac - ac;
  const workRemaining = bac - ev;
  const tcpi = remainingBudget > 0 ? workRemaining / remainingBudget : 0;

  return { pv, ev, ac, cv, sv, cpi, spi, tcpi };
}

/**
 * Get status color based on CPI/SPI thresholds
 * 
 * @param cpi - Cost Performance Index
 * @param spi - Schedule Performance Index
 * @returns Hex color code (red, orange, or green)
 * 
 * @example
 * getStatusColor(0.8, 0.9); // '#ef4444' (red - problem)
 * getStatusColor(0.95, 0.98); // '#f59e0b' (orange - warning)
 * getStatusColor(1.1, 1.05); // '#10b981' (green - good)
 */
export function getStatusColor(cpi: number, spi: number): string {
  if (cpi < 0.9 || spi < 0.9) return '#ef4444'; // Red (Problem)
  if (cpi < 1.0 || spi < 1.0) return '#f59e0b'; // Orange (Warning)
  return '#10b981'; // Green (Good)
}

// ============================================================================
// SECTION 3: HIERARCHY & ROLLUP
// ============================================================================

/**
 * Calculate roll-up values for parent WBS items with EVM support
 * Recursively processes children bottom-up to aggregate values
 * 
 * @param item - Root WBS item to process
 * 
 * @example
 * calculateRollUpValues(projectItem);
 * // projectItem now has aggregated hours, costs, and percent complete
 */
export function calculateRollUpValues(item: WBSItem): void {
  if (!item.children || item.children.length === 0) return;

  // 1. Recursively calculate children first (Bottom-Up)
  item.children.forEach(child => calculateRollUpValues(child));

  // 2. Roll up Dates (Min Start, Max End)
  const validStarts = item.children
    .filter(c => c.startDate)
    .map(c => new Date(c.startDate!).getTime());
  const validEnds = item.children
    .filter(c => c.endDate)
    .map(c => new Date(c.endDate!).getTime());

  if (validStarts.length) {
    item.startDate = new Date(Math.min(...validStarts));
  }
  if (validEnds.length) {
    item.endDate = new Date(Math.max(...validEnds));
  }

  // 3. Roll up Hours, Costs, and Counts
  // Reset sums before aggregating
  item.baselineHours = 0;
  item.actualHours = 0;
  item.projectedRemainingHours = 0;
  item.baselineCost = 0;
  item.actualCost = 0;
  
  // Reset count fields
  (item as any).baselineCount = 0;
  (item as any).actualCount = 0;
  (item as any).completedCount = 0;
  
  let totalWeightedPercent = 0;
  let totalBaselineCostForWeighting = 0;

  item.children.forEach(child => {
    // Sum basic fields
    item.baselineHours! += child.baselineHours || 0;
    item.actualHours! += child.actualHours || 0;
    item.projectedRemainingHours! += child.projectedRemainingHours || 0;
    item.baselineCost! += child.baselineCost || 0;
    item.actualCost! += child.actualCost || 0;

    // Sum count fields
    (item as any).baselineCount += (child as any).baselineCount || 0;
    (item as any).actualCount += (child as any).actualCount || 0;
    (item as any).completedCount += (child as any).completedCount || 0;

    // Accumulate for Weighted Percent Complete
    // Use Baseline Cost as weight (standard practice), fallback to Hours
    const weight = child.baselineCost || child.baselineHours || 0;
    totalBaselineCostForWeighting += weight;
    totalWeightedPercent += (child.percentComplete || 0) * weight;
  });

  // 4. Calculate Aggregate Percent Complete (weighted average)
  item.percentComplete = totalBaselineCostForWeighting > 0 
    ? totalWeightedPercent / totalBaselineCostForWeighting 
    : 0;

  // 5. Derive Aggregate EVM Metrics
  // Note: We recalculate CPI/SPI based on rolled-up sums
  const evm = calculateEVM(item);
  (item as any).cpi = evm.cpi;
  (item as any).spi = evm.spi;
  
  // 6. Roll up Critical Path flag
  item.isCritical = item.children.some(c => c.isCritical);
}

// ============================================================================
// SECTION 4: DISPLAY & FORMATTING
// ============================================================================

/**
 * Format currency for display
 * 
 * @param amount - Amount in dollars
 * @returns Formatted string like "$1,234,567"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Flatten WBS hierarchy for table display
 * Creates rows with visibility and expand/collapse state
 * 
 * @param items - Root WBS items
 * @param expandedIds - Set of expanded item IDs
 * @param parentVisible - Whether parent is visible (default true)
 * @returns Flattened array of WBSTableRow objects
 */
export function flattenWBSForTable(
  items: WBSItem[],
  expandedIds: Set<string>,
  parentVisible: boolean = true
): WBSTableRow[] {
  const rows: WBSTableRow[] = [];
  let rowIndex = 0;

  function processItem(item: WBSItem, isVisible: boolean): void {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const evm = calculateEVM(item);

    rows.push({
      ...item,
      // Display helpers
      indentLevel: item.level - 1,
      hasChildren: !!hasChildren,
      isVisible,
      isExpanded: !!isExpanded,
      rowIndex: rowIndex++,
      // Calculated display metrics
      cpi: evm.cpi,
      spi: evm.spi,
      varianceCost: evm.cv,
      statusColor: getStatusColor(evm.cpi, evm.spi)
    } as WBSTableRow);

    // Process children if expanded
    if (hasChildren && isExpanded) {
      item.children!.forEach(child => processItem(child, isVisible));
    }
  }

  items.forEach(item => processItem(item, parentVisible));
  return rows;
}

/**
 * Build WBS hierarchy from a flat list of items
 * 
 * @param flatItems - Array of WBS items with parentId references
 * @returns Array of root WBS items with nested children
 */
export function buildWBSHierarchy(flatItems: WBSItem[]): WBSItem[] {
  const itemMap = new Map<string, WBSItem>();
  const roots: WBSItem[] = [];

  // Deep copy to avoid mutating source array
  const items = flatItems.map(i => ({ ...i, children: [] as WBSItem[] }));

  // Build lookup map
  items.forEach(item => itemMap.set(item.id, item));

  // Assign children to parents
  items.forEach(item => {
    if (item.parentId && itemMap.has(item.parentId)) {
      const parent = itemMap.get(item.parentId)!;
      parent.children!.push(item);
    } else {
      roots.push(item);
    }
  });

  return roots;
}

// ============================================================================
// SECTION 5: EMPLOYEE & RESOURCE UTILITIES
// ============================================================================

/**
 * Get employee hourly rate from employee list
 * 
 * @param employees - Array of employees
 * @param employeeId - ID to look up
 * @returns Hourly rate or 0 if not found
 */
export function getEmployeeHourlyRate(employees: Employee[], employeeId: string): number {
  const employee = employees.find(e => e.id === employeeId || e.employeeId === employeeId);
  return employee?.hourlyRate || 0;
}

/**
 * Recalculate all costs for a task based on assigned resource
 * 
 * @param task - WBS task item
 * @param employees - Array of employees for rate lookup
 * @returns Updated task with recalculated costs
 */
export function recalculateTaskCosts(
  task: WBSItem,
  employees: Employee[]
): WBSItem {
  if (!task.assignedResourceId) return task;

  const hourlyRate = getEmployeeHourlyRate(employees, task.assignedResourceId);
  const baselineHours = task.baselineHours || 0;
  const actualHours = task.actualHours || 0;
  const remainingHours = task.projectedRemainingHours || 0;

  return {
    ...task,
    baselineCost: calculateBaselineCost(baselineHours, hourlyRate),
    actualCost: calculateActualCost(actualHours, hourlyRate),
    remainingCost: calculateRemainingCost(remainingHours, hourlyRate),
    taskEfficiency: calculateTaskEfficiency(baselineHours, actualHours, remainingHours)
  };
}

/**
 * Generate WBS code for a new item based on parent and sibling count
 * 
 * @param parentWBSCode - Parent's WBS code (e.g., "1.2.3")
 * @param siblingCount - Number of existing siblings
 * @returns New WBS code (e.g., "1.2.3.4")
 */
export function generateWBSCode(
  parentWBSCode: string,
  siblingCount: number
): string {
  const newNumber = siblingCount + 1;
  return parentWBSCode ? `${parentWBSCode}.${newNumber}` : `${newNumber}`;
}

// ============================================================================
// SECTION 6: WBS ITEM TYPE UTILITIES
// ============================================================================

/**
 * Get the color for a WBS item type
 * 
 * @param itemType - WBS item type
 * @returns Hex color code
 */
export function getWBSItemColor(itemType: WBSItemType): string {
  return WBS_LEVELS[itemType]?.color || WBS_COLORS.teal;
}

/**
 * Get the display label for a WBS item type
 * 
 * @param itemType - WBS item type
 * @returns Human-readable label
 */
export function getWBSItemLabel(itemType: WBSItemType): string {
  return WBS_LEVELS[itemType]?.label || itemType;
}

/**
 * Get the hierarchy level for a WBS item type
 * 
 * @param itemType - WBS item type
 * @returns Numeric level (1-7)
 */
export function getWBSItemLevel(itemType: WBSItemType): number {
  return WBS_LEVELS[itemType]?.level || 1;
}

// ============================================================================
// SECTION 7: AUTO-CALCULATION UTILITIES
// ============================================================================

/**
 * Configuration for auto-calculation
 */
export interface AutoCalcConfig {
  /** Default hourly rate when not specified */
  defaultHourlyRate?: number;
  /** Default hours per day */
  hoursPerDay?: number;
  /** Whether to auto-calculate cost from hours */
  autoCost?: boolean;
  /** Whether to auto-calculate dates from hours */
  autoDates?: boolean;
}

const DEFAULT_AUTO_CALC_CONFIG: Required<AutoCalcConfig> = {
  defaultHourlyRate: 150,
  hoursPerDay: 8,
  autoCost: true,
  autoDates: true,
};

/**
 * Auto-calculate missing fields for a WBS item based on available inputs
 * 
 * Rules:
 * - If baselineHours + baselineCost provided → calculate cost rate
 * - If actualHours + actualCost provided → derive efficiency
 * - If percentComplete + baseline dates → estimate actual dates
 * - If baselineHours provided but no dates → estimate duration
 * - If dates provided but no hours → estimate hours from duration
 * 
 * @param item - WBS item with partial data
 * @param config - Auto-calculation configuration
 * @returns WBS item with calculated fields filled in
 */
export function autoCalculateFields(
  item: WBSItem,
  config: AutoCalcConfig = {}
): WBSItem {
  const cfg = { ...DEFAULT_AUTO_CALC_CONFIG, ...config };
  const result = { ...item };
  
  // 1. Calculate cost rate from hours and cost
  let costRate = cfg.defaultHourlyRate;
  if (result.baselineHours && result.baselineCost && result.baselineHours > 0) {
    costRate = result.baselineCost / result.baselineHours;
  }
  
  // 2. Calculate missing baseline cost from hours
  if (cfg.autoCost && result.baselineHours && !result.baselineCost) {
    result.baselineCost = result.baselineHours * costRate;
  }
  
  // 3. Calculate missing actual cost from hours
  if (cfg.autoCost && result.actualHours && !result.actualCost) {
    result.actualCost = result.actualHours * costRate;
  }
  
  // 4. Calculate baseline hours from dates if not provided
  if (cfg.autoDates && !result.baselineHours && result.startDate && result.endDate) {
    const workingDays = calculateWorkingDays(new Date(result.startDate), new Date(result.endDate));
    result.baselineHours = workingDays * cfg.hoursPerDay;
  }
  
  // 5. Calculate dates from hours if not provided
  if (cfg.autoDates && result.baselineHours && !result.endDate && result.startDate) {
    const durationDays = Math.ceil(result.baselineHours / cfg.hoursPerDay);
    result.endDate = addWorkingDays(new Date(result.startDate), durationDays);
  }
  
  // 6. Estimate actual dates from percent complete
  if (result.percentComplete && result.percentComplete > 0) {
    // If percent complete > 0 and no actual start, set actual start = baseline start
    if (!result.actualStartDate && result.baselineStartDate) {
      result.actualStartDate = result.baselineStartDate;
    }
    
    // If 100% complete and no actual end, estimate based on baseline end
    if (result.percentComplete === 100 && !result.actualEndDate && result.baselineEndDate) {
      result.actualEndDate = result.baselineEndDate;
    }
  }
  
  // 7. Calculate efficiency if we have enough data
  if (result.baselineHours && result.actualHours && result.percentComplete) {
    const earnedHours = result.baselineHours * (result.percentComplete / 100);
    if (result.actualHours > 0) {
      result.taskEfficiency = earnedHours / result.actualHours;
    }
  }
  
  return result;
}

/**
 * Auto-calculate fields for an entire WBS tree
 * Processes bottom-up to ensure children are calculated before parents
 * 
 * @param item - Root WBS item
 * @param config - Auto-calculation configuration
 * @returns WBS item tree with all calculated fields
 */
export function autoCalculateTree(
  item: WBSItem,
  config: AutoCalcConfig = {}
): WBSItem {
  const result = { ...item };
  
  // Process children first (bottom-up)
  if (result.children && result.children.length > 0) {
    result.children = result.children.map(child => autoCalculateTree(child, config));
  }
  
  // Auto-calculate this item's fields
  const calculated = autoCalculateFields(result, config);
  
  // Roll up values from children
  if (calculated.children && calculated.children.length > 0) {
    calculateRollUpValues(calculated);
  }
  
  return calculated;
}

/**
 * Validate that required fields are present for a WBS item
 * 
 * @param item - WBS item to validate
 * @returns Object with isValid flag and list of missing fields
 */
export function validateWBSItem(item: WBSItem): {
  isValid: boolean;
  missingFields: string[];
  warnings: string[];
} {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  
  // Required fields
  if (!item.id) missingFields.push('id');
  if (!item.name) missingFields.push('name');
  if (!item.itemType) missingFields.push('itemType');
  
  // Recommended fields (warnings)
  if (!item.startDate) warnings.push('Missing start date');
  if (!item.endDate) warnings.push('Missing end date');
  if (!item.baselineHours && item.itemType !== 'portfolio' && item.itemType !== 'customer') {
    warnings.push('Missing baseline hours');
  }
  
  // Logical validation
  if (item.startDate && item.endDate) {
    const start = new Date(item.startDate);
    const end = new Date(item.endDate);
    if (start > end) {
      warnings.push('Start date is after end date');
    }
  }
  
  if (item.actualHours && item.baselineHours && item.actualHours > item.baselineHours * 2) {
    warnings.push('Actual hours significantly exceed baseline');
  }
  
  if (item.percentComplete !== undefined && (item.percentComplete < 0 || item.percentComplete > 100)) {
    warnings.push('Percent complete should be between 0 and 100');
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings,
  };
}

/**
 * Calculate estimated completion date based on current progress
 * 
 * @param item - WBS item with progress data
 * @returns Estimated completion date or null if can't calculate
 */
export function estimateCompletionDate(item: WBSItem): Date | null {
  if (!item.startDate || !item.actualHours || !item.baselineHours) {
    return null;
  }
  
  const percentComplete = item.percentComplete || 0;
  if (percentComplete === 0) return null;
  
  // Calculate burn rate (hours per day of actual work)
  const start = new Date(item.startDate);
  const today = new Date();
  const daysElapsed = calculateWorkingDays(start, today);
  
  if (daysElapsed === 0) return null;
  
  const hoursPerDay = item.actualHours / daysElapsed;
  if (hoursPerDay === 0) return null;
  
  // Calculate remaining hours based on current efficiency
  const efficiency = (item.baselineHours * (percentComplete / 100)) / item.actualHours;
  const remainingWork = item.baselineHours * ((100 - percentComplete) / 100);
  const adjustedRemaining = remainingWork / efficiency;
  
  // Estimate remaining days
  const remainingDays = Math.ceil(adjustedRemaining / hoursPerDay);
  
  return addWorkingDays(today, remainingDays);
}

/**
 * Get summary statistics for a WBS tree
 * 
 * @param item - Root WBS item
 * @returns Summary statistics
 */
export function getTreeStatistics(item: WBSItem): {
  totalItems: number;
  totalBaselineHours: number;
  totalActualHours: number;
  totalBaselineCost: number;
  totalActualCost: number;
  avgPercentComplete: number;
  criticalPathItems: number;
  itemsByType: Record<string, number>;
} {
  let totalItems = 0;
  let totalBaselineHours = 0;
  let totalActualHours = 0;
  let totalBaselineCost = 0;
  let totalActualCost = 0;
  let totalPercent = 0;
  let criticalPathItems = 0;
  const itemsByType: Record<string, number> = {};
  
  function traverse(node: WBSItem) {
    totalItems++;
    totalBaselineHours += node.baselineHours || 0;
    totalActualHours += node.actualHours || 0;
    totalBaselineCost += node.baselineCost || 0;
    totalActualCost += node.actualCost || 0;
    totalPercent += node.percentComplete || 0;
    if (node.isCritical) criticalPathItems++;
    
    const type = node.itemType || 'unknown';
    itemsByType[type] = (itemsByType[type] || 0) + 1;
    
    if (node.children) {
      node.children.forEach(traverse);
    }
  }
  
  traverse(item);
  
  return {
    totalItems,
    totalBaselineHours,
    totalActualHours,
    totalBaselineCost,
    totalActualCost,
    avgPercentComplete: totalItems > 0 ? totalPercent / totalItems : 0,
    criticalPathItems,
    itemsByType,
  };
}



