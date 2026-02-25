import type { MetricOutput, MetricProvenance } from './types';
import { clamp, nonNegative, round, safeDivide } from './numeric-policy';

function nowIso(): string {
  return new Date().toISOString();
}

function baseProvenance(base: Omit<MetricProvenance, 'inputs' | 'trace'>, formula: string, steps: string[]): MetricProvenance {
  return {
    ...base,
    inputs: [],
    trace: {
      formula,
      steps,
      computedAt: nowIso(),
    },
  };
}

export function calcCpi(ev: number, ac: number, scope: string, timeWindow: string): MetricOutput<number> {
  const value = round(safeDivide(ev, ac, ac === 0 ? 1 : 0), 2);
  const provenance = baseProvenance(
    {
      id: 'CPI_V1',
      version: 'v1',
      label: 'Cost Performance Index',
      dataSources: ['tasks', 'hours'],
      scope,
      timeWindow,
    },
    'CPI = EV / AC',
    [`EV=${round(ev, 2)}`, `AC=${round(ac, 2)}`, `CPI=${value}`],
  );
  provenance.inputs = [
    { key: 'ev', label: 'Earned Value', value: round(ev, 2) },
    { key: 'ac', label: 'Actual Cost', value: round(ac, 2) },
  ];
  return { value, provenance };
}

export function calcSpi(ev: number, pv: number, scope: string, timeWindow: string): MetricOutput<number> {
  const value = round(safeDivide(ev, pv, pv === 0 ? 1 : 0), 2);
  const provenance = baseProvenance(
    {
      id: 'SPI_V1',
      version: 'v1',
      label: 'Schedule Performance Index',
      dataSources: ['tasks', 'projects'],
      scope,
      timeWindow,
    },
    'SPI = EV / PV',
    [`EV=${round(ev, 2)}`, `PV=${round(pv, 2)}`, `SPI=${value}`],
  );
  provenance.inputs = [
    { key: 'ev', label: 'Earned Value', value: round(ev, 2) },
    { key: 'pv', label: 'Planned Value', value: round(pv, 2) },
  ];
  return { value, provenance };
}

export function calcHoursVariancePct(actual: number, baseline: number, scope: string, timeWindow: string): MetricOutput<number> {
  const value = baseline > 0 ? round(((actual - baseline) / baseline) * 100, 0) : 0;
  const provenance = baseProvenance(
    {
      id: 'HOURS_VARIANCE_PCT_V1',
      version: 'v1',
      label: 'Hours Variance %',
      dataSources: ['tasks'],
      scope,
      timeWindow,
    },
    '((Actual - Baseline) / Baseline) * 100',
    [`Actual=${round(actual, 2)}`, `Baseline=${round(baseline, 2)}`, `Variance=${value}%`],
  );
  provenance.inputs = [
    { key: 'actual_hours', label: 'Actual Hours', value: round(actual, 2) },
    { key: 'baseline_hours', label: 'Baseline Hours', value: round(baseline, 2) },
  ];
  return { value, provenance };
}

export function calcHealthScore(spi: number, cpi: number, scope: string, timeWindow: string): MetricOutput<number> {
  let hs = 100;
  if (spi < 0.85) hs -= 30;
  else if (spi < 0.95) hs -= 15;
  else if (spi < 1) hs -= 5;

  if (cpi < 0.85) hs -= 30;
  else if (cpi < 0.95) hs -= 15;
  else if (cpi < 1) hs -= 5;

  const value = clamp(round(hs, 0), 0, 100);
  const provenance = baseProvenance(
    {
      id: 'HEALTH_SCORE_V1',
      version: 'v1',
      label: 'Health Score',
      dataSources: ['tasks', 'hours', 'projects'],
      scope,
      timeWindow,
    },
    '100 - SPI penalty - CPI penalty',
    [`SPI=${round(spi, 2)}`, `CPI=${round(cpi, 2)}`, `HealthScore=${value}`],
  );
  provenance.inputs = [
    { key: 'spi', label: 'SPI', value: round(spi, 2) },
    { key: 'cpi', label: 'CPI', value: round(cpi, 2) },
  ];
  return { value, provenance };
}

