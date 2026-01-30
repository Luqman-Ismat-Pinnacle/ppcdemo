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

import type {
  SampleData,
  LaborBreakdown,
  ResourceHeatmap,
  Snapshot,
  ChangeControlSummary,
  TaskQuantityEntry,
  TaskProductivityMetrics,
  PhaseProductivityMetrics,
  ProjectProductivityMetrics,
  CatchUpEntry,
  QuantityEntryType,
  ProgressMethod,
  ProgressClaim,
  EVSeriesPoint,
  CostTransaction,
  Calendar,
  ResourceCalendar,
  ScheduleHealthEntry,
} from '@/types/data';

// WBS Item type for transformation (matches what WBS Gantt page expects)
interface TransformWBSItem {
  id: string;
  wbsCode: string;
  name: string;
  type: 'portfolio' | 'customer' | 'site' | 'project' | 'phase' | 'unit' | 'task' | 'sub_task';
  itemType: string;
  startDate?: string;
  endDate?: string;
  progress?: number;
  percentComplete?: number;
  baselineHours?: number;
  actualHours?: number;
  remainingHours?: number;
  baselineCost?: number;
  actualCost?: number;
  remainingCost?: number;
  daysRequired?: number;
  assignedResourceId?: string;
  isCritical?: boolean;
  isMilestone?: boolean;
  taskEfficiency?: number | null;
  predecessors?: any[];
  children?: TransformWBSItem[];
  taskId?: string;
  phaseId?: string;
  projectId?: string;
  claimPct?: number;
  pv?: number;
  ev?: number;
  ac?: number;
  is_milestone?: boolean;
  resource_assignments?: any[];
  earlyStart?: string;
  earlyFinish?: string;
  lateStart?: string;
  lateFinish?: string;
  totalSlack?: number;
  freeSlack?: number;
}

// Snapshot helpers for trend charts
type SnapshotRow = Snapshot;

type CostAggregation = {
  actual: number;
  forecast: number;
};

type CostAggregationMaps = {
  byProject: Map<string, CostAggregation>;
  byPhase: Map<string, CostAggregation>;
  byTask: Map<string, CostAggregation>;
};

const buildCostAggregations = (transactions: CostTransaction[] = []): CostAggregationMaps => {
  const byProject = new Map<string, CostAggregation>();
  const byPhase = new Map<string, CostAggregation>();
  const byTask = new Map<string, CostAggregation>();

  const add = (map: Map<string, CostAggregation>, key?: string, actualAmount = 0, forecastAmount = 0) => {
    if (!key) return;
    const existing = map.get(key) || { actual: 0, forecast: 0 };
    map.set(key, {
      actual: existing.actual + actualAmount,
      forecast: existing.forecast + forecastAmount,
    });
  };

  transactions.forEach((tx) => {
    const amount = Number(tx.amount || 0);
    const actualAmount = tx.isAccrual ? 0 : amount;
    const forecastAmount = tx.isAccrual ? amount : 0;
    add(byProject, tx.projectId, actualAmount, forecastAmount);
    add(byPhase, tx.phaseId, actualAmount, forecastAmount);
    add(byTask, tx.taskId, actualAmount, forecastAmount);
  });

  return { byProject, byPhase, byTask };
};

// ============================================================================
// SHARED UTILITIES
// ============================================================================

/**
 * Memoization cache for expensive calculations
 */
const memoizedCalculations = new Map<string, unknown>();

/**
 * Memoize expensive calculations to avoid recomputation
 */
function memoize<T>(key: string, fn: () => T, dependencies: unknown[]): T {
  const depKey = JSON.stringify(dependencies);
  const cacheKey = `${key}_${depKey}`;

  if (memoizedCalculations.has(cacheKey)) {
    return memoizedCalculations.get(cacheKey) as T;
  }

  const result = fn();
  memoizedCalculations.set(cacheKey, result);
  return result;
}

/**
 * Clear memoization cache (useful for testing or memory management)
 */
export function clearMemoizationCache(): void {
  memoizedCalculations.clear();
}

/**
 * Build week mappings from dates - calculate once, reuse across functions
 * This avoids recalculating week mappings in every function that needs them
 */
/**
 * Normalize any date value to canonical "YYYY-MM-DD" so week lookups and grouping work
 * regardless of format (ISO with time, date-only string, or Date object from API).
 */
