import { calcCpi, calcHealthScore, calcHoursVariancePct, calcSpi } from './kpis';
import type { MetricProvenance } from './types';

export type AggregateBy = 'project' | 'site';

export interface ProjectBreakdownItem {
  id: string;
  name: string;
  tasks: number;
  completed: number;
  baselineHours: number;
  actualHours: number;
  remainingHours: number;
  timesheetHours: number;
  timesheetCost: number;
  chargeTypes: Record<string, number>;
  spi: number;
  cpi: number;
  percentComplete: number;
  variance: number;
}

export interface PortfolioAggregate {
  healthScore: number;
  spi: number;
  cpi: number;
  percentComplete: number;
  projectCount: number;
  totalHours: number;
  baselineHours: number;
  earnedHours: number;
  remainingHours: number;
  timesheetHours: number;
  timesheetCost: number;
  hrsVariance: number;
  provenance: Record<'health' | 'spi' | 'cpi' | 'hoursVariance', MetricProvenance>;
}

export interface HealthCheckSummary {
  overallScore: number;
  evaluated: number;
  passed: number;
  failed: number;
  pending: number;
}

export interface TaskHoursLike {
  baseline?: number | null;
  actual?: number | null;
}

export interface PeriodHoursSummary {
  plan: number;
  actual: number;
  added: number;
  reduced: number;
  deltaHours: number;
  deltaPct: number;
  efficiency: number;
}

export interface TaskDecisionFlags {
  needsQC: boolean;
  needsSupport: boolean;
  tag: 'Needs QC' | 'Needs Support' | '';
}

