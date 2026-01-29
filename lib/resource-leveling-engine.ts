/**
 * @file resource-leveling-engine.ts
 * @description Resource leveling engine adapted from the ProjectLeveling Ruby reference.
 *
 * This module keeps the same conceptual structure (ImportanceManager, PathsManager,
 * SolutionManager, TaskAssignmentManager) but uses a streamlined, deterministic
 * leveling pass suitable for UI-driven what-if scenarios.
 */

import type { Employee, SampleData, Task as DataTask } from '@/types/data';

type TaskRecord = DataTask & { id?: string; name?: string };

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type DateKey = string;

export interface LevelingProject {
  startDate: string;
  endDate: string;
}

export interface LevelingResource {
  id: string;
  name: string;
  availabilityMap: Record<DateKey, number>;
}

export interface LevelingTask {
  id: string;
  name: string;
  priority: number;
  sizingHours: number;
  resourcesMap: Record<string, number>;
  predecessorIds: string[];
  successorIds: string[];
  importance?: number;
  constraintType?: string | null;
  constraintDate?: string | null;
  calendarId?: string | null;
}

export interface LevelingParams {
  workdayHours: number;
  bufferDays: number;
  maxScheduleDays: number;
  preferSingleResource: boolean;
  allowSplits: boolean;
  workdaysOnly: boolean;
}

export type LevelingNumericParam = 'workdayHours' | 'bufferDays' | 'maxScheduleDays';

export interface LevelingLogEntry {
  timestamp: string;
  type: 'leveling' | 'update' | 'warning';
  message: string;
  params?: Partial<LevelingParams>;
  results?: {
    scheduledTasks: number;
    maxDelayDays: number;
    avgUtilization: number;
  };
}

export interface TaskSchedule {
  taskId: string;
  name: string;
  startDate: string;
  endDate: string;
  endDateHours: number;
  totalHours: number;
  assignedResources: string[];
  delayDays: number;
  importance: number;
}

export interface ResourceUtilization {
  resourceId: string;
  name: string;
  totalAvailable: number;
  totalAssigned: number;
  utilizationPct: number;
}

export interface LevelingError {
  taskId: string;
  name: string;
  message: string;
}

export interface LevelingSummary {
  totalTasks: number;
  scheduledTasks: number;
  totalHours: number;
  averageUtilization: number;
  peakUtilization: number;
  maxDelayDays: number;
  maxDelayImportance: number;
}

export interface LevelingResult {
  assignment: Record<string, Record<string, Record<DateKey, number>>>;
  schedules: Record<string, TaskSchedule>;
  resourceUtilization: ResourceUtilization[];
  delayedTasks: TaskSchedule[];
  errors: LevelingError[];
  summary: LevelingSummary;
  warnings: string[];
  projectWindow: LevelingProject;
}

export interface LevelingInputs {
  tasks: LevelingTask[];
  resources: LevelingResource[];
  project: LevelingProject;
  warnings: string[];
}

// ============================================================================
// DEFAULTS & LABELS
// ============================================================================

export const DEFAULT_LEVELING_PARAMS: LevelingParams = {
  workdayHours: 8,
  bufferDays: 10,
  maxScheduleDays: 180,
  preferSingleResource: true,
  allowSplits: true,
  workdaysOnly: true
};

export const LEVELING_PARAM_LABELS: Record<LevelingNumericParam, {
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
}> = {
  workdayHours: {
    label: 'Workday Hours',
    description: 'Daily capacity per resource',
    min: 4,
    max: 12,
    step: 1
  },
  bufferDays: {
    label: 'Buffer Days',
    description: 'Extra days beyond project end',
    min: 0,
    max: 60,
    step: 1
  },
  maxScheduleDays: {
    label: 'Max Schedule Days',
    description: 'Hard cap on schedule length',
    min: 30,
    max: 365,
    step: 5
  }
};

// ============================================================================
// DATE HELPERS
// ============================================================================

function normalizeDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return normalizeDate(parsed);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return normalizeDate(next);
}

