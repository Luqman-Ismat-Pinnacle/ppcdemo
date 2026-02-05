/**
 * @fileoverview Executive Metrics Engine
 * 
 * Calculates business-impact metrics for executive-level presentations.
 * Translates technical metrics (SPI, CPI, etc.) into dollar amounts,
 * days, and plain-language insights suitable for COO meetings.
 * 
 * @module lib/executive-metrics
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ProjectMetrics {
  // Schedule
  plannedDuration: number;      // days
  actualDuration: number;       // days elapsed
  remainingDuration: number;    // projected days to complete
  spi: number;                  // Schedule Performance Index
  
  // Cost
  budgetAtCompletion: number;   // total planned budget
  actualCost: number;           // spent so far
  earnedValue: number;          // value of work completed
  plannedValue: number;         // value that should be done by now
  cpi: number;                  // Cost Performance Index
  
  // Progress
  percentComplete: number;
  tasksTotal: number;
  tasksCompleted: number;
  tasksCritical: number;
  
  // Quality
  qcPassRate: number;
  
  // Resources
  teamSize: number;
  avgUtilization: number;
}

export interface ExecutiveSummary {
  // Overall health
  healthScore: number;          // 0-100
  healthStatus: 'excellent' | 'on-track' | 'at-risk' | 'critical';
  healthColor: string;
  
  // Budget Impact
  budgetVariance: number;       // positive = under, negative = over
  budgetVariancePercent: number;
  budgetStatus: string;         // "$50K under budget" or "$30K over budget"
  estimateAtCompletion: number; // projected final cost
  estimateToComplete: number;   // remaining cost
  
  // Schedule Impact
  scheduleVariance: number;     // days ahead (+) or behind (-)
  scheduleVariancePercent: number;
  scheduleStatus: string;       // "5 days ahead" or "2 weeks behind"
  projectedEndDate: Date | null;
  originalEndDate: Date | null;
  
  // Burn Rate
  plannedBurnRate: number;      // $/day planned
  actualBurnRate: number;       // $/day actual
  burnRateStatus: string;       // "On track" or "$500/day over"
  
  // Key Risks
  risks: ExecutiveRisk[];
  
  // Key Wins
  wins: ExecutiveWin[];
  
  // Action Items
  actionItems: ActionItem[];
  
  // Forecasts
  forecasts: ForecastScenario[];
}

export interface ExecutiveRisk {
  id: string;
  title: string;
  impact: 'high' | 'medium' | 'low';
  probability: 'high' | 'medium' | 'low';
  dollarImpact: number | null;
  daysImpact: number | null;
  description: string;
  recommendation: string;
}

export interface ExecutiveWin {
  id: string;
  title: string;
  impact: string;
  description: string;
}

export interface ActionItem {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  owner: string;
  impact: string;
  dueDate: string;
  status: 'approve' | 'escalate' | 'monitor';
}

export interface ForecastScenario {
  name: 'best' | 'expected' | 'worst';
  completionDate: Date;
  finalCost: number;
  probability: number;
  assumptions: string;
}

// ============================================================================
// HEALTH SCORE CALCULATION
// ============================================================================

/**
 * Calculate overall project health score (0-100)
 * Weighted average of key performance indicators
 */
export function calculateHealthScore(metrics: ProjectMetrics): {
  score: number;
  status: 'excellent' | 'on-track' | 'at-risk' | 'critical';
  color: string;
} {
  // Weights for each metric
  const weights = {
    spi: 0.25,        // Schedule performance
    cpi: 0.25,        // Cost performance
    progress: 0.20,   // Task completion
    quality: 0.15,    // QC pass rate
    utilization: 0.15 // Resource efficiency
  };
  
  // Normalize each metric to 0-100 scale
  const spiScore = Math.min(100, Math.max(0, metrics.spi * 100));
  const cpiScore = Math.min(100, Math.max(0, metrics.cpi * 100));
  const progressScore = metrics.percentComplete;
  const qualityScore = metrics.qcPassRate;
  const utilizationScore = Math.min(100, Math.max(0, 
    metrics.avgUtilization <= 100 
      ? metrics.avgUtilization 
      : 100 - (metrics.avgUtilization - 100) // Penalize over-utilization
  ));
  
  // Weighted average
  const score = Math.round(
    spiScore * weights.spi +
    cpiScore * weights.cpi +
    progressScore * weights.progress +
    qualityScore * weights.quality +
    utilizationScore * weights.utilization
  );
  
  // Determine status
  let status: 'excellent' | 'on-track' | 'at-risk' | 'critical';
  let color: string;
  
  if (score >= 90) {
    status = 'excellent';
    color = '#22c55e';
  } else if (score >= 75) {
    status = 'on-track';
    color = '#40E0D0';
  } else if (score >= 60) {
    status = 'at-risk';
    color = '#f97316';
  } else {
    status = 'critical';
    color = '#ef4444';
  }
  
  return { score, status, color };
}

