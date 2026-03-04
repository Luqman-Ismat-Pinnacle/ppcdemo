'use client';

/**
 * Task-related transformations: efficiency, productivity, schedule health, etc.
 */

import type { SampleData, ScheduleHealthEntry, Calendar, ResourceCalendar, TaskProductivityMetrics, PhaseProductivityMetrics, ProjectProductivityMetrics, CatchUpEntry } from '@/types/data';
import { safeNum } from './utils';
import { buildTaskActualHoursMap, buildTaskQuantityTotals, buildMilestoneMap } from './core';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const normalizeDay = (value: string): string => {
  return value.trim().slice(0, 3).toLowerCase();
};

const buildWorkingDaysSet = (calendar?: Calendar): Set<string> => {
  const defaultSet = new Set(['mon', 'tue', 'wed', 'thu', 'fri']);
  if (!calendar?.workingDays) return defaultSet;
  const formatted = calendar.workingDays
    .split(',')
    .map(day => normalizeDay(day))
    .filter(Boolean);
  if (formatted.length === 0) return defaultSet;
  return new Set(formatted);
};

const buildHolidaySet = (calendar?: Calendar): Set<string> => {
  if (!calendar?.holidays) return new Set();
  const holidays: string[] = [];
  if (Array.isArray(calendar.holidays)) {
    holidays.push(...calendar.holidays.map(value => String(value)));
  } else if (typeof calendar.holidays === 'string') {
    try {
      const parsed = JSON.parse(calendar.holidays);
      if (Array.isArray(parsed)) {
        holidays.push(...parsed.map(value => String(value)));
      } else {
        holidays.push(calendar.holidays);
      }
    } catch {
      holidays.push(...calendar.holidays.split(','));
    }
  }
  return new Set(holidays.map(value => value.trim().split('T')[0]));
};

const buildOverrideSet = (overrideDays?: string[] | string): Set<string> => {
  if (!overrideDays) return new Set();
  const values: string[] = [];
  if (Array.isArray(overrideDays)) {
    values.push(...overrideDays.map(v => String(v)));
  } else if (typeof overrideDays === 'string') {
    try {
      const parsed = JSON.parse(overrideDays);
      if (Array.isArray(parsed)) {
        values.push(...parsed.map(v => String(v)));
      } else {
        values.push(overrideDays);
      }
    } catch {
      values.push(...overrideDays.split(','));
    }
  }
  return new Set(values.map(value => value.trim().split('T')[0]));
};

const formatDateValue = (date: Date) => date.toISOString().split('T')[0];

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const sameDay = (a?: Date | null, b?: Date | null) => {
  if (!a || !b) return false;
  return formatDateValue(a) === formatDateValue(b);
};

const resolveTaskCalendar = (
  task: any,
  calendars: Calendar[] = [],
  resourceCalendars: ResourceCalendar[] = []
) => {
  const defaultCalendar = calendars.find(c => c.isActive !== false) || calendars[0];
  const calendarById = calendars.find(c => c.id === task.calendarId);
  if (calendarById) {
    return { calendar: calendarById, overrides: new Set<string>() };
  }
  if (task.employeeId) {
    const resourceCalendar = resourceCalendars.find(rc => rc.employeeId === task.employeeId);
    if (resourceCalendar) {
      const cal = calendars.find(c => c.id === resourceCalendar.calendarId) || defaultCalendar;
      return { calendar: cal, overrides: buildOverrideSet(resourceCalendar.overrideDays) };
    }
  }
  return { calendar: defaultCalendar, overrides: new Set<string>() };
};

const isWorkingDay = (date: Date, calendar?: Calendar, overrides?: Set<string>) => {
  if (!date) return false;
  const dayLabel = normalizeDay(WEEKDAY_LABELS[date.getDay()]);
  const workingDays = buildWorkingDaysSet(calendar);
  const holidays = buildHolidaySet(calendar);
  const dateKey = formatDateValue(date);
  if (holidays.has(dateKey) || overrides?.has(dateKey)) return false;
  return workingDays.has(dayLabel);
};

