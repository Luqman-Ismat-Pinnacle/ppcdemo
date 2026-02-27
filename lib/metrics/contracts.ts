/**
 * @fileoverview Tier-1 metric contracts for command-center KPI cards.
 */

export type MetricUnit =
  | 'percent'
  | 'score'
  | 'hours'
  | 'count'
  | 'currency'
  | 'ratio'
  | 'text';

export interface MetricContract {
  metricId: string;
  formulaId: string;
  label: string;
  value: number | string | null;
  unit: MetricUnit;
  computedAt: string;
  sourceTables: string[];
  nullSemantics: string;
  drillDownUrl?: string;
}

export interface RoleSummaryResponse<TData> {
  success: boolean;
  scope: string;
  computedAt: string;
  data: TData;
  warnings?: string[];
  error?: string;
}

export function buildMetric(input: Omit<MetricContract, 'computedAt'> & { computedAt?: string }): MetricContract {
  return {
    ...input,
    computedAt: input.computedAt || new Date().toISOString(),
  };
}