function getDateKey(date: Date): DateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function enumerateDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  let cursor = normalizeDate(start);
  const last = normalizeDate(end);
  while (cursor <= last) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function diffDays(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((normalizeDate(end).getTime() - normalizeDate(start).getTime()) / msPerDay);
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// ============================================================================
// IMPORTANCE MANAGER (adapted)
// ============================================================================

class ImportanceManager {
  static populateImportances(tasks: LevelingTask[]): void {
    const taskMap = new Map(tasks.map(task => [task.id, task]));

    const compute = (task: LevelingTask, seen: Set<string>): number => {
      if (task.importance != null) return task.importance;
      if (seen.has(task.id)) return task.priority;
      seen.add(task.id);
      let importance = task.priority;
      task.successorIds.forEach((succId) => {
        const successor = taskMap.get(succId);
        if (successor) {
          importance = Math.max(importance, compute(successor, seen));
        }
      });
      task.importance = importance;
      return importance;
    };

    tasks.forEach(task => {
      if (task.importance == null) {
        compute(task, new Set<string>());
      }
    });
  }

  static getSortedTasks(tasks: LevelingTask[]): LevelingTask[] {
    const taskMap = new Map(tasks.map(task => [task.id, task]));
    const inDegree = new Map<string, number>();
    tasks.forEach(task => {
      inDegree.set(task.id, task.predecessorIds.length);
    });

    const ready: LevelingTask[] = [];
    tasks.forEach(task => {
      if ((inDegree.get(task.id) || 0) === 0) {
        ready.push(task);
      }
    });

    const sorted: LevelingTask[] = [];
    while (ready.length > 0) {
      ready.sort((a, b) => {
        const importanceDiff = (b.importance || b.priority) - (a.importance || a.priority);
        if (importanceDiff !== 0) return importanceDiff;
        return b.priority - a.priority;
      });
      const next = ready.shift();
      if (!next) break;
      sorted.push(next);
      next.successorIds.forEach((succId) => {
        const current = inDegree.get(succId) || 0;
        inDegree.set(succId, Math.max(0, current - 1));
        if (current - 1 === 0) {
          const successor = taskMap.get(succId);
          if (successor) {
            ready.push(successor);
          }
        }
      });
    }

    return sorted;
  }
}

// ============================================================================
// TASK ASSIGNMENT MANAGER (adapted)
// ============================================================================

class TaskAssignmentManager {
  static getEarliestStartDate(
    task: LevelingTask,
    schedules: Record<string, TaskSchedule>,
    projectStart: Date
  ): Date {
    let earliest = projectStart;
    task.predecessorIds.forEach((predId) => {
      const predSchedule = schedules[predId];
      if (predSchedule) {
        const predEnd = parseDate(predSchedule.endDate);
        if (predEnd && addDays(predEnd, 1) > earliest) {
          earliest = addDays(predEnd, 1);
        }
      }
    });
    return earliest;
  }

  static assignTask(
    task: LevelingTask,
    resources: LevelingResource[],
    resourceUsage: Record<string, Record<DateKey, number>>,
    schedules: Record<string, TaskSchedule>,
    projectStart: Date,
    projectEnd: Date,
    params: LevelingParams
  ): { assignment: Record<string, Record<DateKey, number>>; schedule: TaskSchedule | null; error?: string } {
    const totalTaskCapacity = Object.values(task.resourcesMap).reduce((sum, hours) => sum + hours, 0);
    if (totalTaskCapacity < task.sizingHours) {
      return {
        assignment: {},
        schedule: null,
        error: 'Not enough task-specific resource capacity'
      };
    }

    const earliestStart = TaskAssignmentManager.getEarliestStartDate(task, schedules, projectStart);
    const scheduleEnd = TaskAssignmentManager.getScheduleEndDate(projectStart, projectEnd, params);
    if (earliestStart > scheduleEnd) {
      return {
        assignment: {},
        schedule: null,
        error: 'Earliest start exceeds scheduling window'
      };
    }

    const taskResourceRemaining = new Map<string, number>();
    Object.entries(task.resourcesMap).forEach(([resourceId, hours]) => {
      taskResourceRemaining.set(resourceId, hours);
    });

    const assignment: Record<string, Record<DateKey, number>> = {};
    let totalAssigned = 0;
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    let endDateHours = 0;
    let primaryResource: string | null = null;

    const dates = enumerateDates(earliestStart, scheduleEnd);

    dates.forEach((date) => {
      if (totalAssigned >= task.sizingHours) return;
      const dateKey = getDateKey(date);

      const availableResources = resources
        .map((resource) => {
          const taskRemaining = taskResourceRemaining.get(resource.id) || 0;
          if (taskRemaining <= 0) return null;
          const dayAvailable = resource.availabilityMap[dateKey] || 0;
          const dayUsed = resourceUsage[resource.id]?.[dateKey] || 0;
          const remainingForDay = Math.max(0, dayAvailable - dayUsed);
          const usable = Math.min(remainingForDay, taskRemaining);
          if (usable <= 0) return null;
          return { resource, usable };
        })
        .filter(Boolean) as Array<{ resource: LevelingResource; usable: number }>;

      if (availableResources.length === 0) return;

      const dayAssignments: Array<{ resourceId: string; hours: number }> = [];

      if (params.preferSingleResource) {
        if (!primaryResource) {
          const preferred = availableResources.sort((a, b) => b.usable - a.usable)[0];
          primaryResource = preferred?.resource.id || null;
        }
        const primaryCandidate = availableResources.find(item => item.resource.id === primaryResource);
        if (primaryCandidate) {
          const remaining = task.sizingHours - totalAssigned;
          const hours = Math.min(primaryCandidate.usable, remaining);
          if (hours > 0) {
            dayAssignments.push({ resourceId: primaryCandidate.resource.id, hours });
          }
        }

        if (params.allowSplits && totalAssigned + dayAssignments.reduce((sum, a) => sum + a.hours, 0) < task.sizingHours) {
          const remaining = task.sizingHours - totalAssigned - dayAssignments.reduce((sum, a) => sum + a.hours, 0);
          availableResources
            .filter(item => item.resource.id !== primaryResource)
            .sort((a, b) => b.usable - a.usable)
            .forEach((item) => {
              if (remaining <= 0) return;
              const hours = Math.min(item.usable, remaining);
              if (hours > 0) {
                dayAssignments.push({ resourceId: item.resource.id, hours });
              }
            });
        }
      } else {
        let remaining = task.sizingHours - totalAssigned;
        availableResources
          .sort((a, b) => b.usable - a.usable)
          .forEach((item) => {
            if (remaining <= 0) return;
            const hours = Math.min(item.usable, remaining);
            if (hours > 0) {
              dayAssignments.push({ resourceId: item.resource.id, hours });
              remaining -= hours;
            }
          });
      }

      if (dayAssignments.length === 0) return;

      dayAssignments.forEach(({ resourceId, hours }) => {
        if (!assignment[resourceId]) assignment[resourceId] = {};
        assignment[resourceId][dateKey] = (assignment[resourceId][dateKey] || 0) + hours;
        resourceUsage[resourceId][dateKey] = (resourceUsage[resourceId][dateKey] || 0) + hours;
        taskResourceRemaining.set(resourceId, (taskResourceRemaining.get(resourceId) || 0) - hours);
        totalAssigned += hours;
        endDateHours = hours;
      });

      if (!startDate) startDate = date;
      endDate = date;
    });

    if (totalAssigned < task.sizingHours || !startDate || !endDate) {
      return {
        assignment: {},
        schedule: null,
        error: 'Insufficient resource availability in scheduling window'
      };
    }

    const schedule: TaskSchedule = {
      taskId: task.id,
      name: task.name,
      startDate: getDateKey(startDate),
      endDate: getDateKey(endDate),
      endDateHours,
      totalHours: totalAssigned,
      assignedResources: Object.keys(assignment),
      delayDays: diffDays(earliestStart, startDate),
      importance: task.importance || task.priority
    };

    return { assignment, schedule };
  }

  static getScheduleEndDate(projectStart: Date, projectEnd: Date, params: LevelingParams): Date {
    const bufferedEnd = addDays(projectEnd, params.bufferDays);
    const cappedEnd = addDays(projectStart, params.maxScheduleDays - 1);
    return bufferedEnd < cappedEnd ? bufferedEnd : cappedEnd;
  }
}

// ============================================================================
// PATHS MANAGER (adapted)
// ============================================================================

class PathsManager {
  static getDelayMetrics(schedules: Record<string, TaskSchedule>): { maxDelayDays: number; maxDelayImportance: number } {
    let maxDelayDays = 0;
    let maxDelayImportance = 0;
    Object.values(schedules).forEach((schedule) => {
      if (schedule.delayDays > maxDelayDays) {
        maxDelayDays = schedule.delayDays;
        maxDelayImportance = schedule.importance;
      } else if (schedule.delayDays === maxDelayDays && schedule.importance > maxDelayImportance) {
        maxDelayImportance = schedule.importance;
      }
    });
    return { maxDelayDays, maxDelayImportance };
  }
}

// ============================================================================
// SOLUTION MANAGER (adapted)
// ============================================================================

class SolutionManager {
  static levelProject(
    tasks: LevelingTask[],
    resources: LevelingResource[],
    project: LevelingProject,
    params: LevelingParams,
    warnings: string[]
  ): LevelingResult {
    const assignment: LevelingResult['assignment'] = {};
    const schedules: Record<string, TaskSchedule> = {};
    const errors: LevelingError[] = [];

    if (tasks.length === 0) {
      return {
        assignment,
        schedules,
        resourceUtilization: [],
        delayedTasks: [],
        errors,
        summary: {
          totalTasks: 0,
          scheduledTasks: 0,
          totalHours: 0,
          averageUtilization: 0,
          peakUtilization: 0,
          maxDelayDays: 0,
          maxDelayImportance: 0
        },
        warnings,
        projectWindow: project
      };
    }

    ImportanceManager.populateImportances(tasks);
    const sortedTasks = ImportanceManager.getSortedTasks(tasks);

    const resourceUsage: Record<string, Record<DateKey, number>> = {};
    resources.forEach(resource => {
      resourceUsage[resource.id] = {};
    });

    const projectStart = parseDate(project.startDate) || normalizeDate(new Date());
    const projectEnd = parseDate(project.endDate) || addDays(projectStart, 30);
    const scheduleEnd = TaskAssignmentManager.getScheduleEndDate(projectStart, projectEnd, params);

    sortedTasks.forEach(task => {
      const result = TaskAssignmentManager.assignTask(
        task,
        resources,
        resourceUsage,
        schedules,
        projectStart,
        projectEnd,
        params
      );
      if (result.error || !result.schedule) {
        errors.push({ taskId: task.id, name: task.name, message: result.error || 'Unassigned task' });
        return;
      }
      assignment[task.id] = result.assignment;
      schedules[task.id] = result.schedule;
    });

    const { resourceUtilization, peakUtilization, averageUtilization } = computeUtilization(
      resources,
      resourceUsage,
      projectStart,
      scheduleEnd
    );

    const delayedTasks = Object.values(schedules)
      .filter(schedule => schedule.delayDays > 0)
      .sort((a, b) => b.delayDays - a.delayDays);

    const delayMetrics = PathsManager.getDelayMetrics(schedules);
    const totalHours = tasks.reduce((sum, task) => sum + task.sizingHours, 0);

    return {
      assignment,
      schedules,
      resourceUtilization,
      delayedTasks,
      errors,
      summary: {
        totalTasks: tasks.length,
        scheduledTasks: Object.keys(schedules).length,
        totalHours,
        averageUtilization,
        peakUtilization,
        maxDelayDays: delayMetrics.maxDelayDays,
        maxDelayImportance: delayMetrics.maxDelayImportance
      },
      warnings,
      projectWindow: {
        startDate: getDateKey(projectStart),
        endDate: getDateKey(scheduleEnd)
      }
    };
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function runResourceLeveling(
  tasks: LevelingTask[],
  resources: LevelingResource[],
  project: LevelingProject,
  params: LevelingParams,
  warnings: string[] = []
): LevelingResult {
  return SolutionManager.levelProject(tasks, resources, project, params, warnings);
}

export function deriveLevelingInputs(
  data: Partial<SampleData>,
  params: LevelingParams
): LevelingInputs {
  const warnings: string[] = [];
  const tasksRaw = [...(data.tasks || []), ...(data.subTasks || [])] as TaskRecord[];
  const employees = data.employees || [];

  if (tasksRaw.length === 0) {
    warnings.push('No tasks found. Load task data to run leveling.');
  }

  const resources = buildResources(employees, tasksRaw, params, warnings);

  const { projectStart, projectEnd } = getProjectWindow(tasksRaw, params);

  const tasks = buildTasks(tasksRaw, resources, params, warnings);

  return {
    tasks,
    resources,
    project: {
      startDate: getDateKey(projectStart),
      endDate: getDateKey(projectEnd)
    },
    warnings
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function buildResources(
  employees: Employee[],
  tasks: TaskRecord[],
  params: LevelingParams,
  warnings: string[]
): LevelingResource[] {
  let resources: LevelingResource[] = [];

  if (employees.length === 0) {
    warnings.push('No employees found. Using a single placeholder resource.');
    resources = [
      {
        id: 'unassigned',
        name: 'Unassigned',
        availabilityMap: {}
      }
    ];
  } else {
    resources = employees.map((emp, idx) => ({
      id: emp.employeeId || `resource-${idx + 1}`,
      name: emp.name || `Resource ${idx + 1}`,
      availabilityMap: {}
    }));
  }

  const { projectStart, projectEnd } = getProjectWindow(tasks, params);
  const scheduleEnd = TaskAssignmentManager.getScheduleEndDate(projectStart, projectEnd, params);
  const dates = enumerateDates(projectStart, scheduleEnd);

  resources.forEach(resource => {
    dates.forEach(date => {
      const dayKey = getDateKey(date);
      const isWorkday = params.workdaysOnly ? !isWeekend(date) : true;
      resource.availabilityMap[dayKey] = isWorkday ? params.workdayHours : 0;
    });
  });

  return resources;
}

function buildTasks(
  tasks: TaskRecord[],
  resources: LevelingResource[],
  params: LevelingParams,
  warnings: string[]
): LevelingTask[] {
  const resourceIds = new Set(resources.map(resource => resource.id));
  const taskInputs: LevelingTask[] = [];
  const taskIndex = new Map<string, TaskRecord>();

  tasks.forEach(task => {
    const taskId = task.taskId || task.id;
    if (!taskId) return;
    taskIndex.set(taskId, task);
  });

  tasks.forEach((task, idx) => {
    const taskId = task.taskId || task.id || `task-${idx + 1}`;
    const sizingHours = Math.max(
      1,
      task.baselineHours || task.projectedHours || task.actualHours || params.workdayHours
    );
    const priority = mapPriority(task.priority);

    const assignedResourceIds = getTaskResourceIds(task, resources);
    const effectiveResourceIds = assignedResourceIds.length > 0 ? assignedResourceIds : resources.map(r => r.id);

    if (assignedResourceIds.length === 0) {
      warnings.push(`Task "${task.taskName || taskId}" has no assigned resource. Using all resources.`);
    }

    const resourcesMap: Record<string, number> = {};
    effectiveResourceIds.forEach(resourceId => {
      if (!resourceIds.has(resourceId)) return;
      resourcesMap[resourceId] = sizingHours;
    });

    const predecessorId = task.predecessorId || task.predecessor || null;
    const predecessorIds = predecessorId && taskIndex.has(predecessorId) ? [predecessorId] : [];
    if (predecessorId && predecessorIds.length === 0) {
      warnings.push(`Task "${task.taskName || taskId}" has missing predecessor "${predecessorId}".`);
    }

    taskInputs.push({
      id: taskId,
      name: task.taskName || task.name || `Task ${idx + 1}`,
      priority,
      sizingHours,
      resourcesMap,
      predecessorIds,
      successorIds: [],
      constraintType: (task as any).constraintType || null,
      constraintDate: (task as any).constraintDate || null,
      calendarId: (task as any).calendarId || null
    });
  });

  const taskById = new Map(taskInputs.map(task => [task.id, task]));
  taskInputs.forEach(task => {
    task.predecessorIds.forEach(predId => {
      const predecessor = taskById.get(predId);
      if (predecessor) {
        predecessor.successorIds.push(task.id);
      }
    });
  });

  return taskInputs;
}

function getProjectWindow(tasks: TaskRecord[], params: LevelingParams): { projectStart: Date; projectEnd: Date } {
  let minStart: Date | null = null;
  let maxEnd: Date | null = null;

  tasks.forEach(task => {
    const start = parseDate(task.baselineStartDate) || parseDate(task.actualStartDate);
    const end = parseDate(task.baselineEndDate) || parseDate(task.actualEndDate);
    if (start && (!minStart || start < minStart)) minStart = start;
    if (end && (!maxEnd || end > maxEnd)) maxEnd = end;
    if (start && !end) {
      const durationDays = Math.max(1, Math.ceil((task.baselineHours || params.workdayHours) / params.workdayHours));
      const estimatedEnd = addDays(start, durationDays);
      if (!maxEnd || estimatedEnd > maxEnd) maxEnd = estimatedEnd;
    }
  });

  const projectStart = minStart || normalizeDate(new Date());
  const projectEnd = maxEnd || addDays(projectStart, 30);

  return { projectStart, projectEnd };
}

function getTaskResourceIds(task: TaskRecord, resources: LevelingResource[]): string[] {
  const resourceIds: string[] = [];
  const resourceById = new Map(resources.map(r => [r.id, r]));
  const resourceByName = new Map(resources.map(r => [r.name.toLowerCase(), r]));

  if (task.employeeId && resourceById.has(task.employeeId)) {
    resourceIds.push(task.employeeId);
  }

  if (task.assignedResource && resourceByName.has(task.assignedResource.toLowerCase())) {
    resourceIds.push(resourceByName.get(task.assignedResource.toLowerCase())!.id);
  }

  return Array.from(new Set(resourceIds));
}

function mapPriority(priority?: string | null): number {
  switch (priority) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 2;
  }
}

function computeUtilization(
  resources: LevelingResource[],
  resourceUsage: Record<string, Record<DateKey, number>>,
  projectStart: Date,
  projectEnd: Date
): { resourceUtilization: ResourceUtilization[]; averageUtilization: number; peakUtilization: number } {
  const dates = enumerateDates(projectStart, projectEnd);
  const dateKeys = dates.map(getDateKey);

  let peakUtilization = 0;
  let utilizationSum = 0;
  let utilizationDays = 0;

  dateKeys.forEach(dateKey => {
    let dailyAvailable = 0;
    let dailyAssigned = 0;
    resources.forEach(resource => {
      dailyAvailable += resource.availabilityMap[dateKey] || 0;
      dailyAssigned += resourceUsage[resource.id]?.[dateKey] || 0;
    });
    if (dailyAvailable > 0) {
      const dailyUtilization = (dailyAssigned / dailyAvailable) * 100;
      utilizationSum += dailyUtilization;
      utilizationDays += 1;
      peakUtilization = Math.max(peakUtilization, dailyUtilization);
    }
  });

  const averageUtilization = utilizationDays > 0 ? utilizationSum / utilizationDays : 0;

  const resourceUtilization = resources.map(resource => {
    const totalAvailable = dateKeys.reduce((sum, dateKey) => sum + (resource.availabilityMap[dateKey] || 0), 0);
    const totalAssigned = dateKeys.reduce((sum, dateKey) => sum + (resourceUsage[resource.id]?.[dateKey] || 0), 0);
    const utilizationPct = totalAvailable > 0 ? (totalAssigned / totalAvailable) * 100 : 0;
    return {
      resourceId: resource.id,
      name: resource.name,
      totalAvailable,
      totalAssigned,
      utilizationPct
    };
  });

  return { resourceUtilization, averageUtilization, peakUtilization };
}
