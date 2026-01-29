/**
 * @fileoverview Utilization Engine for PPC V3
 * 
 * This module provides calculations for employee utilization and efficiency metrics.
 * It analyzes assigned tasks, actual hours logged, and historical performance to
 * provide both current and projected metrics.
 * 
 * Features:
 * - Projected Utilization: Based on assigned task projected hours vs capacity
 * - Current Utilization: Based on actual hours logged vs capacity
 * - Current Efficiency: Actual hours vs baseline hours for completed work
 * - Projected Efficiency: Weighted average trend of efficiency over time
 * 
 * The weighted average for projected efficiency uses:
 * - Last period: 40%
 * - Previous period: 30%
 * - Older period: 20%
 * - Oldest period: 10%
 * 
 * @module lib/utilization-engine
 */

import type { SampleData, Employee, Task, HourEntry } from '@/types/data';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of utilization calculations for a single employee
 */
export interface UtilizationResult {
  /** Employee ID */
  employeeId: string;
  /** Employee name */
  employeeName: string;
  /** Projected utilization percentage (0-100+) based on assigned task hours */
  projectedUtilization: number;
  /** Current utilization percentage (0-100+) based on actual hours logged */
  currentUtilization: number;
  /** Current efficiency percentage (actual/baseline hours) */
  currentEfficiency: number;
  /** Projected efficiency using weighted average trend */
  projectedEfficiency: number;
  /** Total assigned task hours */
  assignedHours: number;
  /** Total actual hours logged */
  actualHoursLogged: number;
  /** Capacity hours (annual) */
  capacityHours: number;
}

/**
 * Period efficiency data for trend calculation
 */
interface PeriodEfficiency {
  periodStart: string;
  periodEnd: string;
  baselineHours: number;
  actualHours: number;
  efficiency: number;
}

/**
 * Configuration options for utilization calculations
 */