// ============================================================================
// BUDGET CALCULATIONS
// ============================================================================

/**
 * Calculate budget impact metrics with dollar amounts
 */
export function calculateBudgetImpact(metrics: ProjectMetrics): {
  variance: number;
  variancePercent: number;
  status: string;
  estimateAtCompletion: number;
  estimateToComplete: number;
  burnRate: { planned: number; actual: number; status: string };
} {
  // Budget variance (positive = under budget, negative = over)
  const variance = metrics.plannedValue - metrics.actualCost;
  const variancePercent = metrics.plannedValue > 0 
    ? (variance / metrics.plannedValue) * 100 
    : 0;
  
  // Estimate at Completion (EAC) = BAC / CPI
  const eac = metrics.cpi > 0 
    ? metrics.budgetAtCompletion / metrics.cpi 
    : metrics.budgetAtCompletion;
  
  // Estimate to Complete
  const etc = eac - metrics.actualCost;
  
  // Format status string
  const absVariance = Math.abs(variance);
  const status = variance >= 0
    ? `$${formatCompactNumber(absVariance)} under budget`
    : `$${formatCompactNumber(absVariance)} over budget`;
  
  // Burn rate calculations
  const daysElapsed = metrics.actualDuration || 1;
  const plannedBurnRate = metrics.budgetAtCompletion / metrics.plannedDuration;
  const actualBurnRate = metrics.actualCost / daysElapsed;
  
  const burnRateDiff = actualBurnRate - plannedBurnRate;
  const burnRateStatus = Math.abs(burnRateDiff) < plannedBurnRate * 0.05
    ? 'On track'
    : burnRateDiff > 0
      ? `$${formatCompactNumber(burnRateDiff)}/day over`
      : `$${formatCompactNumber(Math.abs(burnRateDiff))}/day under`;
  
  return {
    variance,
    variancePercent,
    status,
    estimateAtCompletion: eac,
    estimateToComplete: etc,
    burnRate: {
      planned: plannedBurnRate,
      actual: actualBurnRate,
      status: burnRateStatus
    }
  };
}

// ============================================================================
// SCHEDULE CALCULATIONS
// ============================================================================

/**
 * Calculate schedule impact metrics with days
 */
export function calculateScheduleImpact(
  metrics: ProjectMetrics,
  projectStartDate?: Date,
  plannedEndDate?: Date
): {
  variance: number;
  variancePercent: number;
  status: string;
  projectedEndDate: Date | null;
} {
  // Schedule variance in days (positive = ahead, negative = behind)
  const variance = metrics.spi >= 1
    ? Math.round((metrics.spi - 1) * metrics.plannedDuration)
    : Math.round((1 - metrics.spi) * metrics.plannedDuration) * -1;
  
  const variancePercent = ((metrics.spi - 1) * 100);
  
  // Format status string
  const absVariance = Math.abs(variance);
  let status: string;
  
  if (absVariance < 2) {
    status = 'On schedule';
  } else if (absVariance < 7) {
    status = variance > 0 
      ? `${absVariance} days ahead` 
      : `${absVariance} days behind`;
  } else {
    const weeks = Math.round(absVariance / 7);
    status = variance > 0 
      ? `${weeks} week${weeks > 1 ? 's' : ''} ahead` 
      : `${weeks} week${weeks > 1 ? 's' : ''} behind`;
  }
  
  // Calculate projected end date
  let projectedEndDate: Date | null = null;
  if (projectStartDate && metrics.spi > 0) {
    const projectedDuration = metrics.plannedDuration / metrics.spi;
    projectedEndDate = new Date(projectStartDate);
    projectedEndDate.setDate(projectedEndDate.getDate() + Math.round(projectedDuration));
  }
  
  return {
    variance,
    variancePercent,
    status,
    projectedEndDate
  };
}

// ============================================================================
// RISK IDENTIFICATION
// ============================================================================

/**
 * Identify top risks based on metrics
 */
