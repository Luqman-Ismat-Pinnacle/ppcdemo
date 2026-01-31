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

import React, { useMemo, useState, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import BudgetVarianceChart from '@/components/charts/BudgetVarianceChart';
import ChartCard from '@/components/charts/ChartCard';
import InsightsFilterBar, { type FilterChip } from '@/components/insights/InsightsFilterBar';
import EnhancedTooltip from '@/components/ui/EnhancedTooltip';
import { SkeletonMetric } from '@/components/ui/Skeleton';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';

function formatPercent(value: unknown): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `${Number(n.toFixed(2))}%`;
}

export default function OverviewPage() {
  const { filteredData, isLoading: dataLoading } = useData();
  const data = filteredData;

  // Unique projects for budget variance (when no filters: show first project's bridge)
  const projects = useMemo(() => {
    const projectNames = [...new Set(data.budgetVariance?.map((item: any) => item.project || item.name).filter(Boolean) || [])];
    if (projectNames.length === 0 && data.projects?.length) {
      return data.projects.map((p: any) => p.name || p.projectId).filter(Boolean);
    }
    return projectNames;
  }, [data.budgetVariance, data.projects]);

  const [countMetricsSort, setCountMetricsSort] = useState<SortState | null>(null);
  const [projectMetricsSort, setProjectMetricsSort] = useState<SortState | null>(null);

  // Cross-visual filters (Power BI style)
  const [pageFilters, setPageFilters] = useState<FilterChip[]>([]);
  const projectFilterValues = useMemo(() => pageFilters.filter((f) => f.dimension === 'project').map((f) => f.value), [pageFilters]);

  const handleFilterClick = useCallback((dimension: string, value: string, label?: string) => {
    setPageFilters((prev) => {
      const exists = prev.some((f) => f.dimension === dimension && f.value === value);
      if (exists) return prev.filter((f) => !(f.dimension === dimension && f.value === value));
      return [...prev, { dimension, value, label: label || value }];
    });
  }, []);

  const handleRemoveFilter = useCallback((dimension: string, value: string) => {
    setPageFilters((prev) => prev.filter((f) => !(f.dimension === dimension && f.value === value)));
  }, []);

  const handleClearFilters = useCallback(() => setPageFilters([]), []);

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

  const filteredCountMetrics = useMemo(() => {
    let list = data.countMetricsAnalysis || [];
    if (projectFilterValues.length > 0) {
      list = list.filter((m: any) => projectFilterValues.includes(m.project));
    }
    return list;
  }, [data.countMetricsAnalysis, projectFilterValues]);

  const sortedCountMetrics = useMemo(() => {
    return sortByState(filteredCountMetrics, countMetricsSort, (item, key) => {
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
  }, [filteredCountMetrics, countMetricsSort]);

  const filteredProjectMetrics = useMemo(() => {
    let list = data.projectsEfficiencyMetrics || [];
    if (projectFilterValues.length > 0) {
      list = list.filter((p: any) => projectFilterValues.includes(p.project));
    }
    return list;
  }, [data.projectsEfficiencyMetrics, projectFilterValues]);

  const sortedProjectMetrics = useMemo(() => {
    return sortByState(filteredProjectMetrics, projectMetricsSort, (item, key) => {
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
  }, [filteredProjectMetrics, projectMetricsSort]);

  const filteredBudgetVariance = useMemo(() => {
    let list = data.budgetVariance || [];
    if (projectFilterValues.length > 0) {
      list = list.filter((item: any) => projectFilterValues.includes(item.name) || item.type === 'end');
    } else {
      const first = projects[0];
      if (first) list = list.filter((item: any) => item.name === first || item.type === 'end');
    }
    return list;
  }, [data.budgetVariance, projects, projectFilterValues]);

  return (
    <div className="page-panel insights-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio Overview</h1>
          <p className="page-description" style={{ marginTop: '4px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Key performance at a glance
          </p>
        </div>
      </div>

      {/* Metrics Row - Primary KPIs (skeleton when loading) */}
      <div className="metrics-row-compact" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
        {dataLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <SkeletonMetric key={i} />
            ))}
          </>
        ) : (
        <>
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
        </>
        )}
      </div>

      {/* Filter Bar - Power BI style cross-visual filtering */}
      <div style={{ marginBottom: '1.5rem' }}>
        <InsightsFilterBar
          filters={pageFilters}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearFilters}
          emptyMessage="Click any chart bar to filter the page"
        />
      </div>

      {/* Charts Grid */}
      <div className="dashboard-grid">
        {/* SPI and CPI - Large KPI cards for instant readability */}
        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <EnhancedTooltip
              content={{
                title: 'Schedule Performance Index (SPI)',
                description: 'Measures schedule efficiency - how much work has been completed compared to what was planned.',
                calculation: 'SPI = Earned Value (EV) / Planned Value (PV)',
                details: ['SPI = 1.0: On schedule', 'SPI > 1.0: Ahead', 'SPI < 1.0: Behind', 'Target: ≥ 0.95'],
              }}
            >
              <h3 className="chart-card-title" style={{ cursor: 'help' }}>Schedule Performance</h3>
            </EnhancedTooltip>
          </div>
          <div className="chart-card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: spi >= 1 ? '#10B981' : spi >= 0.9 ? '#F59E0B' : '#EF4444' }}>
              {spi.toFixed(2)}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '8px' }}>
              {spi >= 1 ? 'On or ahead of schedule' : spi >= 0.9 ? 'Slightly behind' : 'Behind schedule'}
            </div>
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <EnhancedTooltip
              content={{
                title: 'Cost Performance Index (CPI)',
                description: 'Measures cost efficiency - value earned per dollar spent.',
                calculation: 'CPI = Earned Value (EV) / Actual Cost (AC)',
                details: ['CPI = 1.0: On budget', 'CPI > 1.0: Under budget', 'CPI < 1.0: Over budget', 'Target: ≥ 0.95'],
              }}
            >
              <h3 className="chart-card-title" style={{ cursor: 'help' }}>Cost Performance</h3>
            </EnhancedTooltip>
          </div>
          <div className="chart-card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '3.5rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, color: cpi >= 1 ? '#10B981' : cpi >= 0.9 ? '#F59E0B' : '#EF4444' }}>
              {cpi.toFixed(2)}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '8px' }}>
              {cpi >= 1 ? 'On or under budget' : cpi >= 0.9 ? 'Slightly over' : 'Over budget'}
            </div>
          </div>
        </div>

        {/* Budget Variance Bridge - Full Width */}
        <ChartCard
          gridClass="grid-full"
          title={
            <EnhancedTooltip
              content={{
                title: 'Budget Variance Bridge',
                description: 'Waterfall chart showing the breakdown of budget changes from baseline to forecast. Click a bar to filter the page by that project.',
                calculation: 'Variance = Actual Cost - Planned Cost. Bridge shows starting budget, changes, and ending forecast.',
                details: [
                  'Each bar represents a variance component',
                  'Click a bar to filter the page by project',
                  'When no filters applied, first project is shown',
                ],
              }}
            >
              <h3 className="chart-card-title" style={{ cursor: 'help' }}>Budget Variance Bridge</h3>
            </EnhancedTooltip>
          }
        >
          <BudgetVarianceChart
            data={filteredBudgetVariance}
            height="100%"
            isLoading={dataLoading}
            isEmpty={!filteredBudgetVariance?.length}
            onBarClick={(params) => handleFilterClick('project', params.name, params.name)}
            activeFilters={projectFilterValues}
          />
        </ChartCard>

        {/* Count/Metrics Analysis Table */}
        <ChartCard
          gridClass="grid-full"
          noPadding
          title={
            <EnhancedTooltip
              content={{
                title: 'Count/Metrics Analysis',
                description: 'Analysis of task metrics to determine hours defensibility.',
                calculation: 'For each task: Defensible Hours = Count × Metric',
                details: ['Rem Hrs: Remaining hours', 'Def: Defensible hours', 'Var: Variance'],
              }}
            >
              <div>
                <h3 className="chart-card-title" style={{ cursor: 'help' }}>Count/Metrics Analysis</h3>
                <span className="chart-card-subtitle">Hours defensibility</span>
              </div>
            </EnhancedTooltip>
          }
        >
          <div style={{ overflow: 'auto', padding: '0.5rem' }}>
            <table className="data-table" style={{ fontSize: '0.875rem' }}>
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
                {sortedCountMetrics.slice(0, 15).map((item, idx) => (
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
        </ChartCard>

        {/* Projects Efficiency Metrics Table */}
        <ChartCard
          gridClass="grid-full"
          noPadding
          title={
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
          }
        >
          <div style={{ overflow: 'auto', padding: '0.5rem' }}>
            <table className="data-table" style={{ fontSize: '0.875rem' }}>
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
                {sortedProjectMetrics.slice(0, 15).map((project, idx) => (
                  <tr key={idx}>
                    <td>{project.project}</td>
                    <td className="number">{formatPercent(project.efficiency)}</td>
                    <td className="number">{formatPercent(project.metricsRatio)}</td>
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
        </ChartCard>
      </div>
    </div>
  );
}
