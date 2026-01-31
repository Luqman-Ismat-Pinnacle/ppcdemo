'use client';

/**
 * @fileoverview QC Dashboard Page for PPC V3 Insights.
 * 
 * Provides quality control analytics with:
 * - QC transaction volume by gate (Initial, Mid, Final, Post-Validation)
 * - QC status by project (pass/fail/unprocessed stacked bars)
 * - QC performance scatter plot (hours vs pass rate vs volume)
 * - QC by name and role table
 * 
 * Supports interactive filtering and cross-chart highlighting.
 * 
 * @module app/insights/qc-dashboard/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import InsightsFilterBar, { type FilterChip } from '@/components/insights/InsightsFilterBar';
import ChartCard from '@/components/charts/ChartCard';
import QCTransactionBarChart from '@/components/charts/QCTransactionBarChart';
import QCStackedBarChart from '@/components/charts/QCStackedBarChart';
import QCScatterChart from '@/components/charts/QCScatterChart';
import QCHoursBarChart from '@/components/charts/QCHoursBarChart';
import QCPassFailStackedChart from '@/components/charts/QCPassFailStackedChart';
import QCFeedbackTimeBarChart from '@/components/charts/QCFeedbackTimeBarChart';
import QCPassRateLineChart from '@/components/charts/QCPassRateLineChart';
import QCOutcomesStackedChart from '@/components/charts/QCOutcomesStackedChart';
import QCFeedbackTimeMonthlyChart from '@/components/charts/QCFeedbackTimeMonthlyChart';

export default function QCDashboardPage() {
  const { filteredData, isLoading: dataLoading } = useData();
  const data = filteredData;
  const [pageFilters, setPageFilters] = useState<FilterChip[]>([]);
  const gateFilterValues = useMemo(() => pageFilters.filter((f) => f.dimension === 'gate').map((f) => f.value), [pageFilters]);
  const projectFilterValues = useMemo(() => pageFilters.filter((f) => f.dimension === 'project').map((f) => f.value), [pageFilters]);
  const allFilterValues = useMemo(() => [...gateFilterValues, ...projectFilterValues], [gateFilterValues, projectFilterValues]);

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

  // Aggregate QC Transaction by Gate - filter by gate when filter active
  const qcByGate = useMemo(() => {
    const gateMap = new Map<string, number>();
    data.qcTransactionByGate.forEach((item) => {
      if (gateFilterValues.length > 0 && !gateFilterValues.includes(item.gate)) return;
      const count = gateMap.get(item.gate) || 0;
      gateMap.set(item.gate, count + item.count);
    });
    return Array.from(gateMap.entries()).map(([gate, count]) => ({
      gate,
      count,
      project: '',
    }));
  }, [data.qcTransactionByGate, gateFilterValues]);

  // Handle chart clicks for filtering
  const handleBarClick = (params: { name: string; dataIndex: number }, dimension: 'gate' | 'project' = 'gate') => {
    handleFilterClick(dimension, params.name, params.name);
  };

  const handleScatterClick = (params: { name: string }) => {
    handleFilterClick('project', params.name, params.name);
  };

  return (
    <div className="page-panel insights-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">QC Dashboard</h1>
          <p style={{ marginTop: '4px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Quality control volume, pass rates, and feedback cycles
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <InsightsFilterBar
          filters={pageFilters}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearFilters}
          emptyMessage="Click any chart to filter the page"
        />
      </div>

      {/* Top Row: Three Charts */}
      <div className="dashboard-grid">
        {/* QC Transaction by QC Gate */}
        <ChartCard title="QC Transaction by QC Gate" gridClass="grid-full">
          <QCTransactionBarChart
              data={qcByGate}
              height="220px"
              showLabels={true}
              isLoading={dataLoading}
              onBarClick={(params) => handleBarClick(params, 'gate')}
              activeFilters={allFilterValues}
            />
        </ChartCard>

        {/* QC Transaction by Project */}
        <ChartCard title="QC Transaction by Project" gridClass="grid-full">
          <QCTransactionBarChart
              data={(projectFilterValues.length > 0
                ? data.qcTransactionByProject.filter((p: any) => projectFilterValues.includes(p.projectId))
                : data.qcTransactionByProject
              ).map((p: any) => ({
                gate: p.projectId,
                count: p.unprocessed + p.pass + p.fail,
                project: p.projectId,
              }))}
              height="220px"
              showLabels={true}
              onBarClick={(params) => handleBarClick(params, 'project')}
              activeFilters={allFilterValues}
            />
        </ChartCard>

        {/* QC Pass/Fail Distribution */}
        <ChartCard title="QC Pass/Fail Distribution" gridClass="grid-full">
          <QCStackedBarChart
              data={(gateFilterValues.length > 0
                ? data.qcByGateStatus.filter((g: any) => gateFilterValues.includes(g.gate))
                : data.qcByGateStatus
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

        {/* Analyst Performance: Records vs Pass Rate */}
        <ChartCard title="Analyst Performance: Records vs Pass Rate" gridClass="grid-full">
          <QCScatterChart
              data={data.qcByNameAndRole}
              labelField="name"
              height="280px"
              onPointClick={handleScatterClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>

        {/* Records, Pass Rate by Subproject */}
        <ChartCard title="Subproject Quality Analysis" gridClass="grid-full">
          <QCScatterChart
              data={data.qcBySubproject.map((s) => ({
                name: s.name,
                role: 'Subproject',
                records: s.records,
                passRate: s.passRate,
                hours: 10,
                openCount: 0, // Subprojects don't track open/closed/pass counts separately
                closedCount: s.records,
                passCount: Math.round((s.passRate / 100) * s.records),
              }))}
              labelField="name"
              height="280px"
              onPointClick={handleScatterClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>
      </div>

      {/* Individual QPCI Measures Performance Table */}
      <div className="dashboard-grid">
        <ChartCard title="Individual QPCI Measures Performance" gridClass="grid-full" noPadding>
            {data.qcByNameAndRole && data.qcByNameAndRole.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee Name Workday</th>
                    <th>QC Pass Rate</th>
                    <th>Open QC Request count</th>
                    <th>Closed count</th>
                    <th>Pass Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.qcByNameAndRole
                    .sort((a, b) => b.passRate - a.passRate)
                    .map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td>{typeof item.passRate === 'number' ? `${Number(item.passRate.toFixed(2))}%` : item.passRate}</td>
                        <td>{item.openCount || 0}</td>
                        <td>{item.closedCount || 0}</td>
                        <td>{item.passCount || 0}</td>
                      </tr>
                    ))}
                  {data.qcByNameAndRole.length > 0 && (
                    <tr style={{ fontWeight: 'bold', borderTop: '2px solid var(--border-color)' }}>
                      <td>Total</td>
                      <td>
                        {data.qcByNameAndRole.reduce((sum, item) => sum + (item.closedCount || 0), 0) > 0
                          ? (
                              (data.qcByNameAndRole.reduce((sum, item) => sum + (item.passCount || 0), 0) /
                                data.qcByNameAndRole.reduce((sum, item) => sum + (item.closedCount || 0), 0)) *
                              100
                            ).toFixed(2) + '%'
                          : '0.0%'}
                      </td>
                      <td>{data.qcByNameAndRole.reduce((sum, item) => sum + (item.openCount || 0), 0)}</td>
                      <td>{data.qcByNameAndRole.reduce((sum, item) => sum + (item.closedCount || 0), 0)}</td>
                      <td>{data.qcByNameAndRole.reduce((sum, item) => sum + (item.passCount || 0), 0)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No data available
              </div>
            )}
        </ChartCard>
      </div>

      {/* Execute Hours Section */}
      <div className="dashboard-grid">
        <ChartCard title="Execute Hours Since Last QC Check" gridClass="grid-full">
          <QCHoursBarChart
              data={data.executeHoursSinceLastQC.map((item) => ({
                name: item.employeeName,
                value: item.hours,
              }))}
              xAxisLabel="Execute Hours Since Last QC Check"
              yAxisLabel="Employee Name Workday"
              height="280px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>

        <ChartCard title="EX Hours to QC Check Ratio" gridClass="grid-full">
          <QCHoursBarChart
              data={data.exHoursToQCRatio.map((item) => ({
                name: item.employeeName,
                value: item.ratio,
              }))}
              xAxisLabel="EX Hours to QC Check Ratio"
              yAxisLabel="Employee Name Workday"
              height="280px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>
      </div>

      {/* Execute Hours by Project */}
      <div className="dashboard-grid">
        <ChartCard title="Execute Hours Since Last QC Check by Project" gridClass="grid-full">
          <QCHoursBarChart
              data={data.executeHoursSinceLastQCByProject.map((item) => ({
                name: item.projectName,
                value: item.hours,
              }))}
              xAxisLabel="Execute Hours Since Last QC Check"
              yAxisLabel="Project ID"
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>
      </div>

      {/* QC Hours Section */}
      <div className="dashboard-grid">
        <ChartCard title="QC Hours Since Last QC Check" gridClass="grid-full">
          <QCHoursBarChart
              data={data.qcHoursSinceLastQC.map((item) => ({
                name: item.employeeName,
                value: item.hours,
              }))}
              xAxisLabel="QC Hours Since Last QC Check"
              yAxisLabel="Employee Name Workday"
              height="280px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>

        <ChartCard title="QC Hours to QC Check Ratio" gridClass="grid-full">
          <QCHoursBarChart
              data={data.qcHoursToQCRatio.map((item) => ({
                name: item.employeeName,
                value: item.ratio,
              }))}
              xAxisLabel="QC Hours to QC Check Ratio"
              yAxisLabel="Employee Name Workday"
              height="280px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>
      </div>

      {/* QC Hours by Project and Subproject */}
      <div className="dashboard-grid">
        <ChartCard title="QC Hours Since Last QC Check by Project and Sub Project" gridClass="grid-full">
          <QCHoursBarChart
              data={data.qcHoursSinceLastQCByProject.map((item) => ({
                name: `${item.projectName}${item.subprojectName ? ' - ' + item.subprojectName : ''}`,
                value: item.hours,
              }))}
              xAxisLabel="QC Hours Since Last QC Check"
              yAxisLabel="Project ID"
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>
      </div>

      {/* QC by Task Section */}
      <div className="dashboard-grid">
        <ChartCard title="QC pass and QC Fail by Task" gridClass="grid-full">
          <QCPassFailStackedChart
              data={data.qcPassFailByTask}
              height="280px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>

        <ChartCard title="QC Feedback by Task" gridClass="grid-full">
          <QCFeedbackTimeBarChart
              data={data.qcFeedbackTimeByTask}
              height="280px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>
      </div>

      {/* Monthly QC Metrics */}
      <div className="dashboard-grid">
        <ChartCard title="QC Pass Rate Per Month" gridClass="grid-full">
          <QCPassRateLineChart
              data={data.qcPassRatePerMonth}
              height="260px"
              onPointClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>

        <ChartCard title="QC Outcomes" gridClass="grid-full">
          <QCOutcomesStackedChart
              data={data.qcOutcomesByMonth}
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>
      </div>

      {/* QC Feedback Time by Month */}
      <div className="dashboard-grid">
        <ChartCard title="QC Feedback Time" gridClass="grid-full">
          <QCFeedbackTimeMonthlyChart
              data={data.qcFeedbackTimeByMonth}
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>

        <ChartCard title="Kickoff Feedback Time" gridClass="grid-full">
          <QCFeedbackTimeMonthlyChart
              data={data.kickoffFeedbackTimeByMonth}
              title="Kickoff Feedback Time"
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
        </ChartCard>
      </div>

    </div>
  );
}