export function identifyRisks(metrics: ProjectMetrics): ExecutiveRisk[] {
  const risks: ExecutiveRisk[] = [];
  
  // Budget overrun risk
  if (metrics.cpi < 0.95) {
    const overrun = metrics.budgetAtCompletion * (1 / metrics.cpi - 1);
    risks.push({
      id: 'budget-overrun',
      title: 'Budget Overrun Risk',
      impact: metrics.cpi < 0.85 ? 'high' : 'medium',
      probability: metrics.cpi < 0.9 ? 'high' : 'medium',
      dollarImpact: overrun,
      daysImpact: null,
      description: `CPI of ${(metrics.cpi * 100).toFixed(0)}% indicates spending ${formatCompactNumber(overrun)} more than planned`,
      recommendation: 'Review scope, identify cost-saving opportunities, or request budget increase'
    });
  }
  
  // Schedule slip risk
  if (metrics.spi < 0.95) {
    const daysSlip = Math.round((1 - metrics.spi) * metrics.plannedDuration);
    risks.push({
      id: 'schedule-slip',
      title: 'Schedule Delay Risk',
      impact: metrics.spi < 0.85 ? 'high' : 'medium',
      probability: metrics.spi < 0.9 ? 'high' : 'medium',
      dollarImpact: null,
      daysImpact: daysSlip,
      description: `SPI of ${(metrics.spi * 100).toFixed(0)}% indicates ${daysSlip}-day delay if trend continues`,
      recommendation: 'Add resources to critical path or reduce scope'
    });
  }
  
  // Resource constraint risk
  if (metrics.avgUtilization > 100) {
    risks.push({
      id: 'resource-constraint',
      title: 'Resource Overload',
      impact: 'medium',
      probability: 'high',
      dollarImpact: null,
      daysImpact: null,
      description: `Team at ${metrics.avgUtilization.toFixed(0)}% utilization - burnout and quality issues likely`,
      recommendation: 'Add team members or extend timeline'
    });
  }
  
  // Quality risk
  if (metrics.qcPassRate < 85) {
    risks.push({
      id: 'quality-issues',
      title: 'Quality Concerns',
      impact: metrics.qcPassRate < 70 ? 'high' : 'medium',
      probability: 'high',
      dollarImpact: null,
      daysImpact: null,
      description: `QC pass rate of ${metrics.qcPassRate.toFixed(0)}% below acceptable threshold`,
      recommendation: 'Increase QC resources and implement additional review gates'
    });
  }
  
  // Critical path risk
  if (metrics.tasksCritical > metrics.tasksTotal * 0.3) {
    risks.push({
      id: 'critical-path-heavy',
      title: 'Critical Path Concentration',
      impact: 'medium',
      probability: 'medium',
      dollarImpact: null,
      daysImpact: null,
      description: `${Math.round(metrics.tasksCritical / metrics.tasksTotal * 100)}% of tasks on critical path`,
      recommendation: 'Review dependencies to reduce critical path length'
    });
  }
  
  // Sort by impact
  const impactOrder = { high: 3, medium: 2, low: 1 };
  risks.sort((a, b) => impactOrder[b.impact] - impactOrder[a.impact]);
  
  return risks.slice(0, 5); // Top 5 risks
}

// ============================================================================
// WINS IDENTIFICATION
// ============================================================================

/**
 * Identify project wins based on metrics
 */
export function identifyWins(metrics: ProjectMetrics): ExecutiveWin[] {
  const wins: ExecutiveWin[] = [];
  
  if (metrics.cpi > 1.05) {
    const savings = metrics.actualCost * (metrics.cpi - 1);
    wins.push({
      id: 'under-budget',
      title: 'Under Budget Performance',
      impact: `$${formatCompactNumber(savings)} saved`,
      description: `Spending ${((metrics.cpi - 1) * 100).toFixed(0)}% less than planned`
    });
  }
  
  if (metrics.spi > 1.05) {
    const daysAhead = Math.round((metrics.spi - 1) * metrics.plannedDuration);
    wins.push({
      id: 'ahead-schedule',
      title: 'Ahead of Schedule',
      impact: `${daysAhead} days ahead`,
      description: `Completing work ${((metrics.spi - 1) * 100).toFixed(0)}% faster than planned`
    });
  }
  
  if (metrics.qcPassRate >= 95) {
    wins.push({
      id: 'high-quality',
      title: 'Excellent Quality',
      impact: `${metrics.qcPassRate.toFixed(0)}% pass rate`,
      description: 'Exceeding quality standards'
    });
  }
  
  if (metrics.avgUtilization >= 75 && metrics.avgUtilization <= 90) {
    wins.push({
      id: 'optimal-utilization',
      title: 'Optimal Resource Utilization',
      impact: `${metrics.avgUtilization.toFixed(0)}% utilization`,
      description: 'Team working at sustainable pace'
    });
  }
  
  return wins.slice(0, 3); // Top 3 wins
}