const addScheduleEntry = (
  entries: ScheduleHealthEntry[],
  task: any,
  issueType: ScheduleHealthEntry['issueType'],
  detail: string,
  date?: string,
  severity: ScheduleHealthEntry['severity'] = 'warning'
) => {
  const identifier = task.id || task.taskId || `task-${Math.random().toString(36).slice(2, 8)}`;
  entries.push({
    id: `${identifier}-${issueType}-${date || 'unknown'}`,
    taskId: task.taskId || task.id || 'unknown',
    taskName: task.taskName || task.name || '',
    issueType,
    severity,
    detail,
    date,
  });
};

export const buildScheduleHealth = (data: Partial<SampleData>): ScheduleHealthEntry[] => {
  const tasks = data.tasks || [];
  const calendars = data.calendars || [];
  const resourceCalendars = data.resourceCalendars || [];
  const entries: ScheduleHealthEntry[] = [];

  tasks.forEach((task: any) => {
    const { calendar, overrides } = resolveTaskCalendar(task, calendars, resourceCalendars);
    const start = parseDate(task.actualStartDate || task.baselineStartDate || task.plannedStartDate);
    const end = parseDate(task.actualEndDate || task.baselineEndDate || task.plannedEndDate);

    if (start && !isWorkingDay(start, calendar, overrides)) {
      addScheduleEntry(
        entries,
        task,
        'calendar',
        `Start date ${formatDateValue(start)} is outside of working days for ${calendar?.name || 'default calendar'}.`,
        formatDateValue(start)
      );
    }

    if (end && !isWorkingDay(end, calendar, overrides)) {
      addScheduleEntry(
        entries,
        task,
        'calendar',
        `End date ${formatDateValue(end)} falls outside of working days for ${calendar?.name || 'default calendar'}.`,
        formatDateValue(end)
      );
    }

    if (task.constraintType && task.constraintDate) {
      const constraint = parseDate(task.constraintDate);
      if (constraint) {
        const type = (task.constraintType || '').toUpperCase();
        const constraintLabel = `${type} constraint at ${formatDateValue(constraint)}`;

        switch (type) {
          case 'MSO':
            if (!start || !sameDay(start, constraint)) {
              addScheduleEntry(entries, task, 'constraint', `${constraintLabel}: task must start on the constraint date.`, formatDateValue(constraint));
            }
            break;
          case 'MFO':
            if (!end || !sameDay(end, constraint)) {
              addScheduleEntry(entries, task, 'constraint', `${constraintLabel}: task must finish on the constraint date.`, formatDateValue(constraint));
            }
            break;
          case 'SNET':
            if (start && start < constraint) {
              addScheduleEntry(entries, task, 'constraint', `${constraintLabel}: task cannot start before this date.`, formatDateValue(start));
            }
            break;
          case 'FNET':
            if (end && end < constraint) {
              addScheduleEntry(entries, task, 'constraint', `${constraintLabel}: task cannot finish before this date.`, formatDateValue(end));
            }
            break;
          case 'ASAP':
            if (start && start < constraint) {
              addScheduleEntry(entries, task, 'constraint', `${constraintLabel}: task cannot start before the earliest date.`, formatDateValue(start));
            }
            break;
          case 'ALAP':
            if (start && start > constraint) {
              addScheduleEntry(entries, task, 'constraint', `${constraintLabel}: task should not start later than this date.`, formatDateValue(constraint));
            }
            break;
          default:
            break;
        }
      }
    }
  });

  return entries;
};

