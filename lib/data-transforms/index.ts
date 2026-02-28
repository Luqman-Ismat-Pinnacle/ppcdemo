'use client';

/**
 * @fileoverview Data Transformation Layer for PPC V3.
 *
 * Transforms raw database table data into computed view structures
 * required by the visualization pages. This bridges the gap between
 * flat Supabase tables and the hierarchical/aggregated views the UI expects.
 *
 * @module lib/data-transforms
 */

export { transformData, type TransformDataOptions, type HoursMappingStats, type ResourceLevelingData } from './transform-data';
export { clearMemoizationCache } from './utils';
export { buildWBSData, type TransformWBSItem } from './wbs';
export { buildHierarchy } from './hierarchy';
export { buildLaborBreakdown, buildResourceHeatmap, buildResourceGantt, buildResourceLeveling } from './resource';
export { buildSCurveData, buildBudgetVariance, buildForecastData } from './budget-forecast';
export { buildMilestoneStatus, buildMilestoneStatusPie, buildPlanVsForecastVsActual, buildMilestoneScoreboard, buildMilestones } from './milestones';
export { buildTaskHoursEfficiency, buildPhaseProductivityMetrics, buildProjectProductivityMetrics, buildCountMetricsAnalysis, buildProjectsEfficiencyMetrics, buildQualityHours, buildNonExecuteHours, buildScheduleHealth, isTPWDescription, isTPWChargeCode, buildCatchUpLog } from './tasks';
export { buildDocumentSignoffGauges, buildDeliverableByStatus, buildDeliverablesTracker } from './documents';
export {
  buildQCTransactionByGate,
  buildQCTransactionByProject,
  buildQCByGateStatus,
  buildQCByNameAndRole,
  buildQCBySubproject,
  buildExecuteHoursSinceLastQC,
  buildEXHoursToQCRatio,
  buildExecuteHoursSinceLastQCByProject,
  buildQCHoursSinceLastQC,
  buildQCHoursToQCRatio,
  buildQCHoursSinceLastQCByProject,
  buildQCPassFailByTask,
  buildQCFeedbackTimeByTask,
  buildQCPassRatePerMonth,
  buildQCOutcomesByMonth,
  buildQCFeedbackTimeByMonth,
} from './qc';
