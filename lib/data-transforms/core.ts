'use client';

/**
 * Core data transformations: hour-to-task resolution and change control adjustments.
 */

import type { SampleData, TaskQuantityEntry, QuantityEntryType, ProgressMethod } from '@/types/data';
import { safeNum, buildCostAggregations } from './utils';

// ============================================================================
// TASK ID NORMALIZATION (shared with resource/tasks)
// ============================================================================

export const normalizeTaskId = (record: any): string | null => {
  if (!record) return null;
  return record.taskId || record.task_id || record.id || null;
};

// ============================================================================
// TASK PROGRESS HELPERS (shared with tasks module)
// ============================================================================

function normalizeQuantityEntry(entry: any): QuantityEntryType {
  if (!entry) return 'completed';
  return (entry.qtyType || entry.qty_type || 'completed') as QuantityEntryType;
}

export const buildTaskQuantityTotals = (entries: any[]) => {
  const completed = new Map<string, number>();
  const produced = new Map<string, number>();

  entries.forEach((entry: TaskQuantityEntry | any) => {
    const taskId = normalizeTaskId(entry);
    if (!taskId) return;
    const qty = Number(entry.qty ?? entry.quantity ?? entry.value ?? 0) || 0;
    const target = normalizeQuantityEntry(entry) === 'produced' ? produced : completed;
    target.set(taskId, (target.get(taskId) || 0) + qty);
  });

  return { completed, produced };
};

export const buildTaskActualHoursMap = (hours: any[]): Map<string, number> => {
  const map = new Map<string, number>();
  hours.forEach((h: any) => {
    const taskId = normalizeTaskId(h);
    if (!taskId) return;
    const hoursValue = safeNum(h.hours);
    map.set(taskId, (map.get(taskId) || 0) + hoursValue);
  });
  return map;
};

export const buildTaskActualCostMap = (hours: any[]): Map<string, number> => {
  const map = new Map<string, number>();
  hours.forEach((h: any) => {
    const taskId = normalizeTaskId(h);
    if (!taskId) return;
    const cost = Number(
      h.actualCost ?? h.actual_cost
      ?? h.reportedStandardCostAmt ?? h.reported_standard_cost_amt
    ) || 0;
    if (cost > 0) map.set(taskId, (map.get(taskId) || 0) + cost);
  });
  return map;
};

export const clampPercent = (value?: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value ?? 0));
};

const normalizeStatusKey = (value?: string): string => {
  if (!value) return '';
  return value.toLowerCase().trim().replace(/[\s_-]+/g, ' ');
};

const milestoneStatusWeights: Record<string, number> = {
  'completed': 100,
  'complete': 100,
  'in progress': 65,
  'in-progress': 65,
  'at risk': 45,
  'on hold': 25,
  'delayed': 20,
  'missed': 0,
  'blocked': 10,
  'not started': 0,
  'ready for review': 80
};

export const getMilestoneStatusWeight = (status?: string): number | null => {
  const key = normalizeStatusKey(status);
  if (!key) return null;
  return milestoneStatusWeights[key] ?? null;
};

export const buildMilestoneMap = (milestones: any[]): Map<string, any> => {
  const map = new Map<string, any>();
  milestones.forEach((milestone: any) => {
    const id = milestone.milestoneId || milestone.id || milestone.milestone_id;
    if (id) {
      map.set(id, milestone);
    }
  });
  return map;
};

// ============================================================================
// HOUR-TO-TASK RESOLUTION
// ============================================================================

export interface HoursMappingStats {
  totalHours: number;
  matchedHours: number;
  unmatchedHours: number;
  tasksWithHours: number;
  tasksWithoutHours: number;
  totalTasks: number;
  matchedHoursByMethod: Record<string, number>;
  sampleMatches: { hourId: string; taskId: string; taskName: string; method: string }[];
  unmatchedSample: { hourId: string; projectId: string; workdayPhase: string; workdayTask: string }[];
}

/**
 * Resolve hour entries to MPP tasks by matching on project_id and charge code.
 */
