/**
 * @fileoverview Metrics Analysis Engine for PPC V3
 * 
 * This module provides calculations for count/metric analysis and 
 * efficiency vs metrics analysis. It analyzes task-level performance,
 * identifies variances, and provides methodology explanations for tooltips.
 * 
 * Features:
 * - Count Metrics Analysis: Remaining hours, count, metric, defensible, variance
 * - Efficiency Metrics: Project-level efficiency and metrics ratios
 * - Defensible Calculations: Expected values based on historical/benchmark data
 * - Status Classification: good/warning/bad based on variance thresholds
 * 
 * @module lib/metrics-engine
 */

import type { 
  SampleData, 
  CountMetricsAnalysis, 
  ProjectsEfficiencyMetrics,
  Task,
  HourEntry 
} from '@/types/data';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for metrics engine calculations
 */
export interface MetricsConfig {
  /** Variance threshold for "warning" status (default: 10%) */
  warningThreshold?: number;
  /** Variance threshold for "bad" status (default: 25%) */
  badThreshold?: number;
  /** Hours per count unit benchmark (default: 2.5) */
  hoursPerUnitBenchmark?: number;
  /** Minimum hours to consider task active (default: 8) */
  minActiveHours?: number;
}

/**
 * Detailed task metrics for individual analysis
 */
export interface TaskMetrics {
  taskId: string;
  taskName: string;
  projectName: string;
  phaseName: string;
  baselineHours: number;
  actualHours: number;
  remainingHours: number;
  percentComplete: number;
  efficiency: number;
  hoursVariance: number;
  status: 'good' | 'warning' | 'bad';
}

/**
 * Summary metrics for a project
 */
export interface ProjectMetricsSummary {
  projectId: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  totalBaselineHours: number;
  totalActualHours: number;
  totalRemainingHours: number;
  overallEfficiency: number;
  avgTaskEfficiency: number;
  tasksAtRisk: number;
  cpi: number;
  spi: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_WARNING_THRESHOLD = 0.10; // 10%
const DEFAULT_BAD_THRESHOLD = 0.25; // 25%
const DEFAULT_HOURS_PER_UNIT = 2.5;
const DEFAULT_MIN_ACTIVE_HOURS = 8;

// ============================================================================
// METRICS ENGINE CLASS
// ============================================================================

/**
 * MetricsEngine - Calculates count/metric analysis and efficiency metrics
 */
export class MetricsEngine {
  private config: Required<MetricsConfig>;
  
  constructor(config: MetricsConfig = {}) {
    this.config = {
      warningThreshold: config.warningThreshold ?? DEFAULT_WARNING_THRESHOLD,
      badThreshold: config.badThreshold ?? DEFAULT_BAD_THRESHOLD,
      hoursPerUnitBenchmark: config.hoursPerUnitBenchmark ?? DEFAULT_HOURS_PER_UNIT,
      minActiveHours: config.minActiveHours ?? DEFAULT_MIN_ACTIVE_HOURS,
    };
  }
  