export interface UtilizationConfig {
  /** Annual capacity hours per employee (default: 2080) */
  annualCapacity?: number;
  /** Number of periods for trend calculation (default: 4) */
  trendPeriods?: number;
  /** Period length in days (default: 30) */
  periodLengthDays?: number;
  /** Weights for trend calculation (default: [0.4, 0.3, 0.2, 0.1]) */
  trendWeights?: number[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_ANNUAL_CAPACITY = 2080; // 40 hours * 52 weeks
const DEFAULT_TREND_PERIODS = 4;
const DEFAULT_PERIOD_LENGTH_DAYS = 30;
const DEFAULT_TREND_WEIGHTS = [0.4, 0.3, 0.2, 0.1];

// ============================================================================
// UTILIZATION ENGINE CLASS
// ============================================================================

/**
 * UtilizationEngine - Calculates employee utilization and efficiency metrics
 */
export class UtilizationEngine {
  private config: Required<UtilizationConfig>;
  
  constructor(config: UtilizationConfig = {}) {
    this.config = {
      annualCapacity: config.annualCapacity ?? DEFAULT_ANNUAL_CAPACITY,
      trendPeriods: config.trendPeriods ?? DEFAULT_TREND_PERIODS,
      periodLengthDays: config.periodLengthDays ?? DEFAULT_PERIOD_LENGTH_DAYS,
      trendWeights: config.trendWeights ?? DEFAULT_TREND_WEIGHTS,
    };
    
    // Normalize weights to sum to 1
    const weightSum = this.config.trendWeights.reduce((a, b) => a + b, 0);
    if (weightSum !== 1) {
      this.config.trendWeights = this.config.trendWeights.map(w => w / weightSum);
    }
  }
  
  /**
   * Calculate utilization metrics for a single employee
   */
  calculateForEmployee(
    employeeId: string,
    employees: Employee[],
    tasks: Task[],
    hours: HourEntry[],
    asOfDate?: Date
  ): UtilizationResult | null {
    const employee = employees.find(e => e.employeeId === employeeId);
    if (!employee) return null;
    
    const today = asOfDate || new Date();
    
    // Find tasks assigned to this employee
    const assignedTasks = tasks.filter(t => 
      t.resourceId === employeeId || 
      t.resourceId === employee.name
    );
    
    // Calculate assigned/projected hours
    const assignedHours = assignedTasks.reduce((sum, task) => {
      return sum + (task.projectedHours || task.baselineHours || 0);
    }, 0);
    
    // Calculate actual hours logged by this employee
    const employeeHours = hours.filter(h => 
      h.employeeId === employeeId ||
      h.employeeId === employee.name
    );
    const actualHoursLogged = employeeHours.reduce((sum, h) => sum + h.hours, 0);
    
    // Calculate projected utilization (assigned hours / capacity)
    const projectedUtilization = (assignedHours / this.config.annualCapacity) * 100;
    
    // Calculate current utilization (actual hours / pro-rated capacity)
    // Pro-rate capacity based on how far into the year we are
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const dayOfYear = Math.floor((today.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
    const proRatedCapacity = (dayOfYear / 365) * this.config.annualCapacity;
    const currentUtilization = proRatedCapacity > 0 
      ? (actualHoursLogged / proRatedCapacity) * 100 
      : 0;
    
    // Calculate current efficiency (actual vs baseline for work done)
    const currentEfficiency = this.calculateCurrentEfficiency(assignedTasks, employeeHours);
    
    // Calculate projected efficiency using weighted trend
    const projectedEfficiency = this.calculateProjectedEfficiency(
      assignedTasks, 
      employeeHours, 
      today
    );
    
    return {
      employeeId,
      employeeName: employee.name,
      projectedUtilization: Math.round(projectedUtilization * 100) / 100,
      currentUtilization: Math.round(currentUtilization * 100) / 100,
      currentEfficiency: Math.round(currentEfficiency * 100) / 100,
      projectedEfficiency: Math.round(projectedEfficiency * 100) / 100,
      assignedHours,
      actualHoursLogged,
      capacityHours: this.config.annualCapacity,
    };
  }
  
  /**
   * Calculate utilization metrics for all employees
   */
  calculateForAllEmployees(
    data: SampleData,
    asOfDate?: Date
  ): UtilizationResult[] {
    const results: UtilizationResult[] = [];
    const allTasks = [...data.tasks, ...(data.subTasks || [])];
    
    for (const employee of data.employees) {
      const result = this.calculateForEmployee(
        employee.employeeId,
        data.employees,
        allTasks,
        data.hours,
        asOfDate
      );
      if (result) {
        results.push(result);
      }
    }
    
    return results;
  }
  
  /**
   * Calculate current efficiency based on completed work
   * Efficiency = (Baseline Hours / Actual Hours) * 100
   * > 100% means work done faster than planned
   * < 100% means work took longer than planned
   */
  private calculateCurrentEfficiency(
    tasks: Task[],
    hours: HourEntry[]
  ): number {
    // Get completed or in-progress tasks
    const relevantTasks = tasks.filter(t => 
      t.status === 'Completed' || 
      t.status === 'In Progress' ||
      t.percentComplete > 0
    );
    
    if (relevantTasks.length === 0) return 100; // Default to 100% if no work done
    
    let totalBaseline = 0;
    let totalActual = 0;
    
    for (const task of relevantTasks) {
      // Use weighted baseline based on percent complete
      const weightedBaseline = (task.baselineHours || 0) * ((task.percentComplete || 0) / 100);
      totalBaseline += weightedBaseline;
      totalActual += task.actualHours || 0;
    }
    
    if (totalActual === 0) return 100;
    
    return (totalBaseline / totalActual) * 100;
  }
  
  /**
   * Calculate projected efficiency using weighted average of historical periods
   * More recent periods are weighted more heavily
   */
  private calculateProjectedEfficiency(
    tasks: Task[],
    hours: HourEntry[],
    asOfDate: Date
  ): number {
    const periods = this.getHistoricalPeriods(hours, asOfDate);
    
    if (periods.length === 0) {
      // No historical data, return current efficiency
      return this.calculateCurrentEfficiency(tasks, hours);
    }
    
    // Calculate efficiency for each period
    const periodEfficiencies = periods.map(period => {
      const periodHours = hours.filter(h => {
        const date = new Date(h.date);
        return date >= new Date(period.periodStart) && date <= new Date(period.periodEnd);
      });
      
      const periodTasks = tasks.filter(t => {
        // Include tasks that were active during this period
        const taskStart = new Date(t.baselineStartDate || t.actualStartDate || '');
        const taskEnd = new Date(t.baselineEndDate || t.actualEndDate || '');
        return taskStart <= new Date(period.periodEnd) && taskEnd >= new Date(period.periodStart);
      });
      
      // Calculate period efficiency
      let periodBaseline = 0;
      let periodActual = 0;
      
      for (const task of periodTasks) {
        const taskHours = periodHours.filter(h => h.taskId === task.taskId);
        const taskActual = taskHours.reduce((sum, h) => sum + h.hours, 0);
        
        // Pro-rate baseline for this period
        const taskTotalDays = this.daysBetween(
          task.baselineStartDate || task.actualStartDate || '',
          task.baselineEndDate || task.actualEndDate || ''
        );
        const periodDays = this.config.periodLengthDays;
        const periodRatio = taskTotalDays > 0 ? periodDays / taskTotalDays : 1;
        
        periodBaseline += (task.baselineHours || 0) * Math.min(periodRatio, 1);
        periodActual += taskActual;
      }
      
      return periodActual > 0 ? (periodBaseline / periodActual) * 100 : 100;
    });
    
    // Apply weighted average
    let weightedSum = 0;
    let weightSum = 0;
    
    for (let i = 0; i < periodEfficiencies.length && i < this.config.trendWeights.length; i++) {
      weightedSum += periodEfficiencies[i] * this.config.trendWeights[i];
      weightSum += this.config.trendWeights[i];
    }
    
    return weightSum > 0 ? weightedSum / weightSum : 100;
  }
  
  /**
   * Get historical periods for trend analysis
   */
  private getHistoricalPeriods(hours: HourEntry[], asOfDate: Date): PeriodEfficiency[] {
    const periods: PeriodEfficiency[] = [];
    const periodLength = this.config.periodLengthDays;
    
    for (let i = 0; i < this.config.trendPeriods; i++) {
      const periodEnd = new Date(asOfDate);
      periodEnd.setDate(periodEnd.getDate() - (i * periodLength));
      
      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodStart.getDate() - periodLength);
      
      // Check if there's any data in this period
      const periodHours = hours.filter(h => {
        const date = new Date(h.date);
        return date >= periodStart && date <= periodEnd;
      });
      
      if (periodHours.length > 0) {
        periods.push({
          periodStart: periodStart.toISOString().split('T')[0],
          periodEnd: periodEnd.toISOString().split('T')[0],
          baselineHours: 0,
          actualHours: periodHours.reduce((sum, h) => sum + h.hours, 0),
          efficiency: 100,
        });
      }
    }
    
    return periods;
  }
  
  /**
   * Calculate days between two date strings
   */
  private daysBetween(startDate: string, endDate: string): number {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  }
}

// ============================================================================
// CALCULATION METHODOLOGY EXPLANATIONS (for tooltips)
// ============================================================================

/**
 * Methodology explanations for UI tooltips
 */
export const UTILIZATION_METHODOLOGY = {
  projectedUtilization: `
    Projected Utilization = (Assigned Task Hours / Annual Capacity) × 100
    
    • Finds all tasks assigned to the employee (by ID or name)
    • Sums projected hours (or baseline if projected unavailable)
    • Divides by annual capacity (default 2,080 hours/year)
    • Values > 100% indicate over-allocation
  `,
  
  currentUtilization: `
    Current Utilization = (Actual Hours Logged / Pro-Rated Capacity) × 100
    
    • Sums all hours logged by the employee YTD
    • Pro-rates annual capacity based on day of year
    • Compares actual to expected hours at this point
    • Values > 100% indicate ahead of pace
  `,
  
  currentEfficiency: `
    Current Efficiency = (Baseline Hours / Actual Hours) × 100
    
    • For completed and in-progress tasks assigned to employee
    • Weights baseline by percent complete
    • > 100% = faster than planned (more efficient)
    • < 100% = slower than planned (less efficient)
    • 100% = on track
  `,
  
  projectedEfficiency: `
    Projected Efficiency uses weighted average of historical periods:
    
    • Last period (30 days): 40% weight
    • Previous period: 30% weight
    • Older period: 20% weight
    • Oldest period: 10% weight
    
    More recent performance has greater influence on projection.
  `,
};

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Create a default utilization engine instance
 */
export function createUtilizationEngine(config?: UtilizationConfig): UtilizationEngine {
  return new UtilizationEngine(config);
}

/**
 * Quick calculation for a single employee
 */
export function calculateEmployeeUtilization(
  employeeId: string,
  data: SampleData,
  config?: UtilizationConfig
): UtilizationResult | null {
  const engine = new UtilizationEngine(config);
  const allTasks = [...data.tasks, ...(data.subTasks || [])];
  return engine.calculateForEmployee(
    employeeId,
    data.employees,
    allTasks,
    data.hours
  );
}

/**
 * Calculate utilization for all employees
 */
export function calculateAllUtilization(
  data: SampleData,
  config?: UtilizationConfig
): UtilizationResult[] {
  const engine = new UtilizationEngine(config);
  return engine.calculateForAllEmployees(data);
}

