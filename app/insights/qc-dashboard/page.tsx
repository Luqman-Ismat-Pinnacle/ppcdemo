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

import React, { useState, useMemo } from 'react';
import { useData } from '@/lib/data-context';
import QCTransactionBarChart from '@/components/charts/QCTransactionBarChart';
import QCStackedBarChart from '@/components/charts/QCStackedBarChart';
import QCScatterChart from '@/components/charts/QCScatterChart';
import QCHoursBarChart from '@/components/charts/QCHoursBarChart';
import QCPassFailStackedChart from '@/components/charts/QCPassFailStackedChart';
import QCFeedbackTimeBarChart from '@/components/charts/QCFeedbackTimeBarChart';
import QCPassRateLineChart from '@/components/charts/QCPassRateLineChart';
import QCOutcomesStackedChart from '@/components/charts/QCOutcomesStackedChart';
import QCFeedbackTimeMonthlyChart from '@/components/charts/QCFeedbackTimeMonthlyChart';
import CompareButton from '@/components/ui/CompareButton';
import SnapshotComparisonModal from '@/components/ui/SnapshotComparisonModal';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

export default function QCDashboardPage() {
  const { filteredData } = useData();
  const data = filteredData;
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [comparisonModal, setComparisonModal] = useState<{
    isOpen: boolean;
    visualId: string;
    visualTitle: string;
    visualType: 'chart' | 'table';
    currentData: any;
  } | null>(null);

  // Aggregate QC Transaction by Gate
  const qcByGate = useMemo(() => {
    const gateMap = new Map<string, number>();
    data.qcTransactionByGate.forEach((item) => {
      const count = gateMap.get(item.gate) || 0;
      gateMap.set(item.gate, count + item.count);
    });
    return Array.from(gateMap.entries()).map(([gate, count]) => ({
      gate,
      count,
      project: '',
    }));
  }, [data.qcTransactionByGate]);

  // Handle chart clicks for filtering
  const handleBarClick = (params: { name: string; dataIndex: number }) => {
    setActiveFilters((prev) => {
      if (prev.includes(params.name)) {
        return prev.filter((f) => f !== params.name);
      }
      return [...prev, params.name];
    });
  };

  const handleScatterClick = (params: { name: string }) => {
    setActiveFilters((prev) => {
      if (prev.includes(params.name)) {
        return prev.filter((f) => f !== params.name);
      }
      return [...prev, params.name];
    });
  };

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">QC Dashboard</h1>
        </div>
      </div>

      {/* Top Row: Three Charts */}
      <div className="dashboard-grid">
        {/* QC Transaction by QC Gate */}
        <div className="chart-card grid-third">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Transaction by QC Gate</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-transaction-by-gate',
                  visualTitle: 'QC Transaction by QC Gate',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCTransactionBarChart
              data={qcByGate}
              height="250px"
              showLabels={true}
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        {/* QC Transaction by Project */}
        <div className="chart-card grid-third">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Transaction by Project</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-transaction-by-project',
                  visualTitle: 'QC Transaction by Project',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCTransactionBarChart
              data={data.qcTransactionByProject.map((p) => ({
                gate: p.projectId,
                count: p.unprocessed + p.pass + p.fail,
                project: p.projectId,
              }))}
              height="250px"
              showLabels={true}
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        {/* QC Transactions by QC Gate (Stacked) */}
        <div className="chart-card grid-third">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Pass/Fail Distribution</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-pass-fail-distribution',
                  visualTitle: 'QC Pass/Fail Distribution',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCStackedBarChart
              data={data.qcByGateStatus.map((g) => ({
                projectId: g.gate,
                customer: '',
                site: '',
                unprocessed: g.unprocessed,
                pass: g.pass,
                fail: g.fail,
                portfolio: g.portfolio || '',
              }))}
              height="250px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        {/* Bottom Row: Scatter Charts */}
        {/* Records, Pass Rate by Name/Role */}
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Analyst Performance: Records vs Pass Rate</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'analyst-performance-scatter',
                  visualTitle: 'Analyst Performance: Records vs Pass Rate',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body" style={{ minHeight: '400px' }}>
            <QCScatterChart
              data={data.qcByNameAndRole}
              labelField="name"
              height="400px"
              onPointClick={handleScatterClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        {/* Records, Pass Rate by Subproject */}
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Subproject Quality Analysis</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'subproject-quality-scatter',
                  visualTitle: 'Subproject Quality Analysis',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body" style={{ minHeight: '400px' }}>
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
              height="400px"
              onPointClick={handleScatterClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>
      </div>

      {/* Individual QPCI Measures Performance Table */}
      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Individual QPCI Measures Performance</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qcpi-measures-table',
                  visualTitle: 'Individual QPCI Measures Performance',
                  visualType: 'table',
                  currentData: data.qcByNameAndRole,
                });
              }}
            />
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '300px', overflow: 'auto' }}>
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
                        <td>{item.passRate.toFixed(1)}%</td>
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
                            ).toFixed(1) + '%'
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
      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Execute Hours Since Last QC Check</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'execute-hours-since-qc',
                  visualTitle: 'Execute Hours Since Last QC Check',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCHoursBarChart
              data={data.executeHoursSinceLastQC.map((item) => ({
                name: item.employeeName,
                value: item.hours,
              }))}
              xAxisLabel="Execute Hours Since Last QC Check"
              yAxisLabel="Employee Name Workday"
              height="400px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">EX Hours to QC Check Ratio</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'ex-hours-qc-ratio',
                  visualTitle: 'EX Hours to QC Check Ratio',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCHoursBarChart
              data={data.exHoursToQCRatio.map((item) => ({
                name: item.employeeName,
                value: item.ratio,
              }))}
              xAxisLabel="EX Hours to QC Check Ratio"
              yAxisLabel="Employee Name Workday"
              height="400px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>
      </div>

      {/* Execute Hours by Project */}
      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Execute Hours Since Last QC Check by Project</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'execute-hours-by-project',
                  visualTitle: 'Execute Hours Since Last QC Check by Project',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCHoursBarChart
              data={data.executeHoursSinceLastQCByProject.map((item) => ({
                name: item.projectName,
                value: item.hours,
              }))}
              xAxisLabel="Execute Hours Since Last QC Check"
              yAxisLabel="Project ID"
              height="300px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>
      </div>

      {/* QC Hours Section */}
      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Hours Since Last QC Check</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-hours-since-qc',
                  visualTitle: 'QC Hours Since Last QC Check',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCHoursBarChart
              data={data.qcHoursSinceLastQC.map((item) => ({
                name: item.employeeName,
                value: item.hours,
              }))}
              xAxisLabel="QC Hours Since Last QC Check"
              yAxisLabel="Employee Name Workday"
              height="400px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Hours to QC Check Ratio</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-hours-qc-ratio',
                  visualTitle: 'QC Hours to QC Check Ratio',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCHoursBarChart
              data={data.qcHoursToQCRatio.map((item) => ({
                name: item.employeeName,
                value: item.ratio,
              }))}
              xAxisLabel="QC Hours to QC Check Ratio"
              yAxisLabel="Employee Name Workday"
              height="400px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>
      </div>

      {/* QC Hours by Project and Subproject */}
      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Hours Since Last QC Check by Project and Sub Project</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-hours-by-project-subproject',
                  visualTitle: 'QC Hours Since Last QC Check by Project and Sub Project',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCHoursBarChart
              data={data.qcHoursSinceLastQCByProject.map((item) => ({
                name: `${item.projectName}${item.subprojectName ? ' - ' + item.subprojectName : ''}`,
                value: item.hours,
              }))}
              xAxisLabel="QC Hours Since Last QC Check"
              yAxisLabel="Project ID"
              height="300px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>
      </div>

      {/* QC by Task Section */}
      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC pass and QC Fail by Task</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-pass-fail-by-task',
                  visualTitle: 'QC pass and QC Fail by Task',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCPassFailStackedChart
              data={data.qcPassFailByTask}
              height="400px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Feedback by Task</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-feedback-by-task',
                  visualTitle: 'QC Feedback by Task',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCFeedbackTimeBarChart
              data={data.qcFeedbackTimeByTask}
              height="400px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>
      </div>

      {/* Monthly QC Metrics */}
      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Pass Rate Per Month</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-pass-rate-monthly',
                  visualTitle: 'QC Pass Rate Per Month',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCPassRateLineChart
              data={data.qcPassRatePerMonth}
              height="300px"
              onPointClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Outcomes</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-outcomes-monthly',
                  visualTitle: 'QC Outcomes',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCOutcomesStackedChart
              data={data.qcOutcomesByMonth}
              height="300px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>
      </div>

      {/* QC Feedback Time by Month */}
      <div className="dashboard-grid" style={{ marginTop: '2rem' }}>
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">QC Feedback Time</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'qc-feedback-time-monthly',
                  visualTitle: 'QC Feedback Time',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCFeedbackTimeMonthlyChart
              data={data.qcFeedbackTimeByMonth}
              height="300px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>

        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Kickoff Feedback Time</h3>
            <CompareButton
              onClick={() => {
                setComparisonModal({
                  isOpen: true,
                  visualId: 'kickoff-feedback-time-monthly',
                  visualTitle: 'Kickoff Feedback Time',
                  visualType: 'chart',
                  currentData: null,
                });
              }}
            />
          </div>
          <div className="chart-card-body">
            <QCFeedbackTimeMonthlyChart
              data={data.kickoffFeedbackTimeByMonth}
              title="Kickoff Feedback Time"
              height="300px"
              onBarClick={handleBarClick}
              activeFilters={activeFilters}
            />
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