export function calcIeacCpi(bac: number, cpi: number, scope: string, timeWindow: string): MetricOutput<number> {
  const value = round(safeDivide(bac, cpi, bac), 2);
  const provenance = baseProvenance(
    {
      id: 'IEAC_CPI_V1',
      version: 'v1',
      label: 'IEAC (CPI)',
      dataSources: ['projects', 'tasks', 'hours'],
      scope,
      timeWindow,
    },
    'IEAC = BAC / CPI',
    [`BAC=${round(bac, 2)}`, `CPI=${round(cpi, 2)}`, `IEAC=${value}`],
  );
  provenance.inputs = [
    { key: 'bac', label: 'Budget at Completion', value: round(bac, 2) },
    { key: 'cpi', label: 'CPI', value: round(cpi, 2) },
  ];
  return { value, provenance };
}

export function calcTcpiToBac(bac: number, ev: number, ac: number, scope: string, timeWindow: string): MetricOutput<number> {
  const numerator = nonNegative(bac - ev);
  const denominator = nonNegative(bac - ac);
  const value = round(safeDivide(numerator, denominator, 0), 2);
  const provenance = baseProvenance(
    {
      id: 'TCPI_BAC_V1',
      version: 'v1',
      label: 'TCPI to BAC',
      dataSources: ['projects', 'tasks', 'hours'],
      scope,
      timeWindow,
    },
    'TCPI = (BAC - EV) / (BAC - AC)',
    [`BAC=${round(bac, 2)}`, `EV=${round(ev, 2)}`, `AC=${round(ac, 2)}`, `TCPI=${value}`],
  );
  provenance.inputs = [
    { key: 'bac', label: 'Budget at Completion', value: round(bac, 2) },
    { key: 'ev', label: 'Earned Value', value: round(ev, 2) },
    { key: 'ac', label: 'Actual Cost', value: round(ac, 2) },
  ];
  return { value, provenance };
}

export function calcEfficiencyPct(actualWorked: number, estimatedAdded: number, scope: string, timeWindow: string): MetricOutput<number> {
  const total = actualWorked + estimatedAdded;
  const value = total > 0 ? round((actualWorked / total) * 100, 0) : 0;
  const provenance = baseProvenance(
    {
      id: 'EFFICIENCY_PCT_V1',
      version: 'v1',
      label: 'Efficiency %',
      dataSources: ['taskHoursEfficiency'],
      scope,
      timeWindow,
    },
    '(Actual / (Actual + Estimated Added)) * 100',
    [`Actual=${round(actualWorked, 2)}`, `EstimatedAdded=${round(estimatedAdded, 2)}`, `Efficiency=${value}%`],
  );
  provenance.inputs = [
    { key: 'actual_worked', label: 'Actual Worked Hours', value: round(actualWorked, 2) },
    { key: 'estimated_added', label: 'Estimated Added Hours', value: round(estimatedAdded, 2) },
  ];
  return { value, provenance };
}

export function calcTaskEfficiencyPct(actual: number, baseline: number, scope: string, timeWindow: string): MetricOutput<number> {
  const value = baseline > 0 ? round((actual / baseline) * 100, 0) : 0;
  const provenance = baseProvenance(
    {
      id: 'TASK_EFFICIENCY_PCT_V1',
      version: 'v1',
      label: 'Task Efficiency %',
      dataSources: ['tasks', 'hours'],
      scope,
      timeWindow,
    },
    '(Actual / Baseline) * 100',
    [`Actual=${round(actual, 2)}`, `Baseline=${round(baseline, 2)}`, `Efficiency=${value}%`],
  );
  provenance.inputs = [
    { key: 'actual_hours', label: 'Actual Hours', value: round(actual, 2) },
    { key: 'baseline_hours', label: 'Baseline Hours', value: round(baseline, 2) },
  ];
  return { value, provenance };
}