function normalizeDateString(value: string | Date | number | null | undefined): string | null {
  if (value == null) return null;
  const d = typeof value === 'object' && 'getTime' in value ? value : new Date(value as string | number);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

/**
 * Shared week mapping utility with memoization
 * Avoids recalculating week mappings for the same date ranges.
 * Uses normalized date strings so all hour entry formats (ISO, date-only, etc.) map correctly.
 */
const weekMappingCache = new Map<string, {
  weekMap: Map<string, string>;
  weekIndexMap: Map<string, number>;
  rawWeeks: string[];
  formattedWeeks: string[];
}>();

function buildWeekMappings(dates: (string | Date | number)[]): {
  weekMap: Map<string, string>;
  weekIndexMap: Map<string, number>;
  rawWeeks: string[];
  formattedWeeks: string[];
} {
  // Normalize all dates to YYYY-MM-DD so cache and lookups are consistent
  const normalized = dates.map(d => normalizeDateString(d)).filter((d): d is string => d != null);
  const sortedDates = [...new Set(normalized)].sort().join(',');
  const cacheKey = `weekMappings_${sortedDates}`;

  if (weekMappingCache.has(cacheKey)) {
    return weekMappingCache.get(cacheKey)!;
  }

  const weekMap = new Map<string, string>();
  const uniqueDates = [...new Set(normalized)].sort();

  uniqueDates.forEach((dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return;

    const day = d.getDay();
    const mondayDate = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), mondayDate);
    const weekKey = monday.toISOString().split('T')[0];
    weekMap.set(dateStr, weekKey);
  });

  const rawWeeks = [...new Set(weekMap.values())].sort();

  const formattedWeeks = rawWeeks.map(week => {
    const d = new Date(week);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  const weekIndexMap = new Map<string, number>();
  rawWeeks.forEach((week, idx) => weekIndexMap.set(week, idx));

  const result = { weekMap, weekIndexMap, rawWeeks, formattedWeeks };

  if (weekMappingCache.size > 50) {
    const firstKey = weekMappingCache.keys().next().value;
    if (firstKey) weekMappingCache.delete(firstKey);
  }
  weekMappingCache.set(cacheKey, result);

  return result;
}

// ============================================================================
// HIERARCHY HELPER FUNCTIONS
// ============================================================================

/**
 * Build parent-child maps for efficient O(1) lookups instead of O(n) filtering
 * This replaces nested filter() calls with Map-based lookups
 */
/**
 * Extract hierarchy levels from hierarchy_nodes or separate tables
 * Supports both new consolidated structure and legacy separate tables
 */
function extractHierarchyLevels(data: {
  hierarchyNodes?: any[];
  portfolios?: any[];
  customers?: any[];
  sites?: any[];
  units?: any[];
}): {
  portfolios: any[];
  customers: any[];
  sites: any[];
  units: any[];
} {
  // Use hierarchy_nodes if available, otherwise use separate tables
  if (data.hierarchyNodes && data.hierarchyNodes.length > 0) {
    return {
      portfolios: data.hierarchyNodes.filter((n: any) => n.node_type === 'portfolio'),
      customers: data.hierarchyNodes.filter((n: any) => n.node_type === 'customer'),
      sites: data.hierarchyNodes.filter((n: any) => n.node_type === 'site'),
      units: data.hierarchyNodes.filter((n: any) => n.node_type === 'unit'),
    };
  }

  // Fall back to separate tables
  return {
    portfolios: data.portfolios || [],
    customers: data.customers || [],
    sites: data.sites || [],
    units: data.units || [],
  };
}

function buildHierarchyMaps(data: {
  hierarchyNodes?: any[];
  portfolios?: any[];
  customers?: any[];
  sites?: any[];
  units?: any[];
  projects?: any[];
  phases?: any[];
  tasks?: any[];
  employees?: any[];
}): {
  customersByPortfolio: Map<string, any[]>;
  sitesByCustomer: Map<string, any[]>;
  unitsBySite: Map<string, any[]>;
  projectsByUnit: Map<string, any[]>;
  projectsBySite: Map<string, any[]>;
  projectsByCustomer: Map<string, any[]>;
  phasesByProject: Map<string, any[]>;
  phasesByUnit: Map<string, any[]>;
  unitsByProject: Map<string, any[]>;
  tasksByPhase: Map<string, any[]>;
  tasksByProject: Map<string, any[]>;
  employeesById: Map<string, any>;
} {
  // Extract hierarchy levels (supports both hierarchy_nodes and separate tables)
  const hierarchy = extractHierarchyLevels(data);
  const portfolios = hierarchy.portfolios;
  const customers = hierarchy.customers;
  const sites = hierarchy.sites;
  const units = hierarchy.units;

  const customersByPortfolio = new Map<string, any[]>();
  const sitesByCustomer = new Map<string, any[]>();
  const unitsBySite = new Map<string, any[]>();
  const projectsByUnit = new Map<string, any[]>();
  const projectsBySite = new Map<string, any[]>();
  const projectsByCustomer = new Map<string, any[]>();
  const phasesByProject = new Map<string, any[]>();
  const phasesByUnit = new Map<string, any[]>();
  const unitsByProject = new Map<string, any[]>();
  const tasksByPhase = new Map<string, any[]>();
  const tasksByProject = new Map<string, any[]>();
  const employeesById = new Map<string, any>();

  // Build customer maps (supports both hierarchy_nodes parent_id and legacy portfolio_id)
  customers.forEach((customer: any) => {
    const portfolioId = customer.parent_id || customer.portfolioId || customer.portfolio_id;
    if (portfolioId) {
      if (!customersByPortfolio.has(portfolioId)) {
        customersByPortfolio.set(portfolioId, []);
      }
      customersByPortfolio.get(portfolioId)!.push(customer);
    }
  });

  // Build site maps (supports both hierarchy_nodes parent_id and legacy customer_id)
  sites.forEach((site: any) => {
    const customerId = site.parent_id || site.customerId || site.customer_id;
    if (customerId) {
      if (!sitesByCustomer.has(customerId)) {
        sitesByCustomer.set(customerId, []);
      }
      sitesByCustomer.get(customerId)!.push(site);
    }
  });

  // Build unit maps: units belong to project (hierarchy is Project -> Unit -> Phase -> Task)
  units.forEach((unit: any) => {
    const projectId = unit.projectId ?? unit.project_id;
    if (projectId != null && projectId !== '') {
      const key = String(projectId);
      if (!unitsByProject.has(key)) unitsByProject.set(key, []);
      unitsByProject.get(key)!.push(unit);
    }

    // Legacy support (Site -> Unit)
    const siteId = unit.parent_id || unit.siteId || unit.site_id;
    if (siteId) {
      if (!unitsBySite.has(siteId)) {
        unitsBySite.set(siteId, []);
      }
      unitsBySite.get(siteId)!.push(unit);
    }
  });

  // Build project maps - only include projects with MPP uploaded (has_schedule = true)
  (data.projects || []).filter((p: any) => p.has_schedule === true || p.hasSchedule === true).forEach((project: any) => {
    const unitId = project.unitId || project.unit_id;
    const siteId = project.siteId || project.site_id;
    const customerId = project.customerId || project.customer_id;

    if (unitId) {
      if (!projectsByUnit.has(unitId)) {
        projectsByUnit.set(unitId, []);
      }
      projectsByUnit.get(unitId)!.push(project);
    }

    if (siteId) {
      if (!projectsBySite.has(siteId)) {
        projectsBySite.set(siteId, []);
      }
      projectsBySite.get(siteId)!.push(project);
    }

    if (customerId) {
      if (!projectsByCustomer.has(customerId)) {
        projectsByCustomer.set(customerId, []);
      }
      projectsByCustomer.get(customerId)!.push(project);
    }
  });

  // Build phase maps: phases belong to unit (unit_id) or directly to project (legacy)
  (data.phases || []).forEach((phase: any) => {
    const unitId = phase.unitId ?? phase.unit_id;
    if (unitId != null && unitId !== '') {
      const key = String(unitId);
      if (!phasesByUnit.has(key)) phasesByUnit.set(key, []);
      phasesByUnit.get(key)!.push(phase);
    }
    const projectId = phase.projectId ?? phase.project_id;
    if (projectId != null && projectId !== '') {
      const key = String(projectId);
      if (!phasesByProject.has(key)) phasesByProject.set(key, []);
      phasesByProject.get(key)!.push(phase);
    }
  });

  // Build task maps (normalize ids to string)
  (data.tasks || []).forEach((task: any) => {
    const phaseId = task.phaseId ?? task.phase_id;
    if (phaseId != null && phaseId !== '') {
      const key = String(phaseId);
      if (!tasksByPhase.has(key)) tasksByPhase.set(key, []);
      tasksByPhase.get(key)!.push(task);
    }

    const projectId = task.projectId ?? task.project_id;
    if (projectId != null && projectId !== '' && !phaseId) {
      const key = String(projectId);
      if (!tasksByProject.has(key)) tasksByProject.set(key, []);
      tasksByProject.get(key)!.push(task);
    }
  });

  // Build employee map
  (data.employees || []).forEach((employee: any) => {
    const empId = employee.id || employee.employeeId;
    if (empId) {
      employeesById.set(empId, employee);
    }
  });

  return {
    customersByPortfolio,
    sitesByCustomer,
    unitsBySite,
    projectsByUnit,
    projectsBySite,
    projectsByCustomer,
    phasesByProject,
    phasesByUnit,
    unitsByProject,
    tasksByPhase,
    tasksByProject,
    employeesById,
  };
}

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

const buildScheduleHealth = (data: Partial<SampleData>): ScheduleHealthEntry[] => {
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
              addScheduleEntry(
                entries,
                task,
                'constraint',
                `${constraintLabel}: task must start on the constraint date.`,
                formatDateValue(constraint)
              );
            }
            break;
          case 'MFO':
            if (!end || !sameDay(end, constraint)) {
              addScheduleEntry(
                entries,
                task,
                'constraint',
                `${constraintLabel}: task must finish on the constraint date.`,
                formatDateValue(constraint)
              );
            }
            break;
          case 'SNET':
            if (start && start < constraint) {
              addScheduleEntry(
                entries,
                task,
                'constraint',
                `${constraintLabel}: task cannot start before this date.`,
                formatDateValue(start)
              );
            }
            break;
          case 'FNET':
            if (end && end < constraint) {
              addScheduleEntry(
                entries,
                task,
                'constraint',
                `${constraintLabel}: task cannot finish before this date.`,
                formatDateValue(end)
              );
            }
            break;
          case 'ASAP':
            if (start && start < constraint) {
              addScheduleEntry(
                entries,
                task,
                'constraint',
                `${constraintLabel}: task cannot start before the earliest date.`,
                formatDateValue(start)
              );
            }
            break;
          case 'ALAP':
            if (start && start > constraint) {
              addScheduleEntry(
                entries,
                task,
                'constraint',
                `${constraintLabel}: task should not start later than this date.`,
                formatDateValue(start)
              );
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

const getProjectSnapshotSeries = (data: Partial<SampleData>) => {
  const snapshots = data.snapshots || [];

  if (snapshots.length === 0) return null;

  // Filter to project-scoped snapshots or all-scope snapshots
  const projectRows = snapshots.filter(row => row.scope === 'project' || row.scope === 'all');
  if (projectRows.length === 0) return null;

  const grouped = new Map<string, { actualCostCum: number; actualHoursCum: number; remainingCost: number; remainingHours: number }>();
  projectRows.forEach(row => {
    const existing = grouped.get(row.snapshotDate) || { actualCostCum: 0, actualHoursCum: 0, remainingCost: 0, remainingHours: 0 };
    // Use snapshot data metrics if available, otherwise use aggregated totals
    const metrics = row.snapshotData?.metrics || {};
    const actualCost = metrics.ac || row.totalCost || 0;
    const actualHours = row.totalHours || 0;
    const remainingCost = metrics.etc || 0; // Estimate to Complete
    const remainingHours = 0; // Not directly available in unified snapshots

    grouped.set(row.snapshotDate, {
      actualCostCum: existing.actualCostCum + actualCost,
      actualHoursCum: existing.actualHoursCum + actualHours,
      remainingCost: existing.remainingCost + remainingCost,
      remainingHours: existing.remainingHours + remainingHours,
    });
  });

  const dates = Array.from(grouped.keys()).sort();
  const series = dates.map(date => grouped.get(date)!);

  return { dates, series };
};

// ============================================================================
// CHANGE CONTROL HELPERS
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
): ChangeControlSummary => {
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
  const baselineHours = Number(task.baselineHours ?? task.budgetHours ?? 0);
  const baselineQty = Number(task.baselineQty ?? 0);
  const completedQty = Number(task.completedQty ?? 0) + (context.quantityTotals.completed.get(taskId) || 0);
  const actualHours = context.actualHoursMap.get(taskId) ?? Number(task.actualHours ?? 0);
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
  // Prefer MPP parser remainingHours; only calculate when not provided
  const remainingHours =
    task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours ??
    Math.max(0, baselineHours - actualHours);

  return {
    ...task,
    percentComplete: normalizedPercent,
    taskEfficiency,
    actualHours,
    remainingHours: typeof remainingHours === 'number' ? remainingHours : Math.max(0, baselineHours - actualHours),
  };
};

const applyProgressToList = (items: any[], context: TaskProgressContext) =>
  items.map(item => applyTaskProgress(item, context));

const applyChangeControlAdjustments = (rawData: Partial<SampleData>) => {
  const { approvedRequests, approvedImpacts, projectDeltas, phaseDeltas, taskDeltas } =
    collectApprovedChangeDeltas(rawData);

  const summary = buildChangeControlSummary(rawData, approvedRequests, approvedImpacts, projectDeltas);

  const milestoneList = [...(rawData.milestones || []), ...(rawData.milestonesTable || [])];
  const progressContext: TaskProgressContext = {
    quantityTotals: buildTaskQuantityTotals(rawData.taskQuantityEntries || []),
    milestoneMap: buildMilestoneMap(milestoneList),
    actualHoursMap: buildTaskActualHoursMap(rawData.hours || []),
  };
  const costAggregations = buildCostAggregations(rawData.costTransactions || []);

  const tasks = (rawData.tasks || []).map((task: any) => {
    const taskId = task.id || task.taskId;
    const delta = taskDeltas.get(taskId) || ZERO_DELTA;
    const baseHours = task.baselineHours ?? task.budgetHours ?? 0;
    const baseCost = task.baselineCost ?? 0;
    const adjustedBaselineHours = baseHours + delta.hours;
    const adjustedBaselineCost = baseCost + delta.cost;
    const actualHours = task.actualHours || 0;
    const taskCost = costAggregations.byTask.get(taskId) || { actual: 0, forecast: 0 };
    const actualCost = (task.actualCost || 0) + taskCost.actual;
    const nonLaborForecast = taskCost.forecast;

    // Prefer MPP parser remainingHours; only calculate when not provided
    const taskRemaining =
      task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours;
    const remainingHours =
      taskRemaining != null && typeof taskRemaining === 'number'
        ? taskRemaining
        : Math.max(0, adjustedBaselineHours - actualHours);

    return {
      ...task,
      baselineHours: adjustedBaselineHours,
      baselineCost: adjustedBaselineCost,
      baselineStartDate: shiftDateByDays(task.baselineStartDate, delta.startDays),
      baselineEndDate: shiftDateByDays(task.baselineEndDate, delta.endDays),
      remainingHours,
      actualCost,
      nonLaborActualCost: taskCost.actual,
      nonLaborForecastCost: nonLaborForecast,
      remainingCost: Math.max(0, adjustedBaselineCost - actualCost) + nonLaborForecast,
    };
  });

  const subTasks = (rawData.subTasks || []).map((task: any) => {
    const taskId = task.id || task.taskId;
    const delta = taskDeltas.get(taskId) || ZERO_DELTA;
    const baseHours = task.baselineHours ?? task.budgetHours ?? 0;
    const baseCost = task.baselineCost ?? 0;
    const adjustedBaselineHours = baseHours + delta.hours;
    const adjustedBaselineCost = baseCost + delta.cost;
    const actualHours = task.actualHours || 0;
    const taskCost = costAggregations.byTask.get(taskId) || { actual: 0, forecast: 0 };
    const actualCost = (task.actualCost || 0) + taskCost.actual;
    const nonLaborForecast = taskCost.forecast;

    // Prefer MPP parser remainingHours for subTasks too
    const subRemaining =
      task.remainingHours ?? task.projectedRemainingHours ?? task.remaining_hours;
    const subRemainingHours =
      subRemaining != null && typeof subRemaining === 'number'
        ? subRemaining
        : Math.max(0, adjustedBaselineHours - actualHours);

    return {
      ...task,
      baselineHours: adjustedBaselineHours,
      baselineCost: adjustedBaselineCost,
      baselineStartDate: shiftDateByDays(task.baselineStartDate, delta.startDays),
      baselineEndDate: shiftDateByDays(task.baselineEndDate, delta.endDays),
      remainingHours: subRemainingHours,
      actualCost,
      nonLaborActualCost: taskCost.actual,
      nonLaborForecastCost: nonLaborForecast,
      remainingCost: Math.max(0, adjustedBaselineCost - actualCost) + nonLaborForecast,
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

    return {
      ...phase,
      baselineHours: adjustedBaselineHours,
      baselineCost: adjustedBaselineCost,
      baselineStartDate: shiftDateByDays(phase.baselineStartDate, delta.startDays),
      baselineEndDate: shiftDateByDays(phase.baselineEndDate, delta.endDays),
      remainingHours: Math.max(0, adjustedBaselineHours - actualHours),
      actualCost,
      nonLaborActualCost: phaseCost.actual,
      nonLaborForecastCost: nonLaborForecast,
      remainingCost: Math.max(0, adjustedBaselineCost - actualCost) + nonLaborForecast,
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

    return {
      ...project,
      baselineHours: adjustedBaselineHours,
      baselineCost: adjustedBaselineCost,
      baselineStartDate: shiftDateByDays(project.baselineStartDate, delta.startDays),
      baselineEndDate: shiftDateByDays(project.baselineEndDate, delta.endDays),
      remainingHours: Math.max(0, adjustedBaselineHours - actualHours),
      actualCost,
      nonLaborActualCost: projectCost.actual,
      nonLaborForecastCost: nonLaborForecast,
      remainingCost: Math.max(0, adjustedBaselineCost - actualCost) + nonLaborForecast,
    };
  });

  const tasksWithProgress = applyProgressToList(tasks, progressContext);
  const subTasksWithProgress = applyProgressToList(subTasks, progressContext);

  return {
    adjustedData: { ...rawData, tasks: tasksWithProgress, subTasks: subTasksWithProgress, phases, projects },
    changeControlSummary: summary,
  };
};

// ============================================================================
// WBS DATA TRANSFORMATION
// Builds hierarchical wbsData.items from flat tables
// ============================================================================

/**
 * Build WBS hierarchy from flat portfolio/customer/site/project/phase/task tables
 */
export function buildWBSData(data: Partial<SampleData>): { items: any[] } {
  // Memoize hierarchy maps and WBS structure for performance (include phase/unit/task so MPP changes rebuild)
  const dataKey = JSON.stringify({
    portfolioCount: data.portfolios?.length || 0,
    customerCount: data.customers?.length || 0,
    siteCount: data.sites?.length || 0,
    projectCount: data.projects?.length || 0,
    phaseCount: data.phases?.length || 0,
    unitCount: data.units?.length || 0,
    taskCount: data.tasks?.length || 0,
  });

  return memoize('buildWBSData', () => {
    const items: TransformWBSItem[] = [];

    const portfolios = data.portfolios || [];
    const customers = data.customers || [];
    const sites = data.sites || [];
    const units = data.units || [];
    // Only include projects with MPP uploaded (has_schedule = true)
    const projects = (data.projects || []).filter((p: any) => p.has_schedule === true || p.hasSchedule === true);
    const tasks = data.tasks || [];
    const employees = data.employees || [];

    // Extract work items if available (new consolidated structure)
    const workItems = data.workItems || [];
    const epics = workItems.filter((w: any) => w.work_item_type === 'epic').length > 0
      ? workItems.filter((w: any) => w.work_item_type === 'epic')
      : (data.epics || []);
    const features = workItems.filter((w: any) => w.work_item_type === 'feature').length > 0
      ? workItems.filter((w: any) => w.work_item_type === 'feature')
      : (data.features || []);
    const userStories = workItems.filter((w: any) => w.work_item_type === 'user_story').length > 0
      ? workItems.filter((w: any) => w.work_item_type === 'user_story')
      : (data.userStories || []);

    // Build Map-based lookups for O(1) access instead of O(n) filtering
    const maps = buildHierarchyMaps(data);

    // Global set: task IDs that belong to ANY unit (by unit_id or parent_id). These must NEVER appear under phase or project directly.
    const unitIds = new Set(units.map((u: any) => String(u.id ?? u.unitId)));
    const taskIdsUnderAnyUnit = new Set<string>();
    (tasks || []).forEach((t: any) => {
      const tid = String(t.id ?? t.taskId);
      const tUnit = String((t as any).unit_id ?? (t as any).unitId ?? '');
      const tParent = String((t as any).parent_id ?? '');
      if (unitIds.has(tUnit) || unitIds.has(tParent)) taskIdsUnderAnyUnit.add(tid);
    });

    // Helper to get owner name from employeeId using Map lookup
    const getOwnerName = (employeeId: string | null): string | null => {
      if (!employeeId) return null;
      const owner = maps.employeesById.get(employeeId);
      return owner?.name || null;
    };

    // Unified helper to build a project node with all its children and rollup logic
    const buildProjectNode = (project: any, projectWbs: string): TransformWBSItem => {
      const projectId = String(project.id ?? project.projectId ?? '');
      const projBaselineHrs = project.baselineHours || project.budgetHours || 0;
      const projActualHrs = project.actualHours || project.actual_hours || 0;
      const projBaselineCst = project.baselineCost || project.budgetCost || 0;
      const projActualCst = project.actualCost || project.actual_cost || 0;

      const projectItem: TransformWBSItem = {
        id: `wbs-project-${projectId}`,
        wbsCode: projectWbs,
        name: project.name || project.projectNumber || `Project`,
        type: 'project',
        itemType: 'project',
        startDate: project.startDate || project.baselineStartDate,
        endDate: project.endDate || project.baselineEndDate,
        percentComplete: project.percentComplete ?? project.percent_complete ?? 0,
        baselineHours: projBaselineHrs,
        actualHours: projActualHrs,
        remainingHours: project.remainingHours ?? Math.max(0, projBaselineHrs - projActualHrs),
        baselineCost: projBaselineCst,
        actualCost: projActualCst,
        remainingCost: project.remainingCost ?? Math.max(0, projBaselineCst - projActualCst),
        children: []
      };

      // Track project rollup totals
      let projRollupBaselineHrs = 0;
      let projRollupActualHrs = 0;
      let projRollupBaselineCst = 0;
      let projRollupActualCst = 0;
      let projRollupPercentComplete = 0;
      let projChildCount = 0;

      // Hierarchy: Project -> Unit -> Phase -> Task
      const projectUnitsRaw = maps.unitsByProject.get(String(projectId)) || [];
      const projectUnits = Array.from(new Map(projectUnitsRaw.map((u: any) => [String(u.id ?? u.unitId), u])).values());
      const addedPhaseIds = new Set<string>();

      projectUnits.forEach((unit: any, uIdx: number) => {
        const unitId = String(unit.id || unit.unitId);
        const unitWbs = `${projectWbs}.${uIdx + 1}`;

        const unitStart = unit.startDate ?? unit.baselineStartDate ?? unit.start_date;
        const unitEnd = unit.endDate ?? unit.baselineEndDate ?? unit.end_date;
        const unitBaselineHrs = unit.baselineHours ?? unit.baseline_hours ?? 0;
        const unitBaselineCst = unit.baselineCost ?? unit.baseline_cost ?? 0;

        const unitItem: TransformWBSItem = {
          id: `wbs-unit-${unitId}`,
          wbsCode: unitWbs,
          name: unit.name || `Unit ${uIdx + 1}`,
          type: 'unit',
          itemType: 'unit',
          startDate: unitStart ?? undefined,
          endDate: unitEnd ?? undefined,
          percentComplete: unit.percentComplete ?? unit.percent_complete ?? 0,
          baselineHours: unitBaselineHrs || undefined,
          baselineCost: unitBaselineCst || undefined,
          children: []
        };

        let unitRollupBaselineHrs = 0;
        let unitRollupActualHrs = 0;
        let unitRollupBaselineCst = 0;
        let unitRollupActualCst = 0;
        let unitRollupPercentComplete = 0;
        let unitChildCount = 0;

        const unitPhasesRaw = maps.phasesByUnit.get(unitId) || [];
        const unitPhases = Array.from(new Map(unitPhasesRaw.map((ph: any) => [String(ph.id ?? ph.phaseId), ph])).values());

        unitPhases.forEach((phase: any, phIdx: number) => {
          const phaseId = String(phase.id ?? phase.phaseId);
          addedPhaseIds.add(phaseId);
          const phaseWbs = `${unitWbs}.${phIdx + 1}`;

          let phaseRollupBaselineHrs = 0;
          let phaseRollupActualHrs = 0;
          let phaseRollupBaselineCst = 0;
          let phaseRollupActualCst = 0;
          let phaseRollupPercentComplete = 0;
          let phaseChildCount = 0;

          const phaseItem: TransformWBSItem = {
            id: `wbs-phase-${phaseId}`,
            wbsCode: phaseWbs,
            name: phase.name || `Phase ${phIdx + 1}`,
            type: 'phase',
            itemType: 'phase',
            startDate: phase.startDate || phase.baselineStartDate,
            endDate: phase.endDate || phase.baselineEndDate,
            percentComplete: phase.percentComplete ?? phase.percent_complete ?? 0,
            baselineHours: phase.baselineHours || 0,
            actualHours: phase.actualHours || 0,
            children: []
          };

          const phaseTasksRaw = maps.tasksByPhase.get(phaseId) || [];
          const phaseTasks = Array.from(new Map(phaseTasksRaw.map((t: any) => [String(t.id ?? t.taskId), t])).values());

          phaseTasks.forEach((task: any, tIdx: number) => {
            const taskId = task.id || task.taskId;
            const taskWbs = `${phaseWbs}.${tIdx + 1}`;
            const taskBaselineHrs = task.baselineHours || task.budgetHours || 0;
            const taskActualHrs = task.actualHours || task.actual_hours || 0;
            const taskBaselineCst = task.baselineCost || task.baseline_cost || 0;
            const taskActualCst = task.actualCost || task.actual_cost || 0;
            const taskPercent = task.percentComplete ?? task.percent_complete ?? 0;

            phaseRollupBaselineHrs += taskBaselineHrs;
            phaseRollupActualHrs += taskActualHrs;
            phaseRollupBaselineCst += taskBaselineCst;
            phaseRollupActualCst += taskActualCst;
            phaseRollupPercentComplete += taskPercent;
            phaseChildCount++;

            const taskItem: TransformWBSItem = {
              id: `wbs-task-${taskId}`,
              wbsCode: taskWbs,
              name: task.name || task.taskName || `Task ${tIdx + 1}`,
              type: 'task',
              itemType: 'task',
              startDate: task.baselineStartDate || task.startDate,
              endDate: task.baselineEndDate || task.endDate,
              daysRequired: (task.duration !== undefined ? task.duration : (task.daysRequired !== undefined ? task.daysRequired : 1)),
              percentComplete: taskPercent,
              baselineHours: taskBaselineHrs,
              actualHours: taskActualHrs,
              remainingHours: task.remainingHours ?? Math.max(0, taskBaselineHrs - taskActualHrs),
              baselineCost: taskBaselineCst,
              actualCost: taskActualCst,
              remainingCost: task.remainingCost ?? Math.max(0, taskBaselineCst - taskActualCst),
              assignedResourceId: task.assignedResourceId ?? (task as any).assigned_resource_id ?? task.employeeId ?? (task as any).employee_id ?? task.assigneeId ?? null,
              is_milestone: task.is_milestone || task.isMilestone || false,
              isCritical: task.is_critical || task.isCritical || false
            };
            phaseItem.children?.push(taskItem);
          });

          if (phaseChildCount > 0) {
            phaseItem.baselineHours = phaseItem.baselineHours || phaseRollupBaselineHrs;
            phaseItem.actualHours = phaseItem.actualHours || phaseRollupActualHrs;
            phaseItem.baselineCost = phaseItem.baselineCost || phaseRollupBaselineCst;
            phaseItem.actualCost = phaseItem.actualCost || phaseRollupActualCst;
            phaseItem.percentComplete = phaseItem.percentComplete || Math.round(phaseRollupPercentComplete / phaseChildCount);
          }

          unitRollupBaselineHrs += phaseItem.baselineHours || 0;
          unitRollupActualHrs += phaseItem.actualHours || 0;
          unitRollupBaselineCst += phaseItem.baselineCost || 0;
          unitRollupActualCst += phaseItem.actualCost || 0;
          unitRollupPercentComplete += phaseItem.percentComplete || 0;
          unitChildCount++;

          unitItem.children?.push(phaseItem);
        });

        if (unitChildCount > 0) {
          unitItem.baselineHours = unitItem.baselineHours || unitRollupBaselineHrs;
          unitItem.actualHours = unitItem.actualHours || unitRollupActualHrs;
          unitItem.baselineCost = unitItem.baselineCost || unitRollupBaselineCst;
          unitItem.actualCost = unitItem.actualCost || unitRollupActualCst;
          unitItem.percentComplete = unitItem.percentComplete || Math.round(unitRollupPercentComplete / unitChildCount);
        }

        projRollupBaselineHrs += unitItem.baselineHours || 0;
        projRollupActualHrs += unitItem.actualHours || 0;
        projRollupBaselineCst += unitItem.baselineCost || 0;
        projRollupActualCst += unitItem.actualCost || 0;
        projRollupPercentComplete += unitItem.percentComplete || 0;
        projChildCount++;

        projectItem.children?.push(unitItem);
      });

      // Phases with no unit (direct under project)
      const directPhasesRaw = (maps.phasesByProject.get(String(projectId)) || []).filter(
        (ph: any) => !(ph.unitId ?? ph.unit_id)
      );
      const directPhases = Array.from(new Map(directPhasesRaw.map((ph: any) => [String(ph.id ?? ph.phaseId), ph])).values());

      directPhases.forEach((phase: any, phIdx: number) => {
        const phaseId = phase.id || phase.phaseId;
        const phaseWbs = `${projectWbs}.${projectUnits.length + phIdx + 1}`;
        addedPhaseIds.add(String(phaseId));

        let phaseRollupBaselineHrs = 0;
        let phaseRollupActualHrs = 0;
        let phaseRollupBaselineCst = 0;
        let phaseRollupActualCst = 0;
        let phaseChildCount = 0;

        const phaseItem: TransformWBSItem = {
          id: `wbs-phase-${phaseId}`,
          wbsCode: phaseWbs,
          name: phase.name || `Phase ${phIdx + 1}`,
          type: 'phase',
          itemType: 'phase',
          startDate: phase.startDate || phase.baselineStartDate,
          endDate: phase.endDate || phase.baselineEndDate,
          percentComplete: phase.percentComplete ?? phase.percent_complete ?? 0,
          baselineHours: phase.baselineHours || 0,
          actualHours: phase.actualHours || 0,
          children: []
        };

        const directPhaseTasksRaw = (maps.tasksByPhase.get(String(phaseId)) || []).filter(
          (t: any) => !taskIdsUnderAnyUnit.has(String(t.id ?? t.taskId))
        );
        const directPhaseTasks = Array.from(new Map(directPhaseTasksRaw.map((t: any) => [String(t.id ?? t.taskId), t])).values());

        directPhaseTasks.forEach((task: any, tIdx: number) => {
          const taskId = task.id || task.taskId;
          const taskWbs = `${phaseWbs}.${tIdx + 1}`;
          const taskBaselineHrs = task.baselineHours || task.budgetHours || 0;
          const taskActualHrs = task.actualHours || task.actual_hours || 0;
          const taskBaselineCst = task.baselineCost || task.baseline_cost || 0;
          const taskActualCst = task.actualCost || task.actual_cost || 0;
          const taskPercent = task.percentComplete ?? task.percent_complete ?? 0;

          phaseRollupBaselineHrs += taskBaselineHrs;
          phaseRollupActualHrs += taskActualHrs;
          phaseRollupBaselineCst += taskBaselineCst;
          phaseRollupActualCst += taskActualCst;
          phaseRollupPercentComplete += taskPercent;
          phaseChildCount++;

          const taskItem: TransformWBSItem = {
            id: `wbs-task-${taskId}`,
            wbsCode: taskWbs,
            name: task.name || task.taskName || `Task ${tIdx + 1}`,
            type: 'task',
            itemType: 'task',
            startDate: task.baselineStartDate || task.startDate,
            endDate: task.baselineEndDate || task.endDate,
            daysRequired: (task.duration !== undefined ? task.duration : (task.daysRequired !== undefined ? task.daysRequired : 1)),
            percentComplete: taskPercent,
            baselineHours: taskBaselineHrs,
            actualHours: taskActualHrs,
            remainingHours: task.remainingHours ?? Math.max(0, taskBaselineHrs - taskActualHrs),
            baselineCost: taskBaselineCst,
            actualCost: taskActualCst,
            remainingCost: task.remainingCost ?? Math.max(0, taskBaselineCst - taskActualCst),
            assignedResourceId: task.assignedResourceId ?? (task as any).assigned_resource_id ?? task.employeeId ?? (task as any).employee_id ?? task.assigneeId ?? null,
            is_milestone: task.is_milestone || task.isMilestone || false,
            isCritical: task.is_critical || task.isCritical || false
          };
          phaseItem.children?.push(taskItem);
        });

        if (phaseChildCount > 0) {
          phaseItem.baselineHours = phaseItem.baselineHours || phaseRollupBaselineHrs;
          phaseItem.actualHours = phaseItem.actualHours || phaseRollupActualHrs;
          phaseItem.baselineCost = phaseItem.baselineCost || phaseRollupBaselineCst;
          phaseItem.actualCost = phaseItem.actualCost || phaseRollupActualCst;
          phaseItem.percentComplete = phaseItem.percentComplete || Math.round(phaseRollupPercentComplete / phaseChildCount);
        }

        projRollupBaselineHrs += phaseItem.baselineHours || 0;
        projRollupActualHrs += phaseItem.actualHours || 0;
        projRollupBaselineCst += phaseItem.baselineCost || 0;
        projRollupActualCst += phaseItem.actualCost || 0;
        projRollupPercentComplete += phaseItem.percentComplete || 0;
        projChildCount++;

        projectItem.children?.push(phaseItem);
      });

      // Orphan tasks under Project (phase not under any unit/direct phase we added); dedupe by task id
      const directProjectTasksRaw = (maps.tasksByProject.get(String(projectId)) || []).filter((t: any) => {
        const tid = String(t.id ?? t.taskId);
        if (taskIdsUnderAnyUnit.has(tid)) return false;
        const tPhaseId = t.phaseId ?? t.phase_id;
        if (tPhaseId && addedPhaseIds.has(String(tPhaseId))) return false;
        return true;
      });
      const directProjectTasks = Array.from(
        new Map(directProjectTasksRaw.map((t: any) => [String(t.id ?? t.taskId), t])).values()
      );
      directProjectTasks.forEach((task: any, tIdx: number) => {
        const taskId = task.id || task.taskId;
        const taskWbs = `${projectWbs}.${projectUnits.length + directPhases.length + tIdx + 1}`;

        const taskBaselineHrs = task.baselineHours || task.budgetHours || 0;
        const taskActualHrs = task.actualHours || task.actual_hours || 0;
        const taskBaselineCst = task.baselineCost || task.baseline_cost || 0;
        const taskActualCst = task.actualCost || task.actual_cost || 0;
        const taskPercent = task.percentComplete ?? task.percent_complete ?? 0;

        // Aggregate to Project
        projRollupBaselineHrs += taskBaselineHrs;
        projRollupActualHrs += taskActualHrs;
        projRollupBaselineCst += taskBaselineCst;
        projRollupActualCst += taskActualCst;
        projRollupPercentComplete += taskPercent;
        projChildCount++;

        const taskItem: TransformWBSItem = {
          id: `wbs-task-${taskId}`,
          wbsCode: taskWbs,
          name: task.name || task.taskName || `Task ${tIdx + 1}`,
          type: 'task',
          itemType: 'task',
          startDate: task.baselineStartDate || task.startDate,
          endDate: task.baselineEndDate || task.endDate,
          percentComplete: taskPercent,
          baselineHours: taskBaselineHrs,
          actualHours: taskActualHrs,
          remainingHours: task.remainingHours ?? Math.max(0, taskBaselineHrs - taskActualHrs),
          baselineCost: taskBaselineCst,
          actualCost: taskActualCst,
          remainingCost: task.remainingCost ?? Math.max(0, taskBaselineCst - taskActualCst),
          assignedResourceId: task.assignedResourceId ?? (task as any).assigned_resource_id ?? task.employeeId ?? (task as any).employee_id ?? task.assigneeId ?? null,
          is_milestone: task.is_milestone || task.isMilestone || false,
          isCritical: task.is_critical || task.isCritical || false
        };

        projectItem.children?.push(taskItem);
      });

      // Project rollup completion
      if (projChildCount > 0) {
        projectItem.baselineHours = projectItem.baselineHours || projRollupBaselineHrs;
        projectItem.actualHours = projectItem.actualHours || projRollupActualHrs;
        projectItem.baselineCost = projectItem.baselineCost || projRollupBaselineCst;
        projectItem.actualCost = projectItem.actualCost || projRollupActualCst;
        projectItem.percentComplete = projectItem.percentComplete || Math.round(projRollupPercentComplete / projChildCount);
      }

      return projectItem;
    };

    // Build hierarchy using Map lookups (O(n) instead of O(n⁴))
    let wbsCounter = 1;

    portfolios.forEach((portfolio: any, pIdx: number) => {
      const portfolioId = portfolio.id || portfolio.portfolioId;
      const portfolioWbs = `${wbsCounter}`;

      // Calculate portfolio name
      const ownerName = getOwnerName(portfolio.employeeId);
      const portfolioName = ownerName
        ? `${ownerName}'s Portfolio`
        : (portfolio.name || `Portfolio ${pIdx + 1}`);

      const portfolioItem: TransformWBSItem = {
        id: `wbs-portfolio-${portfolioId}`,
        wbsCode: portfolioWbs,
        name: portfolioName,
        type: 'portfolio',
        itemType: 'portfolio',
        startDate: portfolio.startDate || portfolio.baselineStartDate,
        endDate: portfolio.endDate || portfolio.baselineEndDate,
        percentComplete: portfolio.percentComplete ?? portfolio.percent_complete ?? 0,
        children: []
      };

      const allPortfolioCustomers = maps.customersByPortfolio.get(portfolioId) || [];
      allPortfolioCustomers.forEach((customer: any, cIdx: number) => {
        const customerId = customer.id || customer.customerId;
        const customerWbs = `${portfolioWbs}.${cIdx + 1}`;

        const customerItem: TransformWBSItem = {
          id: `wbs-customer-${customerId}`,
          wbsCode: customerWbs,
          name: customer.name || `Customer ${cIdx + 1}`,
          type: 'customer',
          itemType: 'customer',
          percentComplete: customer.percentComplete ?? customer.percent_complete ?? 0,
          children: []
        };

        const customerSites = maps.sitesByCustomer.get(customerId) || [];
        customerSites.forEach((site: any, sIdx: number) => {
          const siteId = site.id || site.siteId;
          const siteWbs = `${customerWbs}.${sIdx + 1}`;

          const siteItem: TransformWBSItem = {
            id: `wbs-site-${siteId}`,
            wbsCode: siteWbs,
            name: site.name || `Site ${sIdx + 1}`,
            type: 'site',
            itemType: 'site',
            percentComplete: site.percentComplete ?? site.percent_complete ?? 0,
            children: []
          };



          // Projects directly under site (dedupe by projectId so same project is never built twice)
          const siteProjectsRaw = maps.projectsBySite.get(siteId) || [];
          const siteProjects = Array.from(new Map(siteProjectsRaw.map((p: any) => [String(p.id ?? p.projectId), p])).values());
          siteProjects.forEach((project: any, prIdx: number) => {
            siteItem.children?.push(buildProjectNode(project, `${siteWbs}.${prIdx + 1}`));
          });
          customerItem.children?.push(siteItem);
        });

        // Projects directly under customer (dedupe by projectId)
        const customerProjectsFiltered = (maps.projectsByCustomer.get(customerId) || []).filter((p: any) => {
          if (!p.siteId && !p.site_id) return true;
          const pSiteId = p.siteId || p.site_id;
          return !customerSites.some((s: any) => (s.id || s.siteId) === pSiteId);
        });
        const customerProjects = Array.from(new Map(customerProjectsFiltered.map((p: any) => [String(p.id ?? p.projectId), p])).values());
        customerProjects.forEach((project: any, prIdx: number) => {
          customerItem.children?.push(buildProjectNode(project, `${customerWbs}.${customerSites.length + prIdx + 1}`));
        });

        portfolioItem.children?.push(customerItem);
      });

      // Projects directly under portfolio (dedupe by projectId)
      const portfolioProjectsFiltered = (projects || []).filter((p: any) => {
        if ((p.portfolioId !== portfolioId && p.portfolio_id !== portfolioId)) return false;
        if (!p.customerId && !p.customer_id) return true;
        const pCustId = p.customerId || p.customer_id;
        return !allPortfolioCustomers.some((c: any) => (c.id || c.customerId) === pCustId);
      });
      const portfolioProjects = Array.from(new Map(portfolioProjectsFiltered.map((p: any) => [String(p.id ?? p.projectId), p])).values());
      portfolioProjects.forEach((project: any, prIdx: number) => {
        portfolioItem.children?.push(buildProjectNode(project, `${portfolioWbs}.${allPortfolioCustomers.length + prIdx + 1}`));
      });

      items.push(portfolioItem);
      wbsCounter++;
    });

    // Add orphan projects (no portfolio); dedupe by projectId so each project appears once
    const orphanProjectsFiltered = projects.filter((p: any) => {
      const pPortId = p.portfolioId || p.portfolio_id;
      return !portfolios.some((port: any) => (port.id || port.portfolioId) === pPortId) &&
        !p.customerId && !p.customer_id && !p.siteId && !p.site_id && !p.unitId && !p.unit_id;
    });
    const orphanProjects = Array.from(new Map(orphanProjectsFiltered.map((p: any) => [String(p.id ?? p.projectId), p])).values());
    orphanProjects.forEach((project: any, prIdx: number) => {
      items.push(buildProjectNode(project, `${wbsCounter + prIdx}`));
    });


    // Helper to count tasks recursively
    const countTasks = (item: any): number => {
      if (!item.children || item.children.length === 0) {
        return item.type === 'task' ? 1 : 0;
      }
      return item.children.reduce((acc: number, child: any) => acc + countTasks(child), 0);
    };

    // Sort items by task count (descending)
    items.sort((a, b) => countTasks(b) - countTasks(a));

    // Re-index WBS codes after sorting
    const reindexWBS = (itemList: any[], prefix: string = '') => {
      itemList.forEach((item, idx) => {
        const newCode = prefix ? `${prefix}.${idx + 1}` : `${idx + 1}`;
        item.wbsCode = newCode;
        if (item.children && item.children.length > 0) {
          reindexWBS(item.children, newCode);
        }
      });
    };

    // Roll up dates and hours/cost from children so parent bars (site, customer, portfolio, project, phase, unit) span full range and show roll-up values
    const rollupDatesAndValues = (itemList: any[]): void => {
      itemList.forEach((item: any) => {
        if (item.children && item.children.length > 0) {
          rollupDatesAndValues(item.children);
          let minStart: string | undefined;
          let maxEnd: string | undefined;
          let sumBaselineHrs = 0;
          let sumActualHrs = 0;
          let sumBaselineCst = 0;
          let sumActualCst = 0;
          item.children.forEach((c: any) => {
            const s = c.startDate ?? c.baselineStartDate;
            const e = c.endDate ?? c.baselineEndDate;
            if (s) minStart = !minStart || s < minStart ? s : minStart;
            if (e) maxEnd = !maxEnd || e > maxEnd ? e : maxEnd;
            sumBaselineHrs += Number(c.baselineHours) || 0;
            sumActualHrs += Number(c.actualHours) || 0;
            sumBaselineCst += Number(c.baselineCost) || 0;
            sumActualCst += Number(c.actualCost) || 0;
          });
          if (minStart) item.startDate = minStart;
          if (maxEnd) item.endDate = maxEnd;
          item.baselineHours = item.baselineHours ?? (sumBaselineHrs || undefined);
          item.actualHours = item.actualHours ?? (sumActualHrs || undefined);
          item.baselineCost = item.baselineCost ?? (sumBaselineCst || undefined);
          item.actualCost = item.actualCost ?? (sumActualCst || undefined);
        }
      });
    };
    rollupDatesAndValues(items);

    // Compute daysRequired from start/end dates when both exist (so days roll up correctly)
    const setDaysFromDates = (itemList: any[]): void => {
      itemList.forEach((item: any) => {
        if (item.children && item.children.length > 0) {
          setDaysFromDates(item.children);
        }
        const start = item.startDate ?? item.baselineStartDate;
        const end = item.endDate ?? item.baselineEndDate;
        if (start && end) {
          const startMs = new Date(start).getTime();
          const endMs = new Date(end).getTime();
          if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
            const days = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
            item.daysRequired = item.daysRequired ?? days;
          }
        }
      });
    };
    setDaysFromDates(items);

    reindexWBS(items);

    // Cast to WBSData format; use undefined for missing dates so bar only draws when valid
    const wbsItems = items.map(item => {
      const itemAny = item as any;
      const startDate = item.startDate || itemAny.baselineStartDate || undefined;
      const endDate = item.endDate || itemAny.baselineEndDate || undefined;
      return {
        ...item,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        progress: item.percentComplete || 0,
      };
    }) as any;
    return { items: wbsItems };
  }, [dataKey]);
}

// ============================================================================
// LABOR BREAKDOWN TRANSFORMATION
// Builds laborBreakdown from hours and employees
// ============================================================================

/**
 * Build labor breakdown data from hours entries
 */
export function buildLaborBreakdown(data: Partial<SampleData>): LaborBreakdown {
  const hours = data.hours || [];
  const employees = data.employees || [];
  const projects = data.projects || [];
  const phases = data.phases || [];
  const tasks = data.tasks || [];

  if (hours.length === 0) {
    return { weeks: [], byWorker: [], byPhase: [], byTask: [] };
  }

  // Build Maps for O(1) lookups instead of O(n) find() calls
  const employeeMap = new Map<string, any>();
  const projectMap = new Map<string, any>();
  const phaseMap = new Map<string, any>();
  const taskMap = new Map<string, any>();

  employees.forEach((e: any) => {
    const id = e.id || e.employeeId;
    if (id) employeeMap.set(id, e);
  });

  projects.forEach((p: any) => {
    const id = p.id || p.projectId;
    if (id) projectMap.set(id, p);
  });

  phases.forEach((ph: any) => {
    const id = ph.id || ph.phaseId;
    if (id) phaseMap.set(id, ph);
  });

  tasks.forEach((t: any) => {
    const id = t.id || t.taskId;
    if (id) taskMap.set(id, t);
  });

  // Use shared week mapping utility; normalize dates so ISO/date-only/etc. all map to same weeks
  const dates = hours.map((h: any) => normalizeDateString(h.date || h.entry_date)).filter((d): d is string => d != null);
  const { weekMap, weekIndexMap, rawWeeks, formattedWeeks: weeks } = buildWeekMappings(dates);

  // Build all aggregations in a single pass through hours (Phase 2.4: Batch Data Processing)
  const workerHours = new Map<string, {
    name: string;
    role: string;
    project: string;
    chargeCode: string;
    portfolio: string;
    customer: string;
    site: string;
    data: number[];
    total: number
  }>();
  const phaseHours = new Map<string, { name: string; project: string; data: number[]; total: number }>();
  const taskHours = new Map<string, { name: string; project: string; data: number[]; total: number }>();

  // Single pass through hours - calculate all aggregations at once (byWorker, byPhase, byTask)
  hours.forEach((h: any) => {
    // Use Map lookups instead of find() - O(1) instead of O(n)
    const empId = h.employeeId || h.employee_id;
    const projId = h.projectId || h.project_id;
    const taskId = h.taskId || h.task_id;
    const emp: any = empId ? employeeMap.get(empId) : null;
    const proj: any = projId ? projectMap.get(projId) : null;
    const task: any = taskId ? taskMap.get(taskId) : null;

    // Common values used by all aggregations
    const hourDateNorm = normalizeDateString(h.date || h.entry_date);
    const weekKey = hourDateNorm ? weekMap.get(hourDateNorm) : undefined;
    const weekIdx = weekIndexMap.get(weekKey || '') ?? -1;
    const hoursValue = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;

    if (weekIdx < 0) return; // Skip invalid dates

    // Update byWorker aggregation
    const workerName = emp?.name || h.employeeId || h.employee_id || 'Unknown';
    const role = emp?.jobTitle || emp?.role || emp?.job_title || 'N/A';
    const projectName = proj?.name || h.projectId || h.project_id || 'Unknown';
    const chargeCode = h.chargeCode || h.charge_code || task?.chargeCode || 'EX';
    const portfolio = proj?.portfolioName || proj?.portfolio_name || '';
    const customer = proj?.customerName || proj?.customer_name || '';
    const site = proj?.siteName || proj?.site_name || '';

    const workerKey = `${workerName}-${projectName}-${chargeCode}`;
    if (!workerHours.has(workerKey)) {
      workerHours.set(workerKey, {
        name: workerName,
        role,
        project: projectName,
        chargeCode,
        portfolio,
        customer,
        site,
        data: new Array(rawWeeks.length).fill(0),
        total: 0
      });
    }
    const worker = workerHours.get(workerKey)!;
    worker.data[weekIdx] += hoursValue;
    worker.total += hoursValue;

    // Update byPhase aggregation
    const phaseId = task?.phaseId || task?.phase_id;
    const phase: any = phaseId ? phaseMap.get(phaseId) : null;
    const phaseName = phase?.name || 'No Phase';
    const phaseKey = `${phaseName}-${projectName}`;
    if (!phaseHours.has(phaseKey)) {
      phaseHours.set(phaseKey, {
        name: phaseName,
        project: projectName,
        data: new Array(rawWeeks.length).fill(0),
        total: 0
      });
    }
    const phaseData = phaseHours.get(phaseKey)!;
    phaseData.data[weekIdx] += hoursValue;
    phaseData.total += hoursValue;

    // Update byTask aggregation
    const taskName = task?.name || h.taskId || 'Unknown Task';
    const taskKey = `${taskName}-${projectName}`;
    if (!taskHours.has(taskKey)) {
      taskHours.set(taskKey, {
        name: taskName,
        project: projectName,
        data: new Array(rawWeeks.length).fill(0),
        total: 0
      });
    }
    const taskData = taskHours.get(taskKey)!;
    taskData.data[weekIdx] += hoursValue;
    taskData.total += hoursValue;
  });

  return {
    weeks,
    byWorker: [...workerHours.values()],
    byPhase: [...phaseHours.values()],
    byTask: [...taskHours.values()]
  };
}

// Helper to map raw records to a canonical task ID
const normalizeTaskId = (record: any): string | null => {
  if (!record) return null;
  return record.taskId || record.task_id || record.id || null;
};

// Normalize phase/task name for matching (trim, lower case, collapse whitespace)
const normalizeNameForMatch = (s: string): string =>
  (s ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

// More robust: strip punctuation and extra spaces so "Phase 1 - Kickoff" matches "Phase 1 Kickoff"
const normalizeNameRelaxed = (s: string): string =>
  (s ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.,;:()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');

// Check if two normalized strings match: exact, or one contains the other (for truncated names)
function namesMatch(a: string, b: string, relaxed: boolean): boolean {
  const na = relaxed ? normalizeNameRelaxed(a) : normalizeNameForMatch(a);
  const nb = relaxed ? normalizeNameRelaxed(b) : normalizeNameForMatch(b);
  if (!na || !nb) return na === nb;
  if (na === nb) return true;
  if (relaxed && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

/**
 * Resolve hour entries to MPP tasks by matching (project_id, workday_phase, workday_task)
 * to (task.project_id, phase.name, task.name). Project ID is set by the user when they
 * select the project during MPP upload, so mismatch should not occur. Matching uses
 * increasingly relaxed name comparison so phase/task names align even with punctuation
 * or wording differences.
 * Returns a new hours array with taskId/task_id set where a match was found.
 *
 * Why matching might still not work (reasons 3 and 4 in detail):
 *
 * (3) Missing workday_phase / workday_task: These fields are populated only by the
 *     Workday sync from the Project Labor Transactions report (Phase and Task columns).
 *     If hour entries were imported from CSV, manual entry, or another system, they
 *     typically won't have workday_phase/workday_task. Likewise, if an older version
 *     of the Workday sync did not persist these columns, existing rows will have null.
 *     Without at least one of these, we cannot match by name—only by task_id if it
 *     was already set—so those hours will not roll up to any MPP task.
 *
 * (4) Multiple tasks with the same phase name and task name in one project: Matching
 *     uses the pair (phase_name, task_name) per project. If the MPP schedule has two
 *     different tasks that share the same phase and task name (e.g. duplicate labels
 *     or two "Design" tasks under "Phase 1"), we can only attach hours to one of them
 *     (the first we encounter when building the lookup). The other task will show no
 *     actuals from Workday. Fixing this would require a stronger discriminator (e.g.
 *     WBS code or task order) in both Workday and the MPP data.
 */
function resolveHourEntriesToTasks(
  hours: any[],
  tasks: any[],
  phases: any[]
): any[] {
  if (!hours?.length || !tasks?.length) return hours ?? [];

  const phaseIdToName = new Map<string, string>();
  (phases ?? []).forEach((p: any) => {
    const id = p.id ?? p.phaseId ?? p.phase_id;
    const name = (p.name ?? p.phase_name ?? '').toString().trim();
    if (id != null) phaseIdToName.set(String(id), name);
  });

  // Build lookup: for each task we store (projectId, phaseName, taskName) -> taskId with multiple key variants (exact + relaxed)
  const exactKeys = new Map<string, string>();
  const relaxedKeys = new Map<string, string>();
  const taskListByProject: { projectId: string; phaseName: string; taskName: string; taskId: string }[] = [];

  tasks.forEach((t: any) => {
    const projectId = t.projectId ?? t.project_id;
    const phaseId = t.phaseId ?? t.phase_id;
    const taskName = (t.name ?? t.taskName ?? t.task_name ?? '').toString().trim();
    const phaseName = phaseId ? (phaseIdToName.get(String(phaseId)) ?? '') : '';
    const taskId = String(t.id ?? t.taskId ?? '');
    if (projectId == null) return;

    const exactKey = `${String(projectId)}|${normalizeNameForMatch(phaseName)}|${normalizeNameForMatch(taskName)}`;
    const relaxedKey = `${String(projectId)}|${normalizeNameRelaxed(phaseName)}|${normalizeNameRelaxed(taskName)}`;
    if (!exactKeys.has(exactKey)) exactKeys.set(exactKey, taskId);
    if (!relaxedKeys.has(relaxedKey)) relaxedKeys.set(relaxedKey, taskId);
    taskListByProject.push({ projectId: String(projectId), phaseName, taskName, taskId });
  });

  return hours.map((h: any) => {
    const existingTaskId = h.taskId ?? h.task_id;
    if (existingTaskId) return h;

    const projectId = h.projectId ?? h.project_id;
    const workdayPhase = (h.workdayPhase ?? h.workday_phase ?? '').toString().trim();
    const workdayTask = (h.workdayTask ?? h.workday_task ?? '').toString().trim();
    if (!projectId || (!workdayPhase && !workdayTask)) return h;

    // Try exact normalized key first
    let key = `${String(projectId)}|${normalizeNameForMatch(workdayPhase)}|${normalizeNameForMatch(workdayTask)}`;
    let matchedTaskId = exactKeys.get(key);
    if (matchedTaskId) return { ...h, taskId: matchedTaskId, task_id: matchedTaskId };

    // Try relaxed key (strip punctuation, collapse separators)
    key = `${String(projectId)}|${normalizeNameRelaxed(workdayPhase)}|${normalizeNameRelaxed(workdayTask)}`;
    matchedTaskId = relaxedKeys.get(key);
    if (matchedTaskId) return { ...h, taskId: matchedTaskId, task_id: matchedTaskId };

    // Fallback: find first task in same project where phase and task names match (relaxed or contains)
    const found = taskListByProject.find(
      (x) =>
        x.projectId === String(projectId) &&
        namesMatch(workdayPhase, x.phaseName, true) &&
        namesMatch(workdayTask, x.taskName, true)
    );
    if (found) return { ...h, taskId: found.taskId, task_id: found.taskId };

    return h;
  });
}

const WEEK_DAYS = 7;
const DEFAULT_COST_RATE = 75;

const toWeekStartKey = (dateStr?: string | null): string | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDay();
  const offset = (day + 6) % WEEK_DAYS;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
};

const getWeeksBetween = (start?: string | null, end?: string | null): string[] => {
  const startKey = toWeekStartKey(start);
  const endKey = toWeekStartKey(end);
  if (!startKey || !endKey) return [];
  const weeks: string[] = [];
  const cursor = new Date(startKey);
  const limit = new Date(endKey);
  while (cursor <= limit) {
    weeks.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + WEEK_DAYS);
  }
  return weeks;
};

const addToMap = (map: Map<string, number>, key: string, value: number) => {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + value);
};

const buildClaimTotalsMap = (claims: ProgressClaim[]) => {
  const map = new Map<string, { ev: number; pct: number }>();
  claims.forEach((claim) => {
    if (!claim.taskId) return;
    const taskId = claim.taskId;
    const entry = map.get(taskId) || { ev: 0, pct: 0 };
    entry.ev += Number(claim.claimedEV) || 0;
    entry.pct = Math.max(entry.pct, Number(claim.claimedPct) || 0);
    map.set(taskId, entry);
  });
  return map;
};

const buildPVTimeline = (tasks: any[]) => {
  const map = new Map<string, number>();
  tasks.forEach((task) => {
    const baselineCost = Number(task.baselineCost ?? 0) || Number(task.budgetCost ?? 0) || ((Number(task.baselineHours ?? 0)) * DEFAULT_COST_RATE);
    if (baselineCost <= 0) return;
    const weeks = getWeeksBetween(task.baselineStartDate, task.baselineEndDate);
    if (weeks.length === 0) {
      const key = toWeekStartKey(task.baselineStartDate) || toWeekStartKey(task.baselineEndDate);
      if (key) addToMap(map, key, baselineCost);
      return;
    }
    const perWeek = baselineCost / weeks.length;
    weeks.forEach((wk) => addToMap(map, wk, perWeek));
  });
  return map;
};

const buildEVTimeline = (claims: ProgressClaim[]) => {
  const map = new Map<string, number>();
  claims.forEach((claim) => {
    const key = toWeekStartKey(claim.claimDate);
    if (!key) return;
    addToMap(map, key, Number(claim.claimedEV) || 0);
  });
  return map;
};

const buildACTimeline = (hours: any[]) => {
  const map = new Map<string, number>();
  hours.forEach((entry: any) => {
    const key = toWeekStartKey(entry.date);
    if (!key) return;
    const amount = Number(
      entry.reportedStandardCostAmt ?? entry.reported_standard_cost_amt
      ?? entry.actualCost ?? entry.actual_cost ?? entry.cost ?? (entry.hours || 0) * DEFAULT_COST_RATE
    );
    addToMap(map, key, amount);
  });
  return map;
};

const buildEVMSeries = (data: Partial<SampleData>): EVSeriesPoint[] => {
  const pvMap = buildPVTimeline(data.tasks || []);
  const evMap = buildEVTimeline(data.progressClaims || []);
  const acMap = buildACTimeline(data.hours || []);
  const keys = new Set<string>([...pvMap.keys(), ...evMap.keys(), ...acMap.keys()]);
  const sortedKeys = Array.from(keys).sort();
  return sortedKeys.map((key) => ({
    period: key,
    date: key,
    pv: pvMap.get(key) || 0,
    ev: evMap.get(key) || 0,
    ac: acMap.get(key) || 0,
  }));
};
const buildTaskActualHoursMap = (hours: any[]): Map<string, number> => {
  const map = new Map<string, number>();
  hours.forEach((h: any) => {
    const taskId = normalizeTaskId(h);
    if (!taskId) return;
    const hoursValue = typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
    map.set(taskId, (map.get(taskId) || 0) + hoursValue);
  });
  return map;
};

const clampPercent = (value?: number): number => {
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

const getMilestoneStatusWeight = (status?: string): number | null => {
  const key = normalizeStatusKey(status);
  if (!key) return null;
  return milestoneStatusWeights[key] ?? null;
};

const buildMilestoneMap = (milestones: any[]): Map<string, any> => {
  const map = new Map<string, any>();
  milestones.forEach((milestone: any) => {
    const id = milestone.milestoneId || milestone.id || milestone.milestone_id;
    if (id) {
      map.set(id, milestone);
    }
  });
  return map;
};

function normalizeQuantityEntry(entry: any): QuantityEntryType {
  if (!entry) return 'completed';
  return (entry.qtyType || entry.qty_type || 'completed') as QuantityEntryType;
}

const buildTaskQuantityTotals = (entries: any[]) => {
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

// ============================================================================
// TASK HOURS EFFICIENCY TRANSFORMATION
// ============================================================================

/**
 * Build task hours efficiency data from tasks
 */
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
      return taskActualHours.get(taskId) || t.actualHours || t.actual_hours || 0;
    }),
    estimatedAdded: validTasks.map((t: any) => {
      const taskId = t.id || t.taskId;
      const baseline = t.baselineHours || t.budgetHours || t.baseline_hours || t.budget_hours || 0;
      const actual = taskActualHours.get(taskId) || t.actualHours || t.actual_hours || 0;
      return Math.max(0, baseline - actual);
    }),
    efficiency: validTasks.map((t: any) => {
      const taskId = t.id || t.taskId;
      const baseline = t.baselineHours || t.budgetHours || t.baseline_hours || t.budget_hours || 0;
      const actual = taskActualHours.get(taskId) || t.actualHours || t.actual_hours || 0;
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

const buildTaskProductivityMetrics = (data: Partial<SampleData>): TaskProductivityMetrics[] => {
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

/**
 * Build resource heatmap data from hours and employees
 */
export function buildResourceHeatmap(data: Partial<SampleData>): ResourceHeatmap {
  const hours = data.hours || [];
  const employees = data.employees || [];

  // If no employees, return empty
  if (employees.length === 0) {
    return { resources: [], weeks: [], data: [] };
  }

  // Build hours by employee Map for O(1) lookups instead of filtering
  const hoursByEmployee = new Map<string, any[]>();
  hours.forEach((h: any) => {
    const empId = h.employeeId || h.employee_id;
    if (empId) {
      if (!hoursByEmployee.has(empId)) {
        hoursByEmployee.set(empId, []);
      }
      hoursByEmployee.get(empId)!.push(h);
    }
  });

  // Get unique weeks from hours data, or generate current weeks if no hours
  let rawWeeks: string[] = [];
  let weekMap: Map<string, string>;
  let weekIndexMap: Map<string, number>;

  if (hours.length > 0) {
    // Use shared week mapping utility; normalize so all date formats map to same weeks
    const dates = hours.map((h: any) => normalizeDateString(h.date || h.entry_date)).filter((d): d is string => d != null);
    const weekMappings = buildWeekMappings(dates);
    weekMap = weekMappings.weekMap;
    weekIndexMap = weekMappings.weekIndexMap;
    rawWeeks = weekMappings.rawWeeks;
  } else {
    // No hours data - generate next 12 weeks from today
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    weekMap = new Map();
    weekIndexMap = new Map();
    for (let i = 0; i < 12; i++) {
      const weekStart = new Date(startOfWeek);
      weekStart.setDate(startOfWeek.getDate() + (i * 7));
      const weekKey = weekStart.toISOString().split('T')[0];
      rawWeeks.push(weekKey);
      weekIndexMap.set(weekKey, i);
    }
  }

  // Include ALL employees, not just those with hours
  const resources: string[] = [];
  const heatmapData: number[][] = [];

  // Target hours per week (40 hours = 100% utilization)
  const TARGET_HOURS_PER_WEEK = 40;

  employees.forEach((emp: any) => {
    const empId = emp.id || emp.employeeId;
    const name = emp.name || empId;
    resources.push(name);

    const weeklyHours = new Array(rawWeeks.length).fill(0);

    // Use Map lookup instead of filter - O(1) instead of O(n)
    const empHours = hoursByEmployee.get(empId) || [];
    empHours.forEach((h: any) => {
      const hourDateNorm = normalizeDateString(h.date || h.entry_date);
      const weekKey = hourDateNorm ? weekMap.get(hourDateNorm) : undefined;
      const weekIdx = weekIndexMap.get(weekKey || '') ?? -1;
      if (weekIdx >= 0) {
        weeklyHours[weekIdx] += typeof h.hours === 'number' ? h.hours : parseFloat(h.hours) || 0;
      }
    });

    // Convert hours to utilization percentage (hours / 40 * 100)
    const utilizationData = weeklyHours.map(hrs => Math.round((hrs / TARGET_HOURS_PER_WEEK) * 100));

    heatmapData.push(utilizationData);
  });

  // Format weeks for display using shared utility format
  const formattedWeeks = rawWeeks.map(week => {
    const d = new Date(week);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  return { resources, weeks: formattedWeeks, data: heatmapData };
}

// ============================================================================
// HIERARCHY DATA TRANSFORMATION
// Builds hierarchy for filters
// ============================================================================

/**
 * Build hierarchy structure for hierarchy filter
 */
export function buildHierarchy(data: Partial<SampleData>) {
  // Memoize hierarchy structure for performance
  const dataKey = JSON.stringify({
    portfolioCount: data.portfolios?.length || 0,
    customerCount: data.customers?.length || 0,
    siteCount: data.sites?.length || 0,
    projectCount: data.projects?.length || 0,
  });

  return memoize('buildHierarchy', () => {
    const portfolios = data.portfolios || [];
    const customers = data.customers || [];
    const sites = data.sites || [];
    const units = data.units || [];
    const projects = data.projects || [];
    const phases = data.phases || [];
    const employees = data.employees || [];

    // Build Map-based lookups for O(1) access instead of O(n) filtering
    const maps = buildHierarchyMaps(data);

    // Helper to get owner name from employeeId using Map lookup
    const getOwnerName = (employeeId: string | null): string | null => {
      if (!employeeId) return null;
      const owner = maps.employeesById.get(employeeId);
      return owner?.name || null;
    };

    return {
      portfolios: portfolios.map((p: any) => {
        const portfolioId = p.id || p.portfolioId;

        // Calculate portfolio name as "Owner's Portfolio" using employeeId (Owner column)
        const ownerName = getOwnerName(p.employeeId);
        const portfolioName = ownerName
          ? `${ownerName}'s Portfolio`
          : p.name;

        // Use Map lookup instead of filter - O(1) instead of O(n)
        const portfolioCustomers = maps.customersByPortfolio.get(portfolioId) || [];
        // Also include customers without portfolioId (legacy data)
        const unassignedCustomers = customers.filter((c: any) => !c.portfolioId && !c.portfolio_id);
        const allPortfolioCustomers = [...portfolioCustomers, ...unassignedCustomers];

        return {
          name: portfolioName,
          id: portfolioId,
          manager: p.manager,
          methodology: p.methodology,
          customers: allPortfolioCustomers.map((c: any) => {
            const customerId = c.id || c.customerId;

            // Use Map lookup instead of filter - O(1) instead of O(n)
            const customerSites = maps.sitesByCustomer.get(customerId) || [];

            return {
              name: c.name,
              id: customerId,
              sites: customerSites.map((s: any) => {
                const siteId = s.id || s.siteId;

                // Use Map lookup instead of filter - O(1) instead of O(n)
                const siteUnits = maps.unitsBySite.get(siteId) || [];

                return {
                  name: s.name,
                  id: siteId,
                  units: siteUnits.map((u: any) => {
                    const unitId = u.id || u.unitId;

                    // Use Map lookup instead of filter - O(1) instead of O(n)
                    const unitProjects = maps.projectsByUnit.get(unitId) || [];

                    return {
                      name: u.name,
                      id: unitId,
                      projects: unitProjects.map((pr: any) => {
                        const projectId = pr.id || pr.projectId;

                        // Use Map lookup instead of filter - O(1) instead of O(n)
                        const projectPhases = maps.phasesByProject.get(String(projectId)) || [];

                        return {
                          name: pr.name,
                          id: projectId,
                          phases: projectPhases.map((ph: any) => ph.name || `Phase ${ph.sequence || 1}`)
                        };
                      })
                    };
                  }),
                  // Use Map lookup for projects directly under site (no unit)
                  projects: (maps.projectsBySite.get(siteId) || []).filter((pr: any) => !pr.unitId && !pr.unit_id).map((pr: any) => {
                    const projectId = pr.id || pr.projectId;
                    // Use Map lookup instead of filter - O(1) instead of O(n)
                    const projectPhases = maps.phasesByProject.get(String(projectId)) || [];
                    return {
                      name: pr.name,
                      id: projectId,
                      phases: projectPhases.map((ph: any) => ph.name || `Phase ${ph.sequence || 1}`)
                    };
                  })
                };
              })
            };
          })
        };
      })
    };
  }, [dataKey]);
}

// ============================================================================
// RESOURCE GANTT DATA TRANSFORMATION
// Builds hierarchical resource assignment data for Gantt visualization
// ============================================================================

/**
 * Build resource Gantt data from employees and tasks
 */
export function buildResourceGantt(data: Partial<SampleData>) {
  const employees = data.employees || [];
  const tasks = data.tasks || [];
  const hours = data.hours || [];

  if (employees.length === 0) {
    return { items: [] };
  }

  const items: any[] = [];

  employees.forEach((emp: any) => {
    const empId = emp.id || emp.employeeId;
    const empName = emp.name;

    // Find tasks directly assigned to this employee
    const directlyAssignedTasks = tasks.filter((t: any) =>
      t.employeeId === empId ||
      t.employee_id === empId ||
      t.assignedResourceId === empId ||
      t.resourceId === empId
    );

    // Also find tasks this employee has logged hours against
    const empHours = hours.filter((h: any) =>
      (h.employeeId || h.employee_id) === empId
    );
    const taskIdsFromHours = [...new Set(empHours.map((h: any) => h.taskId || h.task_id).filter(Boolean))];

    // Get tasks from hours that aren't already in directly assigned
    const tasksFromHours = tasks.filter((t: any) => {
      const taskId = t.id || t.taskId;
      const alreadyIncluded = directlyAssignedTasks.some((dt: any) => (dt.id || dt.taskId) === taskId);
      return !alreadyIncluded && taskIdsFromHours.includes(taskId);
    });

    // Combine both sets of tasks
    const empTasks = [...directlyAssignedTasks, ...tasksFromHours];

    // Calculate total hours for this employee
    const totalHours = empHours.reduce((sum: number, h: any) => sum + (parseFloat(h.hours) || 0), 0);

    // Calculate date range from tasks and hours
    let startDate: string | null = null;
    let endDate: string | null = null;

    empTasks.forEach((t: any) => {
      const tStart = t.baselineStartDate || t.startDate || t.actualStartDate || t.baseline_start_date;
      const tEnd = t.baselineEndDate || t.endDate || t.actualEndDate || t.baseline_end_date;

      if (tStart && (!startDate || tStart < startDate)) startDate = tStart;
      if (tEnd && (!endDate || tEnd > endDate)) endDate = tEnd;
    });

    // Also consider hours dates if no task dates
    empHours.forEach((h: any) => {
      const hourDate = h.date || h.entry_date;
      if (hourDate) {
        if (!startDate || hourDate < startDate) startDate = hourDate;
        if (!endDate || hourDate > endDate) endDate = hourDate;
      }
    });

    // Calculate utilization (target is 40hr week = 100%)
    const uniqueWeeks = new Set(empHours.map((h: any) => {
      const d = h.date || h.entry_date;
      if (!d) return null;
      const date = new Date(d);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().split('T')[0];
    }).filter(Boolean));

    const weeksWorked = uniqueWeeks.size || 1;
    const utilization = Math.round((totalHours / (weeksWorked * 40)) * 100);

    // Calculate hours per task for display
    const taskHoursMap = new Map<string, number>();
    empHours.forEach((h: any) => {
      const taskId = h.taskId || h.task_id;
      if (taskId) {
        taskHoursMap.set(taskId, (taskHoursMap.get(taskId) || 0) + (parseFloat(h.hours) || 0));
      }
    });

    const resourceItem = {
      id: `resource-${empId}`,
      name: empName,
      type: 'resource',
      role: emp.jobTitle || emp.role || emp.job_title || 'Team Member',
      startDate: startDate || new Date().toISOString().split('T')[0],
      endDate: endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      utilization,
      efficiency: emp.avgEfficiencyPercent || emp.avg_efficiency_percent || 100,
      hours: totalHours,
      children: empTasks.map((t: any, idx: number) => {
        const taskId = t.id || t.taskId;
        const taskHours = taskHoursMap.get(taskId) || 0;
        return {
          id: `res-${empId}-task-${taskId}`,
          name: t.taskName || t.name || t.task_name || `Task ${idx + 1}`,
          type: 'task',
          startDate: t.baselineStartDate || t.startDate || t.baseline_start_date,
          endDate: t.baselineEndDate || t.endDate || t.baseline_end_date,
          percentComplete: t.percentComplete || t.percent_complete || 0,
          utilization: null,
          efficiency: t.taskEfficiency || t.task_efficiency || null,
          hours: taskHours
        };
      })
    };

    items.push(resourceItem);
  });

  return { items };
}

// ============================================================================
// S-CURVE TRANSFORMATION
// Builds cumulative hours data for S-Curve chart
// ============================================================================

export function buildSCurveData(data: Partial<SampleData>) {
  const tasks = data.tasks || [];
  const hours = data.hours || [];
  const projects = data.projects || [];

  // Return empty structure if no data
  if (tasks.length === 0 && projects.length === 0 && hours.length === 0) {
    return {
      dates: [],
      planned: [],
      actual: [],
      forecast: []
    };
  }

  const snapshotSeries = getProjectSnapshotSeries(data);
  if (snapshotSeries) {
    const totalBaseline = tasks.reduce((sum: number, t: any) => sum + (t.baselineHours || 0), 0) ||
      projects.reduce((sum: number, p: any) => sum + (p.baselineHours || 0), 0);

    if (totalBaseline === 0) {
      return {
        dates: [],
        planned: [],
        actual: [],
        forecast: []
      };
    }

    const dates = snapshotSeries.dates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const planned = snapshotSeries.series.map((_, idx) =>
      Math.round((totalBaseline * (idx + 1)) / snapshotSeries.series.length)
    );
    const actual = snapshotSeries.series.map(point => Math.round(point.actualHoursCum));
    const forecast = snapshotSeries.series.map(point => {
      const actualCum = Number(point.actualHoursCum || 0);
      const remaining = Number(point.remainingHours || 0);
      return Math.round(actualCum + remaining);
    });

    return { dates, planned, actual, forecast };
  }

  // Generate dates from project data or hours data
  const allDates = new Set<string>();

  // Get dates from tasks
  tasks.forEach((t: any) => {
    if (t.baselineStartDate) allDates.add(t.baselineStartDate);
    if (t.baselineEndDate) allDates.add(t.baselineEndDate);
    if (t.actualStartDate) allDates.add(t.actualStartDate);
    if (t.actualEndDate) allDates.add(t.actualEndDate);
  });

  // Get dates from projects
  projects.forEach((p: any) => {
    if (p.baselineStartDate) allDates.add(p.baselineStartDate);
    if (p.baselineEndDate) allDates.add(p.baselineEndDate);
  });

  // Get dates from hours
  hours.forEach((h: any) => {
    if (h.date) allDates.add(h.date);
  });

  if (allDates.size === 0) {
    // Generate synthetic dates if no data
    const today = new Date();
    for (let i = -6; i <= 0; i++) {
      const d = new Date(today);
      d.setMonth(d.getMonth() + i);
      allDates.add(d.toISOString().split('T')[0]);
    }
  }

  const sortedDates = Array.from(allDates).sort();
  const dates = sortedDates.map(d => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  // Calculate baseline total hours
  const totalBaseline = tasks.reduce((sum: number, t: any) => sum + (t.baselineHours || 0), 0) ||
    projects.reduce((sum: number, p: any) => sum + (p.baselineHours || 0), 0);

  if (totalBaseline === 0 && sortedDates.length === 0) {
    return {
      dates: [],
      planned: [],
      actual: [],
      forecast: []
    };
  }

  // Build cumulative planned curve (linear distribution)
  const planned: number[] = [];
  const actual: number[] = [];

  sortedDates.forEach((date, idx) => {
    // Planned: linear distribution
    const plannedValue = totalBaseline > 0 ? Math.round((totalBaseline * (idx + 1)) / sortedDates.length) : 0;
    planned.push(plannedValue);

    // Actual: sum of hours up to this date
    const actualValue = hours
      .filter((h: any) => h.date && h.date <= date)
      .reduce((sum: number, h: any) => sum + (h.hours || 0), 0);
    actual.push(actualValue);
  });

  const forecast: number[] = [];
  sortedDates.forEach((_, idx) => {
    const actualValue = actual[idx] ?? 0;
    const plannedValue = planned[idx] ?? 0;
    const delta = Math.max(0, plannedValue - actualValue);
    forecast.push(Math.round(actualValue + delta * 0.8));
  });

  return { dates, planned, actual, forecast };
}

// ============================================================================
// BUDGET VARIANCE TRANSFORMATION
// Builds budget variance waterfall chart data
// ============================================================================

export function buildBudgetVariance(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const phases = data.phases || [];
  const tasks = data.tasks || [];

  const variance: { name: string; value: number; type: 'start' | 'increase' | 'decrease' | 'end' }[] = [];

  // Add project-level variances
  projects.forEach((p: any, idx: number) => {
    const baseline = p.baselineCost || 0;
    const actual = p.actualCost || 0;
    if (baseline > 0 || actual > 0) {
      const varianceValue = actual - baseline;
      variance.push({
        name: p.name || p.projectId || 'Project',
        value: varianceValue,
        type: idx === 0 ? 'start' : varianceValue >= 0 ? 'increase' : 'decrease'
      });
    }
  });

  // If no project data, use phase or task data
  if (variance.length === 0 && phases.length > 0) {
    phases.forEach((ph: any, idx: number) => {
      const baseline = ph.baselineCost || 0;
      const actual = ph.actualCost || 0;
      if (baseline > 0 || actual > 0) {
        const varianceValue = actual - baseline;
        variance.push({
          name: ph.name || ph.phaseId || 'Phase',
          value: varianceValue,
          type: idx === 0 ? 'start' : varianceValue >= 0 ? 'increase' : 'decrease'
        });
      }
    });
  }

  if (variance.length === 0 && tasks.length > 0) {
    // Group tasks by project
    const tasksByProject = new Map<string, { baseline: number; actual: number }>();
    tasks.forEach((t: any) => {
      const projId = t.projectId || 'Other';
      const current = tasksByProject.get(projId) || { baseline: 0, actual: 0 };
      current.baseline += t.baselineCost || (t.baselineHours || 0) * 75;
      current.actual += t.actualCost || (t.actualHours || 0) * 75;
      tasksByProject.set(projId, current);
    });

    let idx = 0;
    tasksByProject.forEach((taskData, projId) => {
      const proj = projects.find((p: any) => (p.id || p.projectId) === projId);
      const varianceValue = taskData.actual - taskData.baseline;
      variance.push({
        name: proj?.name || projId,
        value: varianceValue,
        type: idx === 0 ? 'start' : varianceValue >= 0 ? 'increase' : 'decrease'
      });
      idx++;
    });
  }

  // Ensure at least some data
  if (variance.length === 0) {
    variance.push({ name: 'No Variance Data', value: 0, type: 'start' });
  }

  // Add end marker
  const totalVariance = variance.reduce((sum, v) => sum + v.value, 0);
  variance.push({ name: 'Total', value: totalVariance, type: 'end' });

  return variance;
}

// ============================================================================
// MILESTONE STATUS TRANSFORMATION
// Builds milestone status pie chart data
// ============================================================================

export function buildMilestoneStatus(data: Partial<SampleData>) {
  const milestones = data.milestones || data.milestonesTable || [];
  const tasks = data.tasks || [];

  // Status colors
  const statusColors: Record<string, string> = {
    'Completed': '#10B981',
    'In Progress': '#40E0D0',
    'Not Started': '#6B7280',
    'At Risk': '#EF4444',
    'On Hold': '#F59E0B'
  };

  // Count milestone statuses
  const statusCounts = {
    'Completed': 0,
    'In Progress': 0,
    'Not Started': 0,
    'At Risk': 0,
    'On Hold': 0
  };

  if (milestones.length > 0) {
    milestones.forEach((m: any) => {
      const status = m.status || 'Not Started';
      if (status === 'Complete' || status === 'Completed') statusCounts['Completed']++;
      else if (status === 'In Progress') statusCounts['In Progress']++;
      else if (status === 'At Risk') statusCounts['At Risk']++;
      else if (status === 'On Hold') statusCounts['On Hold']++;
      else statusCounts['Not Started']++;
    });
  } else if (tasks.length > 0) {
    // Derive from task status
    tasks.filter((t: any) => t.isMilestone).forEach((t: any) => {
      const pct = t.percentComplete || 0;
      if (pct === 100) statusCounts['Completed']++;
      else if (pct > 0) statusCounts['In Progress']++;
      else statusCounts['Not Started']++;
    });

    // If no milestones, count regular task statuses
    if (statusCounts['Completed'] === 0 && statusCounts['In Progress'] === 0) {
      tasks.forEach((t: any) => {
        const pct = t.percentComplete || 0;
        if (pct === 100) statusCounts['Completed']++;
        else if (pct > 0) statusCounts['In Progress']++;
        else statusCounts['Not Started']++;
      });
    }
  }

  return Object.entries(statusCounts)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({ name, value, color: statusColors[name] || '#6B7280' }));
}

// ============================================================================
// COUNT METRICS ANALYSIS TRANSFORMATION
// Builds defensibility metrics table
// ============================================================================

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
// Builds quality hours chart data
// ============================================================================

export function buildQualityHours(data: Partial<SampleData>) {
  const tasks = data.tasks || [];
  const hours = data.hours || [];

  // Filter QC tasks (tasks with QC in name or is_qc flag)
  const qcTasks = tasks.filter((t: any) =>
    String(t.taskName || t.name || '').toLowerCase().includes('qc') ||
    String(t.chargeCode || '').toLowerCase().includes('qc') ||
    t.isQC
  );

  const regularTasks = tasks.filter((t: any) =>
    !String(t.taskName || t.name || '').toLowerCase().includes('qc') &&
    !t.isQC
  );

  // Build categories
  const categories = ['Execution', 'QC Review', 'Rework'];

  // Group by task or project
  const taskNames = [...new Set(regularTasks.slice(0, 10).map((t: any) => t.taskName || t.name || 'Task'))];

  const chartData: number[][] = taskNames.map((taskName, idx) => {
    const task = regularTasks.find((t: any) => (t.taskName || t.name) === taskName);
    const baselineHours = task?.baselineHours || 0;
    const actualHours = task?.actualHours || 0;

    // Estimate breakdown
    const execHours = actualHours * 0.75;
    const qcHours = actualHours * 0.20;
    const reworkHours = actualHours * 0.05;

    return [Math.round(execHours), Math.round(qcHours), Math.round(reworkHours)];
  });

  return {
    tasks: taskNames,
    categories,
    data: chartData,
    qcPercent: chartData.map(row => row[1] > 0 ? Math.round((row[1] / (row[0] + row[1] + row[2])) * 100) : 0),
    poorQualityPercent: chartData.map(row => row[2] > 0 ? Math.round((row[2] / (row[0] + row[1] + row[2])) * 100) : 0),
    project: taskNames.map((_, idx) => regularTasks[idx]?.projectId || 'Unknown')
  };
}

// ============================================================================
// NON-EXECUTE HOURS TRANSFORMATION
// Builds non-execute hours data for pie charts
// ============================================================================

/**
 * Helper function to check if a charge code is TPW-related
 * TPW (The Pinnacle Way) filtering: checks if charge code contains "TPW" or "The Pinnacle Way"
 * Use this function to filter hours/data for TPW visuals
 */
export function isTPWChargeCode(chargeCode: string | null | undefined): boolean {
  if (!chargeCode) return false;
  const code = chargeCode.toUpperCase();
  return code.includes('TPW') || code.includes('THE PINNACLE WAY') || code.includes('PINNACLE WAY');
}

export function buildNonExecuteHours(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const tasks = data.tasks || [];

  // Return empty structure if no data
  if (hours.length === 0 && tasks.length === 0) {
    return {
      total: 0,
      fte: 0,
      percent: 0,
      tpwComparison: [],
      otherBreakdown: []
    };
  }

  // Calculate total hours from actual data only
  const totalHours = hours.reduce((sum: number, h: any) => sum + (h.hours || 0), 0) ||
    tasks.reduce((sum: number, t: any) => sum + (t.actualHours || 0), 0);

  if (totalHours === 0) {
    return {
      total: 0,
      fte: 0,
      percent: 0,
      tpwComparison: [],
      otherBreakdown: []
    };
  }

  // Categorize hours by charge code - TPW filtering
  const tpwHours = hours.filter((h: any) => {
    const chargeCode = h.chargeCode || h.charge_code || '';
    return isTPWChargeCode(chargeCode);
  });

  const nonTpwHours = hours.filter((h: any) => {
    const chargeCode = h.chargeCode || h.charge_code || '';
    return !isTPWChargeCode(chargeCode);
  });

  const billable = nonTpwHours.filter((h: any) => h.isBillable !== false);
  const nonBillable = nonTpwHours.filter((h: any) => h.isBillable === false);

  const tpwHoursTotal = tpwHours.reduce((sum: number, h: any) => sum + (h.hours || 0), 0);
  const billableHours = billable.reduce((sum: number, h: any) => sum + (h.hours || 0), 0);
  const nonBillableHours = nonBillable.reduce((sum: number, h: any) => sum + (h.hours || 0), 0);

  const nonExecutePercent = totalHours > 0 ? Math.round((nonBillableHours / totalHours) * 100) : 0;

  return {
    total: Math.round(nonBillableHours),
    fte: +(nonBillableHours / 2080).toFixed(2),
    percent: nonExecutePercent,
    tpwComparison: [
      { name: 'TPW', value: Math.round(tpwHoursTotal), color: '#8B5CF6' },
      { name: 'Execute', value: Math.round(billableHours), color: '#40E0D0' },
      { name: 'Non-Execute', value: Math.round(nonBillableHours), color: '#F59E0B' }
    ],
    otherBreakdown: nonBillableHours > 0 ? [
      { name: 'Admin', value: Math.round(nonBillableHours * 0.4), color: '#8B5CF6' },
      { name: 'Training', value: Math.round(nonBillableHours * 0.25), color: '#10B981' },
      { name: 'Meetings', value: Math.round(nonBillableHours * 0.20), color: '#F59E0B' },
      { name: 'Other', value: Math.round(nonBillableHours * 0.15), color: '#6B7280' }
    ] : []
  };
}

// ============================================================================
// FORECAST DATA TRANSFORMATION
// Builds forecast chart data
// ============================================================================

export function buildForecastData(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const tasks = data.tasks || [];
  const snapshotSeries = getProjectSnapshotSeries(data);

  if (snapshotSeries) {
    const totalBaseline = projects.reduce((sum: number, p: any) => sum + (p.baselineCost || 0), 0) ||
      tasks.reduce((sum: number, t: any) => sum + (t.baselineCost || (t.baselineHours || 0) * 75), 0) || 500000;

    const months = snapshotSeries.dates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const baseline = snapshotSeries.series.map((_, idx) =>
      Math.round((totalBaseline * (idx + 1)) / snapshotSeries.series.length)
    );
    const actual = snapshotSeries.series.map(point => Math.round(point.actualCostCum));
    const forecast = snapshotSeries.series.map(point => Math.round(point.actualCostCum + point.remainingCost));

    const periodActual = snapshotSeries.series.map((point, idx) => (
      idx === 0 ? point.actualHoursCum : point.actualHoursCum - snapshotSeries.series[idx - 1].actualHoursCum
    ));
    const remainingDelta = snapshotSeries.series.map((point, idx) => (
      idx === 0 ? point.remainingHours : point.remainingHours - snapshotSeries.series[idx - 1].remainingHours
    ));
    const remainingCostDelta = snapshotSeries.series.map((point, idx) => (
      idx === 0 ? point.remainingCost : point.remainingCost - snapshotSeries.series[idx - 1].remainingCost
    ));

    return { months, baseline, actual, forecast, periodActual, remainingDelta, remainingCostDelta };
  }

  // Generate monthly dates
  const today = new Date();
  const months: string[] = [];
  for (let i = -3; i <= 6; i++) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + i);
    months.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
  }

  const totalBaseline = projects.reduce((sum: number, p: any) => sum + (p.baselineCost || 0), 0) ||
    tasks.reduce((sum: number, t: any) => sum + (t.baselineCost || (t.baselineHours || 0) * 75), 0) || 500000;

  const totalActual = projects.reduce((sum: number, p: any) => sum + (p.actualCost || 0), 0) ||
    tasks.reduce((sum: number, t: any) => sum + (t.actualCost || (t.actualHours || 0) * 75), 0) || totalBaseline * 0.45;

  // Build baseline curve (linear)
  const baseline = months.map((_, idx) => Math.round((totalBaseline * (idx + 1)) / months.length));

  // Build actual curve (up to current month)
  const currentMonthIdx = 3; // Current month is index 3 (after -3, -2, -1, 0)
  const actual = months.map((_, idx) =>
    idx <= currentMonthIdx ? Math.round((totalActual * (idx + 1)) / (currentMonthIdx + 1)) : 0
  );

  // Build forecast curve (from current month onwards)
  const forecast = months.map((_, idx) =>
    idx >= currentMonthIdx ? Math.round(totalActual + ((totalBaseline - totalActual) * (idx - currentMonthIdx + 1)) / (months.length - currentMonthIdx)) : 0
  );

  return { months, baseline, actual, forecast };
}

// ============================================================================
// QC DASHBOARD TRANSFORMATIONS
// ============================================================================

export function buildQCTransactionByGate(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Define QC gates
  const gates = ['Initial Review', 'Mid Review', 'Final Review', 'Post-Validation'];

  // Use actual QC tasks data
  const gateCounts = new Map<string, number>();
  qctasks.forEach((qc: any) => {
    const gate = qc.qcType || qc.gate || 'Final Review';
    gateCounts.set(gate, (gateCounts.get(gate) || 0) + 1);
  });

  return gates.map(gate => ({
    gate,
    count: gateCounts.get(gate) || 0,
    project: ''
  }));
}

export function buildQCTransactionByProject(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const customers = data.customers || [];
  const sites = data.sites || [];
  const portfolios = data.portfolios || [];
  const qctasks = data.qctasks || [];
  const tasks = data.tasks || [];

  // Return empty array if no data
  if (projects.length === 0 || qctasks.length === 0) {
    return [];
  }

  return projects.slice(0, 6).map((p: any) => {
    const projectId = p.id || p.projectId;
    const projectName = p.name || projectId;
    // Use Map lookups - build maps if not already built
    const customerMap = new Map<string, any>();
    const siteMap = new Map<string, any>();
    const portfolioMap = new Map<string, any>();
    customers.forEach((c: any) => {
      const id = c.id || c.customerId;
      if (id) customerMap.set(id, c);
    });
    sites.forEach((s: any) => {
      const id = s.id || s.siteId;
      if (id) siteMap.set(id, s);
    });
    portfolios.forEach((pf: any) => {
      const id = pf.id || pf.portfolioId;
      if (id) portfolioMap.set(id, pf);
    });

    // Use Map lookups instead of find() - O(1) instead of O(n)
    const customerId = p.customerId || p.customer_id;
    const siteId = p.siteId || p.site_id;
    const customer = customerId ? customerMap.get(customerId) : null;
    const site = siteId ? siteMap.get(siteId) : null;
    const portfolioId = customer?.portfolioId || customer?.portfolio_id;
    const portfolio = portfolioId ? portfolioMap.get(portfolioId) : null;

    // Count QC tasks for this project
    const projectQC = qctasks.filter((qc: any) => {
      if (qc.projectId === projectId) return true;
      if (qc.parentTaskId) {
        const parentTask = tasks.find((t: any) => (t.id || t.taskId) === qc.parentTaskId);
        return parentTask?.projectId === projectId;
      }
      return false;
    });

    // Count by status
    const unprocessed = projectQC.filter((qc: any) => !qc.qcStatus || qc.qcStatus === 'Pending' || qc.qcStatus === 'In Progress').length;
    const pass = projectQC.filter((qc: any) => qc.qcStatus === 'Pass' || qc.qcStatus === 'Approved').length;
    const fail = projectQC.filter((qc: any) => qc.qcStatus === 'Fail' || qc.qcStatus === 'Rejected').length;

    return {
      projectId: projectName,
      customer: customer?.name || 'Customer',
      site: site?.name || 'Site',
      portfolio: portfolio?.name || 'Portfolio',
      unprocessed,
      pass,
      fail
    };
  }).filter(p => p.unprocessed + p.pass + p.fail > 0);
}

export function buildQCByGateStatus(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];
  const portfolios = data.portfolios || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  const gates = ['Initial', 'Mid', 'Final', 'Post-Val'];

  return gates.map((gate) => {
    const gateQC = qctasks.filter((qc: any) =>
      (qc.qcType || '').includes(gate) || (qc.gate || '').includes(gate)
    );

    const unprocessed = gateQC.filter((qc: any) => !qc.qcStatus || qc.qcStatus === 'Pending' || qc.qcStatus === 'In Progress').length;
    const pass = gateQC.filter((qc: any) => qc.qcStatus === 'Pass' || qc.qcStatus === 'Approved').length;
    const fail = gateQC.filter((qc: any) => qc.qcStatus === 'Fail' || qc.qcStatus === 'Rejected').length;

    return {
      gate,
      unprocessed,
      pass,
      fail,
      portfolio: portfolios[0]?.name || 'Portfolio'
    };
  }).filter(g => g.unprocessed + g.pass + g.fail > 0);
}

export function buildQCByNameAndRole(data: Partial<SampleData>) {
  const employees = data.employees || [];
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Get employees who have QC tasks
  const empIdsWithQC = new Set<string>();
  qctasks.forEach((qc: any) => {
    if (qc.employeeId) empIdsWithQC.add(qc.employeeId);
    if (qc.qcResourceId) empIdsWithQC.add(qc.qcResourceId);
  });

  const analysts = employees.filter((e: any) => {
    const empId = e.id || e.employeeId;
    return empIdsWithQC.has(empId);
  });

  if (analysts.length === 0) {
    return [];
  }

  return analysts.map((emp: any) => {
    const empId = emp.id || emp.employeeId;
    const empQC = qctasks.filter((qc: any) => qc.employeeId === empId || qc.qcResourceId === empId);

    const total = empQC.length;
    const pass = empQC.filter((qc: any) => {
      const status = (qc.qcStatus || '').toUpperCase();
      return status === 'PASS' || status === 'APPROVED';
    }).length;
    const closed = empQC.filter((qc: any) => {
      const status = (qc.qcStatus || '').toUpperCase();
      return status === 'PASS' || status === 'APPROVED' || status === 'FAIL' || status === 'REJECTED';
    }).length;
    const open = total - closed;
    const passRate = closed > 0 ? Math.round((pass / closed) * 100 * 10) / 10 : 0;
    const totalHours = empQC.reduce((sum: number, qc: any) => sum + (qc.qcHours || 0), 0);

    return {
      name: emp.name || 'Analyst',
      role: emp.jobTitle || emp.role || 'QA/QC',
      records: total,
      passRate,
      hours: Math.round(totalHours),
      openCount: open,
      closedCount: closed,
      passCount: pass,
    };
  });
}

export function buildQCBySubproject(data: Partial<SampleData>) {
  const projects = data.projects || [];
  const phases = data.phases || [];
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Filter projects by isSubproject flag instead of using separate subprojects table
  const subprojects = projects.filter((p: any) => p.isSubproject === true || p.is_subproject === true);

  // Use subprojects, phases, or projects
  const items = subprojects.length > 0 ? subprojects : (phases.length > 0 ? phases : projects);

  if (items.length === 0) {
    return [];
  }

  return items.slice(0, 8).map((item: any) => {
    const itemId = item.id || item.subprojectId || item.phaseId || item.projectId;
    const itemQC = qctasks.filter((qc: any) => {
      // Try to match by project/phase/subproject
      return qc.projectId === itemId || qc.phaseId === itemId || qc.subprojectId === itemId;
    });

    const total = itemQC.length;
    const pass = itemQC.filter((qc: any) => qc.qcStatus === 'Pass' || qc.qcStatus === 'Approved').length;
    const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;

    return {
      name: item.name || item.phaseName || 'Subproject',
      records: total,
      passRate
    };
  }).filter(item => item.records > 0);
}

// ============================================================================
// ADDITIONAL QC METRICS TRANSFORMATIONS
// ============================================================================

/**
 * Calculate execute hours since last QC check for each employee
 */
export function buildExecuteHoursSinceLastQC(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const employees = data.employees || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get execute hours (non-QC charge codes)
  const executeHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return !chargeCode.includes('QC') && h.isBillable !== false;
  });

  // Group QC tasks by employee to find last QC date
  const lastQCDateByEmployee = new Map<string, Date>();
  qctasks.forEach((qc: any) => {
    const empId = qc.employeeId || qc.qcResourceId;
    if (!empId) return;

    const qcDate = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!qcDate) return;

    const date = new Date(qcDate);
    if (isNaN(date.getTime())) return;

    const existing = lastQCDateByEmployee.get(empId);
    if (!existing || date > existing) {
      lastQCDateByEmployee.set(empId, date);
    }
  });

  // Calculate hours since last QC for each employee
  const employeeHours = new Map<string, number>();
  executeHours.forEach((h: any) => {
    const empId = h.employeeId;
    if (!empId) return;

    const lastQCDate = lastQCDateByEmployee.get(empId);
    const hourDate = new Date(h.date || h.entry_date);
    if (isNaN(hourDate.getTime())) return;

    // If no QC date or hour is after last QC, count it
    if (!lastQCDate || hourDate > lastQCDate) {
      const current = employeeHours.get(empId) || 0;
      employeeHours.set(empId, current + (h.hours || 0));
    }
  });

  // Build result array
  return Array.from(employeeHours.entries())
    .map(([empId, hours]) => {
      const emp = employees.find((e: any) => (e.id || e.employeeId) === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || empId,
        hours: Math.round(hours * 100) / 100,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate EX hours to QC check ratio for each employee
 */
export function buildEXHoursToQCRatio(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const employees = data.employees || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get execute hours
  const executeHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return !chargeCode.includes('QC') && h.isBillable !== false;
  });

  // Count QC checks and total hours by employee
  const qcCountByEmployee = new Map<string, number>();
  const hoursByEmployee = new Map<string, number>();

  qctasks.forEach((qc: any) => {
    const empId = qc.employeeId || qc.qcResourceId;
    if (empId) {
      qcCountByEmployee.set(empId, (qcCountByEmployee.get(empId) || 0) + 1);
    }
  });

  executeHours.forEach((h: any) => {
    const empId = h.employeeId;
    if (empId) {
      hoursByEmployee.set(empId, (hoursByEmployee.get(empId) || 0) + (h.hours || 0));
    }
  });

  // Calculate ratio
  return Array.from(hoursByEmployee.entries())
    .map(([empId, totalHours]) => {
      const qcCount = qcCountByEmployee.get(empId) || 0;
      const ratio = qcCount > 0 ? totalHours / qcCount : totalHours;
      const emp = employees.find((e: any) => (e.id || e.employeeId) === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || empId,
        hours: Math.round(totalHours * 100) / 100,
        qcCount,
        ratio: Math.round(ratio * 100) / 100,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/**
 * Calculate execute hours since last QC check by project
 */
export function buildExecuteHoursSinceLastQCByProject(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const projects = data.projects || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get execute hours
  const executeHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return !chargeCode.includes('QC') && h.isBillable !== false;
  });

  // Find last QC date by project
  const lastQCDateByProject = new Map<string, Date>();
  qctasks.forEach((qc: any) => {
    const projectId = qc.projectId;
    if (!projectId) return;

    const qcDate = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!qcDate) return;

    const date = new Date(qcDate);
    if (isNaN(date.getTime())) return;

    const existing = lastQCDateByProject.get(projectId);
    if (!existing || date > existing) {
      lastQCDateByProject.set(projectId, date);
    }
  });

  // Calculate hours since last QC by project
  const projectHours = new Map<string, number>();
  executeHours.forEach((h: any) => {
    const projectId = h.projectId;
    if (!projectId) return;

    const lastQCDate = lastQCDateByProject.get(projectId);
    const hourDate = new Date(h.date || h.entry_date);
    if (isNaN(hourDate.getTime())) return;

    if (!lastQCDate || hourDate > lastQCDate) {
      const current = projectHours.get(projectId) || 0;
      projectHours.set(projectId, current + (h.hours || 0));
    }
  });

  return Array.from(projectHours.entries())
    .map(([projectId, hours]) => {
      const project = projects.find((p: any) => (p.id || p.projectId) === projectId);
      return {
        projectId,
        projectName: project?.name || projectId,
        hours: Math.round(hours * 100) / 100,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate QC hours since last QC check for each employee
 */
export function buildQCHoursSinceLastQC(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const employees = data.employees || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get QC hours
  const qcHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return chargeCode.includes('QC');
  });

  // Find last QC check date by employee
  const lastQCDateByEmployee = new Map<string, Date>();
  qctasks.forEach((qc: any) => {
    const empId = qc.employeeId || qc.qcResourceId;
    if (!empId) return;

    const qcDate = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!qcDate) return;

    const date = new Date(qcDate);
    if (isNaN(date.getTime())) return;

    const existing = lastQCDateByEmployee.get(empId);
    if (!existing || date > existing) {
      lastQCDateByEmployee.set(empId, date);
    }
  });

  // Calculate QC hours since last QC check
  const employeeHours = new Map<string, number>();
  qcHours.forEach((h: any) => {
    const empId = h.employeeId;
    if (!empId) return;

    const lastQCDate = lastQCDateByEmployee.get(empId);
    const hourDate = new Date(h.date || h.entry_date);
    if (isNaN(hourDate.getTime())) return;

    if (!lastQCDate || hourDate > lastQCDate) {
      const current = employeeHours.get(empId) || 0;
      employeeHours.set(empId, current + (h.hours || 0));
    }
  });

  return Array.from(employeeHours.entries())
    .map(([empId, hours]) => {
      const emp = employees.find((e: any) => (e.id || e.employeeId) === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || empId,
        hours: Math.round(hours * 100) / 100,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate QC hours to QC check ratio for each employee
 */
export function buildQCHoursToQCRatio(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const employees = data.employees || [];

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get QC hours
  const qcHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return chargeCode.includes('QC');
  });

  // Count QC checks and total QC hours by employee
  const qcCountByEmployee = new Map<string, number>();
  const hoursByEmployee = new Map<string, number>();

  qctasks.forEach((qc: any) => {
    const empId = qc.employeeId || qc.qcResourceId;
    if (empId) {
      qcCountByEmployee.set(empId, (qcCountByEmployee.get(empId) || 0) + 1);
    }
  });

  qcHours.forEach((h: any) => {
    const empId = h.employeeId;
    if (empId) {
      hoursByEmployee.set(empId, (hoursByEmployee.get(empId) || 0) + (h.hours || 0));
    }
  });

  return Array.from(hoursByEmployee.entries())
    .map(([empId, totalHours]) => {
      const qcCount = qcCountByEmployee.get(empId) || 0;
      const ratio = qcCount > 0 ? totalHours / qcCount : totalHours;
      const emp = employees.find((e: any) => (e.id || e.employeeId) === empId);
      return {
        employeeId: empId,
        employeeName: emp?.name || empId,
        hours: Math.round(totalHours * 100) / 100,
        qcCount,
        ratio: Math.round(ratio * 100) / 100,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/**
 * Calculate QC hours since last QC check by project and subproject
 */
export function buildQCHoursSinceLastQCByProject(data: Partial<SampleData>) {
  const hours = data.hours || [];
  const qctasks = data.qctasks || [];
  const projects = data.projects || [];
  // Filter projects by isSubproject flag instead of using separate subprojects table
  const subprojects = projects.filter((p: any) => p.isSubproject === true || p.is_subproject === true);

  // Return empty array if no data
  if (hours.length === 0 || qctasks.length === 0) {
    return [];
  }

  // Get QC hours
  const qcHours = hours.filter((h: any) => {
    const chargeCode = (h.chargeCode || h.charge_code || '').toUpperCase();
    return chargeCode.includes('QC');
  });

  // Find last QC date by project
  const lastQCDateByProject = new Map<string, Date>();
  qctasks.forEach((qc: any) => {
    const projectId = qc.projectId;
    if (!projectId) return;

    const qcDate = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!qcDate) return;

    const date = new Date(qcDate);
    if (isNaN(date.getTime())) return;

    const existing = lastQCDateByProject.get(projectId);
    if (!existing || date > existing) {
      lastQCDateByProject.set(projectId, date);
    }
  });

  // Calculate hours by project and subproject
  const projectSubprojectHours = new Map<string, { projectId: string; subprojectId?: string; hours: number }>();

  qcHours.forEach((h: any) => {
    const projectId = h.projectId;
    if (!projectId) return;

    const lastQCDate = lastQCDateByProject.get(projectId);
    const hourDate = new Date(h.date || h.entry_date);
    if (isNaN(hourDate.getTime())) return;

    if (!lastQCDate || hourDate > lastQCDate) {
      const subprojectId = h.subprojectId || '';
      const key = `${projectId}-${subprojectId}`;
      const current = projectSubprojectHours.get(key);
      projectSubprojectHours.set(key, {
        projectId,
        subprojectId: subprojectId || undefined,
        hours: (current?.hours || 0) + (h.hours || 0),
      });
    }
  });

  return Array.from(projectSubprojectHours.values())
    .map((item) => {
      const project = projects.find((p: any) => (p.id || p.projectId) === item.projectId);
      // Find subproject from filtered projects list
      const subproject = item.subprojectId
        ? subprojects.find((s: any) => (s.id || s.projectId) === item.subprojectId)
        : null;
      return {
        projectId: item.projectId,
        projectName: project?.name || item.projectId,
        subprojectId: item.subprojectId,
        subprojectName: subproject?.name || item.subprojectId || '(Blank)',
        hours: Math.round(item.hours * 100) / 100,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

/**
 * Calculate QC pass and fail by task/subproject
 */
export function buildQCPassFailByTask(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  // Filter projects by isSubproject flag instead of using separate subprojects table
  const subprojects = projects.filter((p: any) => p.isSubproject === true || p.is_subproject === true);

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by task/subproject
  const taskMap = new Map<string, { name: string; pass: number; fail: number }>();

  qctasks.forEach((qc: any) => {
    // Try to find task or subproject
    const taskId = qc.parentTaskId || qc.taskId;
    const subprojectId = qc.subprojectId;

    let key = '';
    let name = '';

    if (subprojectId) {
      const subproject = subprojects.find((s: any) => (s.id || s.projectId) === subprojectId);
      key = `subproject-${subprojectId}`;
      name = subproject?.name || subprojectId || '(Blank)';
    } else if (taskId) {
      const task = tasks.find((t: any) => (t.id || t.taskId) === taskId);
      key = `task-${taskId}`;
      name = task?.taskName || (task as any)?.name || taskId || '(Blank)';
    } else {
      key = 'blank';
      name = '(Blank)';
    }

    const existing = taskMap.get(key) || { name, pass: 0, fail: 0 };
    const status = (qc.qcStatus || '').toUpperCase();
    if (status === 'PASS' || status === 'APPROVED') {
      existing.pass++;
    } else if (status === 'FAIL' || status === 'REJECTED') {
      existing.fail++;
    }
    taskMap.set(key, existing);
  });

  return Array.from(taskMap.values())
    .filter(item => item.pass > 0 || item.fail > 0)
    .sort((a, b) => (b.pass + b.fail) - (a.pass + a.fail));
}

/**
 * Calculate QC feedback time (days to close) by task/subproject
 */
export function buildQCFeedbackTimeByTask(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  // Filter projects by isSubproject flag instead of using separate subprojects table
  const subprojects = projects.filter((p: any) => p.isSubproject === true || p.is_subproject === true);

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by task/subproject and calculate average days
  const taskMap = new Map<string, { name: string; days: number[] }>();

  qctasks.forEach((qc: any) => {
    const startDate = qc.qcStartDate || qc.actualStartDate;
    const endDate = qc.qcEndDate || qc.actualEndDate;
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const taskId = qc.parentTaskId || qc.taskId;
    const subprojectId = qc.subprojectId;

    let key = '';
    let name = '';

    if (subprojectId) {
      const subproject = subprojects.find((s: any) => (s.id || s.projectId) === subprojectId);
      key = `subproject-${subprojectId}`;
      name = subproject?.name || subprojectId || '(Blank)';
    } else if (taskId) {
      const task = tasks.find((t: any) => (t.id || t.taskId) === taskId);
      key = `task-${taskId}`;
      name = task?.taskName || (task as any)?.name || taskId || '(Blank)';
    } else {
      key = 'blank';
      name = '(Blank)';
    }

    const existing = taskMap.get(key) || { name, days: [] };
    existing.days.push(days);
    taskMap.set(key, existing);
  });

  return Array.from(taskMap.entries())
    .map(([key, item]) => ({
      name: item.name,
      avgDays: item.days.length > 0
        ? Math.round((item.days.reduce((a, b) => a + b, 0) / item.days.length) * 100) / 100
        : 0,
    }))
    .filter(item => item.avgDays > 0)
    .sort((a, b) => b.avgDays - a.avgDays);
}

/**
 * Calculate QC pass rate per month
 */
export function buildQCPassRatePerMonth(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by month
  const monthMap = new Map<string, { pass: number; total: number; label: string }>();

  qctasks.forEach((qc: any) => {
    const date = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!date) return;

    const d = new Date(date);
    if (isNaN(d.getTime())) return;

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const existing = monthMap.get(monthKey) || { pass: 0, total: 0, label: monthLabel };
    existing.total++;

    const status = (qc.qcStatus || '').toUpperCase();
    if (status === 'PASS' || status === 'APPROVED') {
      existing.pass++;
    }

    monthMap.set(monthKey, existing);
  });

  return Array.from(monthMap.entries())
    .map(([key, item]) => ({
      month: key,
      monthLabel: item.label || key,
      passRate: item.total > 0 ? Math.round((item.pass / item.total) * 100 * 10) / 10 : 0,
      pass: item.pass,
      total: item.total,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Calculate QC outcomes (pass/fail) by month
 */
export function buildQCOutcomesByMonth(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by month
  const monthMap = new Map<string, { pass: number; fail: number; label: string }>();

  qctasks.forEach((qc: any) => {
    const date = qc.qcEndDate || qc.qcStartDate || qc.actualEndDate || qc.actualStartDate;
    if (!date) return;

    const d = new Date(date);
    if (isNaN(d.getTime())) return;

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const existing = monthMap.get(monthKey) || { pass: 0, fail: 0, label: monthLabel };

    const status = (qc.qcStatus || '').toUpperCase();
    if (status === 'PASS' || status === 'APPROVED') {
      existing.pass++;
    } else if (status === 'FAIL' || status === 'REJECTED') {
      existing.fail++;
    }

    monthMap.set(monthKey, existing);
  });

  return Array.from(monthMap.entries())
    .map(([key, item]) => ({
      month: key,
      monthLabel: item.label || key,
      pass: item.pass,
      fail: item.fail,
      total: item.pass + item.fail,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Calculate QC feedback time (takt time) by month
 */
export function buildQCFeedbackTimeByMonth(data: Partial<SampleData>) {
  const qctasks = data.qctasks || [];

  // Return empty array if no QC data
  if (qctasks.length === 0) {
    return [];
  }

  // Group by month
  const monthMap = new Map<string, { days: number[]; label: string }>();

  qctasks.forEach((qc: any) => {
    const startDate = qc.qcStartDate || qc.actualStartDate;
    const endDate = qc.qcEndDate || qc.actualEndDate;
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    const monthKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const existing = monthMap.get(monthKey) || { days: [], label: monthLabel };
    existing.days.push(days);
    monthMap.set(monthKey, existing);
  });

  return Array.from(monthMap.entries())
    .map(([key, item]) => ({
      month: key,
      monthLabel: item.label || key,
      avgDays: item.days.length > 0
        ? Math.round((item.days.reduce((a, b) => a + b, 0) / item.days.length) * 100) / 100
        : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ============================================================================
// MILESTONE TRACKER TRANSFORMATIONS
// ============================================================================

export function buildMilestoneStatusPie(data: Partial<SampleData>) {
  const milestones = data.milestones || data.milestonesTable || [];
  const tasks = data.tasks || [];

  const statusColors: Record<string, string> = {
    'Completed': '#10B981',
    'In Progress': '#40E0D0',
    'Not Started': '#6B7280',
    'At Risk': '#EF4444',
    'On Hold': '#F59E0B'
  };

  const counts: Record<string, number> = {
    'Completed': 0,
    'In Progress': 0,
    'Not Started': 0,
    'At Risk': 0
  };

  if (milestones.length > 0) {
    milestones.forEach((m: any) => {
      const status = m.status || 'Not Started';
      if (status === 'Complete' || status === 'Completed') counts['Completed']++;
      else if (status === 'In Progress') counts['In Progress']++;
      else if (status === 'At Risk') counts['At Risk']++;
      else counts['Not Started']++;
    });
  } else {
    // Generate from tasks
    const milestoneTasks = tasks.filter((t: any) => t.isMilestone);
    const tasksToCount = milestoneTasks.length > 0 ? milestoneTasks : tasks.slice(0, 20);

    tasksToCount.forEach((t: any) => {
      const pct = t.percentComplete || 0;
      if (pct === 100) counts['Completed']++;
      else if (pct > 50) counts['In Progress']++;
      else if (pct > 0) counts['At Risk']++;
      else counts['Not Started']++;
    });
  }

  const total = Object.values(counts).reduce((sum, v) => sum + v, 0) || 1;

  return Object.entries(counts)
    .filter(([_, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      percent: Math.round((value / total) * 100),
      color: statusColors[name] || '#6B7280'
    }));
}

export function buildPlanVsForecastVsActual(data: Partial<SampleData>) {
  const milestones = data.milestones || data.milestonesTable || [];
  const tasks = data.tasks || [];
  const projects = data.projects || [];

  // Generate date range
  const today = new Date();
  const dates: string[] = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + i);
    dates.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
  }

  const totalMilestones = milestones.length || tasks.filter((t: any) => t.isMilestone).length || 20;
  const statusDateIdx = 6; // Current month

  // Build cumulative curves
  const cumulativePlanned = dates.map((_, idx) =>
    Math.floor((totalMilestones * (idx + 1)) / dates.length)
  );

  const cumulativeActual = dates.map((_, idx) =>
    idx <= statusDateIdx ? Math.floor(cumulativePlanned[idx] * (0.85 + Math.random() * 0.1)) : 0
  );

  const cumulativeForecasted = dates.map((_, idx) =>
    idx >= statusDateIdx - 1
      ? Math.floor(cumulativeActual[statusDateIdx - 1] + ((totalMilestones - cumulativeActual[statusDateIdx - 1]) * (idx - statusDateIdx + 2)) / (dates.length - statusDateIdx + 1))
      : 0
  );

  return {
    dates,
    statusDate: statusDateIdx,
    cumulativeActual,
    cumulativeForecasted,
    cumulativePlanned
  };
}

export function buildMilestoneScoreboard(data: Partial<SampleData>) {
  const customers = data.customers || [];
  const milestones = data.milestones || data.milestonesTable || [];

  // Build Map for O(1) milestone lookups by customerId
  const milestonesByCustomer = new Map<string, any[]>();
  milestones.forEach((m: any) => {
    const customerId = m.customerId || m.customer_id;
    if (customerId) {
      if (!milestonesByCustomer.has(customerId)) {
        milestonesByCustomer.set(customerId, []);
      }
      milestonesByCustomer.get(customerId)!.push(m);
    }
  });

  if (customers.length === 0) {
    // No customer data available - show unknown
    return [
      { customer: 'Unknown', plannedThrough: 0, actualThrough: 0, variance: 0 }
    ];
  }

  return customers.slice(0, 6).map((c: any) => {
    // Use Map lookup instead of filter - O(1) instead of O(n)
    const customerId = c.id || c.customerId;
    const customerMilestones = milestonesByCustomer.get(customerId) || [];
    const planned = customerMilestones.length || Math.floor(5 + Math.random() * 10);
    const actual = Math.floor(planned * (0.7 + Math.random() * 0.3));

    return {
      customer: c.name || 'Customer',
      plannedThrough: planned,
      actualThrough: actual,
      variance: planned - actual
    };
  });
}

export function buildMilestones(data: Partial<SampleData>) {
  const milestones = data.milestones || data.milestonesTable || [];
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  const customers = data.customers || [];
  const sites = data.sites || [];
  const portfolios = data.portfolios || [];

  // Build Maps for O(1) lookups instead of O(n) find() calls
  const projectMap = new Map<string, any>();
  const customerMap = new Map<string, any>();
  const siteMap = new Map<string, any>();
  const portfolioMap = new Map<string, any>();

  projects.forEach((p: any) => {
    const id = p.id || p.projectId;
    if (id) projectMap.set(id, p);
  });

  customers.forEach((c: any) => {
    const id = c.id || c.customerId;
    if (id) customerMap.set(id, c);
  });

  sites.forEach((s: any) => {
    const id = s.id || s.siteId;
    if (id) siteMap.set(id, s);
  });

  portfolios.forEach((pf: any) => {
    const id = pf.id || pf.portfolioId;
    if (id) portfolioMap.set(id, pf);
  });

  if (milestones.length > 0) {
    return milestones.map((m: any) => {
      // Use Map lookups instead of find() - O(1) instead of O(n)
      const projectId = m.projectId || m.project_id;
      const project = projectId ? projectMap.get(projectId) : null;
      const customerId = project?.customerId || project?.customer_id;
      const customer = customerId ? customerMap.get(customerId) : null;
      const siteId = project?.siteId || project?.site_id;
      const site = siteId ? siteMap.get(siteId) : null;
      const portfolioId = customer?.portfolioId || customer?.portfolio_id;
      const portfolio = portfolioId ? portfolioMap.get(portfolioId) : null;

      const planned = m.plannedCompletion || m.baselineEndDate;
      const forecast = m.forecastedCompletion || m.projectedEndDate || planned;
      const actual = m.actualCompletion || m.actualEndDate;

      // Calculate variance in days
      let varianceDays = 0;
      if (planned && (actual || forecast)) {
        const plannedDate = new Date(planned);
        const compareDate = new Date(actual || forecast);
        varianceDays = Math.floor((compareDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        portfolio: portfolio?.name || m.portfolio || 'Portfolio',
        customer: customer?.name || m.customer || 'Customer',
        site: site?.name || m.site || 'Site',
        projectNum: project?.name || m.projectNum || 'Project',
        name: m.milestoneName || m.name || 'Milestone',
        status: m.status || 'Not Started',
        percentComplete: m.percentComplete || 0,
        plannedCompletion: planned,
        forecastedCompletion: forecast,
        actualCompletion: actual,
        varianceDays
      };
    });
  }

  // Generate from tasks
  const milestoneTasks = tasks.filter((t: any) => t.isMilestone);
  const tasksToUse = milestoneTasks.length > 0 ? milestoneTasks : tasks.slice(0, 10);

  return tasksToUse.map((t: any) => {
    // Use Map lookups instead of find() - O(1) instead of O(n)
    const projectId = t.projectId || t.project_id;
    const project = projectId ? projectMap.get(projectId) : null;
    const customerId = project?.customerId || project?.customer_id;
    const customer = customerId ? customerMap.get(customerId) : null;
    // Use Map lookups - reuse maps from buildMilestones function scope
    const siteId = project?.siteId || project?.site_id;
    const site = siteId ? siteMap.get(siteId) : null;
    const portfolioId = customer?.portfolioId || customer?.portfolio_id;
    const portfolio = portfolioId ? portfolioMap.get(portfolioId) : null;

    const pct = t.percentComplete || 0;
    let status = 'Not Started';
    if (pct === 100) status = 'Completed';
    else if (pct > 50) status = 'In Progress';
    else if (pct > 0) status = 'At Risk';

    const planned = t.baselineEndDate || t.plannedEndDate;
    const forecast = t.projectedEndDate || planned;
    const actual = t.actualEndDate;

    let varianceDays = 0;
    if (planned && (actual || forecast)) {
      const plannedDate = new Date(planned);
      const compareDate = new Date(actual || forecast);
      varianceDays = Math.floor((compareDate.getTime() - plannedDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      portfolio: portfolio?.name || 'Portfolio',
      customer: customer?.name || 'Customer',
      site: site?.name || 'Site',
      projectNum: project?.name || t.projectId || 'Project',
      name: t.taskName || t.name || 'Milestone',
      status,
      percentComplete: pct,
      plannedCompletion: planned,
      forecastedCompletion: forecast,
      actualCompletion: actual,
      varianceDays
    };
  });
}

// ============================================================================
// DOCUMENT TRACKER TRANSFORMATIONS
// ============================================================================

export function buildDocumentSignoffGauges(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];

  // Count by status for each document type
  const types = ['DRD', 'Workflow', 'SOP', 'QMP'];
  const colors = ['#40E0D0', '#8B5CF6', '#F59E0B', '#10B981'];

  if (deliverables.length > 0) {
    return types.map((type, idx) => {
      const typeDeliverables = deliverables.filter((d: any) =>
        (d.type || '').toLowerCase().includes(type.toLowerCase()) ||
        (d.name || '').toLowerCase().includes(type.toLowerCase())
      );

      const approved = typeDeliverables.filter((d: any) =>
        (d.status || d.drdStatus || '').toLowerCase().includes('approved') ||
        (d.status || d.drdStatus || '').toLowerCase().includes('complete') ||
        (d.status || d.drdStatus || '').toLowerCase().includes('signed')
      ).length;

      const total = typeDeliverables.length || 10;
      const value = total > 0 ? Math.round((approved / total) * 100) : Math.floor(60 + Math.random() * 35);

      return { name: type, value, color: colors[idx] };
    });
  }

  // Generate synthetic data
  return types.map((type, idx) => ({
    name: type,
    value: Math.floor(60 + Math.random() * 35),
    color: colors[idx]
  }));
}

export function buildDeliverableByStatus(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];

  const statuses = ['Approved', 'In Review', 'Draft', 'Not Started'];
  const colors = ['#10B981', '#F59E0B', '#40E0D0', '#6B7280'];

  const buildPieData = (filterFn: (d: any) => boolean) => {
    const filtered = deliverables.filter(filterFn);
    if (filtered.length > 0) {
      const counts: Record<string, number> = {};
      filtered.forEach((d: any) => {
        const status = d.status || d.drdStatus || 'Not Started';
        let normalized = 'Not Started';
        if (status.toLowerCase().includes('approved') || status.toLowerCase().includes('complete') || status.toLowerCase().includes('signed')) {
          normalized = 'Approved';
        } else if (status.toLowerCase().includes('review')) {
          normalized = 'In Review';
        } else if (status.toLowerCase().includes('draft') || status.toLowerCase().includes('progress')) {
          normalized = 'Draft';
        }
        counts[normalized] = (counts[normalized] || 0) + 1;
      });

      const total = Object.values(counts).reduce((sum, v) => sum + v, 0) || 1;

      return Object.entries(counts).map(([name, value]) => ({
        name,
        value,
        percent: Math.round((value / total) * 100),
        color: colors[statuses.indexOf(name)] || '#6B7280'
      }));
    }

    // Synthetic data
    const syntheticData = statuses.map((status, idx) => ({
      name: status,
      value: Math.floor(3 + Math.random() * 8),
      percent: 0,
      color: colors[idx]
    }));
    const total = syntheticData.reduce((sum, d) => sum + d.value, 0) || 1;
    return syntheticData.map(d => ({ ...d, percent: Math.round((d.value / total) * 100) }));
  };

  return {
    drd: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('drd')),
    workflow: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('workflow')),
    sop: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('sop')),
    qmp: buildPieData((d: any) => (d.type || d.name || '').toLowerCase().includes('qmp'))
  };
}

export function buildDeliverablesTracker(data: Partial<SampleData>) {
  const deliverables = data.deliverables || data.deliverablesTracker || [];
  const projects = data.projects || [];
  const customers = data.customers || [];

  // Build Maps for O(1) lookups instead of O(n) find() calls
  const projectMap = new Map<string, any>();
  const customerMap = new Map<string, any>();

  projects.forEach((p: any) => {
    const id = p.id || p.projectId;
    if (id) projectMap.set(id, p);
  });

  customers.forEach((c: any) => {
    const id = c.id || c.customerId;
    if (id) customerMap.set(id, c);
  });

  if (deliverables.length > 0) {
    return deliverables.map((d: any) => {
      // Use Map lookups instead of find() - O(1) instead of O(n)
      const projectId = d.projectId || d.project_id;
      const project = projectId ? projectMap.get(projectId) : null;
      const customerId = project?.customerId || project?.customer_id;
      const customer = customerId ? customerMap.get(customerId) : null;

      return {
        customer: customer?.name || d.customer || 'Customer',
        projectNum: project?.name || d.projectNum || d.projectId || 'Project',
        name: d.name || 'Deliverable',
        drdStatus: d.drdStatus || d.status || 'Not Started',
        workflowStatus: d.workflowStatus || 'Not Started',
        sopStatus: d.sopStatus || 'Not Started',
        qmpStatus: d.qmpStatus || 'Not Started'
      };
    });
  }

  // Generate from projects
  const statusOptions = ['Customer Signed Off', 'In Review', 'Draft', 'Not Started'];

  return projects.slice(0, 8).map((p: any) => {
    // Use Map lookup instead of find() - O(1) instead of O(n)
    const customerId = p.customerId || p.customer_id;
    const customer = customerId ? customerMap.get(customerId) : null;

    return {
      customer: customer?.name || 'Customer',
      projectNum: p.name || p.projectId || 'Project',
      name: `${p.name || 'Project'} Deliverables`,
      drdStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      workflowStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      sopStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)],
      qmpStatus: statusOptions[Math.floor(Math.random() * statusOptions.length)]
    };
  });
}

// ============================================================================
// MAIN TRANSFORM FUNCTION
// Apply all transformations to raw data
// ============================================================================

export interface TransformDataOptions {
  onLog?: (engine: string, lines: string[]) => void;
}

/**
 * Transform raw database data into computed view structures
 */
export function transformData(rawData: Partial<SampleData>, options?: TransformDataOptions): Partial<SampleData> {
  const startTime = performance.now();
  const transformed: Partial<SampleData> = { ...rawData };

  // Resolve Workday hours to MPP tasks by (project_id, workday_phase, workday_task) so actuals roll up correctly
  const enrichedHours = resolveHourEntriesToTasks(
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
    `> Tasks with progress applied: ${tasksCount}`,
    `> buildTaskActualHoursMap from ${hoursCount} entries; applyProgressToList on ${tasksCount} tasks`,
  ];
  options?.onLog?.('Actuals', actualsLines);

  transformed.changeControlSummary = changeControlSummary;

  // Build WBS data from hierarchy (with performance monitoring)
  if (adjustedData.portfolios?.length || adjustedData.projects?.length || adjustedData.tasks?.length) {
    const wbsStartTime = performance.now();
    transformed.wbsData = buildWBSData(adjustedData);
    const wbsDuration = performance.now() - wbsStartTime;
    if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
      console.debug(`[Performance] buildWBSData took ${wbsDuration.toFixed(2)}ms`);
    }
  }

  // Build labor breakdown and resource heatmap (with performance monitoring)
  // Resource heatmap should show all employees, even if no hours yet
  if (adjustedData.hours?.length || adjustedData.employees?.length) {
    const laborStartTime = performance.now();
    transformed.laborBreakdown = buildLaborBreakdown(adjustedData);
    const laborDuration = performance.now() - laborStartTime;
    if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
      console.debug(`[Performance] buildLaborBreakdown took ${laborDuration.toFixed(2)}ms`);
    }
    const heatmapStartTime = performance.now();
    transformed.resourceHeatmap = buildResourceHeatmap(adjustedData);
    const heatmapDuration = performance.now() - heatmapStartTime;
    if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
      console.debug(`[Performance] buildResourceHeatmap took ${heatmapDuration.toFixed(2)}ms`);
    }
  }

  // Build resource Gantt from employees and tasks
  if (adjustedData.employees?.length) {
    transformed.resourceGantt = buildResourceGantt(adjustedData);
  }

  // Build task hours efficiency from tasks
  if (adjustedData.tasks?.length) {
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

  // Build hierarchy for filters - from portfolios, customers, sites, projects (with performance monitoring)
  if (adjustedData.portfolios?.length || adjustedData.customers?.length || adjustedData.sites?.length || adjustedData.projects?.length) {
    const hierarchyStartTime = performance.now();
    transformed.hierarchy = buildHierarchy(adjustedData) as any;
    const hierarchyDuration = performance.now() - hierarchyStartTime;
    if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
      console.debug(`[Performance] buildHierarchy took ${hierarchyDuration.toFixed(2)}ms`);
    }
  }

  // Build S-Curve data
  if (adjustedData.tasks?.length || adjustedData.hours?.length || adjustedData.projects?.length) {
    transformed.sCurve = buildSCurveData(adjustedData);
  }

  // Build budget variance data
  if (adjustedData.projects?.length || adjustedData.phases?.length || adjustedData.tasks?.length) {
    transformed.budgetVariance = buildBudgetVariance(adjustedData);
  }

  // Build milestone status data
  if (adjustedData.milestones?.length || adjustedData.milestonesTable?.length || adjustedData.tasks?.length) {
    transformed.milestoneStatus = buildMilestoneStatus(adjustedData);
  }

  // Build count metrics analysis
  if (adjustedData.tasks?.length) {
    transformed.countMetricsAnalysis = buildCountMetricsAnalysis(adjustedData);
  }

  // Build projects efficiency metrics
  if (adjustedData.projects?.length || adjustedData.tasks?.length) {
    transformed.projectsEfficiencyMetrics = buildProjectsEfficiencyMetrics(adjustedData);
  }

  // Build quality hours data
  if (adjustedData.tasks?.length || adjustedData.hours?.length) {
    transformed.qualityHours = buildQualityHours(adjustedData);
  }

  // Build non-execute hours data
  if (adjustedData.hours?.length || adjustedData.tasks?.length) {
    transformed.nonExecuteHours = buildNonExecuteHours(adjustedData);
  }

  transformed.scheduleHealth = buildScheduleHealth(adjustedData);

  // Build forecast data
  if (adjustedData.projects?.length || adjustedData.tasks?.length) {
    transformed.forecast = buildForecastData(adjustedData);
  }

  // Build QC Dashboard data
  if (adjustedData.qctasks?.length || adjustedData.tasks?.length || adjustedData.employees?.length || adjustedData.hours?.length) {
    transformed.qcTransactionByGate = buildQCTransactionByGate(adjustedData);
    transformed.qcTransactionByProject = buildQCTransactionByProject(adjustedData);
    transformed.qcByGateStatus = buildQCByGateStatus(adjustedData);
    transformed.qcByNameAndRole = buildQCByNameAndRole(adjustedData);
    transformed.qcBySubproject = buildQCBySubproject(adjustedData);
    // Additional QC metrics
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
    transformed.kickoffFeedbackTimeByMonth = buildQCFeedbackTimeByMonth(adjustedData); // Same calculation for kickoff
  }

  // Build Milestone Tracker data
  if (adjustedData.milestones?.length || adjustedData.milestonesTable?.length || adjustedData.tasks?.length) {
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

  // Log total transformation time
  const totalDuration = performance.now() - startTime;
  if (typeof window !== 'undefined' && (window as any).__DEBUG__) {
    console.debug(`[Performance] transformData total took ${totalDuration.toFixed(2)}ms`);
  }

  // Build Document Tracker data
  if (adjustedData.deliverables?.length || adjustedData.deliverablesTracker?.length || adjustedData.projects?.length) {
    transformed.documentSignoffGauges = buildDocumentSignoffGauges(adjustedData);
    transformed.deliverableByStatus = buildDeliverableByStatus(adjustedData);
    transformed.deliverablesTracker = buildDeliverablesTracker(adjustedData);
  }

  transformed.catchUpLog = buildCatchUpLog(adjustedData);

  // Build resource leveling data (monthly/quarterly)
  if (adjustedData.hours?.length || adjustedData.tasks?.length || adjustedData.employees?.length) {
    transformed.resourceLeveling = buildResourceLeveling(adjustedData);
  }

  return transformed;
}

// ============================================================================
// RESOURCE LEVELING TRANSFORMATION
// Builds monthly and quarterly resource leveling data
// ============================================================================

export interface ResourceLevelingData {
  monthly: Array<{
    month: string;
    monthLabel: string;
    totalProjectHours: number;
    projectedFTEUtilization: number;
    variance: number;
    variancePercent: number;
  }>;
  quarterly: Array<{
    quarter: string;
    quarterLabel: string;
    totalProjectHours: number;
    projectedFTEUtilization: number;
    variance: number;
    variancePercent: number;
  }>;
}

/**
 * Build resource leveling data (monthly and quarterly)
 */
export function buildResourceLeveling(data: Partial<SampleData>): ResourceLevelingData {
  const hours = data.hours || [];
  const tasks = data.tasks || [];
  const employees = data.employees || [];

  // Return empty structure if no data
  if (hours.length === 0 && tasks.length === 0 && employees.length === 0) {
    return { monthly: [], quarterly: [] };
  }

  // Calculate FTE capacity (assuming 40 hours/week, ~173 hours/month, ~520 hours/quarter)
  const HOURS_PER_MONTH = 173;
  const HOURS_PER_QUARTER = 520;
  const fteCount = employees.length || 1;

  // Group hours by month
  const monthlyMap = new Map<string, { hours: number; monthLabel: string }>();
  hours.forEach((h: any) => {
    const date = h.date || h.entry_date;
    if (!date) return;

    const d = new Date(date);
    if (isNaN(d.getTime())) return;

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    const existing = monthlyMap.get(monthKey) || { hours: 0, monthLabel };
    existing.hours += parseFloat(h.hours) || 0;
    monthlyMap.set(monthKey, existing);
  });

  // Also consider baseline hours from tasks (projected)
  const monthlyProjectedMap = new Map<string, number>();
  tasks.forEach((t: any) => {
    const startDate = t.baselineStartDate || t.startDate;
    const endDate = t.baselineEndDate || t.endDate;
    if (!startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const baselineHours = parseFloat(t.baselineHours) || 0;
    if (baselineHours === 0) return;

    // Distribute hours across months
    const current = new Date(start);
    while (current <= end) {
      const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

      const overlapStart = start > monthStart ? start : monthStart;
      const overlapEnd = end < monthEnd ? end : monthEnd;
      const overlapDays = Math.max(0, Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

      const monthHours = (baselineHours * overlapDays) / (Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

      monthlyProjectedMap.set(monthKey, (monthlyProjectedMap.get(monthKey) || 0) + monthHours);

      current.setMonth(current.getMonth() + 1);
      current.setDate(1);
    }
  });

  // Build monthly data
  const monthly: ResourceLevelingData['monthly'] = [];
  const allMonthKeys = [...new Set([...monthlyMap.keys(), ...monthlyProjectedMap.keys()])].sort();

  allMonthKeys.forEach(monthKey => {
    const actualHours = monthlyMap.get(monthKey)?.hours || 0;
    const projectedHours = monthlyProjectedMap.get(monthKey) || actualHours; // Use actual if no projection
    const projectedFTE = fteCount * HOURS_PER_MONTH;
    const variance = actualHours - projectedFTE;
    const variancePercent = projectedFTE > 0 ? (variance / projectedFTE) * 100 : 0;

    monthly.push({
      month: monthKey,
      monthLabel: monthlyMap.get(monthKey)?.monthLabel || new Date(monthKey + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      totalProjectHours: Math.round(actualHours * 100) / 100,
      projectedFTEUtilization: Math.round(projectedFTE * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      variancePercent: Math.round(variancePercent * 100) / 100,
    });
  });

  // Build quarterly data
  const quarterlyMap = new Map<string, { hours: number; quarterLabel: string }>();
  monthly.forEach(m => {
    const d = new Date(m.month + '-01');
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    const quarterKey = `Q${quarter} ${d.getFullYear()}`;
    const quarterLabel = `Q${quarter} ${d.getFullYear()}`;

    const existing = quarterlyMap.get(quarterKey) || { hours: 0, quarterLabel };
    existing.hours += m.totalProjectHours;
    quarterlyMap.set(quarterKey, existing);
  });

  const quarterly: ResourceLevelingData['quarterly'] = [];
  const allQuarterKeys = [...quarterlyMap.keys()].sort();

  allQuarterKeys.forEach(quarterKey => {
    const totalHours = quarterlyMap.get(quarterKey)?.hours || 0;
    const projectedFTE = fteCount * HOURS_PER_QUARTER;
    const variance = totalHours - projectedFTE;
    const variancePercent = projectedFTE > 0 ? (variance / projectedFTE) * 100 : 0;

    quarterly.push({
      quarter: quarterKey,
      quarterLabel: quarterlyMap.get(quarterKey)?.quarterLabel || quarterKey,
      totalProjectHours: Math.round(totalHours * 100) / 100,
      projectedFTEUtilization: Math.round(projectedFTE * 100) / 100,
      variance: Math.round(variance * 100) / 100,
      variancePercent: Math.round(variancePercent * 100) / 100,
    });
  });

  return { monthly, quarterly };
}