  /**
   * Calculate count metrics analysis for all tasks
   * Returns data suitable for the Count/Metric Analysis table
   */
  calculateCountMetrics(data: SampleData): CountMetricsAnalysis[] {
    const results: CountMetricsAnalysis[] = [];
    const allTasks = [...data.tasks, ...(data.subTasks || [])];
    
    for (const task of allTasks) {
      // Skip tasks with minimal activity
      if ((task.baselineHours || 0) < this.config.minActiveHours) continue;
      
      const project = data.projects.find(p => p.projectId === task.projectId);
      const phase = data.phases.find(p => p.phaseId === task.phaseId);
      
      // Calculate remaining hours
      const remainingHours = Math.max(0, 
        (task.projectedHours || task.baselineHours || 0) - (task.actualHours || 0)
      );
      
      // Calculate count from QC tasks if available
      const qcTask = data.qctasks?.find(q => q.parentTaskId === task.taskId);
      const count = qcTask?.qcCount || Math.ceil((task.baselineHours || 0) / this.config.hoursPerUnitBenchmark);
      
      // Calculate metric (hours per unit)
      const metric = count > 0 ? (task.actualHours || 0) / count : 0;
      
      // Calculate defensible (benchmark hours per unit)
      const defensible = this.config.hoursPerUnitBenchmark;
      
      // Calculate variance
      const variance = metric - defensible;
      const variancePercent = defensible > 0 ? Math.abs(variance) / defensible : 0;
      
      // Determine status
      let status: 'good' | 'warning' | 'bad' = 'good';
      if (variancePercent > this.config.badThreshold) {
        status = 'bad';
      } else if (variancePercent > this.config.warningThreshold) {
        status = 'warning';
      }
      
      results.push({
        project: project?.name || 'Unknown Project',
        task: task.taskName || 'Unknown Task',
        remainingHours: Math.round(remainingHours * 10) / 10,
        count,
        metric: Math.round(metric * 100) / 100,
        defensible: Math.round(defensible * 100) / 100,
        variance: Math.round(variance * 100) / 100,
        status,
      });
    }
    
    return results;
  }
  
  /**
   * Calculate efficiency metrics at project level
   */
  calculateProjectEfficiencyMetrics(data: SampleData): ProjectsEfficiencyMetrics[] {
    const results: ProjectsEfficiencyMetrics[] = [];
    
    for (const project of data.projects) {
      const portfolio = data.portfolios.find(p => p.portfolioId === project.customerId);
      const customer = data.customers.find(c => c.customerId === project.customerId);
      const site = data.sites.find(s => s.siteId === project.siteId);
      
      // Get project tasks
      const projectTasks = data.tasks.filter(t => t.projectId === project.projectId);
      
      // Calculate totals
      const totalBaseline = projectTasks.reduce((sum, t) => sum + (t.baselineHours || 0), 0);
      const totalActual = projectTasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
      const totalRemaining = projectTasks.reduce((sum, t) => {
        return sum + Math.max(0, (t.projectedHours || t.baselineHours || 0) - (t.actualHours || 0));
      }, 0);
      
      // Calculate efficiency
      const efficiency = totalActual > 0 ? (totalBaseline / totalActual) * 100 : 100;
      
      // Calculate metrics ratio (actual progress vs planned progress)
      const avgProgress = projectTasks.length > 0
        ? projectTasks.reduce((sum, t) => sum + (t.percentComplete || 0), 0) / projectTasks.length
        : 0;
      const expectedProgress = this.calculateExpectedProgress(project);
      const metricsRatio = expectedProgress > 0 ? avgProgress / expectedProgress : 1;
      
      // Determine flag
      let flag: 'ok' | 'watch' | 'high_metrics' = 'ok';
      if (efficiency < 80 || metricsRatio < 0.8) {
        flag = 'watch';
      } else if (metricsRatio > 1.2) {
        flag = 'high_metrics';
      }
      
      results.push({
        project: project.name,
        portfolio: portfolio?.name || 'Unknown',
        customer: customer?.name || 'Unknown',
        site: site?.name || 'Unknown',
        efficiency: Math.round(efficiency * 10) / 10,
        metricsRatio: Math.round(metricsRatio * 100) / 100,
        remainingHours: Math.round(totalRemaining),
        flag,
      });
    }
    
    return results;
  }
  