export function buildTaskHoursEfficiency(data: Partial<SampleData>) {
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  const hours = data.hours || [];

  const taskActualHours = buildTaskActualHoursMap(hours);

  // Filter to tasks that have baseline/budget hours OR have actual hours logged
  const validTasks = tasks.filter((t: any) => {
    const taskId = t.id || t.taskId;
    const hasBaseline = t.baselineHours || t.budgetHours || t.baseline_hours || t.budget_hours;
    const hasActualFromTask = t.actualHours || t.actual_hours;
    const hasActualFromHours = taskActualHours.has(taskId);
    return hasBaseline || hasActualFromTask || hasActualFromHours;
  });

  if (validTasks.length === 0) {
    return { tasks: [], actualWorked: [], estimatedAdded: [], efficiency: [], project: [] };
  }

  return {
    // Use taskName first (database column), then name, then taskId as last fallback
    tasks: validTasks.map((t: any) => t.taskName || t.name || t.task_name || t.taskId || 'Task'),
    actualWorked: validTasks.map((t: any) => {
      const taskId = t.id || t.taskId;
      // Prefer actual hours from hour_entries, fallback to task's actualHours field
      return safeNum(taskActualHours.get(taskId) ?? t.actualHours ?? t.actual_hours);
    }),
    estimatedAdded: validTasks.map((t: any) => {
      const taskId = t.id || t.taskId;
      const baseline = safeNum(t.baselineHours ?? t.budgetHours ?? t.baseline_hours ?? t.budget_hours);
      const actual = safeNum(taskActualHours.get(taskId) ?? t.actualHours ?? t.actual_hours);
      return Math.max(0, baseline - actual);
    }),
    efficiency: validTasks.map((t: any) => {
      const taskId = t.id || t.taskId;
      const baseline = safeNum(t.baselineHours ?? t.budgetHours ?? t.baseline_hours ?? t.budget_hours);
      const actual = safeNum(taskActualHours.get(taskId) ?? t.actualHours ?? t.actual_hours);
      return baseline > 0 ? Math.round((actual / baseline) * 100) : (actual > 0 ? 100 : 0);
    }),
    project: validTasks.map((t: any) => {
      const proj = projects.find((p: any) => (p.id || p.projectId) === (t.projectId || t.project_id));
      return proj?.name || t.projectId || t.project_id || 'Unknown';
    })
  };
}

// ============================================================================
// PRODUCTIVITY METRICS TRANSFORMATIONS
// ============================================================================

export const buildTaskProductivityMetrics = (data: Partial<SampleData>): TaskProductivityMetrics[] => {
  const tasks = data.tasks || [];
  const entries = data.taskQuantityEntries || [];
  const hours = data.hours || [];
  const taskActualHours = buildTaskActualHoursMap(hours);
  const { produced, completed } = buildTaskQuantityTotals(entries);

  return tasks.map((task: any) => {
    const taskId = task.id || task.taskId;
    if (!taskId) return null;
    const baselineQty = Number(task.baselineQty ?? 0);
    const baselineHours = Number(task.baselineHours ?? task.budgetHours ?? 0);
    const actualHours = taskActualHours.get(taskId) ?? Number(task.actualHours ?? 0);
    const actualQty = Number(task.actualQty ?? 0) + (produced.get(taskId) || 0);
    const completedQty = Number(task.completedQty ?? 0) + (completed.get(taskId) || 0);
    const qtyRemaining = Math.max(0, baselineQty - completedQty);
    const expectedUnitsPerHour = baselineQty > 0 && baselineHours > 0 ? baselineQty / baselineHours : null;
    const unitsPerHour = actualHours > 0 ? actualQty / actualHours : null;
    const hrsPerUnit = baselineQty > 0 ? baselineHours / baselineQty : null;
    const productivityVariance =
      unitsPerHour !== null && expectedUnitsPerHour !== null
        ? unitsPerHour - expectedUnitsPerHour
        : null;
    const performingMetric =
      expectedUnitsPerHour && expectedUnitsPerHour > 0 && unitsPerHour !== null
        ? (unitsPerHour / expectedUnitsPerHour) * 100
        : null;

    return {
      taskId,
      taskName: task.taskName || task.name || task.task_name || 'Task',
      projectId: task.projectId || task.project_id || '',
      phaseId: task.phaseId || task.phase_id || null,
      baselineQty,
      actualQty,
      completedQty,
      qtyRemaining,
      uom: task.uom || task.unitOfMeasure || null,
      baselineMetric: task.baselineMetric || null,
      baselineHours,
      actualHours,
      hrsPerUnit,
      unitsPerHour,
      productivityVariance,
      performingMetric,
    };
  }).filter(Boolean) as TaskProductivityMetrics[];
};