export function resolveHourEntriesToTasks(
  hours: any[],
  tasks: any[],
  phases: any[]
): { hours: any[]; stats: HoursMappingStats } {
  const stats: HoursMappingStats = {
    totalHours: hours?.length ?? 0,
    matchedHours: 0,
    unmatchedHours: 0,
    tasksWithHours: 0,
    tasksWithoutHours: 0,
    totalTasks: tasks?.length ?? 0,
    matchedHoursByMethod: {},
    sampleMatches: [],
    unmatchedSample: [],
  };

  if (!hours?.length || !tasks?.length) return { hours: hours ?? [], stats };
  const validTaskIds = new Set<string>();
  const taskIdToName = new Map<string, string>();
  tasks.forEach((t: any) => {
    const id = t.id ?? t.taskId;
    const name = t.name ?? t.taskName ?? t.task_name ?? '';
    if (id != null) {
      validTaskIds.add(String(id));
      taskIdToName.set(String(id), name);
    }
  });

  const phaseIdToName = new Map<string, string>();
  (phases ?? []).forEach((p: any) => {
    const id = p.id ?? p.phaseId ?? p.phase_id;
    const name = (p.name ?? p.phase_name ?? '').toString().trim();
    if (id != null) phaseIdToName.set(String(id), name);
  });

  const taskListByProject: { projectId: string; phaseName: string; taskName: string; taskId: string }[] = [];

  tasks.forEach((t: any) => {
    const projectId = t.projectId ?? t.project_id;
    const phaseId = t.phaseId ?? t.phase_id ?? '';
    const taskName = (t.name ?? t.taskName ?? t.task_name ?? '').toString().trim();
    const phaseName = phaseId ? (phaseIdToName.get(String(phaseId)) ?? '') : '';
    const taskId = String(t.id ?? t.taskId ?? '');
    if (projectId == null) return;

    taskListByProject.push({ projectId: String(projectId), phaseName, taskName, taskId });
  });

  const projectTasks = taskListByProject.filter((x) => x.projectId);
  const tasksWithHoursSet = new Set<string>();

  const trackMatch = (hourId: string, taskId: string, method: string) => {
    stats.matchedHours++;
    stats.matchedHoursByMethod[method] = (stats.matchedHoursByMethod[method] || 0) + 1;
    tasksWithHoursSet.add(taskId);
    if (stats.sampleMatches.length < 10) {
      stats.sampleMatches.push({
        hourId,
        taskId,
        taskName: taskIdToName.get(taskId) || taskId,
        method
      });
    }
  };

  const trackUnmatched = (h: any) => {
    stats.unmatchedHours++;
    if (stats.unmatchedSample.length < 10) {
      stats.unmatchedSample.push({
        hourId: h.id ?? h.entryId ?? h.entry_id ?? 'unknown',
        projectId: h.projectId ?? h.project_id ?? '',
        workdayPhase: h.workdayPhase ?? h.workday_phase ?? '',
        workdayTask: h.workdayTask ?? h.workday_task ?? '',
      });
    }
  };

  const enrichedHours = hours.map((h: any) => {
    const hourId = h.id ?? h.entryId ?? h.entry_id ?? '';
    const existingTaskId = h.taskId ?? h.task_id;
    if (existingTaskId && validTaskIds.has(String(existingTaskId))) {
      trackMatch(hourId, String(existingTaskId), 'existing');
      return h;
    }

    const projectId = h.projectId ?? h.project_id;

    if (!projectId) {
      trackUnmatched(h);
      return h;
    }

    const chargeCode = (h.chargeCode ?? h.charge_code ?? '').toString().trim().toLowerCase();
    if (!chargeCode) {
      trackUnmatched(h);
      return h;
    }

    const projectTasksForProject = projectTasks.filter((x) => x.projectId === String(projectId));
    for (const task of projectTasksForProject) {
      const taskNameLower = (task.taskName ?? '').toString().trim().toLowerCase();
      const phaseNameLower = (task.phaseName ?? '').toString().trim().toLowerCase();
      if (!taskNameLower) continue;

      const taskInChargeCode = chargeCode.includes(taskNameLower);
      const phaseInChargeCode = !phaseNameLower || chargeCode.includes(phaseNameLower);
      if (taskInChargeCode && phaseInChargeCode) {
        trackMatch(hourId, task.taskId, 'charge_code');
        return { ...h, taskId: task.taskId, task_id: task.taskId };
      }
    }

    trackUnmatched(h);
    return h;
  });

  stats.tasksWithHours = tasksWithHoursSet.size;
  stats.tasksWithoutHours = stats.totalTasks - stats.tasksWithHours;

  return { hours: enrichedHours, stats };
}

