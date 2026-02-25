/**
 * Shared calculation and provenance contracts.
 */

export type FormulaId =
  | 'SPI_V1'
  | 'CPI_V1'
  | 'HOURS_VARIANCE_PCT_V1'
  | 'HEALTH_SCORE_V1'
  | 'IEAC_CPI_V1'
  | 'TCPI_BAC_V1'
  | 'UTILIZATION_PCT_V1'
  | 'EFFICIENCY_PCT_V1';

export interface MetricInputSnapshot {
  key: string;
  label: string;
  value: number | string | null;
}

export interface MetricComputationTrace {
  formula: string;
  steps: string[];
  computedAt: string;
}

export interface MetricProvenance {
  id: FormulaId;
  version: 'v1';
  label: string;
  dataSources: string[];
  scope: string;
  timeWindow: string;
  inputs: MetricInputSnapshot[];
  trace: MetricComputationTrace;
}

export interface MetricOutput<T = number> {
  value: T;
  provenance: MetricProvenance;
}

export interface MetricDefinition {
  id: FormulaId;
  label: string;
  expression: string;
  dataSources: string[];
  notes: string;
}