const aggregateMetrics = <K extends string>(
  metrics: TaskProductivityMetrics[],
  keySelector: (metric: TaskProductivityMetrics) => K | null
) => {
  const map = new Map<K, {
    baselineQty: number;
    actualQty: number;
    completedQty: number;
    baselineHours: number;
    actualHours: number;
    projectId: string;
  }>();

  metrics.forEach(metric => {
    const key = keySelector(metric);
    if (!key) return;
    const projectId = metric.projectId || '';
    const entry = map.get(key) || {
      baselineQty: 0,
      actualQty: 0,
      completedQty: 0,
      baselineHours: 0,
      actualHours: 0,
      projectId,
    };
    entry.baselineQty += metric.baselineQty;
    entry.actualQty += metric.actualQty;
    entry.completedQty += metric.completedQty;
    entry.baselineHours += metric.baselineHours;
    entry.actualHours += metric.actualHours;
    map.set(key, entry);
  });

  return map;
};

export const buildPhaseProductivityMetrics = (
  metrics: TaskProductivityMetrics[],
  data: Partial<SampleData>
): PhaseProductivityMetrics[] => {
  const phases = data.phases || [];
  const phaseNameMap = new Map<string, string>(phases.map((phase: any) => [(phase.id || phase.phaseId), phase.name || `Phase ${phase.phaseId}`]));
  const aggregated = aggregateMetrics(metrics, metric => metric.phaseId || null);

  return Array.from(aggregated.entries()).map(([phaseId, summary]) => {
    const expectedUnitsPerHour = summary.baselineQty > 0 && summary.baselineHours > 0
      ? summary.baselineQty / summary.baselineHours
      : null;
    const unitsPerHour = summary.actualHours > 0 ? summary.actualQty / summary.actualHours : null;
    const hrsPerUnit = summary.baselineQty > 0 ? summary.baselineHours / summary.baselineQty : null;
    const productivityVariance =
      unitsPerHour !== null && expectedUnitsPerHour !== null
        ? unitsPerHour - expectedUnitsPerHour
        : null;
    const performingMetric =
      expectedUnitsPerHour && expectedUnitsPerHour > 0 && unitsPerHour !== null
        ? (unitsPerHour / expectedUnitsPerHour) * 100
        : null;

    return {
      phaseId,
      phaseName: phaseNameMap.get(phaseId) || `Phase ${phaseId}`,
      projectId: summary.projectId,
      baselineQty: summary.baselineQty,
      actualQty: summary.actualQty,
      completedQty: summary.completedQty,
      qtyRemaining: Math.max(0, summary.baselineQty - summary.completedQty),
      baselineHours: summary.baselineHours,
      actualHours: summary.actualHours,
      hrsPerUnit,
      unitsPerHour,
      productivityVariance,
      performingMetric,
    };
  });
};

export const buildProjectProductivityMetrics = (
  metrics: TaskProductivityMetrics[],
  data: Partial<SampleData>
): ProjectProductivityMetrics[] => {
  const projects = data.projects || [];
  const projectNameMap = new Map<string, string>(projects.map((project: any) => [(project.id || project.projectId), project.name || `Project ${project.projectId}`]));
  const aggregated = aggregateMetrics(metrics, metric => metric.projectId || null);

  return Array.from(aggregated.entries()).map(([projectId, summary]) => {
    const expectedUnitsPerHour = summary.baselineQty > 0 && summary.baselineHours > 0
      ? summary.baselineQty / summary.baselineHours
      : null;
    const unitsPerHour = summary.actualHours > 0 ? summary.actualQty / summary.actualHours : null;
    const hrsPerUnit = summary.baselineQty > 0 ? summary.baselineHours / summary.baselineQty : null;
    const productivityVariance =
      unitsPerHour !== null && expectedUnitsPerHour !== null
        ? unitsPerHour - expectedUnitsPerHour
        : null;
    const performingMetric =
      expectedUnitsPerHour && expectedUnitsPerHour > 0 && unitsPerHour !== null
        ? (unitsPerHour / expectedUnitsPerHour) * 100
        : null;

    return {
      projectId,
      projectName: projectNameMap.get(projectId) || `Project ${projectId}`,
      baselineQty: summary.baselineQty,
      actualQty: summary.actualQty,
      completedQty: summary.completedQty,
      qtyRemaining: Math.max(0, summary.baselineQty - summary.completedQty),
      baselineHours: summary.baselineHours,
      actualHours: summary.actualHours,
      hrsPerUnit,
      unitsPerHour,
      productivityVariance,
      performingMetric,
    };
  });
};