function asId(value: unknown): string {
  return String(value ?? '').trim();
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function projectName(project: Record<string, unknown>): string {
  return String(project.name ?? project.projectName ?? project.id ?? project.projectId ?? 'Unknown');
}

function isCompletedTask(task: Record<string, unknown>): boolean {
  const status = String(task.status ?? '').toLowerCase();
  const percent = toNum(task.percentComplete);
  return status.includes('complete') || percent >= 100;
}

/**
 * Shared project/site rollup used by overview dashboards.
 */
export function buildProjectBreakdown(
  tasksInput: unknown[],
  projectsInput: unknown[],
  hoursInput: unknown[],
  sitesInput: unknown[],
  aggregateBy: AggregateBy,
): ProjectBreakdownItem[] {
  const tasks = Array.isArray(tasksInput) ? tasksInput : [];
  const projects = Array.isArray(projectsInput) ? projectsInput : [];
  const hours = Array.isArray(hoursInput) ? hoursInput : [];
  const sites = Array.isArray(sitesInput) ? sitesInput : [];

  const nameMap = new Map<string, string>();
  projects.forEach((pRaw) => {
    const p = (pRaw || {}) as Record<string, unknown>;
    const id = asId(p.id ?? p.projectId);
    if (!id) return;
    nameMap.set(id, projectName(p));
  });

  const siteMap = new Map<string, string>();
  sites.forEach((sRaw) => {
    const s = (sRaw || {}) as Record<string, unknown>;
    const id = asId(s.id ?? s.siteId);
    if (!id) return;
    siteMap.set(id, String(s.name ?? 'Unknown Site'));
  });

  const projToSite = new Map<string, string>();
  projects.forEach((pRaw) => {
    const p = (pRaw || {}) as Record<string, unknown>;
    const pid = asId(p.id ?? p.projectId);
    const sid = asId(p.siteId ?? p.site_id);
    if (!pid || !sid || !siteMap.has(sid)) return;
    projToSite.set(pid, String(siteMap.get(sid)));
  });

  const planIds = new Set<string>();
  tasks.forEach((tRaw) => {
    const t = (tRaw || {}) as Record<string, unknown>;
    const pid = asId(t.projectId ?? t.project_id);
    if (pid) planIds.add(pid);
  });

  const map = new Map<string, {
    name: string;
    tasks: number;
    completed: number;
    baselineHours: number;
    actualHours: number;
    pcSum: number;
    chargeTypes: Record<string, number>;
    hoursActual: number;
    hoursCost: number;
  }>();

  tasks.forEach((tRaw) => {
    const t = (tRaw || {}) as Record<string, unknown>;
    const pid = asId((t.projectId ?? t.project_id) || 'Unknown');
    const key = aggregateBy === 'site' ? (projToSite.get(pid) || nameMap.get(pid) || pid) : pid;
    const name = aggregateBy === 'site' ? key : (nameMap.get(pid) || pid);

    if (!map.has(key)) {
      map.set(key, {
        name,
        tasks: 0,
        completed: 0,
        baselineHours: 0,
        actualHours: 0,
        pcSum: 0,
        chargeTypes: {},
        hoursActual: 0,
        hoursCost: 0,
      });
    }

    const e = map.get(key)!;
    e.tasks += 1;
    e.baselineHours += toNum(t.baselineHours ?? t.budgetHours);
    e.actualHours += toNum(t.actualHours);
    e.pcSum += toNum(t.percentComplete);
    if (isCompletedTask(t)) e.completed += 1;
  });

  hours.forEach((hRaw) => {
    const h = (hRaw || {}) as Record<string, unknown>;
    const pid = asId(h.projectId ?? h.project_id);
    if (!pid || !planIds.has(pid)) return;

    const key = aggregateBy === 'site' ? (projToSite.get(pid) || nameMap.get(pid) || pid) : pid;
    const e = map.get(key);
    if (!e) return;

    e.hoursActual += toNum(h.hours);
    e.hoursCost += toNum(h.actualCost ?? h.actual_cost);
    const chargeType = String(h.chargeType ?? h.charge_type ?? 'Other');
    e.chargeTypes[chargeType] = (e.chargeTypes[chargeType] || 0) + toNum(h.hours);
  });

  return Array.from(map.entries())
    .map(([id, p]) => {
      const avgPc = p.tasks > 0 ? Math.round(p.pcSum / p.tasks) : 0;
      const earned = p.baselineHours * (avgPc / 100);
      const spi = p.baselineHours > 0 ? earned / p.baselineHours : 1;
      const cpi = p.actualHours > 0 ? earned / p.actualHours : 1;
      const variance = p.baselineHours > 0 ? ((p.actualHours - p.baselineHours) / p.baselineHours) * 100 : 0;
      return {
        id,
        name: p.name,
        tasks: p.tasks,
        completed: p.completed,
        baselineHours: Math.round(p.baselineHours),
        actualHours: Math.round(p.actualHours),
        remainingHours: Math.round(Math.max(0, p.baselineHours - p.actualHours)),
        timesheetHours: Math.round(p.hoursActual),
        timesheetCost: Math.round(p.hoursCost),
        chargeTypes: p.chargeTypes,
        spi: Math.round(spi * 100) / 100,
        cpi: Math.round(cpi * 100) / 100,
        percentComplete: avgPc,
        variance: Math.round(variance),
      } as ProjectBreakdownItem;
    })
    .filter((p) => p.name !== 'Unknown' && p.tasks > 0)
    .sort((a, b) => b.actualHours - a.actualHours);
}

/**
 * Shared portfolio KPI rollup used by overview dashboards.
 */
export function buildPortfolioAggregate(projectBreakdown: ProjectBreakdownItem[], scope: AggregateBy): PortfolioAggregate {
  let totalBl = 0;
  let totalAc = 0;
  let totalEv = 0;
  let tsHrs = 0;
  let tsCost = 0;

  projectBreakdown.forEach((p) => {
    totalBl += p.baselineHours;
    totalAc += p.actualHours;
    totalEv += p.baselineHours * (p.percentComplete / 100);
    tsHrs += p.timesheetHours;
    tsCost += p.timesheetCost;
  });

  const spiMetric = calcSpi(totalEv, totalBl, scope, 'current');
  const cpiMetric = calcCpi(totalEv, totalAc, scope, 'current');
  const healthMetric = calcHealthScore(spiMetric.value, cpiMetric.value, scope, 'current');
  const hoursVarianceMetric = calcHoursVariancePct(totalAc, totalBl, scope, 'current');
  const avgPc = projectBreakdown.length > 0
    ? Math.round(projectBreakdown.reduce((sum, p) => sum + p.percentComplete, 0) / projectBreakdown.length)
    : 0;

  return {
    healthScore: healthMetric.value,
    spi: spiMetric.value,
    cpi: cpiMetric.value,
    percentComplete: avgPc,
    projectCount: projectBreakdown.length,
    totalHours: Math.round(totalAc),
    baselineHours: Math.round(totalBl),
    earnedHours: Math.round(totalEv),
    remainingHours: Math.round(Math.max(0, totalBl - totalAc)),
    timesheetHours: Math.round(tsHrs),
    timesheetCost: Math.round(tsCost),
    hrsVariance: hoursVarianceMetric.value,
    provenance: {
      health: healthMetric.provenance,
      spi: spiMetric.provenance,
      cpi: cpiMetric.provenance,
      hoursVariance: hoursVarianceMetric.provenance,
    },
  };
}

/**
 * Shared health score selector for the project health checks table.
 * Excludes multi-line checks and unevaluated checks from score math.
 */
export function buildHealthCheckScore(checksInput: unknown[]): HealthCheckSummary {
  const checks = Array.isArray(checksInput) ? checksInput : [];
  let total = 0;
  let evaluated = 0;
  let passed = 0;
  let failed = 0;

  checks.forEach((raw) => {
    const c = (raw || {}) as Record<string, unknown>;
    if (Boolean(c.isMultiLine)) return;
    total += 1;
    const checkState = c.passed;
    if (checkState === null || checkState === undefined) return;
    evaluated += 1;
    if (checkState === true) {
      passed += 1;
    } else if (checkState === false) {
      failed += 1;
    }
  });

  const pending = Math.max(0, total - passed - failed);
  const overallScore = evaluated > 0 ? Math.round((passed / evaluated) * 100) : 0;
  return { overallScore, evaluated, passed, failed, pending };
}

/**
 * Shared period-hours selector for Mo's page period efficiency panel.
 */
export function buildPeriodHoursSummary(rowsInput: TaskHoursLike[]): PeriodHoursSummary {
  const rows = Array.isArray(rowsInput) ? rowsInput : [];
  const plan = rows.reduce((sum, row) => sum + toNum(row?.baseline), 0);
  const actual = rows.reduce((sum, row) => sum + toNum(row?.actual), 0);
  const added = Math.max(0, actual - plan);
  const reduced = Math.max(0, plan - actual);
  const deltaHours = actual - plan;
  const deltaPct = plan > 0 ? (deltaHours / plan) * 100 : 0;
  const efficiency = plan > 0 ? Math.round((Math.min(plan, actual) / plan) * 100) : 0;
  return { plan, actual, added, reduced, deltaHours, deltaPct, efficiency };
}

/**
 * Standardized task efficiency percentage used in task-level and aggregate views.
 */
export function toTaskEfficiencyPct(actualInput: unknown, baselineInput: unknown): number {
  const actual = toNum(actualInput);
  const baseline = toNum(baselineInput);
  if (baseline <= 0) return 0;
  return Math.round((actual / baseline) * 100);
}

/**
 * Shared decision flags for task triage surfaces.
 */
export function buildTaskDecisionFlags(input: {
  exHours: unknown;
  qcHours: unknown;
  percentComplete: unknown;
  efficiencyPct: unknown;
  daysToDeadline: unknown;
}): TaskDecisionFlags {
  const exHours = toNum(input.exHours);
  const qcHours = toNum(input.qcHours);
  const percentComplete = toNum(input.percentComplete);
  const efficiencyPct = toNum(input.efficiencyPct);
  const daysToDeadline = toNum(input.daysToDeadline);

  const needsQC = exHours > 0 && qcHours === 0 && percentComplete > 50;
  const needsSupport = efficiencyPct > 120 && daysToDeadline < 3;
  const tag: TaskDecisionFlags['tag'] = needsQC ? 'Needs QC' : needsSupport ? 'Needs Support' : '';
  return { needsQC, needsSupport, tag };
}