// ============================================================================
// CHANGE CONTROL ADJUSTMENTS
// ============================================================================

type ChangeDelta = {
  hours: number;
  cost: number;
  startDays: number;
  endDays: number;
  qty: number;
};

const ZERO_DELTA: ChangeDelta = { hours: 0, cost: 0, startDays: 0, endDays: 0, qty: 0 };
const APPROVED_CHANGE_STATUSES = new Set(['approved', 'implemented']);

const shiftDateByDays = (value: string | null | undefined, deltaDays: number): string | null => {
  if (!value || !deltaDays) return value ?? null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value ?? null;
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().split('T')[0];
};

const addDelta = (target: ChangeDelta, delta: ChangeDelta): ChangeDelta => ({
  hours: target.hours + delta.hours,
  cost: target.cost + delta.cost,
  startDays: target.startDays + delta.startDays,
  endDays: target.endDays + delta.endDays,
  qty: target.qty + delta.qty,
});

const collectApprovedChangeDeltas = (data: Partial<SampleData>) => {
  const changeRequests = data.changeRequests || [];
  const changeImpacts = data.changeImpacts || [];

  if (changeRequests.length === 0 || changeImpacts.length === 0) {
    return {
      approvedRequests: new Map<string, any>(),
      approvedImpacts: [] as any[],
      projectDeltas: new Map<string, ChangeDelta>(),
      phaseDeltas: new Map<string, ChangeDelta>(),
      taskDeltas: new Map<string, ChangeDelta>(),
    };
  }

  const approvedRequests = new Map(
    changeRequests
      .filter(req => APPROVED_CHANGE_STATUSES.has(req.status))
      .map(req => [req.id, req])
  );

  const approvedImpacts = changeImpacts.filter(impact => approvedRequests.has(impact.changeRequestId));

  const projectDeltas = new Map<string, ChangeDelta>();
  const phaseDeltas = new Map<string, ChangeDelta>();
  const taskDeltas = new Map<string, ChangeDelta>();

  approvedImpacts.forEach((impact: any) => {
    const delta: ChangeDelta = {
      hours: Number(impact.deltaBaselineHours) || 0,
      cost: Number(impact.deltaBaselineCost) || 0,
      startDays: Number(impact.deltaStartDays) || 0,
      endDays: Number(impact.deltaEndDays) || 0,
      qty: Number(impact.deltaQty) || 0,
    };

    if (impact.projectId) {
      projectDeltas.set(impact.projectId, addDelta(projectDeltas.get(impact.projectId) || ZERO_DELTA, delta));
    }
    if (impact.phaseId) {
      phaseDeltas.set(impact.phaseId, addDelta(phaseDeltas.get(impact.phaseId) || ZERO_DELTA, delta));
    }
    if (impact.taskId) {
      taskDeltas.set(impact.taskId, addDelta(taskDeltas.get(impact.taskId) || ZERO_DELTA, delta));
    }
  });

  return { approvedRequests, approvedImpacts, projectDeltas, phaseDeltas, taskDeltas };
};

