'use client';

/**
 * Main transform orchestration: applies all transformations to raw data.
 */

import type { TransformView } from '@/lib/route-data-config';
import type { SampleData } from '@/types/data';
import { resolveHourEntriesToTasks, applyChangeControlAdjustments } from './core';
import { buildWBSData } from './wbs';
import { buildLaborBreakdown, buildResourceHeatmap, buildResourceGantt, buildResourceLeveling } from './resource';
import { buildHierarchy } from './hierarchy';
import { buildSCurveData, buildBudgetVariance, buildForecastData } from './budget-forecast';
import { buildMilestoneStatus, buildMilestoneStatusPie, buildPlanVsForecastVsActual, buildMilestoneScoreboard, buildMilestones } from './milestones';
import { buildTaskHoursEfficiency, buildTaskProductivityMetrics, buildPhaseProductivityMetrics, buildProjectProductivityMetrics, buildCountMetricsAnalysis, buildProjectsEfficiencyMetrics, buildQualityHours, buildNonExecuteHours, buildScheduleHealth, buildCatchUpLog } from './tasks';
import { buildQCTransactionByGate, buildQCTransactionByProject, buildQCByGateStatus, buildQCByNameAndRole, buildQCBySubproject, buildExecuteHoursSinceLastQC, buildEXHoursToQCRatio, buildExecuteHoursSinceLastQCByProject, buildQCHoursSinceLastQC, buildQCHoursToQCRatio, buildQCHoursSinceLastQCByProject, buildQCPassFailByTask, buildQCFeedbackTimeByTask, buildQCPassRatePerMonth, buildQCOutcomesByMonth, buildQCFeedbackTimeByMonth } from './qc';
import { buildDocumentSignoffGauges, buildDeliverableByStatus, buildDeliverablesTracker } from './documents';
import type { HoursMappingStats } from './core';
import type { ResourceLevelingData } from './resource';

export type { HoursMappingStats, ResourceLevelingData };

export interface TransformDataOptions {
  onLog?: (engine: string, lines: string[]) => void;
  /** When set, labor breakdown and resource heatmap use this for week list (all dates) but filtered hours for values. Use when date filter would otherwise collapse to one week. */
  allHoursForWeekRange?: any[];
  /** When set, only build these computed views. Use 'all' to build everything (default when undefined). */
  views?: TransformView[];
}

function shouldBuildView(views: TransformView[] | undefined, view: TransformView): boolean {
  if (!views || views.length === 0) return true;
  if (views.includes('all')) return true;
  return views.includes(view);
}

/**
 * Transform raw database data into computed view structures
 */