const locateProjectIdForEntity = (data: Partial<SampleData>, entityType: string, entityId: string) => {
  const key = (entityType || '').toLowerCase();
  const id = entityId || '';
  if (!id) return null;

  const findById = (items: any[], idField: string) => items.find((item: any) => (item[idField] || item.id) === id);

  if (key.includes('task')) {
    const task = findById(data.tasks || [], 'taskId') || findById(data.subTasks || [], 'taskId');
    return task?.projectId || task?.project_id || null;
  }
  if (key.includes('phase')) {
    const phase = findById(data.phases || [], 'phaseId');
    return phase?.projectId || null;
  }
  if (key.includes('deliverable')) {
    const deliverable = findById(data.deliverables || [], 'deliverableId');
    return deliverable?.projectId || null;
  }
  if (key.includes('milestone')) {
    const milestone = findById(data.milestones || [], 'milestoneId');
    return milestone?.projectId || null;
  }
  if (key.includes('snapshot') || key.includes('forecast')) {
    const snapshot = (data.snapshots || []).find(
      (snap: any) => snap.snapshotId === id || snap.id === id
    );
    if (snapshot?.scope === 'project') {
      return snapshot.scopeId || null;
    }
    if (snapshot?.scope === 'all') {
      // All-scope snapshots don't have a specific project
      return null;
    }
    return snapshot?.scopeId || null;
  }
  if (key.includes('qc')) {
    const qc = findById(data.qctasks || [], 'qcTaskId');
    return qc?.projectId || null;
  }
  const project = findById(data.projects || [], 'projectId');
  if (project) return project.id || project.projectId;
  return null;
};

export const buildCatchUpLog = (data: Partial<SampleData>): CatchUpEntry[] => {
  const changeLog = data.changeLog || [];
  const approvalRecords = data.approvalRecords || [];

  const entries: CatchUpEntry[] = [];

  changeLog.forEach(log => {
    const projectId = locateProjectIdForEntity(data, log.entityType, log.entityId);
    entries.push({
      id: log.id,
      timestamp: log.timestamp,
      projectId,
      entityType: log.entityType,
      entityId: log.entityId,
      description: `${log.action} ${log.entityType} ${log.fieldName ?? ''} → ${log.newValue ?? ''}`,
      source: 'changeLog',
      user: log.user,
      status: log.action,
      fromValue: log.oldValue || undefined,
      toValue: log.newValue || undefined,
    });
  });

  approvalRecords.forEach(record => {
    entries.push({
      id: record.id,
      timestamp: record.approvedAt || record.updatedAt || record.createdAt,
      projectId: record.projectId,
      entityType: record.entityType,
      entityId: record.entityId,
      description: `${record.approvalType} ${record.status}`,
      source: 'approval',
      user: record.approvedBy || null,
      status: record.status,
      fromValue: null,
      toValue: record.status || null,
    });
  });

  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// ============================================================================
// RESOURCE HEATMAP TRANSFORMATION
// ============================================================================

/** Normalize employee ID for consistent map key/lookup (DB may return number or string). */

export function buildCountMetricsAnalysis(data: Partial<SampleData>) {
  const tasks = data.tasks || [];
  const projects = data.projects || [];

  const results: any[] = [];

  tasks.slice(0, 20).forEach((t: any) => {
    const proj = projects.find((p: any) => (p.id || p.projectId) === t.projectId);
    const baseline = t.baselineHours || 0;
    const actual = t.actualHours || 0;
    const remaining = Math.max(0, baseline - actual);
    const variance = actual - baseline;
    const defensible = baseline > 0 ? Math.round((1 - Math.abs(variance) / baseline) * 100) : 100;

    let status: 'good' | 'warning' | 'bad' = 'good';
    if (Math.abs(variance) > baseline * 0.2) status = 'bad';
    else if (Math.abs(variance) > baseline * 0.1) status = 'warning';

    results.push({
      project: proj?.name || t.projectId || 'Unknown',
      task: t.taskName || t.name || t.taskId || 'Task',
      remainingHours: Math.round(remaining),
      count: 1,
      metric: Math.round(baseline),
      defensible,
      variance: Math.round(variance),
      status
    });
  });

  return results;
}

// ============================================================================
// PROJECTS EFFICIENCY METRICS TRANSFORMATION
// Builds project efficiency table
// ============================================================================


export function buildProjectsEfficiencyMetrics(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const tasks = data.tasks || [];

  const results: any[] = [];

  projects.forEach((p: any) => {
    const projectTasks = tasks.filter((t: any) => t.projectId === (p.id || p.projectId));

    const baseline = p.baselineHours || projectTasks.reduce((sum: number, t: any) => sum + (t.baselineHours || 0), 0) || 0;
    const actual = p.actualHours || projectTasks.reduce((sum: number, t: any) => sum + (t.actualHours || 0), 0) || 0;
    const remaining = Math.max(0, baseline - actual);

    const efficiency = baseline > 0 ? Math.round((actual / baseline) * 100) : 100;
    const metricsRatio = baseline > 0 ? (actual / baseline).toFixed(2) : '1.00';

    let flag: 'ok' | 'watch' | 'alert' = 'ok';
    if (efficiency > 120 || efficiency < 70) flag = 'alert';
    else if (efficiency > 110 || efficiency < 80) flag = 'watch';

    results.push({
      project: p.name || p.projectId || 'Unknown',
      efficiency,
      metricsRatio,
      remainingHours: Math.round(remaining),
      flag
    });
  });

  // If no projects, derive from tasks grouped by project
  if (results.length === 0 && tasks.length > 0) {
    const tasksByProject = new Map<string, { name: string; baseline: number; actual: number }>();
    tasks.forEach((t: any) => {
      const projId = t.projectId || 'Unknown';
      const current = tasksByProject.get(projId) || { name: projId, baseline: 0, actual: 0 };
      current.baseline += t.baselineHours || 0;
      current.actual += t.actualHours || 0;
      tasksByProject.set(projId, current);
    });

    tasksByProject.forEach(({ name, baseline, actual }) => {
      const remaining = Math.max(0, baseline - actual);
      const efficiency = baseline > 0 ? Math.round((actual / baseline) * 100) : 100;
      let flag: 'ok' | 'watch' | 'alert' = 'ok';
      if (efficiency > 120 || efficiency < 70) flag = 'alert';
      else if (efficiency > 110 || efficiency < 80) flag = 'watch';

      results.push({
        project: name,
        efficiency,
        metricsRatio: baseline > 0 ? (actual / baseline).toFixed(2) : '1.00',
        remainingHours: Math.round(remaining),
        flag
      });
    });
  }

  return results;
}

// ============================================================================
// QUALITY HOURS TRANSFORMATION
// Builds quality hours by charge code from hours entries
// ============================================================================


function isQCChargeCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = code.toLowerCase();
  return c.includes('qc') || c.includes('quality') || c.includes('rework') || c.includes('review');
}