// ============================================================================
// FORECAST SCENARIOS
// ============================================================================

/**
 * Generate forecast scenarios
 */
export function generateForecasts(
  metrics: ProjectMetrics,
  projectStartDate: Date
): ForecastScenario[] {
  const now = new Date();
  
  // Expected scenario - based on current performance
  const expectedDuration = metrics.plannedDuration / metrics.spi;
  const expectedCost = metrics.budgetAtCompletion / metrics.cpi;
  const expectedEnd = new Date(projectStartDate);
  expectedEnd.setDate(expectedEnd.getDate() + Math.round(expectedDuration));
  
  // Best case - 10% improvement in performance
  const bestSpi = Math.min(1.2, metrics.spi * 1.1);
  const bestCpi = Math.min(1.2, metrics.cpi * 1.1);
  const bestDuration = metrics.plannedDuration / bestSpi;
  const bestCost = metrics.budgetAtCompletion / bestCpi;
  const bestEnd = new Date(projectStartDate);
  bestEnd.setDate(bestEnd.getDate() + Math.round(bestDuration));
  
  // Worst case - 15% decline in performance
  const worstSpi = Math.max(0.6, metrics.spi * 0.85);
  const worstCpi = Math.max(0.6, metrics.cpi * 0.85);
  const worstDuration = metrics.plannedDuration / worstSpi;
  const worstCost = metrics.budgetAtCompletion / worstCpi;
  const worstEnd = new Date(projectStartDate);
  worstEnd.setDate(worstEnd.getDate() + Math.round(worstDuration));
  
  return [
    {
      name: 'best',
      completionDate: bestEnd,
      finalCost: bestCost,
      probability: 20,
      assumptions: 'Performance improves 10% through added resources or scope reduction'
    },
    {
      name: 'expected',
      completionDate: expectedEnd,
      finalCost: expectedCost,
      probability: 60,
      assumptions: 'Current performance trends continue'
    },
    {
      name: 'worst',
      completionDate: worstEnd,
      finalCost: worstCost,
      probability: 20,
      assumptions: 'Performance declines 15% due to unforeseen issues'
    }
  ];
}

// ============================================================================
// ACTION ITEMS GENERATION
// ============================================================================

/**
 * Generate action items based on risks and metrics
 */
