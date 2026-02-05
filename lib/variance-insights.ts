/**
 * @fileoverview Variance Insights Engine
 * 
 * Intelligence layer that provides explanations, detects anomalies, and flags issues.
 * Analyzes variance data to generate actionable insights.
 * 
 * @module lib/variance-insights
 */

import { VarianceResult, VariancePeriod } from './variance-engine';

// ============================================================================
// Types
// ============================================================================

export type FlagSeverity = 'info' | 'warning' | 'critical';

export type InsightType = 
  | 'anomaly'           // Unusual spike or drop
  | 'trend'             // Consistent direction over time
  | 'threshold'         // Crossed a predefined threshold
  | 'correlation'       // Related to another metric change
  | 'milestone'         // Related to milestone/deadline
  | 'resource'          // Resource-related explanation
  | 'seasonal';         // Expected seasonal pattern

export interface VarianceInsight {
  type: InsightType;
  severity: FlagSeverity;
  title: string;              // Short headline
  explanation: string;        // Detailed explanation
  likelyReasons: string[];    // Possible causes
  recommendation?: string;    // Suggested action
  relatedMetrics?: string[];  // Other metrics that may be connected
  confidence: number;         // 0-100% confidence in the insight
}

export interface VarianceFlag {
  severity: FlagSeverity;
  icon: string;
  label: string;
  tooltip: string;
}

export interface VarianceAnalysis {
  variance: VarianceResult;
  insights: VarianceInsight[];
  flags: VarianceFlag[];
  trendDirection: 'improving' | 'declining' | 'stable' | 'volatile';
  historicalContext: string;
  summary: string;            // One-line summary for quick view
}

export interface AnalysisContext {
  // Current state
  milestones?: Array<{ name: string; dueDate: string; status: string }>;
  recentChanges?: Array<{ type: string; description: string; date: string }>;
  teamChanges?: Array<{ type: 'added' | 'removed'; count: number; date: string }>;
  
  // Related metrics for correlation
  relatedMetrics?: Map<string, { current: number; previous: number }>;
  
  // Historical data
  historicalValues?: number[];  // Last N periods
  
  // Thresholds
  warningThreshold?: number;
  criticalThreshold?: number;
}

export interface MetricThresholds {
  warningHigh?: number;
  warningLow?: number;
  criticalHigh?: number;
  criticalLow?: number;
}

// Default thresholds for common metrics
export const DEFAULT_THRESHOLDS: Record<string, MetricThresholds> = {
  cpi: { warningLow: 0.95, criticalLow: 0.9, warningHigh: 1.1, criticalHigh: 1.2 },
  spi: { warningLow: 0.95, criticalLow: 0.9, warningHigh: 1.1, criticalHigh: 1.2 },
  percentComplete: { warningLow: -10, criticalLow: -20 }, // variance thresholds
  hours: { warningHigh: 20, criticalHigh: 40 }, // % over baseline
  cost: { warningHigh: 10, criticalHigh: 25 }, // % over budget
  qcPassRate: { warningLow: 90, criticalLow: 80 },
};

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Analyze variance and generate insights
 */