  /**
   * Calculate detailed task metrics
   */
  calculateTaskMetrics(data: SampleData): TaskMetrics[] {
    const results: TaskMetrics[] = [];
    const allTasks = [...data.tasks, ...(data.subTasks || [])];
    
    for (const task of allTasks) {
      const project = data.projects.find(p => p.projectId === task.projectId);
      const phase = data.phases.find(p => p.phaseId === task.phaseId);
      
      const baselineHours = task.baselineHours || 0;
      const actualHours = task.actualHours || 0;
      const projectedHours = task.projectedHours || baselineHours;
      const remainingHours = Math.max(0, projectedHours - actualHours);
      const percentComplete = task.percentComplete || 0;
      
      // Calculate efficiency
      const earnedBaseline = baselineHours * (percentComplete / 100);
      const efficiency = actualHours > 0 ? (earnedBaseline / actualHours) * 100 : 100;
      
      // Calculate hours variance
      const hoursVariance = actualHours - earnedBaseline;
      const variancePercent = earnedBaseline > 0 ? Math.abs(hoursVariance) / earnedBaseline : 0;
      
      // Determine status
      let status: 'good' | 'warning' | 'bad' = 'good';
      if (variancePercent > this.config.badThreshold) {
        status = 'bad';
      } else if (variancePercent > this.config.warningThreshold) {
        status = 'warning';
      }
      
      results.push({
        taskId: task.taskId,
        taskName: task.taskName,
        projectName: project?.name || 'Unknown',
        phaseName: phase?.name || 'Unknown',
        baselineHours,
        actualHours,
        remainingHours,
        percentComplete,
        efficiency: Math.round(efficiency * 10) / 10,
        hoursVariance: Math.round(hoursVariance * 10) / 10,
        status,
      });
    }
    
    return results;
  }
  
  /**
   * Calculate project summary metrics
   */
  calculateProjectSummary(data: SampleData): ProjectMetricsSummary[] {
    const results: ProjectMetricsSummary[] = [];
    
    for (const project of data.projects) {
      const projectTasks = data.tasks.filter(t => t.projectId === project.projectId);
      
      const totalTasks = projectTasks.length;
      const completedTasks = projectTasks.filter(t => 
        t.status === 'Completed' || t.percentComplete === 100
      ).length;
      
      const totalBaselineHours = projectTasks.reduce((sum, t) => sum + (t.baselineHours || 0), 0);
      const totalActualHours = projectTasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
      const totalRemainingHours = projectTasks.reduce((sum, t) => {
        return sum + Math.max(0, (t.projectedHours || t.baselineHours || 0) - (t.actualHours || 0));
      }, 0);
      
      // Overall efficiency
      const overallEfficiency = totalActualHours > 0 
        ? (totalBaselineHours / totalActualHours) * 100 
        : 100;
      
      // Average task efficiency
      const taskEfficiencies = projectTasks.map(t => {
        const earned = (t.baselineHours || 0) * ((t.percentComplete || 0) / 100);
        return (t.actualHours || 0) > 0 ? (earned / t.actualHours) * 100 : 100;
      });
      const avgTaskEfficiency = taskEfficiencies.length > 0
        ? taskEfficiencies.reduce((a, b) => a + b, 0) / taskEfficiencies.length
        : 100;
      
      // Tasks at risk (variance > bad threshold)
      const tasksAtRisk = projectTasks.filter(t => {
        const earned = (t.baselineHours || 0) * ((t.percentComplete || 0) / 100);
        const variance = Math.abs((t.actualHours || 0) - earned);
        return earned > 0 && variance / earned > this.config.badThreshold;
      }).length;
      
      // EVM metrics
      const cpi = project.percentComplete && totalActualHours > 0
        ? (totalBaselineHours * (project.percentComplete / 100)) / totalActualHours
        : 1;
      const spi = this.calculateSPI(project, totalBaselineHours);
      
      results.push({
        projectId: project.projectId,
        projectName: project.name,
        totalTasks,
        completedTasks,
        totalBaselineHours,
        totalActualHours,
        totalRemainingHours,
        overallEfficiency: Math.round(overallEfficiency * 10) / 10,
        avgTaskEfficiency: Math.round(avgTaskEfficiency * 10) / 10,
        tasksAtRisk,
        cpi: Math.round(cpi * 100) / 100,
        spi: Math.round(spi * 100) / 100,
      });
    }
    
    return results;
  }
  