export function transformData(rawData: Partial<SampleData>, options?: TransformDataOptions): Partial<SampleData> {
  const startTime = performance.now();
  const transformed: Partial<SampleData> = { ...rawData };
  const views = options?.views;

  const { hours: enrichedHours, stats: mappingStats } = resolveHourEntriesToTasks(
    rawData.hours ?? [],
    rawData.tasks ?? [],
    rawData.phases ?? []
  );
  const dataWithEnrichedHours: Partial<SampleData> = { ...rawData, hours: enrichedHours };

  const { adjustedData, changeControlSummary } = applyChangeControlAdjustments(dataWithEnrichedHours);

  const hoursCount = rawData.hours?.length ?? 0;
  const tasksCount = adjustedData.tasks?.length ?? 0;

  const actualsLines = [
    `[${new Date().toISOString()}] Actuals / progress`,
    `> Hour entries: ${hoursCount}`,
    `> Tasks: ${tasksCount}`,
    ``,
    `Hours-to-Tasks Mapping:`,
    `  Matched: ${mappingStats.matchedHours} (${hoursCount > 0 ? ((mappingStats.matchedHours / hoursCount) * 100).toFixed(1) : 0}%)`,
    `  Unmatched: ${mappingStats.unmatchedHours}`,
    `  Tasks with hours: ${mappingStats.tasksWithHours}`,
    `  Tasks without hours: ${mappingStats.tasksWithoutHours}`,
  ];

  if (Object.keys(mappingStats.matchedHoursByMethod).length > 0) {
    actualsLines.push(`  Match methods:`);
    for (const [method, count] of Object.entries(mappingStats.matchedHoursByMethod)) {
      actualsLines.push(`    - ${method}: ${count}`);
    }
  }

  if (mappingStats.sampleMatches.length > 0) {
    actualsLines.push(`  Sample matches (${Math.min(5, mappingStats.sampleMatches.length)} of ${mappingStats.matchedHours}):`);
    mappingStats.sampleMatches.slice(0, 5).forEach(m => {
      actualsLines.push(`    - "${m.taskName.substring(0, 40)}${m.taskName.length > 40 ? '...' : ''}" (${m.method})`);
    });
  }

  if (mappingStats.unmatchedSample.length > 0) {
    actualsLines.push(`  Sample unmatched hours (${Math.min(5, mappingStats.unmatchedSample.length)} of ${mappingStats.unmatchedHours}):`);
    mappingStats.unmatchedSample.slice(0, 5).forEach(u => {
      actualsLines.push(`    - Project: ${u.projectId || 'none'}, Phase: "${u.workdayPhase || 'none'}", Task: "${u.workdayTask || 'none'}"`);
    });
  }

  options?.onLog?.('Actuals', actualsLines);

  transformed.changeControlSummary = changeControlSummary;

  if (shouldBuildView(views, 'wbsData') && (adjustedData.portfolios?.length || adjustedData.projects?.length || adjustedData.tasks?.length)) {
    const wbsStartTime = performance.now();
    transformed.wbsData = buildWBSData(adjustedData);
    const wbsDuration = performance.now() - wbsStartTime;
    if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
      console.debug(`[Performance] buildWBSData took ${wbsDuration.toFixed(2)}ms`);
    }
  }

  if ((shouldBuildView(views, 'laborBreakdown') || shouldBuildView(views, 'resourceHeatmap')) && (adjustedData.hours?.length || adjustedData.employees?.length)) {
    if (shouldBuildView(views, 'laborBreakdown')) {
      const laborStartTime = performance.now();
      transformed.laborBreakdown = buildLaborBreakdown(adjustedData, { allHoursForWeekRange: options?.allHoursForWeekRange });
      const laborDuration = performance.now() - laborStartTime;
      if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
        console.debug(`[Performance] buildLaborBreakdown took ${laborDuration.toFixed(2)}ms`);
      }
    }
    if (shouldBuildView(views, 'resourceHeatmap')) {
      const heatmapStartTime = performance.now();
      transformed.resourceHeatmap = buildResourceHeatmap(adjustedData, { allHoursForWeekRange: options?.allHoursForWeekRange });
      const heatmapDuration = performance.now() - heatmapStartTime;
      if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
        console.debug(`[Performance] buildResourceHeatmap took ${heatmapDuration.toFixed(2)}ms`);
      }
    }
  }

  if (shouldBuildView(views, 'resourceGantt') && adjustedData.employees?.length) {
    transformed.resourceGantt = buildResourceGantt(adjustedData);
  }

  if (shouldBuildView(views, 'taskHoursEfficiency') && adjustedData.tasks?.length) {
    transformed.taskHoursEfficiency = buildTaskHoursEfficiency(adjustedData);
    const taskProductivity = buildTaskProductivityMetrics(adjustedData);
    transformed.taskProductivity = taskProductivity;
    transformed.phaseProductivity = buildPhaseProductivityMetrics(taskProductivity, adjustedData);
    transformed.projectProductivity = buildProjectProductivityMetrics(taskProductivity, adjustedData);
  } else {
    transformed.taskProductivity = [];
    transformed.phaseProductivity = [];
    transformed.projectProductivity = [];
  }

  if (shouldBuildView(views, 'hierarchy') && (adjustedData.portfolios?.length || adjustedData.customers?.length || adjustedData.sites?.length || adjustedData.projects?.length)) {
    const hierarchyStartTime = performance.now();
    transformed.hierarchy = buildHierarchy(adjustedData) as any;
    const hierarchyDuration = performance.now() - hierarchyStartTime;
    if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
      console.debug(`[Performance] buildHierarchy took ${hierarchyDuration.toFixed(2)}ms`);
    }
  }

  if (shouldBuildView(views, 'sCurve') && (adjustedData.tasks?.length || adjustedData.hours?.length || adjustedData.projects?.length)) {
    transformed.sCurve = buildSCurveData(adjustedData);
  }

  if (shouldBuildView(views, 'budgetVariance') && (adjustedData.projects?.length || adjustedData.phases?.length || adjustedData.tasks?.length)) {
    transformed.budgetVariance = buildBudgetVariance(adjustedData);
  }

  if (shouldBuildView(views, 'milestoneStatus') && (adjustedData.milestones?.length || adjustedData.milestonesTable?.length || adjustedData.tasks?.length)) {
    transformed.milestoneStatus = buildMilestoneStatus(adjustedData);
  }

  if (adjustedData.tasks?.length) {
    transformed.countMetricsAnalysis = buildCountMetricsAnalysis(adjustedData);
  }

  if (adjustedData.projects?.length || adjustedData.tasks?.length) {
    transformed.projectsEfficiencyMetrics = buildProjectsEfficiencyMetrics(adjustedData);
  }

  if (shouldBuildView(views, 'qualityHours') && (adjustedData.tasks?.length || adjustedData.hours?.length)) {
    transformed.qualityHours = buildQualityHours(adjustedData, {
      taskOrder: transformed.taskHoursEfficiency?.tasks,
    });
  }

  if (adjustedData.hours?.length || adjustedData.tasks?.length) {
    transformed.nonExecuteHours = buildNonExecuteHours(adjustedData);
  }

  transformed.scheduleHealth = buildScheduleHealth(adjustedData);

  if (shouldBuildView(views, 'forecast') && (adjustedData.projects?.length || adjustedData.tasks?.length)) {
    transformed.forecast = buildForecastData(adjustedData);
  }

  if (shouldBuildView(views, 'qc') && (adjustedData.qctasks?.length || adjustedData.tasks?.length || adjustedData.employees?.length || adjustedData.hours?.length)) {
    transformed.qcTransactionByGate = buildQCTransactionByGate(adjustedData);
    transformed.qcTransactionByProject = buildQCTransactionByProject(adjustedData);
    transformed.qcByGateStatus = buildQCByGateStatus(adjustedData);
    transformed.qcByNameAndRole = buildQCByNameAndRole(adjustedData);
    transformed.qcBySubproject = buildQCBySubproject(adjustedData);
    transformed.executeHoursSinceLastQC = buildExecuteHoursSinceLastQC(adjustedData);
    transformed.exHoursToQCRatio = buildEXHoursToQCRatio(adjustedData);
    transformed.executeHoursSinceLastQCByProject = buildExecuteHoursSinceLastQCByProject(adjustedData);
    transformed.qcHoursSinceLastQC = buildQCHoursSinceLastQC(adjustedData);
    transformed.qcHoursToQCRatio = buildQCHoursToQCRatio(adjustedData);
    transformed.qcHoursSinceLastQCByProject = buildQCHoursSinceLastQCByProject(adjustedData);
    transformed.qcPassFailByTask = buildQCPassFailByTask(adjustedData);
    transformed.qcFeedbackTimeByTask = buildQCFeedbackTimeByTask(adjustedData);
    transformed.qcPassRatePerMonth = buildQCPassRatePerMonth(adjustedData);
    transformed.qcOutcomesByMonth = buildQCOutcomesByMonth(adjustedData);
    transformed.qcFeedbackTimeByMonth = buildQCFeedbackTimeByMonth(adjustedData);
    transformed.kickoffFeedbackTimeByMonth = buildQCFeedbackTimeByMonth(adjustedData);
  }

  if (shouldBuildView(views, 'milestones') && (adjustedData.milestones?.length || adjustedData.milestonesTable?.length || adjustedData.tasks?.length)) {
    transformed.milestoneStatusPie = buildMilestoneStatusPie(adjustedData);
    transformed.planVsForecastVsActual = buildPlanVsForecastVsActual(adjustedData);
    transformed.milestoneScoreboard = buildMilestoneScoreboard(adjustedData);
    const milestonesStartTime = performance.now();
    transformed.milestones = buildMilestones(adjustedData);
    const milestonesDuration = performance.now() - milestonesStartTime;
    if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
      console.debug(`[Performance] buildMilestones took ${milestonesDuration.toFixed(2)}ms`);
    }
  }

  const totalDuration = performance.now() - startTime;
  if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
    console.debug(`[Performance] transformData total took ${totalDuration.toFixed(2)}ms`);
  }

  if (shouldBuildView(views, 'documents') && (adjustedData.deliverables?.length || adjustedData.deliverablesTracker?.length || adjustedData.projects?.length)) {
    transformed.documentSignoffGauges = buildDocumentSignoffGauges(adjustedData);
    transformed.deliverableByStatus = buildDeliverableByStatus(adjustedData);
    transformed.deliverablesTracker = buildDeliverablesTracker(adjustedData);
  }

  transformed.catchUpLog = buildCatchUpLog(adjustedData);

  if (shouldBuildView(views, 'resourceLeveling') && (adjustedData.hours?.length || adjustedData.tasks?.length || adjustedData.employees?.length)) {
    transformed.resourceLeveling = buildResourceLeveling(adjustedData);
  }

  return transformed;
}
