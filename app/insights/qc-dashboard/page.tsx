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
        <div className="chart-card grid-third">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Transaction by QC Gate</h3>
          </div>
          <div className="chart-card-body">
            <QCTransactionBarChart
              data={qcByGate}
              height="220px"
              showLabels={true}
              isLoading={dataLoading}
              onBarClick={(params) => handleBarClick(params, 'gate')}
              activeFilters={allFilterValues}
            />
          </div>
        </div>

        {/* QC Transaction by Project */}
        <div className="chart-card grid-third">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Transaction by Project</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>

        {/* QC Transactions by QC Gate (Stacked) */}
        <div className="chart-card grid-third">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Pass/Fail Distribution</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>

        {/* Bottom Row: Scatter Charts */}
        {/* Records, Pass Rate by Name/Role */}
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Analyst Performance: Records vs Pass Rate</h3>
          </div>
          <div className="chart-card-body">
            <QCScatterChart
              data={data.qcByNameAndRole}
              labelField="name"
              height="280px"
              onPointClick={handleScatterClick}
              activeFilters={allFilterValues}
            />
          </div>
        </div>

        {/* Records, Pass Rate by Subproject */}
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Subproject Quality Analysis</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>
      </div>

      {/* Individual QPCI Measures Performance Table */}
      <div className="dashboard-grid">
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Individual QPCI Measures Performance</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ overflow: 'auto' }}>
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
          </div>
        </div>
      </div>

      {/* Execute Hours Section */}
      <div className="dashboard-grid">
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Execute Hours Since Last QC Check</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">EX Hours to QC Check Ratio</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>
      </div>

      {/* Execute Hours by Project */}
      <div className="dashboard-grid">
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Execute Hours Since Last QC Check by Project</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>
      </div>

      {/* QC Hours Section */}
      <div className="dashboard-grid">
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Hours Since Last QC Check</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Hours to QC Check Ratio</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>
      </div>

      {/* QC Hours by Project and Subproject */}
      <div className="dashboard-grid">
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Hours Since Last QC Check by Project and Sub Project</h3>
          </div>
          <div className="chart-card-body">
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
          </div>
        </div>
      </div>

      {/* QC by Task Section */}
      <div className="dashboard-grid">
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC pass and QC Fail by Task</h3>
          </div>
          <div className="chart-card-body">
            <QCPassFailStackedChart
              data={data.qcPassFailByTask}
              height="280px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Feedback by Task</h3>
          </div>
          <div className="chart-card-body">
            <QCFeedbackTimeBarChart
              data={data.qcFeedbackTimeByTask}
              height="280px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
          </div>
        </div>
      </div>

      {/* Monthly QC Metrics */}
      <div className="dashboard-grid">
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Pass Rate Per Month</h3>
          </div>
          <div className="chart-card-body">
            <QCPassRateLineChart
              data={data.qcPassRatePerMonth}
              height="260px"
              onPointClick={handleBarClick}
              activeFilters={allFilterValues}
            />
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Outcomes</h3>
          </div>
          <div className="chart-card-body">
            <QCOutcomesStackedChart
              data={data.qcOutcomesByMonth}
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
          </div>
        </div>
      </div>

      {/* QC Feedback Time by Month */}
      <div className="dashboard-grid">
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Feedback Time</h3>
          </div>
          <div className="chart-card-body">
            <QCFeedbackTimeMonthlyChart
              data={data.qcFeedbackTimeByMonth}
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Kickoff Feedback Time</h3>
          </div>
          <div className="chart-card-body">
            <QCFeedbackTimeMonthlyChart
              data={data.kickoffFeedbackTimeByMonth}
              title="Kickoff Feedback Time"
              height="260px"
              onBarClick={handleBarClick}
              activeFilters={allFilterValues}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