const buildChangeControlSummary = (
  data: Partial<SampleData>,
  approvedRequests: Map<string, any>,
  approvedImpacts: any[],
  projectDeltas: Map<string, ChangeDelta>
) => {
  const projects = data.projects || [];
  const projectNameMap = new Map(
    projects.map((p: any) => [p.id || p.projectId, p.name || p.projectId || 'Project'])
  );

  const byProject = Array.from(projectDeltas.entries()).map(([projectId, delta]) => ({
    projectId,
    projectName: projectNameMap.get(projectId) || projectId,
    approvedDeltaHours: delta.hours,
    approvedDeltaCost: delta.cost,
    approvedDeltaStartDays: delta.startDays,
    approvedDeltaEndDays: delta.endDays,
    approvedDeltaQty: delta.qty,
  }));

  const monthlyMap = new Map<string, ChangeDelta>();
  approvedImpacts.forEach((impact: any) => {
    const request = approvedRequests.get(impact.changeRequestId);
    const dateValue = request?.approvedAt || request?.submittedAt;
    const monthKey = dateValue ? new Date(dateValue).toISOString().slice(0, 7) : 'Unknown';
    const delta: ChangeDelta = {
      hours: Number(impact.deltaBaselineHours) || 0,
      cost: Number(impact.deltaBaselineCost) || 0,
      startDays: Number(impact.deltaStartDays) || 0,
      endDays: Number(impact.deltaEndDays) || 0,
      qty: Number(impact.deltaQty) || 0,
    };
    monthlyMap.set(monthKey, addDelta(monthlyMap.get(monthKey) || ZERO_DELTA, delta));
  });

  const byMonth = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, delta]) => ({
      month,
      approvedDeltaHours: delta.hours,
      approvedDeltaCost: delta.cost,
      approvedDeltaQty: delta.qty,
    }));

  return { byProject, byMonth };
};

interface TaskProgressContext {
  quantityTotals: ReturnType<typeof buildTaskQuantityTotals>;
  milestoneMap: Map<string, any>;
  actualHoursMap: Map<string, number>;
}

const resolveProgressMethod = (value?: string | null, isMilestoneFlag?: boolean): ProgressMethod => {
  const normalized = (value || (isMilestoneFlag ? 'milestone' : 'hours')).toLowerCase();
  if (normalized === 'quantity') return 'quantity';
  if (normalized === 'milestone') return 'milestone';
  return 'hours';
};

const deriveMilestonePercent = (
  task: any,
  context: TaskProgressContext,
  fallbackPercent: number
): number => {
  const milestoneId = task.milestoneId || task.milestone_id;
  const milestone = milestoneId ? context.milestoneMap.get(milestoneId) : undefined;
  if (milestone && typeof milestone.percentComplete === 'number') {
    return clampPercent(milestone.percentComplete);
  }
  const status = milestone?.status || task.status || task.milestoneStatus || task.milestone_status || '';
  const weighted = getMilestoneStatusWeight(status);
  if (weighted !== null) {
    return clampPercent(weighted);
  }
  return clampPercent(fallbackPercent ?? 0);
};

const applyTaskProgress = (task: any, context: TaskProgressContext) => {
  const taskId = normalizeTaskId(task);
  if (!taskId) return task;
  const baselineHours = safeNum(task.baselineHours ?? task.budgetHours);
  const baselineQty = safeNum(task.baselineQty);
  const completedQty = safeNum(task.completedQty) + safeNum(context.quantityTotals.completed.get(taskId));
  const actualHours = safeNum(context.actualHoursMap.get(taskId) ?? task.actualHours);
  const method = resolveProgressMethod(task.progressMethod || task.progress_method, task.isMilestone);
  const hoursPercent = baselineHours > 0 ? (actualHours / baselineHours) * 100 : 0;
  let percentComplete = 0;

  if (method === 'quantity') {
    percentComplete = baselineQty > 0 ? (completedQty / baselineQty) * 100 : 0;
  } else if (method === 'milestone') {
    percentComplete = deriveMilestonePercent(task, context, hoursPercent);
  } else {
    percentComplete = hoursPercent;
  }

  const normalizedPercent = clampPercent(percentComplete);
  const earnedHours = baselineHours * (normalizedPercent / 100);
  const taskEfficiency = actualHours > 0 ? clampPercent((earnedHours / actualHours) * 100) : null;
  const rawRemaining = task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours;
  const remainingHours = rawRemaining != null ? Number(rawRemaining) || 0 : null;

  return {
    ...task,
    percentComplete: normalizedPercent,
    taskEfficiency,
    actualHours,
    remainingHours,
  };
};

