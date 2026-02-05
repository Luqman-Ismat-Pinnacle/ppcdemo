'use client';

/**
 * @fileoverview Tasks Page for PPC V3 Insights.
 * 
 * Combines Hours & Labor Analysis with QC Dashboard functionality
 * in a unified tabbed interface for comprehensive task tracking.
 * 
 * @module app/insights/tasks/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import InsightsFilterBar, { type FilterChip } from '@/components/insights/InsightsFilterBar';
import ChartCard from '@/components/charts/ChartCard';
import TableCompareExport from '@/components/ui/TableCompareExport';
import VarianceIndicator from '@/components/ui/VarianceIndicator';
import { calculateMetricVariance, getPeriodDisplayName } from '@/lib/variance-engine';

// Hours components
import TaskHoursEfficiencyChart from '@/components/charts/TaskHoursEfficiencyChart';
import QualityHoursChart from '@/components/charts/QualityHoursChart';
import NonExecutePieChart from '@/components/charts/NonExecutePieChart';
import LaborBreakdownChart from '@/components/charts/LaborBreakdownChart';
import HoursWaterfallChart from '@/components/charts/HoursWaterfallChart';

// QC components
import QCTransactionBarChart from '@/components/charts/QCTransactionBarChart';
import QCStackedBarChart from '@/components/charts/QCStackedBarChart';
import QCScatterChart from '@/components/charts/QCScatterChart';
import QCHoursBarChart from '@/components/charts/QCHoursBarChart';
import QCPassRateLineChart from '@/components/charts/QCPassRateLineChart';

type TabType = 'hours' | 'qc';
type StackedViewType = 'chargeCode' | 'project' | 'role';

function formatWeekLabel(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function TasksPage() {
  const { filteredData, isLoading, variancePeriod, varianceEnabled, metricsHistory } = useData();
  const data = filteredData;
  
  const [activeTab, setActiveTab] = useState<TabType>('hours');
  const [pageFilters, setPageFilters] = useState<FilterChip[]>([]);
  const [stackedView, setStackedView] = useState<StackedViewType>('chargeCode');

  // Filter helpers
  const selectedEmployees = useMemo(() => new Set(pageFilters.filter((f) => f.dimension === 'employee').map((f) => f.value)), [pageFilters]);
  const selectedRoles = useMemo(() => new Set(pageFilters.filter((f) => f.dimension === 'role').map((f) => f.value)), [pageFilters]);
  const selectedChargeCodes = useMemo(() => new Set(pageFilters.filter((f) => f.dimension === 'chargeCode').map((f) => f.value)), [pageFilters]);
  const selectedProjects = useMemo(() => new Set(pageFilters.filter((f) => f.dimension === 'project').map((f) => f.value)), [pageFilters]);
  const gateFilterValues = useMemo(() => pageFilters.filter((f) => f.dimension === 'gate').map((f) => f.value), [pageFilters]);
  const allFilterValues = useMemo(() => pageFilters.map((f) => f.value), [pageFilters]);
  const chargeType = useMemo((): 'all' | 'billable' | 'non-billable' => {
    const chip = pageFilters.find((f) => f.dimension === 'chargeType');
    return (chip?.value === 'billable' || chip?.value === 'non-billable') ? chip.value : 'all';
  }, [pageFilters]);

  // KPI Calculations
  const overallEfficiency = useMemo(() => {
    if (!data?.taskHoursEfficiency?.actualWorked?.length) return null;
    const totalActual = data.taskHoursEfficiency.actualWorked.reduce((a: number, b: number) => a + b, 0) || 0;
    const totalEstimated = data.taskHoursEfficiency.estimatedAdded?.reduce((a: number, b: number) => a + b, 0) || 0;
    const total = totalActual + totalEstimated;
    return total > 0 ? Math.round((totalActual / total) * 100) : null;
  }, [data?.taskHoursEfficiency]);

  const qualityHoursPercent = useMemo(() => {
    const qh = data?.qualityHours as { qcPercentOverall?: number } | undefined;
    return qh?.qcPercentOverall ?? null;
  }, [data?.qualityHours]);

  const nonExecutePercent = useMemo(() => {
    return data?.nonExecuteHours?.percent ?? null;
  }, [data?.nonExecuteHours]);

  // Variance calculations
  const varianceData = useMemo(() => {
    return {
      totalHours: calculateMetricVariance(metricsHistory, 'actual_hours', variancePeriod),
      efficiency: calculateMetricVariance(metricsHistory, 'cpi', variancePeriod),
      qualityHours: calculateMetricVariance(metricsHistory, 'qc_pass_rate', variancePeriod),
    };
  }, [metricsHistory, variancePeriod]);

  // Filter handlers
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

  const handleBarClick = useCallback((params: { name: string; dataIndex: number; value?: number }, dimension?: string) => {
    const dim = dimension || (stackedView === 'chargeCode' ? 'chargeCode' : stackedView === 'project' ? 'project' : 'role');
    handleFilterClick(dim, params.name);
  }, [stackedView, handleFilterClick]);

  // Labor breakdown data
  const filteredLaborBreakdown = useMemo(() => {
    if (!data?.laborBreakdown?.byWorker) return [];
    return data.laborBreakdown.byWorker.filter((w: any) => {
      if (selectedEmployees.size > 0 && !selectedEmployees.has(w.name)) return false;
      if (selectedRoles.size > 0 && !selectedRoles.has(w.role)) return false;
      if (selectedChargeCodes.size > 0 && !selectedChargeCodes.has(w.chargeCode)) return false;
      if (chargeType === 'billable' && w.chargeCode !== 'BILLABLE' && w.chargeCode !== 'EX') return false;
      if (chargeType === 'non-billable' && (w.chargeCode === 'BILLABLE' || w.chargeCode === 'EX')) return false;
      return true;
    });
  }, [data?.laborBreakdown, selectedEmployees, selectedRoles, selectedChargeCodes, chargeType]);

  const laborByChargeCode = useMemo(() => {
    const workers = filteredLaborBreakdown;
    if (!workers.length || !data?.laborBreakdown?.weeks?.length) {
      return { months: [], dataByCategory: {} };
    }
    const allChargeCodes = [...new Set(workers.map((w: any) => w.chargeCode).filter(Boolean))];
    const weeks = data.laborBreakdown.weeks;
    const months = weeks.map(formatWeekLabel);
    const dataByCategory: Record<string, number[]> = {};
    allChargeCodes.forEach((code: string) => {
      dataByCategory[code] = new Array(months.length).fill(0);
      workers.filter((w: any) => w.chargeCode === code).forEach((worker: any) => {
        if (worker.data && Array.isArray(worker.data)) {
          worker.data.forEach((val: number, idx: number) => {
            if (idx < dataByCategory[code].length) {
              dataByCategory[code][idx] += typeof val === 'number' ? val : 0;
            }
          });
        }
      });
    });
    return { months, dataByCategory };
  }, [filteredLaborBreakdown, data?.laborBreakdown?.weeks]);

  // QC data
  const qcByGate = useMemo(() => {
    const gateMap = new Map<string, number>();
    (data.qcTransactionByGate || []).forEach((item: any) => {
      if (gateFilterValues.length > 0 && !gateFilterValues.includes(item.gate)) return;
      const count = gateMap.get(item.gate) || 0;
      gateMap.set(item.gate, count + item.count);
    });
    return Array.from(gateMap.entries()).map(([gate, count]) => ({ gate, count, project: '' }));
  }, [data.qcTransactionByGate, gateFilterValues]);

  // Calculate total hours
  const totalHours = useMemo(() => {
    if (!data?.hours?.length) return null;
    return data.hours.reduce((sum: number, h: any) => sum + (h.hours || 0), 0);
  }, [data?.hours]);

  // Tab button style
  const tabStyle = (isActive: boolean) => ({
    padding: '0.75rem 1.5rem',
    background: isActive ? 'var(--pinnacle-teal)' : 'transparent',
    color: isActive ? '#000' : 'var(--text-secondary)',
    border: 'none',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  });

  return (
    <div className="page-panel insights-page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Tasks</h1>
          <p style={{ marginTop: '4px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Hours, labor analysis, and quality control metrics
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '1.5rem',
        padding: '0.5rem',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        width: 'fit-content'
      }}>
        <button style={tabStyle(activeTab === 'hours')} onClick={() => setActiveTab('hours')}>
          Hours & Labor
        </button>
        <button style={tabStyle(activeTab === 'qc')} onClick={() => setActiveTab('qc')}>
          Quality Control
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Hours</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {totalHours !== null ? totalHours.toLocaleString() : '-'}
          </div>
          {varianceEnabled && varianceData.totalHours && (
            <VarianceIndicator variance={varianceData.totalHours} format="hours" size="sm" />
          )}
        </div>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Task Efficiency</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {overallEfficiency !== null ? `${overallEfficiency}%` : '-'}
          </div>
          {varianceEnabled && varianceData.efficiency && (
            <VarianceIndicator variance={varianceData.efficiency} format="percent" size="sm" />
          )}
        </div>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Quality Hours</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {qualityHoursPercent !== null ? `${qualityHoursPercent}%` : '-'}
          </div>
          {varianceEnabled && varianceData.qualityHours && (
            <VarianceIndicator variance={varianceData.qualityHours} format="percent" size="sm" />
          )}
        </div>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Non-Execute</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {nonExecutePercent !== null ? `${nonExecutePercent}%` : '-'}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <InsightsFilterBar
          filters={pageFilters}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearFilters}
          emptyMessage="Click any chart element to filter"
        />
      </div>

      {/* Hours Tab Content */}
      {activeTab === 'hours' && (
        <>
          {/* View Toggle for Labor Chart */}
          <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
            {(['chargeCode', 'project', 'role'] as StackedViewType[]).map((view) => (
              <button
                key={view}
                onClick={() => setStackedView(view)}
                style={{
                  padding: '0.5rem 1rem',
                  background: stackedView === view ? 'rgba(64, 224, 208, 0.15)' : 'var(--bg-secondary)',
                  border: `1px solid ${stackedView === view ? 'var(--pinnacle-teal)' : 'var(--border-color)'}`,
                  borderRadius: '6px',
                  color: stackedView === view ? 'var(--pinnacle-teal)' : 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                By {view === 'chargeCode' ? 'Charge Code' : view === 'project' ? 'Project' : 'Role'}
              </button>
            ))}
          </div>

          <div className="dashboard-grid">
            <ChartCard title={`Labor Breakdown by ${stackedView === 'chargeCode' ? 'Charge Code' : stackedView === 'project' ? 'Project' : 'Role'}`} gridClass="grid-full">
              <LaborBreakdownChart
                months={laborByChargeCode.months}
                dataByCategory={laborByChargeCode.dataByCategory}
                height="280px"
                isLoading={isLoading}
                onBarClick={handleBarClick}
                activeFilters={allFilterValues}
              />
            </ChartCard>

            <ChartCard title="Hours Variance Waterfall" gridClass="grid-half">
              <HoursWaterfallChart
                data={data.hoursVarianceWaterfall || { labels: [], baseline: [], changes: [] }}
                height="260px"
                isLoading={isLoading}
              />
            </ChartCard>

            <ChartCard title="Task Hours Efficiency" gridClass="grid-half">
              <TaskHoursEfficiencyChart
                data={data.taskHoursEfficiency || { tasks: [], actualWorked: [], estimatedAdded: [] }}
                height="260px"
                onBarClick={handleBarClick}
                activeFilters={allFilterValues}
              />
            </ChartCard>

            <ChartCard title="Quality Hours Breakdown" gridClass="grid-half">
              <QualityHoursChart
                data={data.qualityHours || { tasks: [], data: [] }}
                height="260px"
              />
            </ChartCard>

            <ChartCard title="Non-Execute Hours" gridClass="grid-half">
              <NonExecutePieChart
                data={(data.nonExecuteHours?.categories || []).map((name: string, i: number) => ({
                  name,
                  value: data.nonExecuteHours?.values?.[i] || 0,
                  color: ['#40E0D0', '#CDDC39', '#FF9800', '#E91E63', '#3B82F6'][i % 5]
                }))}
                height="260px"
              />
            </ChartCard>
          </div>
        </>
      )}

      {/* QC Tab Content */}
      {activeTab === 'qc' && (
        <div className="dashboard-grid">
          <ChartCard title="QC Transaction by Gate" gridClass="grid-half">
            <QCTransactionBarChart
              data={qcByGate}
              height="220px"
              showLabels={true}
              isLoading={isLoading}
              onBarClick={(params) => handleBarClick(params, 'gate')}
              activeFilters={allFilterValues}
            />
          </ChartCard>

          <ChartCard title="QC Pass/Fail Distribution" gridClass="grid-half">
            <QCStackedBarChart
              data={((gateFilterValues.length > 0 && data.qcByGateStatus
                ? data.qcByGateStatus.filter((g: any) => gateFilterValues.includes(g.gate))
                : data.qcByGateStatus) || []
              ).map((g: any) => ({
                projectId: g.gate,
                customer: '',
                site: '',
                unprocessed: g.unprocessed,
                pass: g.pass,
                fail: g.fail,
                portfolio: g.portfolio || '',
              }))}
              height="220px"
              onBarClick={(params) => handleBarClick(params, 'gate')}
              activeFilters={allFilterValues}
            />
          </ChartCard>

          <ChartCard title="Analyst Performance: Records vs Pass Rate" gridClass="grid-full">
            <QCScatterChart
              data={data.qcByNameAndRole || []}
              labelField="name"
              height="280px"
              onPointClick={(params) => handleFilterClick('project', params.name)}
              activeFilters={allFilterValues}
            />
          </ChartCard>

          <ChartCard title="QC Pass Rate Trend" gridClass="grid-full">
            <QCPassRateLineChart
              data={data.qcPassRateTrend || []}
              height="260px"
              isLoading={isLoading}
            />
          </ChartCard>

          <ChartCard title="Execute Hours Since Last QC Check" gridClass="grid-half">
            <QCHoursBarChart
              data={(data.executeHoursSinceLastQC || []).map((item: any) => ({
                name: item.employeeName,
                value: item.hours,
              }))}
              xAxisLabel="Hours"
              yAxisLabel="Employee"
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
          </ChartCard>

          <ChartCard title="QC Hours Since Last Check" gridClass="grid-half">
            <QCHoursBarChart
              data={(data.qcHoursSinceLastQC || []).map((item: any) => ({
                name: item.employeeName,
                value: item.hours,
              }))}
              xAxisLabel="Hours"
              yAxisLabel="Employee"
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
          </ChartCard>

          {/* QPCI Performance Table */}
          <ChartCard title="Individual QPCI Performance" gridClass="grid-full" noPadding>
            <TableCompareExport
              visualId="qc-performance"
              visualTitle="QPCI Performance"
              data={data.qcByNameAndRole || []}
            >
              {data.qcByNameAndRole?.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Pass Rate</th>
                      <th>Open</th>
                      <th>Closed</th>
                      <th>Passed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(data.qcByNameAndRole || [])].sort((a: any, b: any) => (b.passRate || 0) - (a.passRate || 0)).map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td>{typeof item.passRate === 'number' ? `${item.passRate.toFixed(1)}%` : '-'}</td>
                        <td>{item.openCount || 0}</td>
                        <td>{item.closedCount || 0}</td>
                        <td>{item.passCount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No QC data available
                </div>
              )}
            </TableCompareExport>
          </ChartCard>
        </div>
      )}
    </div>
  );
}
