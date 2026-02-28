'use client';

/**
 * Budget and forecast transformations.
 */

import type { SampleData } from '@/types/data';

function getProjectSnapshotSeries(data: Partial<SampleData>) {
  const snapshots = data.snapshots || [];

  if (snapshots.length === 0) return null;

  const projectRows = snapshots.filter(row => row.scope === 'project' || row.scope === 'all');
  if (projectRows.length === 0) return null;

  const grouped = new Map<string, { actualCostCum: number; actualHoursCum: number; remainingCost: number; remainingHours: number }>();
  projectRows.forEach(row => {
    const existing = grouped.get(row.snapshotDate) || { actualCostCum: 0, actualHoursCum: 0, remainingCost: 0, remainingHours: 0 };
    const metrics = row.snapshotData?.metrics || {};
    const actualCost = metrics.ac || row.totalCost || 0;
    const actualHours = row.totalHours || 0;
    const remainingCost = metrics.etc || 0;
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
}

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