export function generateActionItems(
  metrics: ProjectMetrics,
  risks: ExecutiveRisk[]
): ActionItem[] {
  const items: ActionItem[] = [];
  
  // Generate action items from risks
  risks.forEach((risk, index) => {
    if (risk.impact === 'high') {
      items.push({
        id: `action-${risk.id}`,
        priority: 'high',
        action: risk.recommendation,
        owner: 'PM',
        impact: risk.dollarImpact 
          ? `Prevent $${formatCompactNumber(risk.dollarImpact)} overrun`
          : risk.daysImpact
            ? `Recover ${risk.daysImpact} days`
            : 'Reduce project risk',
        dueDate: 'This week',
        status: risk.impact === 'high' && risk.probability === 'high' ? 'escalate' : 'approve'
      });
    }
  });
  
  // Add proactive items based on metrics
  if (metrics.tasksCritical > 0 && metrics.spi < 1) {
    items.push({
      id: 'action-critical-focus',
      priority: 'high',
      action: 'Focus resources on critical path tasks',
      owner: 'PM',
      impact: `Accelerate ${metrics.tasksCritical} critical tasks`,
      dueDate: 'Immediate',
      status: 'approve'
    });
  }
  
  if (metrics.percentComplete < 50 && metrics.spi < 0.9) {
    items.push({
      id: 'action-scope-review',
      priority: 'medium',
      action: 'Conduct scope review for potential reduction',
      owner: 'PM + Stakeholder',
      impact: 'Realign expectations with capacity',
      dueDate: 'This sprint',
      status: 'monitor'
    });
  }
  
  // Sort by priority
  const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  items.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
  
  return items.slice(0, 5); // Top 5 action items
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Generate complete executive summary
 */
export function generateExecutiveSummary(
  metrics: ProjectMetrics,
  projectStartDate?: Date,
  plannedEndDate?: Date
): ExecutiveSummary {
  const health = calculateHealthScore(metrics);
  const budget = calculateBudgetImpact(metrics);
  const schedule = calculateScheduleImpact(metrics, projectStartDate, plannedEndDate);
  const risks = identifyRisks(metrics);
  const wins = identifyWins(metrics);
  const actionItems = generateActionItems(metrics, risks);
  const forecasts = projectStartDate ? generateForecasts(metrics, projectStartDate) : [];
  
  return {
    healthScore: health.score,
    healthStatus: health.status,
    healthColor: health.color,
    
    budgetVariance: budget.variance,
    budgetVariancePercent: budget.variancePercent,
    budgetStatus: budget.status,
    estimateAtCompletion: budget.estimateAtCompletion,
    estimateToComplete: budget.estimateToComplete,
    
    scheduleVariance: schedule.variance,
    scheduleVariancePercent: schedule.variancePercent,
    scheduleStatus: schedule.status,
    projectedEndDate: schedule.projectedEndDate,
    originalEndDate: plannedEndDate || null,
    
    plannedBurnRate: budget.burnRate.planned,
    actualBurnRate: budget.burnRate.actual,
    burnRateStatus: budget.burnRate.status,
    
    risks,
    wins,
    actionItems,
    forecasts
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format number to compact form (1000 -> 1K, 1000000 -> 1M)
 */
export function formatCompactNumber(num: number): string {
  const absNum = Math.abs(num);
  if (absNum >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (absNum >= 1000) {
    return (num / 1000).toFixed(0) + 'K';
  }
  return num.toFixed(0);
}

/**
 * Format currency
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
 * Format date for display
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Calculate metrics from raw project data
 */
export function calculateProjectMetrics(data: {
  tasks: any[];
  employees: any[];
  hours: any[];
  projects: any[];
}): ProjectMetrics {
  const { tasks, employees, hours } = data;
  
  // Calculate aggregates
  const totalBaseline = tasks.reduce((sum, t) => sum + (t.baselineHours || 0), 0);
  const totalActual = tasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);
  const totalBudget = tasks.reduce((sum, t) => sum + (t.baselineCost || 0), 0);
  const actualCost = tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0);
  
  const completedTasks = tasks.filter(t => t.percentComplete >= 100).length;
  const criticalTasks = tasks.filter(t => t.isCritical).length;
  
  // Calculate percent complete (weighted by hours)
  const earnedHours = tasks.reduce((sum, t) => 
    sum + ((t.baselineHours || 0) * (t.percentComplete || 0) / 100), 0);
  const percentComplete = totalBaseline > 0 
    ? (earnedHours / totalBaseline) * 100 
    : 0;
  
  // EV metrics
  const plannedValue = totalBudget * (percentComplete / 100);
  const earnedValue = actualCost * (percentComplete / 100);
  
  // Performance indices
  const spi = plannedValue > 0 ? earnedValue / plannedValue : 1;
  const cpi = actualCost > 0 ? earnedValue / actualCost : 1;
  
  // Duration (estimate from dates)
  const dates = tasks
    .flatMap(t => [t.startDate, t.endDate])
    .filter(Boolean)
    .map(d => new Date(d).getTime());
  
  const minDate = Math.min(...dates) || Date.now();
  const maxDate = Math.max(...dates) || Date.now();
  const plannedDuration = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) || 1;
  const actualDuration = Math.ceil((Date.now() - minDate) / (1000 * 60 * 60 * 24));
  
  // QC (estimate from tasks)
  const tasksWithQc = tasks.filter(t => t.qcStatus);
  const qcPassed = tasksWithQc.filter(t => t.qcStatus === 'passed' || t.qcStatus === 'approved').length;
  const qcPassRate = tasksWithQc.length > 0 ? (qcPassed / tasksWithQc.length) * 100 : 90;
  
  // Utilization
  const avgUtilization = employees.length > 0
    ? employees.reduce((sum, e) => sum + (e.utilization || 80), 0) / employees.length
    : 80;
  
  return {
    plannedDuration,
    actualDuration,
    remainingDuration: Math.max(0, plannedDuration - actualDuration),
    spi,
    budgetAtCompletion: totalBudget,
    actualCost,
    earnedValue,
    plannedValue,
    cpi,
    percentComplete,
    tasksTotal: tasks.length,
    tasksCompleted: completedTasks,
    tasksCritical: criticalTasks,
    qcPassRate,
    teamSize: employees.length,
    avgUtilization
  };
}
