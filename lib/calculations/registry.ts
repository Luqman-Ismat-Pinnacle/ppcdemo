import type { MetricDefinition } from './types';

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: 'SPI_V1',
    label: 'Schedule Performance Index',
    expression: 'SPI = EV / PV',
    dataSources: ['tasks', 'projects'],
    notes: 'Schedule efficiency relative to planned progress.',
  },
  {
    id: 'CPI_V1',
    label: 'Cost Performance Index',
    expression: 'CPI = EV / AC',
    dataSources: ['tasks', 'hours'],
    notes: 'Cost efficiency based on earned vs actual.',
  },
  {
    id: 'HOURS_VARIANCE_PCT_V1',
    label: 'Hours Variance %',
    expression: '((Actual - Baseline) / Baseline) * 100',
    dataSources: ['tasks'],
    notes: 'Percent deviation from baseline hours.',
  },
  {
    id: 'HEALTH_SCORE_V1',
    label: 'Portfolio Health Score',
    expression: '100 - SPI penalty - CPI penalty',
    dataSources: ['tasks', 'hours', 'projects'],
    notes: 'Penalty-based schedule/cost health rollup.',
  },
  {
    id: 'IEAC_CPI_V1',
    label: 'IEAC (CPI Method)',
    expression: 'BAC / CPI',
    dataSources: ['projects', 'tasks', 'hours'],
    notes: 'Independent estimate at completion using CPI.',
  },
  {
    id: 'TCPI_BAC_V1',
    label: 'TCPI to BAC',
    expression: '(BAC - EV) / (BAC - AC)',
    dataSources: ['projects', 'tasks', 'hours'],
    notes: 'Efficiency needed to finish at original BAC.',
  },
  {
    id: 'UTILIZATION_PCT_V1',
    label: 'Utilization %',
    expression: '(Allocated / Capacity) * 100',
    dataSources: ['tasks', 'employees'],
    notes: 'Workload pressure metric.',
  },
  {
    id: 'EFFICIENCY_PCT_V1',
    label: 'Efficiency %',
    expression: '(Actual / (Actual + Estimated Added)) * 100',
    dataSources: ['taskHoursEfficiency'],
    notes: 'Task efficiency on hours page.',
  },
  {
    id: 'TASK_EFFICIENCY_PCT_V1',
    label: 'Task Efficiency %',
    expression: '(Actual / Baseline) * 100',
    dataSources: ['tasks', 'hours'],
    notes: 'Task/scope burn efficiency against baseline hours.',
  },
];

export function getMetricDefinition(id: MetricDefinition['id']): MetricDefinition | undefined {
  return METRIC_DEFINITIONS.find(m => m.id === id);
}
