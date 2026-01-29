'use client';

/**
 * @fileoverview Overview Page for PPC V3 Insights.
 * 
 * Provides a high-level portfolio summary with:
 * - Key performance metrics (KPIs)
 * - SPI and CPI gauges (Earned Value Management metrics)
 * - Budget variance waterfall chart
 * - Count/Metrics analysis tables
 * 
 * This is the main executive dashboard for project status.
 * 
 * @module app/insights/overview/page
 */

import React, { Suspense, useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import GaugeChart from '@/components/charts/GaugeChart';
import BudgetVarianceChart from '@/components/charts/BudgetVarianceChart';
import MilestoneStatusPie from '@/components/charts/MilestoneStatusPie';
import PercentCompleteDonut from '@/components/charts/PercentCompleteDonut';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import CompareButton from '@/components/ui/CompareButton';
import SnapshotComparisonModal from '@/components/ui/SnapshotComparisonModal';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
      <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
    </div>
  );
}

export default function OverviewPage() {
  const { filteredData } = useData();
  const [comparisonModal, setComparisonModal] = useState<{
    isOpen: boolean;
    visualId: string;
    visualTitle: string;
    visualType: 'chart' | 'table';
    currentData: any;
  } | null>(null);
  const data = filteredData;

  // Get unique projects for budget variance selector
  const projects = useMemo(() => {
    const projectNames = [...new Set(data.budgetVariance.map((item: any) => item.project || item.name).filter(Boolean))];
    // If no project names in budget variance, try to get from projects table
    if (projectNames.length === 0 && data.projects?.length) {
      return data.projects.map((p: any) => p.name || p.projectId).filter(Boolean);
    }
    return projectNames;
  }, [data.budgetVariance, data.projects]);

  // Selected project for budget variance (default to first)
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [countMetricsSort, setCountMetricsSort] = useState<SortState | null>(null);
  const [projectMetricsSort, setProjectMetricsSort] = useState<SortState | null>(null);

  // Calculate metrics
  const totalHours = useMemo(() => {
    if (!data.sCurve?.actual?.length) return 0;
    return data.sCurve.actual.reduce((sum, val) => sum + val, 0);
  }, [data.sCurve?.actual]);

  const efficiency = useMemo(() => {
    if (!data.sCurve?.planned?.length || !data.sCurve?.actual?.length) {
      return null; // Return null to show "No Data"
    }
    const planned = data.sCurve.planned[data.sCurve.planned.length - 1] || 0;
    const actual = data.sCurve.actual[data.sCurve.actual.length - 1] || 0;
    return planned > 0 ? Math.round((actual / planned) * 100 * 10) / 10 : null;
  }, [data.sCurve]);

  const budgetForecast = useMemo(() => {
    return data.budgetVariance.reduce((sum, item) => sum + Math.abs(item.value), 0);
  }, [data.budgetVariance]);

  const qcPassRate = useMemo(() => {
    const total = data.milestoneStatus.reduce((sum, item) => sum + item.value, 0);
    const completed = data.milestoneStatus.find((item) => item.name === 'Complete')?.value || 0;
    return total > 0 ? Math.round((completed / total) * 100 * 10) / 10 : 0;
  }, [data.milestoneStatus]);

  // Calculate SPI and CPI from EVM data or WBS data
  const { spi, cpi } = useMemo(() => {
    // Try to get from WBS data (rolled up from tasks)
    const wbsItems = data.wbsData?.items || [];
    let totalPV = 0;  // Planned Value (Baseline Cost * % Scheduled)
    let totalEV = 0;  // Earned Value (Baseline Cost * % Complete)
    let totalAC = 0;  // Actual Cost
    let totalBaselineHours = 0;
    let totalActualHours = 0;
    let totalPercentComplete = 0;
    let itemCount = 0;

    const sumValues = (items: any[]) => {
      items.forEach(item => {
        if (item.baselineCost || item.actualCost || item.baselineHours) {
          const baselineCost = item.baselineCost || 0;
          const actualCost = item.actualCost || 0;
          const percentComplete = item.percentComplete || 0;

          // EV = Baseline Cost × % Complete
          totalEV += baselineCost * (percentComplete / 100);
          // AC = Actual Cost
          totalAC += actualCost;
          // PV = Baseline Cost (assuming we're at schedule date)
          totalPV += baselineCost;

          totalBaselineHours += item.baselineHours || 0;
          totalActualHours += item.actualHours || 0;
          totalPercentComplete += percentComplete;
          itemCount++;
        }
        if (item.children?.length) {
          sumValues(item.children);
        }
      });
    };

    sumValues(wbsItems);

    // Also try from tasks directly
    const tasks = data.tasks || [];
    if (tasks.length > 0 && totalPV === 0) {
      tasks.forEach((task: any) => {
        const baselineCost = task.baselineCost || task.budgetCost || 0;
        const actualCost = task.actualCost || 0;
        const percentComplete = task.percentComplete || 0;
        const baselineHours = task.baselineHours || task.budgetHours || 0;
        const actualHours = task.actualHours || 0;

        totalEV += baselineCost * (percentComplete / 100);
        totalAC += actualCost;
        totalPV += baselineCost;
        totalBaselineHours += baselineHours;
        totalActualHours += actualHours;
        totalPercentComplete += percentComplete;
        itemCount++;
      });
    }

    // Fall back to hours-based calculation if no cost data
    if (totalPV === 0 && totalBaselineHours > 0) {
      const avgPercentComplete = itemCount > 0 ? totalPercentComplete / itemCount : 0;
      // SPI based on hours: Actual Progress / Planned Progress
      const spiValue = totalBaselineHours > 0
        ? (totalActualHours / totalBaselineHours)
        : 1;
      // CPI approximation: Baseline Hours Earned / Actual Hours Spent
      const earnedHours = totalBaselineHours * (avgPercentComplete / 100);
      const cpiValue = totalActualHours > 0
        ? (earnedHours / totalActualHours)
        : 1;
      return {
        spi: Math.round(spiValue * 100) / 100,
        cpi: Math.round(cpiValue * 100) / 100
      };
    }

    // Calculate SPI and CPI from EVM values
    const spiValue = totalPV > 0 ? totalEV / totalPV : 1;
    const cpiValue = totalAC > 0 ? totalEV / totalAC : 1;

    return {
      spi: Math.round(spiValue * 100) / 100,
      cpi: Math.round(cpiValue * 100) / 100
    };
  }, [data.wbsData?.items, data.tasks]);

  // Calculate percentage changes (compare to previous snapshot or period)
  const calculateChange = useMemo(() => {
    const snapshots = data.snapshots || [];
    const sortedSnapshots = [...snapshots].sort((a, b) =>
      new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime()
    );

    // Get most recent snapshot for comparison
    const latestSnapshot = sortedSnapshots[0];
    const previousSnapshot = sortedSnapshots[1];

    return {
      totalHours: (current: number) => {
        if (!previousSnapshot?.totalHours) return null;
        const prev = previousSnapshot.totalHours;
        const change = prev > 0 ? ((current - prev) / prev) * 100 : 0;
        return Math.round(change * 10) / 10;
      },
      efficiency: (current: number | null) => {
        if (current === null || !previousSnapshot?.snapshotData?.metrics?.cpi) return null;
        const prev = previousSnapshot.snapshotData.metrics.cpi * 100 || 100;
        const change = prev > 0 ? ((current - prev) / prev) * 100 : 0;
        return Math.round(change * 10) / 10;
      },
      budgetForecast: (current: number) => {
        if (!previousSnapshot?.totalCost) return null;
        const prev = previousSnapshot.totalCost;
        const change = prev > 0 ? ((current - prev) / prev) * 100 : 0;
        return Math.round(change * 10) / 10;
      },
      qcPassRate: (current: number) => {
        // Try to get from snapshot data
        if (!previousSnapshot?.snapshotData?.charts?.qcMetrics) return null;
        // For now, return null if no comparison data
        return null;
      },
    };
  }, [data.snapshots]);

  const sortedCountMetrics = useMemo(() => {
    return sortByState(data.countMetricsAnalysis, countMetricsSort, (item, key) => {
      switch (key) {
        case 'project':
          return item.project;
        case 'task':
          return item.task;
        case 'remainingHours':
          return item.remainingHours;
        case 'count':
          return item.count;
        case 'metric':
          return item.metric;
        case 'defensible':
          return item.defensible;
        case 'variance':
          return item.variance;
        case 'status':
          return item.status;
        default:
          return null;
      }
    });
  }, [data.countMetricsAnalysis, countMetricsSort]);

  const sortedProjectMetrics = useMemo(() => {
    return sortByState(data.projectsEfficiencyMetrics, projectMetricsSort, (item, key) => {
      switch (key) {
        case 'project':
          return item.project;
        case 'efficiency':
          return item.efficiency;
        case 'metricsRatio':
          return item.metricsRatio;
        case 'remainingHours':
          return item.remainingHours;
        case 'flag':
          return item.flag;
        default:
          return null;
      }
    });
  }, [data.projectsEfficiencyMetrics, projectMetricsSort]);

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio Overview</h1>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-row-compact">
        <EnhancedTooltip
          content={{
            title: 'Total Hours',
            description: 'Cumulative total of all actual hours logged across all projects.',
            calculation: 'Total Hours = Sum of all actual hours from hour_entries table\n\nCalculated from S-Curve actual values:\nTotal = Σ(actual hours per date)',
            details: [
              'Includes all hours from all projects, tasks, and employees',
              'Rolled up from individual hour entries',
              'Updated in real-time as hours are logged',
            ],
          }}
        >
          <div className="metric-card">
            <div className="metric-label">Total Hours</div>
            <div className="metric-value">{totalHours.toLocaleString()}</div>
            {calculateChange.totalHours(totalHours) !== null ? (
              <div className={`metric-change ${calculateChange.totalHours(totalHours)! >= 0 ? 'up' : 'down'}`}>
                {calculateChange.totalHours(totalHours)! >= 0 ? '+' : ''}{calculateChange.totalHours(totalHours)}%
              </div>
            ) : (
              <div className="metric-change" style={{ opacity: 0.5 }}>N/A</div>
            )}
          </div>
        </EnhancedTooltip>

        <EnhancedTooltip
          content={{
            title: 'Efficiency',
            description: 'Percentage of planned hours that have been completed. Measures how actual progress compares to planned progress.',
            calculation: 'Efficiency = (Actual Hours / Planned Hours) × 100\n\nWhere:\n- Actual Hours = Cumulative actual hours at latest date\n- Planned Hours = Cumulative planned hours at latest date',
            details: [
              'Values above 100% indicate work is ahead of schedule',
              'Values below 100% indicate work is behind schedule',
              'Based on S-Curve planned vs actual comparison',
            ],
          }}
        >
          <div className="metric-card accent-lime">
            <div className="metric-label">Efficiency</div>
            <div className="metric-value">{efficiency !== null ? `${efficiency}%` : 'No Data'}</div>
            {efficiency !== null && calculateChange.efficiency(efficiency) !== null ? (
              <div className={`metric-change ${calculateChange.efficiency(efficiency)! >= 0 ? 'up' : 'down'}`}>
                {calculateChange.efficiency(efficiency)! >= 0 ? '+' : ''}{calculateChange.efficiency(efficiency)}%
              </div>
            ) : (
              <div className="metric-change" style={{ opacity: 0.5 }}>N/A</div>
            )}
          </div>
        </EnhancedTooltip>

        <EnhancedTooltip
          content={{
            title: 'Budget Forecast',
            description: 'Total absolute value of all budget variances across all projects. Represents the total deviation from planned budget.',
            calculation: 'Budget Forecast = Σ |Budget Variance|\n\nWhere:\n- Budget Variance = Difference between planned and actual costs\n- Sum of absolute values of all variance items',
            details: [
              'Higher values indicate greater budget variance',
              'Includes both positive and negative variances',
              'Calculated from budget variance bridge data',
            ],
          }}
        >
          <div className="metric-card accent-orange">
            <div className="metric-label">Budget Forecast</div>
            <div className="metric-value">${(budgetForecast / 1000).toFixed(0)}K</div>
            {calculateChange.budgetForecast(budgetForecast) !== null ? (
              <div className={`metric-change ${calculateChange.budgetForecast(budgetForecast)! >= 0 ? 'up' : 'down'}`}>
                {calculateChange.budgetForecast(budgetForecast)! >= 0 ? '+' : ''}{calculateChange.budgetForecast(budgetForecast)}%
              </div>
            ) : (
              <div className="metric-change" style={{ opacity: 0.5 }}>N/A</div>
            )}
          </div>
        </EnhancedTooltip>

        <EnhancedTooltip
          content={{
            title: 'QC Pass Rate',
            description: 'Percentage of quality control checks that have passed. Measures the quality of deliverables.',
            calculation: 'QC Pass Rate = (Completed Milestones / Total Milestones) × 100\n\nWhere:\n- Completed = Count of milestones with status "Complete"\n- Total = Sum of all milestone status values',
            details: [
              'Based on milestone status distribution',
              'Higher values indicate better quality outcomes',
              'Updated as milestones are completed',
            ],
          }}
        >
          <div className="metric-card accent-pink">
            <div className="metric-label">QC Pass Rate</div>
            <div className="metric-value">{qcPassRate}%</div>
            {calculateChange.qcPassRate(qcPassRate) !== null ? (
              <div className={`metric-change ${calculateChange.qcPassRate(qcPassRate)! >= 0 ? 'up' : 'down'}`}>
                {calculateChange.qcPassRate(qcPassRate)! >= 0 ? '+' : ''}{calculateChange.qcPassRate(qcPassRate)}%
              </div>
            ) : (
              <div className="metric-change" style={{ opacity: 0.5 }}>N/A</div>
            )}
          </div>
        </EnhancedTooltip>
      </div>

      {/* Charts Grid */}
      <div className="dashboard-grid">
        {/* SPI and CPI Gauges */}
        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <EnhancedTooltip
              content={{
                title: 'Schedule Performance Index (SPI)',
                description: 'Measures schedule efficiency - how much work has been completed compared to what was planned.',
                calculation: 'SPI = Earned Value (EV) / Planned Value (PV)\n\nWhere:\n- EV = Baseline Cost × % Complete\n- PV = Baseline Cost (planned work)',
                details: [
                  'SPI = 1.0: On schedule',
                  'SPI > 1.0: Ahead of schedule',
                  'SPI < 1.0: Behind schedule',
                  'Industry target: SPI ≥ 0.95',
                ],
              }}
            >
              <h3 className="chart-card-title" style={{ cursor: 'help' }}>Schedule Performance Index (SPI)</h3>
            </EnhancedTooltip>
          </div>
          <div className="chart-card-body" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: '300px' }}>
              <Suspense fallback={<LoadingSpinner />}>
                <GaugeChart
                  value={Math.round(spi * 100)}
                  label="SPI"
                  color={spi >= 1 ? '#10B981' : spi >= 0.9 ? '#F59E0B' : '#EF4444'}
                  height="180px"
                />
              </Suspense>
              <div style={{ textAlign: 'center', marginTop: '-20px' }}>
                <span style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: spi >= 1 ? '#10B981' : spi >= 0.9 ? '#F59E0B' : '#EF4444'
                }}>
                  {spi.toFixed(2)}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {spi >= 1 ? 'On/Ahead' : spi >= 0.9 ? 'Slightly Behind' : 'Behind Schedule'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <EnhancedTooltip
              content={{
                title: 'Cost Performance Index (CPI)',
                description: 'Measures cost efficiency - how much value has been earned for every dollar spent.',
                calculation: 'CPI = Earned Value (EV) / Actual Cost (AC)\n\nWhere:\n- EV = Baseline Cost × % Complete\n- AC = Actual Cost spent',
                details: [
                  'CPI = 1.0: On budget',
                  'CPI > 1.0: Under budget (efficient)',
                  'CPI < 1.0: Over budget',
                  'Industry target: CPI ≥ 0.95',
                ],
              }}
            >
              <h3 className="chart-card-title" style={{ cursor: 'help' }}>Cost Performance Index (CPI)</h3>
            </EnhancedTooltip>
          </div>
          <div className="chart-card-body" style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: '300px' }}>
              <Suspense fallback={<LoadingSpinner />}>
                <GaugeChart
                  value={Math.round(cpi * 100)}
                  label="CPI"
                  color={cpi >= 1 ? '#10B981' : cpi >= 0.9 ? '#F59E0B' : '#EF4444'}
                  height="180px"
                />
              </Suspense>
              <div style={{ textAlign: 'center', marginTop: '-20px' }}>
                <span style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: cpi >= 1 ? '#10B981' : cpi >= 0.9 ? '#F59E0B' : '#EF4444'
                }}>
                  {cpi.toFixed(2)}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {cpi >= 1 ? 'On/Under Budget' : cpi >= 0.9 ? 'Slightly Over' : 'Over Budget'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Budget Variance Bridge - Full Width */}
        <div className="chart-card grid-full" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <EnhancedTooltip
              content={{
                title: 'Budget Variance Bridge',
                description: 'Waterfall chart showing the breakdown of budget changes from baseline to forecast.',
                calculation: 'Variance = Actual Cost - Planned Cost\n\nBridge shows:\n- Starting Budget (baseline)\n- Changes (positive/negative variances)\n- Ending Forecast',
                details: [
                  'Each bar represents a variance component',
                  'Positive values increase budget',
                  'Negative values decrease budget',
                  'Final value shows forecasted total cost',
                ],
              }}
            >
              <h3 className="chart-card-title" style={{ cursor: 'help' }}>Budget Variance Bridge</h3>
            </EnhancedTooltip>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {projects.length > 0 && (
                <select
                  value={selectedProject || projects[0]}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.8rem',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    minWidth: '200px'
                  }}
                >
                  {projects.map((proj: string) => (
                    <option key={proj} value={proj}>{proj}</option>
                  ))}
                </select>
              )}
              <CompareButton
                onClick={() => {
                  setComparisonModal({
                    isOpen: true,
                    visualId: 'budget-variance-chart',
                    visualTitle: 'Budget Variance Bridge',
                    visualType: 'chart',
                    currentData: null,
                  });
                }}
              />
            </div>
          </div>
          <div className="chart-card-body" style={{ height: '450px' }}>
            <Suspense fallback={<LoadingSpinner />}>
              <BudgetVarianceChart
                data={data.budgetVariance.filter((item: any) => {
                  const itemProject = item.project || item.name;
                  const currentProject = selectedProject || projects[0];
                  return !currentProject || itemProject === currentProject || !item.project;
                })}
                height="420px"
              />
            </Suspense>
          </div>
        </div>

        {/* Count/Metrics Analysis Table */}
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <EnhancedTooltip
              content={{
                title: 'Count/Metrics Analysis',
                description: 'Analysis of task metrics to determine hours defensibility. Shows remaining hours, count metrics, and variance status.',
                calculation: 'For each task:\n- Defensible Hours = Count × Metric\n- Variance = Remaining Hours - Defensible Hours\n- Status = Based on variance threshold',
                details: [
                  'Rem Hrs: Remaining hours to complete task',
                  'Count: Number of units/deliverables',
                  'Metric: Hours per unit',
                  'Def: Defensible hours (Count × Metric)',
                  'Var: Variance (Rem Hrs - Def)',
                  'Status indicates if hours are defensible',
                ],
              }}
            >
              <div>
                <h3 className="chart-card-title" style={{ cursor: 'help' }}>Count/Metrics Analysis</h3>
                <span className="chart-card-subtitle">Hours defensibility</span>
              </div>
            </EnhancedTooltip>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'count-metrics-analysis-table',
                  visualTitle: 'Count/Metrics Analysis',
                  visualType: 'table',
                  currentData: sortedCountMetrics,
                });
              }}
            />
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '400px', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    { key: 'project', label: 'Project' },
                    { key: 'task', label: 'Task' },
                    {
                      key: 'remainingHours',
                      label: (
                        <EnhancedTooltip content={{ title: 'Remaining Hours', description: 'Hours remaining to complete the task.', calculation: 'Baseline Hours - Actual Hours' }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Rem Hrs</span>
                        </EnhancedTooltip>
                      ),
                      align: 'number'
                    },
                    {
                      key: 'count',
                      label: (
                        <EnhancedTooltip content={{ title: 'Count', description: 'Number of units or deliverables.' }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Count</span>
                        </EnhancedTooltip>
                      ),
                      align: 'number'
                    },
                    {
                      key: 'metric',
                      label: (
                        <EnhancedTooltip content={{ title: 'Metric', description: 'Standard hours per unit.' }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Metric</span>
                        </EnhancedTooltip>
                      ),
                      align: 'number'
                    },
                    {
                      key: 'defensible',
                      label: (
                        <EnhancedTooltip content={{ title: 'Defensible Hours', description: 'Calculated justified hours.', calculation: 'Count × Metric' }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Def</span>
                        </EnhancedTooltip>
                      ),
                      align: 'number'
                    },
                    {
                      key: 'variance',
                      label: (
                        <EnhancedTooltip content={{ title: 'Variance', description: 'Difference between remaining and defensible hours.', calculation: 'Remaining Hours - Defensible Hours' }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Var</span>
                        </EnhancedTooltip>
                      ),
                      align: 'number'
                    },
                    {
                      key: 'status',
                      label: (
                        <EnhancedTooltip content={{ title: 'Status', description: 'Indicates if hours are defensible.', details: ['Good: Var >= 0', 'Warning: Var < 0 (small gap)', 'Critical: Var << 0 (large gap)'] }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Status</span>
                        </EnhancedTooltip>
                      )
                    },
                  ].map(({ key, label, align }) => {
                    const indicator = formatSortIndicator(countMetricsSort, key);
                    return (
                      <th key={key} className={align}>
                        <button
                          type="button"
                          onClick={() => setCountMetricsSort(prev => getNextSortState(prev, key))}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'inherit',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {label}
                          {indicator && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{indicator}</span>}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedCountMetrics.slice(0, 10).map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.project}</td>
                    <td>{item.task}</td>
                    <td className="number">{item.remainingHours}</td>
                    <td className="number">{item.count}</td>
                    <td className="number">{item.metric}</td>
                    <td className="number">{item.defensible}</td>
                    <td className="number">{item.variance}</td>
                    <td>
                      <span className={`badge badge-${item.status === 'good' ? 'success' : item.status === 'warning' ? 'warning' : 'critical'}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Projects Efficiency Metrics Table */}
        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <EnhancedTooltip
              content={{
                title: 'Projects: Efficiency vs Metrics',
                description: 'Comparison of project efficiency percentages against metrics ratios to identify projects needing attention.',
                calculation: 'Efficiency = (Actual Hours / Planned Hours) × 100\nMetrics Ratio = (Tasks with Metrics / Total Tasks) × 100',
                details: [
                  'Eff %: Project efficiency percentage',
                  'Metrics: Ratio of tasks with count metrics',
                  'Rem Hrs: Remaining hours to complete',
                  'Flag: Status indicator (ok/watch/critical)',
                  'Helps identify projects with tracking gaps',
                ],
              }}
            >
              <h3 className="chart-card-title" style={{ cursor: 'help' }}>Projects: Efficiency vs Metrics</h3>
            </EnhancedTooltip>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'project-efficiency-metrics-table',
                  visualTitle: 'Projects: Efficiency vs Metrics',
                  visualType: 'table',
                  currentData: sortedProjectMetrics,
                });
              }}
            />
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '400px', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    { key: 'project', label: 'Project' },
                    {
                      key: 'efficiency',
                      label: (
                        <EnhancedTooltip content={{ title: 'Efficiency %', description: 'Project execution efficiency.', calculation: '(Actual Hours / Planned Hours) × 100' }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Eff %</span>
                        </EnhancedTooltip>
                      ),
                      align: 'number'
                    },
                    {
                      key: 'metricsRatio',
                      label: (
                        <EnhancedTooltip content={{ title: 'Metrics Ratio', description: 'Percentage of tasks with defined metrics.', calculation: '(Tasks with Metrics / Total Tasks) × 100' }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Metrics</span>
                        </EnhancedTooltip>
                      ),
                      align: 'number'
                    },
                    {
                      key: 'remainingHours',
                      label: (
                        <EnhancedTooltip content={{ title: 'Remaining Hours', description: 'Total remaining hours for project.' }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Rem Hrs</span>
                        </EnhancedTooltip>
                      ),
                      align: 'number'
                    },
                    {
                      key: 'flag',
                      label: (
                        <EnhancedTooltip content={{ title: 'Flag Status', description: 'Overall project health indicator.', details: ['OK: Good metrics & efficiency', 'Watch: Minor issues', 'Critical: Low metrics or efficiency'] }}>
                          <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Flag</span>
                        </EnhancedTooltip>
                      )
                    },
                  ].map(({ key, label, align }) => {
                    const indicator = formatSortIndicator(projectMetricsSort, key);
                    return (
                      <th key={key} className={align}>
                        <button
                          type="button"
                          onClick={() => setProjectMetricsSort(prev => getNextSortState(prev, key))}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'inherit',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {label}
                          {indicator && <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>{indicator}</span>}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedProjectMetrics.slice(0, 10).map((project, idx) => (
                  <tr key={idx}>
                    <td>{project.project}</td>
                    <td className="number">{project.efficiency}%</td>
                    <td className="number">{project.metricsRatio}</td>
                    <td className="number">{project.remainingHours}</td>
                    <td>
                      <span className={`badge badge-${project.flag === 'ok' ? 'success' : project.flag === 'watch' ? 'warning' : 'critical'}`}>
                        {project.flag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Snapshot Comparison Modal */}
      {comparisonModal && (
        <SnapshotComparisonModal
          isOpen={comparisonModal.isOpen}
          onClose={() => setComparisonModal(null)}
          visualId={comparisonModal.visualId}
          visualTitle={comparisonModal.visualTitle}
          visualType={comparisonModal.visualType}
          currentData={comparisonModal.currentData}
          onRenderChart={(container: HTMLDivElement, chartOption: EChartsOption) => {
            try {
              const chart = echarts.init(container, 'dark', {
                renderer: 'canvas',
              });
              chart.setOption(chartOption);
              return chart;
            } catch (error) {
              console.error('Error rendering chart:', error);
              return null;
            }
          }}
        />
      )}
    </div>
  );
}
