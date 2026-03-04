'use client';

/**
 * Resource-related transformations: labor breakdown, heatmap, Gantt, leveling.
 */

import type { SampleData, LaborBreakdown, ResourceHeatmap } from '@/types/data';
import { buildWeekMappings, memoize, normalizeDateString, safeNum } from './utils';

export function buildLaborBreakdown(data: Partial<SampleData>, options?: { allHoursForWeekRange?: any[] }): LaborBreakdown {
  const hours = data.hours || [];
  const employees = data.employees || [];
  const hoursForWeekList = (options?.allHoursForWeekRange && options.allHoursForWeekRange.length > 0)
    ? options.allHoursForWeekRange
    : hours;
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

  // Gather all relevant dates for week range calculation:
  // 1. Hour entry dates from hoursForWeekList
  // 2. Project start/end dates to ensure full timeline coverage
  // 3. Task start/end dates for more granular coverage
  const allDates: string[] = [];
  
  // Add dates from hours entries
  hoursForWeekList.forEach((h: any) => {
    const d = normalizeDateString(h.date || h.entry_date);
    if (d) allDates.push(d);
  });
  
  // Add project start/end dates to expand the range
  projects.forEach((p: any) => {
    const startDate = normalizeDateString(p.startDate || p.start_date || p.baselineStartDate || p.baseline_start_date);
    const endDate = normalizeDateString(p.endDate || p.end_date || p.baselineEndDate || p.baseline_end_date);
    if (startDate) allDates.push(startDate);
    if (endDate) allDates.push(endDate);
  });
  
  // Add task dates to fill in the timeline
  tasks.forEach((t: any) => {
    const startDate = normalizeDateString(t.startDate || t.start_date || t.baselineStartDate || t.baseline_start_date);
    const endDate = normalizeDateString(t.endDate || t.end_date || t.baselineEndDate || t.baseline_end_date);
    if (startDate) allDates.push(startDate);
    if (endDate) allDates.push(endDate);
  });
  
  // Filter out nulls and build week mappings
  const dates = allDates.filter((d): d is string => d != null);
  const { weekMap, weekIndexMap, rawWeeks, formattedWeeks: weeks } = buildWeekMappings(dates);

  // Build all aggregations in a single pass through hours (Phase 2.4: Batch Data Processing)
  const workerHours = new Map<string, {
    name: string;
    role: string;
    project: string;
    chargeCode: string;
    chargeType: string;
    portfolio: string;
    customer: string;
    site: string;
    data: number[];
    total: number
  }>();
  const phaseHours = new Map<string, { name: string; project: string; data: number[]; total: number }>();
  const taskHours = new Map<string, { name: string; project: string; chargeType: string; data: number[]; total: number }>();
  const chargeTypeHours = new Map<string, { name: string; data: number[]; total: number }>();

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
    const hoursValue = safeNum(h.hours);

    if (weekIdx < 0) return; // Skip invalid dates

    // Update byWorker aggregation
    const workerName = emp?.name || h.employeeId || h.employee_id || 'Unknown';
    const role = emp?.jobTitle || emp?.role || emp?.job_title || 'N/A';
    const projectName = proj?.name || h.projectId || h.project_id || 'Unknown';
    const chargeCode = h.chargeCode || h.charge_code || task?.chargeCode || 'EX';
    // chargeType from Workday: EX=Execution, QC=Quality, CR=Customer Relations
    const chargeType = h.chargeType || h.charge_type || 'EX';
    const portfolio = proj?.portfolioName || proj?.portfolio_name || '';
    const customer = proj?.customerName || proj?.customer_name || '';
    const site = proj?.siteName || proj?.site_name || '';

    const workerKey = `${workerName}-${projectName}-${chargeCode}-${chargeType}`;
    if (!workerHours.has(workerKey)) {
      workerHours.set(workerKey, {
        name: workerName,
        role,
        project: projectName,
        chargeCode,
        chargeType,
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

    // Update byTask aggregation (with chargeType)
    const taskName = task?.name || h.taskId || 'Unknown Task';
    const taskKey = `${taskName}-${projectName}-${chargeType}`;
    if (!taskHours.has(taskKey)) {
      taskHours.set(taskKey, {
        name: taskName,
        project: projectName,
        chargeType,
        data: new Array(rawWeeks.length).fill(0),
        total: 0
      });
    }
    const taskData = taskHours.get(taskKey)!;
    taskData.data[weekIdx] += hoursValue;
    taskData.total += hoursValue;

    // Update byChargeType aggregation
    // Map Workday codes to display names: EX=Execution, QC=Quality, CR=Customer Relations
    const chargeTypeLabel = chargeType === 'EX' ? 'Execution' : 
                            chargeType === 'QC' ? 'Quality' : 
                            chargeType === 'CR' ? 'Customer Relations' : 
                            chargeType || 'Other';
    if (!chargeTypeHours.has(chargeTypeLabel)) {
      chargeTypeHours.set(chargeTypeLabel, {
        name: chargeTypeLabel,
        data: new Array(rawWeeks.length).fill(0),
        total: 0
      });
    }
    const ctData = chargeTypeHours.get(chargeTypeLabel)!;
    ctData.data[weekIdx] += hoursValue;
    ctData.total += hoursValue;
  });

  return {
    weeks,
    byWorker: [...workerHours.values()],
    byPhase: [...phaseHours.values()],
    byTask: [...taskHours.values()]
  };
}


export function buildResourceHeatmap(data: Partial<SampleData>, _options?: { allHoursForWeekRange?: any[] }): ResourceHeatmap {
  const tasks = data.tasks || [];
  const projects = data.projects || [];
  const employees = data.employees || [];
  const hours = data.hours || [];

  const dataKey = JSON.stringify({
    taskCount: tasks.length,
    projectCount: projects.length,
    employeeCount: employees.length,
    hoursCount: hours.length,
  });

  return memoize('buildResourceHeatmap', () => {
  const HOURS_PER_WEEK = 40;

  function toDate(s: string | Date | null | undefined): string | null {
    if (s == null) return null;
    const d = typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s) : new Date(s as any);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }

  function toMonday(dateStr: string): string {
    const d = new Date(dateStr);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return monday.toISOString().split('T')[0];
  }

  const allDateStrs: string[] = [];
  projects.forEach((p: any) => {
    const s = toDate(p.startDate ?? p.start_date ?? p.baselineStartDate ?? p.baseline_start_date);
    const e = toDate(p.endDate ?? p.end_date ?? p.baselineEndDate ?? p.baseline_end_date);
    if (s) allDateStrs.push(s);
    if (e) allDateStrs.push(e);
  });
  tasks.forEach((t: any) => {
    const s = toDate(t.startDate ?? t.start_date ?? t.baselineStartDate ?? t.baseline_start_date);
    const e = toDate(t.endDate ?? t.end_date ?? t.baselineEndDate ?? t.baseline_end_date);
    if (s) allDateStrs.push(s);
    if (e) allDateStrs.push(e);
  });
  hours.forEach((h: any) => {
    const d = toDate(h.date ?? h.entry_date);
    if (d) allDateStrs.push(d);
  });

  const weekSet = new Set<string>();
  allDateStrs.forEach(d => weekSet.add(toMonday(d)));

  let rawWeeks = [...weekSet].sort();
  if (rawWeeks.length === 0) {
    const today = new Date();
    for (let i = -4; i <= 8; i++) {
      const w = new Date(today);
      w.setDate(today.getDate() + i * 7);
      rawWeeks.push(toMonday(w.toISOString().split('T')[0]));
    }
    rawWeeks = [...new Set(rawWeeks)].sort();
  }

  const weekToIndex = new Map<string, number>();
  rawWeeks.forEach((w, i) => weekToIndex.set(w, i));
  const numWeeks = rawWeeks.length;

  const formattedWeeks = rawWeeks.map(w => {
    const d = new Date(w);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });

  type ResKey = string;
  const resourceNames = new Map<ResKey, string>();
  const weeklyHoursByResource = new Map<ResKey, number[]>();

  const empById = new Map<string, any>();
  employees.forEach((e: any) => {
    const id = (e.id ?? e.employeeId ?? '').toString().trim();
    if (id) empById.set(id, e);
  });

  function ensureResource(key: ResKey, displayName: string) {
    if (!resourceNames.has(key)) resourceNames.set(key, displayName);
    if (!weeklyHoursByResource.has(key)) weeklyHoursByResource.set(key, new Array(numWeeks).fill(0));
  }

  function addHoursToWeeks(weekHours: number[], startStr: string, endStr: string, totalHours: number) {
    const wStart = weekToIndex.get(toMonday(startStr));
    const wEnd = weekToIndex.get(toMonday(endStr));
    if (wStart == null || wEnd == null) return;
    const startIdx = Math.max(0, wStart);
    const endIdx = Math.min(numWeeks - 1, wEnd);
    const span = Math.max(1, endIdx - startIdx + 1);
    const perWeek = totalHours / span;
    for (let i = startIdx; i <= endIdx; i++) weekHours[i] += perWeek;
  }

  tasks.forEach((t: any) => {
    const blHrs = Number(t.baselineHours ?? t.baseline_hours ?? 0) || 0;
    if (blHrs <= 0) return;
    const start = toDate(t.startDate ?? t.start_date ?? t.baselineStartDate ?? t.baseline_start_date);
    const end = toDate(t.endDate ?? t.end_date ?? t.baselineEndDate ?? t.baseline_end_date);
    if (!start || !end) return;

    const assignId = (t.assignedResourceId ?? t.assigned_resource_id ?? t.employeeId ?? t.employee_id ?? '').toString().trim();
    const assignName = (t.assignedResource ?? t.assigned_resource ?? t.assignedResourceName ?? t.assigned_resource_name ?? 'Unassigned').toString().trim() || 'Unassigned';
    const key: ResKey = assignId || `n:${assignName.toLowerCase()}`;
    const display = assignId ? (empById.get(assignId)?.name ?? assignName ?? assignId) : assignName;

    ensureResource(key, display);
    const arr = weeklyHoursByResource.get(key)!;
    addHoursToWeeks(arr, start, end, blHrs);
  });

  if (hours.length > 0) {
    const byResourceAndWeek = new Map<string, number[]>();
    hours.forEach((h: any) => {
      const dateStr = toDate(h.date ?? h.entry_date);
      if (!dateStr) return;
      const weekKey = toMonday(dateStr);
      const wi = weekToIndex.get(weekKey);
      if (wi == null) return;

      const empId = (h.employeeId ?? h.employee_id ?? '').toString().trim();
      const empName = (h.employeeName ?? h.employee_name ?? '').toString().trim() || 'Unknown';
      const resKey: ResKey = empId || `n:${empName.toLowerCase()}`;
      const display = empId ? (empById.get(empId)?.name ?? empName ?? empId) : empName;

      ensureResource(resKey, display);
      const arr = weeklyHoursByResource.get(resKey)!;
      const hrs = Number(h.hours ?? 0) || 0;
      arr[wi] = (arr[wi] ?? 0) + hrs;
    });
  }

  const resources: string[] = [];
  const dataMatrix: number[][] = [];

  weeklyHoursByResource.forEach((weekArr, key) => {
    resources.push(resourceNames.get(key) ?? key);
    dataMatrix.push(weekArr.map(hrs => Math.round((hrs / HOURS_PER_WEEK) * 100)));
  });

  return { resources, weeks: formattedWeeks, data: dataMatrix };
}, [dataKey]);
}

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

export function buildResourceLeveling(data: Partial<SampleData>): ResourceLevelingData {
  const hours = data.hours || [];
  const tasks = data.tasks || [];
  const employees = data.employees || [];

  if (hours.length === 0 && tasks.length === 0 && employees.length === 0) {
    return { monthly: [], quarterly: [] };
  }

  const HOURS_PER_MONTH = 173;
  const HOURS_PER_QUARTER = 520;
  const fteCount = employees.length || 1;

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

  const monthly: ResourceLevelingData['monthly'] = [];
  const allMonthKeys = [...new Set([...monthlyMap.keys(), ...monthlyProjectedMap.keys()])].sort();

  allMonthKeys.forEach(monthKey => {
    const actualHours = monthlyMap.get(monthKey)?.hours || 0;
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