  /**
   * Calculate expected progress based on schedule
   */
  private calculateExpectedProgress(project: { 
    baselineStartDate?: string | null; 
    baselineEndDate?: string | null;
    actualStartDate?: string | null;
  }): number {
    const startDate = project.actualStartDate || project.baselineStartDate;
    const endDate = project.baselineEndDate;
    
    if (!startDate || !endDate) return 50; // Default assumption
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    
    if (today < start) return 0;
    if (today > end) return 100;
    
    const totalDuration = end.getTime() - start.getTime();
    const elapsed = today.getTime() - start.getTime();
    
    return (elapsed / totalDuration) * 100;
  }
  
  /**
   * Calculate Schedule Performance Index
   */
  private calculateSPI(project: { 
    percentComplete?: number;
    baselineStartDate?: string | null; 
    baselineEndDate?: string | null;
    actualStartDate?: string | null;
  }, totalBaselineHours: number): number {
    const expectedProgress = this.calculateExpectedProgress(project);
    const actualProgress = project.percentComplete || 0;
    
    return expectedProgress > 0 ? actualProgress / expectedProgress : 1;
  }
}

// ============================================================================
// CALCULATION METHODOLOGY EXPLANATIONS (for tooltips)
// ============================================================================

/**
 * Methodology explanations for UI header tooltips
 */
export const METRICS_METHODOLOGY = {
  remainingHours: `
    Remaining Hours = Projected Hours - Actual Hours
    
    • Projected Hours = EAC estimate or baseline if unavailable
    • Actual Hours = Hours logged against the task
    • Cannot be negative (minimum is 0)
  `,
  
  count: `
    Count represents the number of units/items for the task.
    
    • Sourced from QC task data if available
    • Otherwise estimated from baseline hours ÷ benchmark rate
    • Used to calculate productivity metrics
  `,
  
  metric: `
    Metric = Actual Hours / Count
    
    • Represents actual hours per unit produced
    • Lower is better (more efficient)
    • Compared against defensible benchmark
  `,
  
  defensible: `
    Defensible = Benchmark hours per unit
    
    • Standard/expected hours to complete one unit
    • Based on historical data or industry standards
    • Default: 2.5 hours per unit
  `,
  
  variance: `
    Variance = Metric - Defensible
    
    • Positive = slower than benchmark (inefficient)
    • Negative = faster than benchmark (efficient)
    • Status thresholds:
      - Good: < 10% variance
      - Warning: 10-25% variance
      - Bad: > 25% variance
  `,
  
  efficiency: `
    Efficiency = (Earned Baseline / Actual Hours) × 100
    
    • Earned Baseline = Baseline Hours × % Complete
    • > 100% = More efficient than planned
    • < 100% = Less efficient than planned
    • 100% = On target
  `,
  
  metricsRatio: `
    Metrics Ratio = Actual Progress / Expected Progress
    
    • Expected Progress based on schedule (time elapsed)
    • > 1.0 = Ahead of schedule
    • < 1.0 = Behind schedule
    • 1.0 = On schedule
  `,
  
  cpi: `
    CPI (Cost Performance Index) = EV / AC
    
    • EV = Earned Value (Baseline × % Complete)
    • AC = Actual Cost/Hours
    • > 1.0 = Under budget
    • < 1.0 = Over budget
  `,
  
  spi: `
    SPI (Schedule Performance Index) = Actual Progress / Expected Progress
    
    • Based on where project should be by today
    • > 1.0 = Ahead of schedule
    • < 1.0 = Behind schedule
  `,
};

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Create a default metrics engine instance
 */
export function createMetricsEngine(config?: MetricsConfig): MetricsEngine {
  return new MetricsEngine(config);
}

/**
 * Quick calculation for count metrics
 */
export function calculateCountMetrics(
  data: SampleData, 
  config?: MetricsConfig
): CountMetricsAnalysis[] {
  const engine = new MetricsEngine(config);
  return engine.calculateCountMetrics(data);
}

/**
 * Quick calculation for project efficiency metrics
 */
export function calculateProjectEfficiency(
  data: SampleData,
  config?: MetricsConfig
): ProjectsEfficiencyMetrics[] {
  const engine = new MetricsEngine(config);
  return engine.calculateProjectEfficiencyMetrics(data);
}

