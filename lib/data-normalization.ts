import type { SampleData } from '@/types/data';

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function normalizeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeArray<T>(rows: unknown, fn: (row: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null)
    .map(fn);
}

/**
 * Normalize runtime data to reduce formula drift and inconsistent types.
 * Only normalizes fields used broadly by transforms/metrics.
 */
export function normalizeRuntimeData(raw: Partial<SampleData>): Partial<SampleData> {
  const normalized: Partial<SampleData> = { ...raw };

  normalized.tasks = normalizeArray(raw.tasks, (task) => ({
    ...task,
    id: normalizeId(task.id ?? task.taskId),
    taskId: normalizeId(task.taskId ?? task.id),
    projectId: normalizeId(task.projectId ?? task.project_id),
    phaseId: normalizeId(task.phaseId ?? task.phase_id),
    baselineHours: normalizeNumber(task.baselineHours ?? task.baseline_hours),
    actualHours: normalizeNumber(task.actualHours ?? task.actual_hours),
    projectedHours: normalizeNumber(task.projectedHours ?? task.projected_hours),
    percentComplete: normalizeNumber(task.percentComplete ?? task.progress),
    baselineStartDate: normalizeDate(task.baselineStartDate ?? task.baseline_start_date),
    baselineEndDate: normalizeDate(task.baselineEndDate ?? task.baseline_end_date),
  })) as any;

  normalized.hours = normalizeArray(raw.hours, (hour) => ({
    ...hour,
    id: normalizeId(hour.id),
    employeeId: normalizeId(hour.employeeId ?? hour.employee_id),
    taskId: normalizeId(hour.taskId ?? hour.task_id),
    phaseId: normalizeId(hour.phaseId ?? hour.phase_id),
    projectId: normalizeId(hour.projectId ?? hour.project_id),
    date: normalizeDate(hour.date) ?? '',
    hours: normalizeNumber(hour.hours),
    actualCost: normalizeNumber(hour.actualCost ?? hour.actual_cost ?? hour.reported_standard_cost_amt),
  })) as any;

  normalized.projects = normalizeArray(raw.projects, (project) => ({
    ...project,
    id: normalizeId(project.id ?? project.projectId),
    projectId: normalizeId(project.projectId ?? project.id),
    portfolioId: normalizeId(project.portfolioId ?? project.portfolio_id),
    customerId: normalizeId(project.customerId ?? project.customer_id),
    siteId: normalizeId(project.siteId ?? project.site_id),
    baselineCost: normalizeNumber(project.baselineCost ?? project.baseline_cost),
    actualCost: normalizeNumber(project.actualCost ?? project.actual_cost),
  })) as any;

  normalized.milestonesTable = normalizeArray(raw.milestonesTable, (m) => ({
    ...m,
    id: normalizeId(m.id ?? m.milestoneId),
    milestoneId: normalizeId(m.milestoneId ?? m.id),
    projectId: normalizeId(m.projectId ?? m.project_id),
    baselineDate: normalizeDate(m.baselineDate ?? m.baseline_date),
    forecastDate: normalizeDate(m.forecastDate ?? m.forecast_date),
    dueDate: normalizeDate(m.dueDate ?? m.due_date),
  })) as any;

  return normalized;
}