export function analyzeVariance(
  metricName: string,
  current: number,
  previous: number,
  context: AnalysisContext = {}
): VarianceAnalysis {
  const variance: VarianceResult = {
    current,
    previous,
    change: current - previous,
    changePercent: previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : 0,
    trend: current > previous ? 'up' : current < previous ? 'down' : 'flat',
    periodLabel: 'vs previous period'
  };
  
  const insights: VarianceInsight[] = [];
  const flags: VarianceFlag[] = [];
  
  // 1. Check for anomalies
  if (context.historicalValues && context.historicalValues.length >= 3) {
    const anomalyResult = detectAnomaly(current, context.historicalValues);
    if (anomalyResult.isAnomaly) {
      insights.push({
        type: 'anomaly',
        severity: Math.abs(anomalyResult.zScore) > 3 ? 'critical' : 'warning',
        title: anomalyResult.zScore > 0 ? 'Unusual spike detected' : 'Unusual drop detected',
        explanation: anomalyResult.explanation,
        likelyReasons: generateLikelyReasons(metricName, variance, context),
        recommendation: generateRecommendation(metricName, variance),
        confidence: Math.min(95, 50 + Math.abs(anomalyResult.zScore) * 15)
      });
      
      flags.push({
        severity: Math.abs(anomalyResult.zScore) > 3 ? 'critical' : 'warning',
        icon: anomalyResult.zScore > 0 ? '📈' : '📉',
        label: anomalyResult.zScore > 0 ? 'Spike' : 'Drop',
        tooltip: `${Math.abs(variance.changePercent).toFixed(1)}% ${variance.trend === 'up' ? 'increase' : 'decrease'}`
      });
    }
  }
  
  // 2. Check thresholds
  const thresholds = DEFAULT_THRESHOLDS[metricName.toLowerCase()] || {};
  const thresholdFlags = checkThresholds(metricName, current, thresholds);
  flags.push(...thresholdFlags);
  
  if (thresholdFlags.length > 0) {
    const worstFlag = thresholdFlags.reduce((worst, flag) => 
      flag.severity === 'critical' ? flag : 
      flag.severity === 'warning' && worst.severity !== 'critical' ? flag : worst
    );
    
    insights.push({
      type: 'threshold',
      severity: worstFlag.severity,
      title: `${metricName} ${worstFlag.severity === 'critical' ? 'critically' : ''} outside target range`,
      explanation: `Current value of ${current.toFixed(2)} has crossed the ${worstFlag.severity} threshold.`,
      likelyReasons: generateLikelyReasons(metricName, variance, context),
      recommendation: generateRecommendation(metricName, variance),
      confidence: 90
    });
  }
  
  // 3. Check for trends
  if (context.historicalValues && context.historicalValues.length >= 3) {
    const trendInsight = analyzeTrend(metricName, context.historicalValues);
    if (trendInsight) {
      insights.push(trendInsight);
      
      if (trendInsight.severity !== 'info') {
        flags.push({
          severity: trendInsight.severity,
          icon: trendInsight.type === 'trend' && variance.trend === 'up' ? '📊' : '📉',
          label: 'Trend',
          tooltip: trendInsight.title
        });
      }
    }
  }
  
  // 4. Check for correlations
  if (context.relatedMetrics && context.relatedMetrics.size > 0) {
    const correlations = findCorrelations(metricName, variance.changePercent, context.relatedMetrics);
    if (correlations.length > 0) {
      insights.push({
        type: 'correlation',
        severity: 'info',
        title: 'Related changes detected',
        explanation: `This change may be connected to other metric movements.`,
        likelyReasons: correlations,
        relatedMetrics: Array.from(context.relatedMetrics.keys()),
        confidence: 65
      });
    }
  }
  
  // 5. Check milestone proximity
  if (context.milestones && context.milestones.length > 0) {
    const nearMilestones = context.milestones.filter(m => {
      const daysUntil = Math.ceil((new Date(m.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 14;
    });
    
    if (nearMilestones.length > 0 && variance.trend === 'up' && metricName.toLowerCase().includes('hour')) {
      insights.push({
        type: 'milestone',
        severity: 'info',
        title: 'Approaching milestone',
        explanation: `Increased activity may be related to upcoming deadline: ${nearMilestones[0].name}`,
        likelyReasons: [`Milestone "${nearMilestones[0].name}" due soon`, 'Team pushing to meet deadline'],
        confidence: 70
      });
    }
  }
  
  // 6. Check for team changes
  if (context.teamChanges && context.teamChanges.length > 0) {
    const recentTeamChange = context.teamChanges[0];
    if (recentTeamChange.type === 'added' && variance.trend === 'up') {
      insights.push({
        type: 'resource',
        severity: 'info',
        title: 'Team expansion detected',
        explanation: `${recentTeamChange.count} team member(s) recently added, which may explain increased activity.`,
        likelyReasons: ['New team members ramping up', 'Onboarding activities'],
        confidence: 75
      });
    }
  }
  
  // Determine overall trend direction
  const trendDirection = determineTrendDirection(context.historicalValues || [current, previous]);
  
  // Generate historical context
  const historicalContext = generateHistoricalContext(current, context.historicalValues || []);
  
  // Generate summary
  const summary = generateSummary(metricName, variance, insights, flags);
  
  return {
    variance,
    insights,
    flags,
    trendDirection,
    historicalContext,
    summary
  };
}

// ============================================================================
// Anomaly Detection
// ============================================================================

/**
 * Detect anomalies using z-score method
 */
export function detectAnomaly(
  value: number,
  history: number[],
  sensitivity: 'low' | 'medium' | 'high' = 'medium'
): { isAnomaly: boolean; zScore: number; explanation: string } {
  if (history.length < 3) {
    return { isAnomaly: false, zScore: 0, explanation: 'Insufficient history for anomaly detection' };
  }
  
  // Calculate mean and standard deviation
  const mean = history.reduce((sum, v) => sum + v, 0) / history.length;
  const squaredDiffs = history.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / history.length;
  const stdDev = Math.sqrt(variance);
  
  // Avoid division by zero
  if (stdDev === 0) {
    const isAnomaly = value !== mean;
    return {
      isAnomaly,
      zScore: isAnomaly ? (value > mean ? 3 : -3) : 0,
      explanation: isAnomaly 
        ? `Value deviates from constant historical value of ${mean.toFixed(1)}`
        : 'Value consistent with history'
    };
  }
  
  // Calculate z-score
  const zScore = (value - mean) / stdDev;
  
  // Threshold based on sensitivity
  const thresholds = { low: 3, medium: 2, high: 1.5 };
  const threshold = thresholds[sensitivity];
  
  const isAnomaly = Math.abs(zScore) > threshold;
  
  // Calculate typical range for explanation
  const typicalMin = (mean - stdDev).toFixed(1);
  const typicalMax = (mean + stdDev).toFixed(1);
  
  const explanation = isAnomaly
    ? `Value of ${value.toFixed(1)} is ${Math.abs(zScore).toFixed(1)} standard deviations ${zScore > 0 ? 'above' : 'below'} the mean. Typical range: ${typicalMin} to ${typicalMax}.`
    : `Value of ${value.toFixed(1)} is within normal range (${typicalMin} to ${typicalMax}).`;
  
  return { isAnomaly, zScore, explanation };
}

// ============================================================================
// Threshold Checking
// ============================================================================

/**
 * Check if value crosses defined thresholds
 */
export function checkThresholds(
  metricName: string,
  value: number,
  thresholds: MetricThresholds
): VarianceFlag[] {
  const flags: VarianceFlag[] = [];
  
  // Check critical thresholds first
  if (thresholds.criticalHigh !== undefined && value > thresholds.criticalHigh) {
    flags.push({
      severity: 'critical',
      icon: '🚨',
      label: 'Critical High',
      tooltip: `${metricName} is ${value.toFixed(1)}, above critical threshold of ${thresholds.criticalHigh}`
    });
  } else if (thresholds.criticalLow !== undefined && value < thresholds.criticalLow) {
    flags.push({
      severity: 'critical',
      icon: '🚨',
      label: 'Critical Low',
      tooltip: `${metricName} is ${value.toFixed(1)}, below critical threshold of ${thresholds.criticalLow}`
    });
  }
  // Then warning thresholds
  else if (thresholds.warningHigh !== undefined && value > thresholds.warningHigh) {
    flags.push({
      severity: 'warning',
      icon: '⚠️',
      label: 'Above Target',
      tooltip: `${metricName} is ${value.toFixed(1)}, above warning threshold of ${thresholds.warningHigh}`
    });
  } else if (thresholds.warningLow !== undefined && value < thresholds.warningLow) {
    flags.push({
      severity: 'warning',
      icon: '⚠️',
      label: 'Below Target',
      tooltip: `${metricName} is ${value.toFixed(1)}, below warning threshold of ${thresholds.warningLow}`
    });
  }
  
  return flags;
}

// ============================================================================
// Trend Analysis
// ============================================================================

/**
 * Analyze trend in historical data
 */
function analyzeTrend(metricName: string, history: number[]): VarianceInsight | null {
  if (history.length < 3) return null;
  
  // Count consecutive increases/decreases
  let consecutiveIncreases = 0;
  let consecutiveDecreases = 0;
  
  for (let i = 1; i < history.length; i++) {
    if (history[i] > history[i - 1]) {
      consecutiveIncreases++;
      consecutiveDecreases = 0;
    } else if (history[i] < history[i - 1]) {
      consecutiveDecreases++;
      consecutiveIncreases = 0;
    }
  }
  
  const maxConsecutive = Math.max(consecutiveIncreases, consecutiveDecreases);
  
  if (maxConsecutive >= 3) {
    const direction = consecutiveIncreases > consecutiveDecreases ? 'upward' : 'downward';
    const severity: FlagSeverity = maxConsecutive >= 5 ? 'warning' : 'info';
    
    return {
      type: 'trend',
      severity,
      title: `Consistent ${direction} trend`,
      explanation: `${metricName} has been ${direction === 'upward' ? 'increasing' : 'decreasing'} for ${maxConsecutive} consecutive periods.`,
      likelyReasons: direction === 'upward'
        ? ['Increasing workload', 'Scope expansion', 'Team scaling up']
        : ['Efficiency improvements', 'Scope reduction', 'Project winding down'],
      confidence: Math.min(85, 50 + maxConsecutive * 10)
    };
  }
  
  return null;
}

/**
 * Determine overall trend direction
 */
function determineTrendDirection(history: number[]): 'improving' | 'declining' | 'stable' | 'volatile' {
  if (history.length < 2) return 'stable';
  
  // Calculate changes between periods
  const changes: number[] = [];
  for (let i = 1; i < history.length; i++) {
    changes.push(history[i] - history[i - 1]);
  }
  
  const avgChange = changes.reduce((sum, c) => sum + c, 0) / changes.length;
  const variance = changes.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / changes.length;
  const stdDev = Math.sqrt(variance);
  
  // Check for volatility
  const coefficientOfVariation = stdDev / Math.abs(avgChange || 1);
  if (coefficientOfVariation > 2) return 'volatile';
  
  // Determine direction
  if (Math.abs(avgChange) < 0.01 * Math.abs(history[0] || 1)) return 'stable';
  return avgChange > 0 ? 'improving' : 'declining';
}

// ============================================================================
// Correlation Analysis
// ============================================================================

/**
 * Find correlations with other metrics
 */
export function findCorrelations(
  primaryMetric: string,
  primaryChange: number,
  relatedMetrics: Map<string, { current: number; previous: number }>
): string[] {
  const correlations: string[] = [];
  const changeDirection = primaryChange > 0 ? 'increased' : 'decreased';
  
  for (const [metricName, values] of relatedMetrics) {
    if (metricName === primaryMetric) continue;
    
    const metricChange = values.previous !== 0 
      ? ((values.current - values.previous) / Math.abs(values.previous)) * 100 
      : 0;
    
    // Check if changes are in the same direction and significant
    if (Math.abs(metricChange) > 5) {
      const metricDirection = metricChange > 0 ? 'increased' : 'decreased';
      
      if ((primaryChange > 0 && metricChange > 0) || (primaryChange < 0 && metricChange < 0)) {
        correlations.push(`${metricName} also ${metricDirection} by ${Math.abs(metricChange).toFixed(1)}%`);
      } else {
        correlations.push(`${metricName} ${metricDirection} by ${Math.abs(metricChange).toFixed(1)}% (inverse relationship)`);
      }
    }
  }
  
  return correlations;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate likely reasons based on metric and context
 */
function generateLikelyReasons(
  metricName: string,
  variance: VarianceResult,
  context: AnalysisContext
): string[] {
  const reasons: string[] = [];
  const metricLower = metricName.toLowerCase();
  const direction = variance.trend === 'up' ? 'increase' : 'decrease';
  
  // Generic reasons based on metric type
  if (metricLower.includes('hour')) {
    if (variance.trend === 'up') {
      reasons.push('Increased team activity or overtime');
      reasons.push('New tasks or scope additions');
      reasons.push('Sprint or milestone deadline approaching');
    } else {
      reasons.push('Reduced team capacity');
      reasons.push('Tasks completed or removed');
      reasons.push('Holiday or PTO period');
    }
  } else if (metricLower.includes('cost')) {
    if (variance.trend === 'up') {
      reasons.push('Increased resource utilization');
      reasons.push('Higher-cost resources assigned');
      reasons.push('Scope or budget changes');
    } else {
      reasons.push('Resource optimization');
      reasons.push('Scope reduction');
      reasons.push('Cost-saving measures implemented');
    }
  } else if (metricLower.includes('cpi') || metricLower.includes('spi')) {
    if (variance.trend === 'up') {
      reasons.push('Improved efficiency');
      reasons.push('Better resource allocation');
    } else {
      reasons.push('Scope creep without budget adjustment');
      reasons.push('Unexpected rework or delays');
    }
  } else if (metricLower.includes('qc') || metricLower.includes('quality')) {
    if (variance.trend === 'up') {
      reasons.push('Improved processes');
      reasons.push('Better training or documentation');
    } else {
      reasons.push('Rushed delivery');
      reasons.push('New team members learning curve');
    }
  }
  
  // Context-specific reasons
  if (context.recentChanges && context.recentChanges.length > 0) {
    const change = context.recentChanges[0];
    reasons.push(`Recent ${change.type}: ${change.description}`);
  }
  
  if (context.teamChanges && context.teamChanges.length > 0) {
    const teamChange = context.teamChanges[0];
    reasons.push(`Team ${teamChange.type === 'added' ? 'grew by' : 'reduced by'} ${teamChange.count} member(s)`);
  }
  
  return reasons.slice(0, 4); // Limit to 4 reasons
}

/**
 * Generate recommendation based on metric and variance
 */
function generateRecommendation(metricName: string, variance: VarianceResult): string {
  const metricLower = metricName.toLowerCase();
  const isCritical = Math.abs(variance.changePercent) > 30;
  
  if (metricLower.includes('hour') && variance.trend === 'up') {
    return isCritical
      ? 'Urgently review time entries for accuracy and assess team workload sustainability.'
      : 'Monitor time entries and check if the increase is expected.';
  }
  
  if (metricLower.includes('cost') && variance.trend === 'up') {
    return isCritical
      ? 'Review budget immediately and identify cost drivers. Consider escalation.'
      : 'Track spending closely and validate against approved budget.';
  }
  
  if ((metricLower.includes('cpi') || metricLower.includes('spi')) && variance.trend === 'down') {
    return isCritical
      ? 'Immediate corrective action needed. Review project plan and resource allocation.'
      : 'Monitor closely and identify potential recovery actions.';
  }
  
  if (metricLower.includes('qc') && variance.trend === 'down') {
    return 'Review QC processes and identify areas for improvement.';
  }
  
  return 'Continue monitoring and investigate if trend continues.';
}

/**
 * Generate historical context string
 */
function generateHistoricalContext(current: number, history: number[]): string {
  if (history.length === 0) {
    return 'No historical data available for comparison.';
  }
  
  const max = Math.max(...history, current);
  const min = Math.min(...history, current);
  const avg = history.reduce((sum, v) => sum + v, 0) / history.length;
  
  if (current === max) {
    return `This is the highest value in the last ${history.length} periods.`;
  }
  if (current === min) {
    return `This is the lowest value in the last ${history.length} periods.`;
  }
  
  const percentOfAvg = (current / avg) * 100;
  if (percentOfAvg > 110) {
    return `Current value is ${(percentOfAvg - 100).toFixed(0)}% above the ${history.length}-period average.`;
  }
  if (percentOfAvg < 90) {
    return `Current value is ${(100 - percentOfAvg).toFixed(0)}% below the ${history.length}-period average.`;
  }
  
  return `Current value is within normal range for the last ${history.length} periods.`;
}

/**
 * Generate one-line summary
 */
function generateSummary(
  metricName: string,
  variance: VarianceResult,
  insights: VarianceInsight[],
  flags: VarianceFlag[]
): string {
  const criticalFlags = flags.filter(f => f.severity === 'critical');
  const warningFlags = flags.filter(f => f.severity === 'warning');
  
  if (criticalFlags.length > 0) {
    return `${metricName}: Critical - ${variance.changePercent >= 0 ? '+' : ''}${variance.changePercent.toFixed(1)}% (${criticalFlags[0].label})`;
  }
  
  if (warningFlags.length > 0) {
    return `${metricName}: Warning - ${variance.changePercent >= 0 ? '+' : ''}${variance.changePercent.toFixed(1)}% (${warningFlags[0].label})`;
  }
  
  if (Math.abs(variance.changePercent) < 1) {
    return `${metricName}: Stable (no significant change)`;
  }
  
  return `${metricName}: ${variance.changePercent >= 0 ? '+' : ''}${variance.changePercent.toFixed(1)}% ${variance.periodLabel}`;
}

// ============================================================================
// Batch Analysis
// ============================================================================

/**
 * Analyze multiple metrics at once
 */
export function analyzeMultipleMetrics(
  metrics: Array<{
    name: string;
    current: number;
    previous: number;
    history?: number[];
  }>,
  sharedContext: Partial<AnalysisContext> = {}
): Map<string, VarianceAnalysis> {
  const results = new Map<string, VarianceAnalysis>();
  
  // Build related metrics map
  const relatedMetrics = new Map<string, { current: number; previous: number }>();
  for (const metric of metrics) {
    relatedMetrics.set(metric.name, { current: metric.current, previous: metric.previous });
  }
  
  // Analyze each metric
  for (const metric of metrics) {
    const context: AnalysisContext = {
      ...sharedContext,
      historicalValues: metric.history,
      relatedMetrics
    };
    
    const analysis = analyzeVariance(metric.name, metric.current, metric.previous, context);
    results.set(metric.name, analysis);
  }
  
  return results;
}

/**
 * Get overall health summary from multiple analyses
 */
export function getOverallHealth(analyses: Map<string, VarianceAnalysis>): {
  status: 'healthy' | 'warning' | 'critical';
  criticalCount: number;
  warningCount: number;
  summary: string;
} {
  let criticalCount = 0;
  let warningCount = 0;
  
  for (const analysis of analyses.values()) {
    criticalCount += analysis.flags.filter(f => f.severity === 'critical').length;
    warningCount += analysis.flags.filter(f => f.severity === 'warning').length;
  }
  
  const status = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'healthy';
  
  const summary = status === 'critical'
    ? `${criticalCount} critical issue(s) require immediate attention`
    : status === 'warning'
    ? `${warningCount} warning(s) to review`
    : 'All metrics within normal range';
  
  return { status, criticalCount, warningCount, summary };
}

// ============================================================================
// Executive-Friendly Language Translations
// ============================================================================

/**
 * Business-friendly metric translations for executives
 */
export interface ExecutiveTranslation {
  metricLabel: string;          // Plain-language metric name
  valueLabel: string;           // Plain-language value description
  impactStatement: string;      // Business impact in dollars/days
  statusLabel: string;          // Simple status (ahead/behind/on-track)
  actionableInsight: string;    // What to do about it
}

/**
 * Translate SPI (Schedule Performance Index) for executives
 * @example translateSPI(0.85, 90, 1000000) => "15% behind schedule (1.5 weeks), potential $50K delay cost"
 */
export function translateSPI(
  spi: number,
  projectDurationDays: number,
  totalBudget?: number
): ExecutiveTranslation {
  const scheduleVariancePercent = (1 - spi) * 100;
  const scheduleVarianceDays = Math.round((1 - spi) * projectDurationDays);
  const weeks = Math.abs(scheduleVarianceDays / 7).toFixed(1);
  
  // Estimate delay cost (rough approximation: 10% of budget per week of delay)
  const weeklyDelayCost = totalBudget ? totalBudget * 0.1 / (projectDurationDays / 7) : 0;
  const potentialDelayCost = Math.abs(scheduleVarianceDays / 7) * weeklyDelayCost;
  
  let statusLabel: string;
  let actionableInsight: string;
  
  if (spi >= 1.05) {
    statusLabel = 'Ahead of schedule';
    actionableInsight = 'Consider accelerating milestones or reallocating resources';
  } else if (spi >= 0.95) {
    statusLabel = 'On schedule';
    actionableInsight = 'Maintain current pace';
  } else if (spi >= 0.85) {
    statusLabel = 'Slightly behind';
    actionableInsight = 'Identify bottlenecks and add resources to critical path';
  } else {
    statusLabel = 'Significantly behind';
    actionableInsight = 'Immediate intervention required - reassess scope or resources';
  }
  
  return {
    metricLabel: 'Schedule Performance',
    valueLabel: spi >= 1 
      ? `${Math.abs(scheduleVariancePercent).toFixed(0)}% ahead of schedule (${weeks} weeks)`
      : `${Math.abs(scheduleVariancePercent).toFixed(0)}% behind schedule (${weeks} weeks)`,
    impactStatement: spi >= 1
      ? `Potential early completion by ${Math.abs(scheduleVarianceDays)} days`
      : totalBudget && potentialDelayCost > 1000
        ? `${Math.abs(scheduleVarianceDays)}-day delay, potential $${formatCompact(potentialDelayCost)} additional cost`
        : `${Math.abs(scheduleVarianceDays)}-day delay if trend continues`,
    statusLabel,
    actionableInsight
  };
}

/**
 * Translate CPI (Cost Performance Index) for executives
 * @example translateCPI(0.92, 500000) => "8% over budget ($40K)"
 */
export function translateCPI(
  cpi: number,
  totalBudget: number,
  actualSpend?: number
): ExecutiveTranslation {
  const costVariancePercent = (1 - cpi) * 100;
  const estimatedOverrun = totalBudget * (1 / cpi - 1);
  const currentOverrun = actualSpend ? (actualSpend - (actualSpend * cpi)) : estimatedOverrun * (actualSpend || 1) / totalBudget;
  
  let statusLabel: string;
  let actionableInsight: string;
  
  if (cpi >= 1.05) {
    statusLabel = 'Under budget';
    actionableInsight = 'Cost efficiency achieved - document and replicate practices';
  } else if (cpi >= 0.95) {
    statusLabel = 'On budget';
    actionableInsight = 'Maintain current spending patterns';
  } else if (cpi >= 0.85) {
    statusLabel = 'Over budget';
    actionableInsight = 'Review spending, identify cost reduction opportunities';
  } else {
    statusLabel = 'Significantly over budget';
    actionableInsight = 'Budget review required - consider scope changes or additional funding';
  }
  
  return {
    metricLabel: 'Cost Performance',
    valueLabel: cpi >= 1
      ? `${Math.abs(costVariancePercent).toFixed(0)}% under budget ($${formatCompact(Math.abs(estimatedOverrun))} saved)`
      : `${Math.abs(costVariancePercent).toFixed(0)}% over budget ($${formatCompact(Math.abs(estimatedOverrun))})`,
    impactStatement: cpi >= 1
      ? `Projected savings of $${formatCompact(Math.abs(estimatedOverrun))} at completion`
      : `Projected $${formatCompact(Math.abs(estimatedOverrun))} overrun at completion`,
    statusLabel,
    actionableInsight
  };
}

/**
 * Translate variance percentage for executives
 * @example translateVariance(-12, 'hours') => "Improved by 12% vs last week"
 */
export function translateVariance(
  percentChange: number,
  metricType: 'hours' | 'cost' | 'quality' | 'progress' | 'efficiency',
  period: string = 'last period'
): ExecutiveTranslation {
  // Determine if the direction is good or bad based on metric type
  const isPositiveGood = metricType === 'quality' || metricType === 'progress' || metricType === 'efficiency';
  const isGood = isPositiveGood ? percentChange > 0 : percentChange < 0;
  
  const absChange = Math.abs(percentChange);
  const direction = percentChange > 0 ? 'increased' : 'decreased';
  const goodBad = isGood ? 'improved' : 'declined';
  
  let statusLabel: string;
  if (absChange < 2) {
    statusLabel = 'Stable';
  } else if (isGood) {
    statusLabel = absChange > 10 ? 'Strong improvement' : 'Improving';
  } else {
    statusLabel = absChange > 10 ? 'Needs attention' : 'Slight decline';
  }
  
  const metricLabels = {
    hours: 'Labor Hours',
    cost: 'Spending',
    quality: 'Quality Score',
    progress: 'Progress',
    efficiency: 'Efficiency'
  };
  
  return {
    metricLabel: metricLabels[metricType],
    valueLabel: absChange < 2
      ? `No significant change vs ${period}`
      : `${goodBad.charAt(0).toUpperCase() + goodBad.slice(1)} by ${absChange.toFixed(0)}% vs ${period}`,
    impactStatement: absChange < 2
      ? 'Metrics stable'
      : isGood
        ? `Positive trend: ${absChange.toFixed(0)}% ${goodBad}`
        : `Requires review: ${absChange.toFixed(0)}% ${goodBad}`,
    statusLabel,
    actionableInsight: isGood
      ? 'Continue current approach'
      : absChange > 10
        ? 'Investigate cause and implement corrective action'
        : 'Monitor closely for continued trend'
  };
}

/**
 * Translate z-score (statistical anomaly) for executives
 * @example translateZScore(2.5) => "Unusual spike requiring attention"
 */
export function translateZScore(zScore: number): ExecutiveTranslation {
  const absZ = Math.abs(zScore);
  const direction = zScore > 0 ? 'spike' : 'drop';
  
  let severity: string;
  let actionableInsight: string;
  
  if (absZ < 1.5) {
    severity = 'within normal range';
    actionableInsight = 'No action required';
  } else if (absZ < 2) {
    severity = 'slightly unusual';
    actionableInsight = 'Worth monitoring';
  } else if (absZ < 3) {
    severity = 'unusual';
    actionableInsight = 'Investigate cause';
  } else {
    severity = 'highly unusual';
    actionableInsight = 'Immediate investigation required';
  }
  
  return {
    metricLabel: 'Statistical Analysis',
    valueLabel: absZ < 1.5 
      ? 'Normal variation'
      : `Unusual ${direction} detected`,
    impactStatement: absZ < 1.5
      ? 'Value is within expected range'
      : `Value is ${severity} - ${absZ.toFixed(1)} standard deviations from normal`,
    statusLabel: absZ < 2 ? 'Normal' : absZ < 3 ? 'Attention' : 'Critical',
    actionableInsight
  };
}

/**
 * Format a number in a compact executive-friendly way
 */
function formatCompact(num: number): string {
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
 * Generate executive summary bullet points from variance analysis
 */
export function generateExecutiveBullets(
  analyses: Map<string, VarianceAnalysis>,
  options: { maxBullets?: number; includeRecommendations?: boolean } = {}
): string[] {
  const { maxBullets = 5, includeRecommendations = true } = options;
  const bullets: Array<{ severity: FlagSeverity; text: string }> = [];
  
  for (const [metricName, analysis] of analyses) {
    // Priority 1: Critical flags
    const criticalFlags = analysis.flags.filter(f => f.severity === 'critical');
    if (criticalFlags.length > 0) {
      const insight = analysis.insights.find(i => i.severity === 'critical');
      bullets.push({
        severity: 'critical',
        text: `${metricName}: ${criticalFlags[0].tooltip}${includeRecommendations && insight?.recommendation ? `. Action: ${insight.recommendation}` : ''}`
      });
    }
    
    // Priority 2: Warning flags
    const warningFlags = analysis.flags.filter(f => f.severity === 'warning');
    if (warningFlags.length > 0 && criticalFlags.length === 0) {
      bullets.push({
        severity: 'warning',
        text: `${metricName}: ${warningFlags[0].tooltip}`
      });
    }
    
    // Priority 3: Notable trends
    const trendInsight = analysis.insights.find(i => i.type === 'trend');
    if (trendInsight && analysis.flags.length === 0) {
      bullets.push({
        severity: 'info',
        text: `${metricName}: ${trendInsight.title}`
      });
    }
  }
  
  // Sort by severity and return top bullets
  const severityOrder = { critical: 3, warning: 2, info: 1 };
  bullets.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  
  return bullets.slice(0, maxBullets).map(b => b.text);
}

/**
 * Translate technical jargon to plain business language
 */
export function translateTechnicalTerm(term: string, value?: number): string {
  const translations: Record<string, (v?: number) => string> = {
    'spi': (v) => v !== undefined 
      ? (v >= 1 ? `${((v - 1) * 100).toFixed(0)}% ahead of schedule` : `${((1 - v) * 100).toFixed(0)}% behind schedule`)
      : 'Schedule Performance Index',
    'cpi': (v) => v !== undefined
      ? (v >= 1 ? `${((v - 1) * 100).toFixed(0)}% under budget` : `${((1 - v) * 100).toFixed(0)}% over budget`)
      : 'Cost Performance Index',
    'eac': () => 'Estimated final project cost',
    'etc': () => 'Remaining cost to complete',
    'bac': () => 'Original budget',
    'ev': () => 'Value of work completed',
    'pv': () => 'Planned value at this point',
    'ac': () => 'Actual cost incurred',
    'variance': (v) => v !== undefined && v >= 0 ? 'favorable' : 'unfavorable',
    'z-score': (v) => v !== undefined
      ? (Math.abs(v) < 2 ? 'within normal range' : 'unusual variation detected')
      : 'Statistical deviation measure',
    'critical path': () => 'Tasks that directly impact project end date',
    'float': () => 'Buffer time available before delay',
    'utilization': (v) => v !== undefined
      ? (v <= 85 ? 'healthy workload' : v <= 100 ? 'fully utilized' : 'overloaded')
      : 'Percentage of available time being used',
  };
  
  const lowerTerm = term.toLowerCase().replace(/[_-]/g, ' ').trim();
  const translator = translations[lowerTerm];
  
  return translator ? translator(value) : term;
}
