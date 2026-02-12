'use client';

import { useMemo } from 'react';
import { useData } from '@/lib/data-context';
import { useSnapshotPopup } from '@/lib/snapshot-context';

export type VarianceDimension = {
  projectId?: string;
  phaseId?: string;
  portfolioId?: string;
  taskId?: string;
};

export type MetricKey = 'actualHours' | 'actualCost' | 'planHours' | 'planCost' | 'totalHours' | 'totalCost';

export function useSnapshotVariance() {
  const { filteredData } = useData();
  const { comparisonSnapshotId } = useSnapshotPopup();
  const snapshots = (filteredData.snapshots || []) as any[];
  const comparisonSnapshot = comparisonSnapshotId
    ? snapshots.find((s: any) => (s.id || s.snapshotId) === comparisonSnapshotId)
    : null;

  const snapshotData = comparisonSnapshot?.snapshotData ?? comparisonSnapshot?.snapshot_data;

  const getSnapshotValue = useMemo(() => {
    return function getValue(metric: MetricKey, dimension?: VarianceDimension): number | null {
      if (!snapshotData) return null;
      const metrics = snapshotData.metrics || {};
      if (!dimension || (!dimension.projectId && !dimension.phaseId && !dimension.portfolioId && !dimension.taskId)) {
        if (metric === 'actualHours' || metric === 'totalHours') return metrics.actualHours ?? comparisonSnapshot?.total_hours ?? null;
        if (metric === 'actualCost' || metric === 'totalCost') return metrics.actualCost ?? comparisonSnapshot?.total_cost ?? null;
        if (metric === 'planHours') return metrics.planHours ?? null;
        if (metric === 'planCost') return metrics.planCost ?? null;
        return null;
      }
      if (dimension.taskId && snapshotData.byTask) {
        const row = (snapshotData.byTask as any[]).find((r: any) => (r.taskId || r.task_id) === dimension.taskId);
        if (row) {
          if (metric === 'actualHours' || metric === 'totalHours') return row.actualHours ?? row.actual_hours ?? null;
          if (metric === 'actualCost' || metric === 'totalCost') return row.actualCost ?? row.actual_cost ?? null;
          if (metric === 'planHours') return row.planHours ?? row.plan_hours ?? null;
          if (metric === 'planCost') return row.planCost ?? row.plan_cost ?? null;
        }
      }
      if (dimension.projectId && snapshotData.byProject) {
        const row = (snapshotData.byProject as any[]).find((r: any) => (r.projectId || r.project_id) === dimension.projectId);
        if (row) {
          if (metric === 'actualHours' || metric === 'totalHours') return row.actualHours ?? row.actual_hours ?? null;
          if (metric === 'actualCost' || metric === 'totalCost') return row.actualCost ?? row.actual_cost ?? null;
          if (metric === 'planHours') return row.planHours ?? row.plan_hours ?? null;
          if (metric === 'planCost') return row.planCost ?? row.plan_cost ?? null;
        }
      }
      if (dimension.phaseId && snapshotData.byPhase) {
        const row = (snapshotData.byPhase as any[]).find((r: any) => (r.phaseId || r.phase_id) === dimension.phaseId);
        if (row) {
          if (metric === 'actualHours' || metric === 'totalHours') return row.actualHours ?? row.actual_hours ?? null;
          if (metric === 'actualCost' || metric === 'totalCost') return row.actualCost ?? row.actual_cost ?? null;
          if (metric === 'planHours') return row.planHours ?? row.plan_hours ?? null;
          if (metric === 'planCost') return row.planCost ?? row.plan_cost ?? null;
        }
      }
      if (dimension.portfolioId && snapshotData.byPortfolio) {
        const row = (snapshotData.byPortfolio as any[]).find((r: any) => (r.portfolioId || r.portfolio_id) === dimension.portfolioId);
        if (row) {
          if (metric === 'actualHours' || metric === 'totalHours') return row.actualHours ?? row.actual_hours ?? null;
          if (metric === 'actualCost' || metric === 'totalCost') return row.actualCost ?? row.actual_cost ?? null;
          if (metric === 'planHours') return row.planHours ?? row.plan_hours ?? null;
          if (metric === 'planCost') return row.planCost ?? row.plan_cost ?? null;
        }
      }
      return null;
    };
  }, [snapshotData, comparisonSnapshot]);

  return {
    comparisonSnapshot,
    comparisonSnapshotId,
    snapshotData,
    getSnapshotValue,
    hasComparison: !!comparisonSnapshot,
  };
}