export function buildQualityHours(data: Partial<SampleData>, options?: { taskOrder?: string[] }) {
  const hours = data.hours || [];
  const tasks = data.tasks || [];
  const taskMap = new Map<string, any>();
  tasks.forEach((t: any) => {
    const id = t.id || t.taskId;
    if (id) taskMap.set(id, t);
  });

  const taskOrder = options?.taskOrder;

  // When taskOrder is provided (same as Task Hours Efficiency), aggregate QC hours per task.
  // If taskOrder is empty array, derive same task names as buildTaskHoursEfficiency so chart shows same charge codes.
  const effectiveTaskOrder =
    taskOrder !== undefined
      ? taskOrder.length > 0
        ? taskOrder
        : (() => {
            const taskActualHours = buildTaskActualHoursMap(hours);
            const validTasks = tasks.filter((t: any) => {
              const taskId = t.id || t.taskId;
              const hasBaseline = t.baselineHours || t.budgetHours || t.baseline_hours || t.budget_hours;
              const hasActualFromTask = t.actualHours || t.actual_hours;
              const hasActualFromHours = taskActualHours.has(taskId);
              return hasBaseline || hasActualFromTask || hasActualFromHours;
            });
            return validTasks.map((t: any) => t.taskName || t.name || t.task_name || t.taskId || 'Task');
          })()
      : null;

  if (effectiveTaskOrder && effectiveTaskOrder.length > 0) {
    const taskNameToId = new Map<string, string>();
    tasks.forEach((t: any) => {
      const name = t.taskName || t.name || t.task_name || t.taskId || '';
      const id = t.id || t.taskId;
      if (name && id) taskNameToId.set(name, id);
    });
    const qcHoursByTaskId = new Map<string, number>();
    let totalHours = 0;
    let qcHours = 0;
    hours.forEach((h: any) => {
      const taskId = h.taskId || h.task_id;
      const task = taskId ? taskMap.get(taskId) : null;
      const code = (h.chargeCode || h.charge_code || task?.chargeCode || task?.charge_code || 'EX').trim() || 'EX';
      const hrs = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
      if (hrs <= 0) return;
      totalHours += hrs;
      if (isQCChargeCode(code)) {
        qcHours += hrs;
        qcHoursByTaskId.set(taskId, (qcHoursByTaskId.get(taskId) || 0) + hrs);
      }
    });
    const chargeCodes = effectiveTaskOrder;
    const hoursPerCode = effectiveTaskOrder.map((name) => {
      const id = taskNameToId.get(name);
      return id ? (qcHoursByTaskId.get(id) || 0) : 0;
    });
    const qcPercentOverall = totalHours > 0 ? Math.round((qcHours / totalHours) * 100) : 0;
    return {
      tasks: chargeCodes,
      categories: ['Hours'],
      data: chargeCodes.length > 0 ? chargeCodes.map((_, i) => [hoursPerCode[i] ?? 0]) : [],
      qcPercent: chargeCodes.map(() => qcPercentOverall),
      poorQualityPercent: chargeCodes.map(() => 0),
      project: chargeCodes.map(() => ''),
      totalHours,
      qcHours,
      qcPercentOverall,
    };
  }

  const byCode = new Map<string, number>();
  let totalHours = 0;
  let qcHours = 0;

  hours.forEach((h: any) => {
    const taskId = h.taskId || h.task_id;
    const task = taskId ? taskMap.get(taskId) : null;
    const code = (h.chargeCode || h.charge_code || task?.chargeCode || task?.charge_code || 'EX').trim() || 'EX';
    const hrs = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
    if (hrs <= 0) return;
    totalHours += hrs;
    if (isQCChargeCode(code)) qcHours += hrs;
    byCode.set(code, (byCode.get(code) || 0) + hrs);
  });

  if (byCode.size === 0) {
    const taskActualHours = buildTaskActualHoursMap(hours);
    tasks.forEach((t: any) => {
      const code = (t.chargeCode || t.charge_code || 'EX').trim() || 'EX';
      const taskId = t.id || t.taskId;
      const hrs = taskActualHours.get(taskId) ?? (t.actualHours ?? t.actual_hours ?? 0);
      if (hrs > 0) {
        totalHours += hrs;
        if (isQCChargeCode(code)) qcHours += hrs;
        byCode.set(code, (byCode.get(code) || 0) + hrs);
      }
    });
  }

  const sorted = [...byCode.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  const chargeCodes = sorted.map(([c]) => c);
  const hoursPerCode = sorted.map(([, v]) => v);
  const qcPercent = totalHours > 0 ? Math.round((qcHours / totalHours) * 100) : 0;

  return {
    tasks: chargeCodes,
    categories: ['Hours'],
    data: chargeCodes.length > 0 ? chargeCodes.map((_, i) => [hoursPerCode[i] ?? 0]) : [],
    qcPercent: chargeCodes.map((code) => (isQCChargeCode(code) ? 100 : 0)),
    poorQualityPercent: chargeCodes.map(() => 0),
    project: chargeCodes.map(() => ''),
    totalHours,
    qcHours,
    qcPercentOverall: qcPercent,
  };
}

// ============================================================================
// NON-EXECUTE HOURS TRANSFORMATION
// Builds non-execute hours data for pie charts
// ============================================================================

/**
 * Helper to check if Description contains "TPW The Pinnacle Way".
 * TPW/Non-Execute hours come from Hours Entries where Description includes this text.
 */
export function isTPWDescription(description: string | null | undefined): boolean {
  if (!description || typeof description !== 'string') return false;
  return description.toUpperCase().includes('TPW THE PINNACLE WAY') ||
    description.toUpperCase().includes('THE PINNACLE WAY') ||
    description.toUpperCase().includes('TPW');
}

/** @deprecated Use isTPWDescription for Hours Entries; kept for backward compatibility */
export function isTPWChargeCode(chargeCode: string | null | undefined): boolean {
  if (!chargeCode) return false;
  const code = chargeCode.toUpperCase();
  return code.includes('TPW') || code.includes('THE PINNACLE WAY') || code.includes('PINNACLE WAY');
}

export function buildNonExecuteHours(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const tasks = data.tasks || [];

  if (hours.length === 0 && tasks.length === 0) {
    return { total: 0, fte: 0, percent: 0, tpwComparison: [], otherBreakdown: [] };
  }

  const totalHours = hours.reduce((sum: number, h: any) => sum + (typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0), 0) ||
    tasks.reduce((sum: number, t: any) => sum + (t.actualHours || 0), 0);

  if (totalHours === 0) {
    return { total: 0, fte: 0, percent: 0, tpwComparison: [], otherBreakdown: [] };
  }

  // TPW/Non-Execute: filter Hours Entries by Description containing "TPW The Pinnacle Way"
  const tpwHours = hours.filter((h: any) => {
    const desc = h.description || h.desc || '';
    return isTPWDescription(desc);
  });
  const tpwHoursTotal = tpwHours.reduce((sum: number, h: any) => sum + (typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0), 0);

  const nonTpwHours = hours.filter((h: any) => !isTPWDescription(h.description || h.desc || ''));
  const billable = nonTpwHours.filter((h: any) => h.isBillable !== false && h.billable !== false);
  const nonBillable = nonTpwHours.filter((h: any) => h.isBillable === false || h.billable === false);
  const billableHours = billable.reduce((sum: number, h: any) => sum + (typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0), 0);
  const nonBillableHours = nonBillable.reduce((sum: number, h: any) => sum + (typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0), 0);

  const nonExecutePercent = totalHours > 0 ? Math.round(((tpwHoursTotal + nonBillableHours) / totalHours) * 100) : 0;

  // TPW Comparison: TPW vs Execute vs Non-Execute
  const tpwComparison = [
    { name: 'TPW', value: Math.round(tpwHoursTotal), color: '#8B5CF6' },
    { name: 'Execute', value: Math.round(billableHours), color: '#40E0D0' },
    { name: 'Non-Execute', value: Math.round(nonBillableHours), color: '#F59E0B' }
  ];

  // Other Breakdown: TPW hours broken down by charge code (more specific)
  const tpwByChargeCode = new Map<string, number>();
  const TPW_COLORS = ['#8B5CF6', '#A78BFA', '#C4B5FD', '#7C3AED', '#6D28D9', '#5B21B6', '#4C1D95', '#6B7280'];
  tpwHours.forEach((h: any) => {
    const code = (h.chargeCode || h.charge_code || (h.description || h.desc || 'TPW').toString()).trim() || 'TPW';
    const hrs = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
    if (hrs > 0) tpwByChargeCode.set(code, (tpwByChargeCode.get(code) || 0) + hrs);
  });
  const otherBreakdownEntries = [...tpwByChargeCode.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name], i) => ({
      name: name.length > 24 ? name.slice(0, 22) + '…' : name,
      value: Math.round(tpwByChargeCode.get(name)!),
      color: TPW_COLORS[i % TPW_COLORS.length],
    }));
  const otherBreakdown = otherBreakdownEntries.length > 0
    ? otherBreakdownEntries
    : (nonBillableHours > 0 ? [
        { name: 'Admin', value: Math.round(nonBillableHours * 0.4), color: '#8B5CF6' },
        { name: 'Training', value: Math.round(nonBillableHours * 0.25), color: '#10B981' },
        { name: 'Meetings', value: Math.round(nonBillableHours * 0.20), color: '#F59E0B' },
        { name: 'Other', value: Math.round(nonBillableHours * 0.15), color: '#6B7280' }
      ] : []);

  return {
    total: Math.round(tpwHoursTotal + nonBillableHours),
    fte: +((tpwHoursTotal + nonBillableHours) / 2080).toFixed(2),
    percent: nonExecutePercent,
    tpwComparison,
    otherBreakdown,
  };
}

// ============================================================================
// FORECAST DATA TRANSFORMATION
// Builds forecast chart data
// ============================================================================