const applyProgressToList = (items: any[], context: TaskProgressContext) =>
  items.map(item => applyTaskProgress(item, context));

/**
 * Apply change control adjustments to raw data (baseline shifts, progress context).
 */
export function applyChangeControlAdjustments(rawData: Partial<SampleData>) {
  const { approvedRequests, approvedImpacts, projectDeltas, phaseDeltas, taskDeltas } =
    collectApprovedChangeDeltas(rawData);

  const summary = buildChangeControlSummary(rawData, approvedRequests, approvedImpacts, projectDeltas);

  const milestoneList = [...(rawData.milestones || []), ...(rawData.milestonesTable || [])];
  const progressContext: TaskProgressContext = {
    quantityTotals: buildTaskQuantityTotals(rawData.taskQuantityEntries || []),
    milestoneMap: buildMilestoneMap(milestoneList),
    actualHoursMap: buildTaskActualHoursMap(rawData.hours || []),
  };
  const taskActualHoursMap = buildTaskActualHoursMap(rawData.hours || []);
  const taskActualCostFromHours = buildTaskActualCostMap(rawData.hours || []);
  const costAggregations = buildCostAggregations(rawData.costTransactions || []);

  const tasks = (rawData.tasks || []).map((task: any) => {
    const taskId = task.id || task.taskId;
    const delta = taskDeltas.get(taskId) || ZERO_DELTA;
    const baseHours = task.baselineHours ?? task.budgetHours ?? 0;
    const baseCost = task.baselineCost ?? 0;
    const adjustedBaselineHours = baseHours + delta.hours;
    const adjustedBaselineCost = baseCost + delta.cost;
    const actualHours = taskActualHoursMap.get(taskId) ?? 0;
    const taskCost = costAggregations.byTask.get(taskId) || { actual: 0, forecast: 0 };
    const laborActualFromHours = taskActualCostFromHours.get(taskId) || 0;
    const actualCost = laborActualFromHours + taskCost.actual;
    const nonLaborForecast = taskCost.forecast;

    const taskRemaining = task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours;
    const remainingHours = taskRemaining != null ? Number(taskRemaining) || 0 : null;
    const rawRemainingCost = task.remainingCost ?? task.remaining_cost;
    const remainingCost = rawRemainingCost != null ? Number(rawRemainingCost) : null;

    return {
      ...task,
      baselineHours: adjustedBaselineHours,
      baselineCost: adjustedBaselineCost,
      baselineStartDate: shiftDateByDays(task.baselineStartDate, delta.startDays),
      baselineEndDate: shiftDateByDays(task.baselineEndDate, delta.endDays),
      remainingHours,
      actualHours,
      actualCost,
      nonLaborActualCost: taskCost.actual,
      nonLaborForecastCost: nonLaborForecast,
      remainingCost,
    };
  });

  const subTasks = (rawData.subTasks || []).map((task: any) => {
    const taskId = task.id || task.taskId;
    const delta = taskDeltas.get(taskId) || ZERO_DELTA;
    const baseHours = task.baselineHours ?? task.budgetHours ?? 0;
    const baseCost = task.baselineCost ?? 0;
    const adjustedBaselineHours = baseHours + delta.hours;
    const adjustedBaselineCost = baseCost + delta.cost;
    const actualHours = taskActualHoursMap.get(taskId) ?? 0;
    const taskCost = costAggregations.byTask.get(taskId) || { actual: 0, forecast: 0 };
    const laborActualFromHours = taskActualCostFromHours.get(taskId) || 0;
    const actualCost = laborActualFromHours + taskCost.actual;
    const nonLaborForecast = taskCost.forecast;

    const subRemaining = task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours;
    const subRemainingHours = subRemaining != null ? Number(subRemaining) || 0 : null;
    const rawSubRemainingCost = task.remainingCost ?? task.remaining_cost;
    const subRemainingCost = rawSubRemainingCost != null ? Number(rawSubRemainingCost) : null;

    return {
      ...task,
      baselineHours: adjustedBaselineHours,
      baselineCost: adjustedBaselineCost,
      baselineStartDate: shiftDateByDays(task.baselineStartDate, delta.startDays),
      baselineEndDate: shiftDateByDays(task.baselineEndDate, delta.endDays),
      remainingHours: subRemainingHours,
      actualHours,
      actualCost,
      nonLaborActualCost: taskCost.actual,
      nonLaborForecastCost: nonLaborForecast,
      remainingCost: subRemainingCost,
    };
  });

  const phases = (rawData.phases || []).map((phase: any) => {
    const phaseId = phase.id || phase.phaseId;
    const delta = phaseDeltas.get(phaseId) || ZERO_DELTA;
    const baseHours = phase.baselineHours || 0;
    const baseCost = phase.baselineCost || 0;
    const adjustedBaselineHours = baseHours + delta.hours;
    const adjustedBaselineCost = baseCost + delta.cost;
    const actualHours = phase.actualHours || 0;
    const phaseCost = costAggregations.byPhase.get(phaseId) || { actual: 0, forecast: 0 };
    const actualCost = (phase.actualCost || 0) + phaseCost.actual;
    const nonLaborForecast = phaseCost.forecast;

    const phaseRemaining = phase.remainingHours ?? phase.remaining_hours;
    return {
      ...phase,
      baselineHours: adjustedBaselineHours,
      baselineCost: adjustedBaselineCost,
      baselineStartDate: shiftDateByDays(phase.baselineStartDate, delta.startDays),
      baselineEndDate: shiftDateByDays(phase.baselineEndDate, delta.endDays),
      remainingHours: phaseRemaining != null ? Number(phaseRemaining) : null,
      actualCost,
      nonLaborActualCost: phaseCost.actual,
      nonLaborForecastCost: nonLaborForecast,
      remainingCost: phase.remainingCost != null ? Number(phase.remainingCost) : null,
    };
  });

  const projects = (rawData.projects || []).map((project: any) => {
    const projectId = project.id || project.projectId;
    const delta = projectDeltas.get(projectId) || ZERO_DELTA;
    const baseHours = project.baselineHours ?? project.budgetHours ?? 0;
    const baseCost = project.baselineCost ?? project.budgetCost ?? 0;
    const adjustedBaselineHours = baseHours + delta.hours;
    const adjustedBaselineCost = baseCost + delta.cost;
    const actualHours = project.actualHours || 0;
    const projectCost = costAggregations.byProject.get(projectId) || { actual: 0, forecast: 0 };
    const actualCost = (project.actualCost || 0) + projectCost.actual;
    const nonLaborForecast = projectCost.forecast;

    const projRemaining = project.remainingHours ?? project.remaining_hours;
    return {
      ...project,
      baselineHours: adjustedBaselineHours,
      baselineCost: adjustedBaselineCost,
      baselineStartDate: shiftDateByDays(project.baselineStartDate, delta.startDays),
      baselineEndDate: shiftDateByDays(project.baselineEndDate, delta.endDays),
      remainingHours: projRemaining != null ? Number(projRemaining) : null,
      actualCost,
      nonLaborActualCost: projectCost.actual,
      nonLaborForecastCost: nonLaborForecast,
      remainingCost: project.remainingCost != null ? Number(project.remainingCost) : null,
    };
  });

  const tasksWithProgress = applyProgressToList(tasks, progressContext);
  const subTasksWithProgress = applyProgressToList(subTasks, progressContext);

  return {
    adjustedData: { ...rawData, tasks: tasksWithProgress, subTasks: subTasksWithProgress, phases, projects },
    changeControlSummary: summary,
  };
}
