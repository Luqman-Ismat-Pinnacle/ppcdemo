'use client';

/**
 * @fileoverview Milestone Tracker Page for PPC V3 Insights.
 * 
 * Provides milestone tracking and variance analysis with:
 * - Milestone status pie chart (completed, in progress, etc.)
 * - Plan vs Forecast vs Actual progress chart
 * - Milestone scoreboard by customer
 * - Detailed milestone table with variance indicators
 * - Snapshot capture and comparison functionality
 * 
 * @module app/insights/milestones/page
 */

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import MilestoneStatusPie from '@/components/charts/MilestoneStatusPie';
import PlanForecastActualChart from '@/components/charts/PlanForecastActualChart';
import { formatDate } from '@/lib/utils';
import CompareButton from '@/components/ui/CompareButton';
import SnapshotButton from '@/components/ui/SnapshotButton';
import SnapshotComparisonModal from '@/components/ui/SnapshotComparisonModal';
import { generateId } from '@/lib/database-schema';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import {
  type SortState,
  formatSortIndicator,
  getNextSortState,
  sortByState,
} from '@/lib/sort-utils';

export default function MilestonesPage() {
  const { filteredData, hierarchyFilter, dateFilter, saveVisualSnapshot } = useData();
  const data = filteredData;
  const [scoreboardSort, setScoreboardSort] = useState<SortState | null>(null);
  const [milestonesSort, setMilestonesSort] = useState<SortState | null>(null);
  const [comparisonModal, setComparisonModal] = useState<{
    isOpen: boolean;
    visualId: string;
    visualTitle: string;
    visualType: 'chart' | 'table';
    currentData: any;
  } | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);

  // Snapshot capture handlers
  const handleCaptureSnapshot = useCallback((visualId: string, visualTitle: string, visualType: 'chart' | 'table', snapshotData: any) => {
    return async (snapshotName: string) => {
      try {
        const metadata: Record<string, unknown> = {};
        if (hierarchyFilter) metadata.hierarchyFilter = JSON.parse(JSON.stringify(hierarchyFilter));
        if (dateFilter) metadata.dateFilter = JSON.parse(JSON.stringify(dateFilter));

        await saveVisualSnapshot({
          id: generateId('VSN'),
          visualId,
          visualType,
          visualTitle,
          snapshotName,
          snapshotDate: new Date().toISOString().split('T')[0],
          data: snapshotData,
          metadata,
          createdBy: 'User',
          createdAt: new Date().toISOString(),
        });
        setSnapshotMessage(`Snapshot "${snapshotName}" captured!`);
        setTimeout(() => setSnapshotMessage(null), 3000);
      } catch (error) {
        setSnapshotMessage('Failed to capture snapshot');
        setTimeout(() => setSnapshotMessage(null), 3000);
      }
    };
  }, [hierarchyFilter, dateFilter]);

  const sortedScoreboard = useMemo(() => {
    return sortByState(data.milestoneScoreboard, scoreboardSort, (item, key) => {
      switch (key) {
        case 'customer':
          return item.customer;
        case 'plannedThrough':
          return item.plannedThrough;
        case 'actualThrough':
          return item.actualThrough;
        case 'variance':
          return item.variance;
        default:
          return null;
      }
    });
  }, [data.milestoneScoreboard, scoreboardSort]);

  const sortedMilestones = useMemo(() => {
    return sortByState(data.milestones, milestonesSort, (item, key) => {
      switch (key) {
        case 'customer':
          return item.customer;
        case 'site':
          return item.site;
        case 'projectNum':
          return item.projectNum;
        case 'name':
          return item.name;
        case 'status':
          return item.status;
        case 'percentComplete':
          return item.percentComplete;
        case 'plannedCompletion':
          return item.plannedCompletion ? new Date(item.plannedCompletion) : null;
        case 'forecastedCompletion':
          return item.forecastedCompletion ? new Date(item.forecastedCompletion) : null;
        case 'actualCompletion':
          return item.actualCompletion ? new Date(item.actualCompletion) : null;
        case 'progress':
          return item.percentComplete;
        case 'varianceDays':
          return item.varianceDays;
        default:
          return null;
      }
    });
  }, [data.milestones, milestonesSort]);

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio Milestone Tracker</h1>
        </div>
      </div>

      {/* Top Row: Charts and Scoreboard */}
      <div className="dashboard-grid">
        {/* Snapshot Success Message */}
        {snapshotMessage && (
          <div style={{
            position: 'fixed',
            top: '80px',
            right: '24px',
            padding: '12px 20px',
            background: 'var(--pinnacle-teal)',
            color: '#000',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.875rem',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {snapshotMessage}
          </div>
        )}

        {/* Milestone Status Pie */}
        <div className="chart-card grid-quarter">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Milestone Status</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SnapshotButton
                visualId="milestone-status-pie"
                visualTitle="Milestone Status"
                visualType="chart"
                onCapture={handleCaptureSnapshot('milestone-status-pie', 'Milestone Status', 'chart', data.milestoneStatusPie)}
              />
              <CompareButton
                onClick={() => {
                  setComparisonModal({
                    isOpen: true,
                    visualId: 'milestone-status-pie',
                    visualTitle: 'Milestone Status',
                    visualType: 'chart',
                    currentData: data.milestoneStatusPie,
                  });
                }}
              />
            </div>
          </div>
          <div className="chart-card-body">
            <MilestoneStatusPie data={data.milestoneStatusPie} height="250px" />
          </div>
        </div>

        {/* Plan vs Forecast vs Actual */}
        <div className="chart-card grid-half">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Plan vs Forecast vs Actual</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SnapshotButton
                visualId="plan-forecast-actual-chart"
                visualTitle="Plan vs Forecast vs Actual"
                visualType="chart"
                onCapture={handleCaptureSnapshot('plan-forecast-actual-chart', 'Plan vs Forecast vs Actual', 'chart', data.planVsForecastVsActual)}
              />
              <CompareButton
                onClick={() => {
                  setComparisonModal({
                    isOpen: true,
                    visualId: 'plan-forecast-actual-chart',
                    visualTitle: 'Plan vs Forecast vs Actual',
                    visualType: 'chart',
                    currentData: data.planVsForecastVsActual,
                  });
                }}
              />
            </div>
          </div>
          <div className="chart-card-body">
            <PlanForecastActualChart data={data.planVsForecastVsActual} height="250px" />
          </div>
        </div>

        {/* Scoreboard */}
        <div className="chart-card grid-quarter">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Scoreboard</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SnapshotButton
                visualId="milestone-scoreboard-table"
                visualTitle="Scoreboard"
                visualType="table"
                onCapture={handleCaptureSnapshot('milestone-scoreboard-table', 'Scoreboard', 'table', sortedScoreboard)}
              />
              <CompareButton
                onClick={() => {
                  setComparisonModal({
                    isOpen: true,
                    visualId: 'milestone-scoreboard-table',
                    visualTitle: 'Scoreboard',
                    visualType: 'table',
                    currentData: sortedScoreboard,
                  });
                }}
              />
            </div>
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '250px', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    { key: 'customer', label: 'Customer' },
                    { key: 'plannedThrough', label: 'Planned', align: 'number' },
                    { key: 'actualThrough', label: 'Actual', align: 'number' },
                    { key: 'variance', label: 'Var', align: 'number' },
                  ].map(({ key, label, align }) => {
                    const indicator = formatSortIndicator(scoreboardSort, key);
                    return (
                      <th key={key} className={align}>
                        <button
                          type="button"
                          onClick={() => setScoreboardSort(prev => getNextSortState(prev, key))}
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
                {sortedScoreboard.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.customer}</td>
                    <td className="number">{item.plannedThrough}</td>
                    <td className="number">{item.actualThrough}</td>
                    <td className={`number ${item.variance < 0 ? 'status-good' : item.variance > 0 ? 'status-bad' : ''}`}>
                      {item.variance > 0 ? '+' : ''}{item.variance}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom: Milestones Table */}
        <div className="chart-card grid-full">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Detailed Milestones</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <SnapshotButton
                visualId="detailed-milestones-table"
                visualTitle="Detailed Milestones"
                visualType="table"
                onCapture={handleCaptureSnapshot('detailed-milestones-table', 'Detailed Milestones', 'table', sortedMilestones)}
              />
              <CompareButton
                onClick={() => {
                  setComparisonModal({
                    isOpen: true,
                    visualId: 'detailed-milestones-table',
                    visualTitle: 'Detailed Milestones',
                    visualType: 'table',
                    currentData: sortedMilestones,
                  });
                }}
              />
            </div>
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '400px', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    { key: 'customer', label: 'Customer' },
                    { key: 'site', label: 'Site' },
                    { key: 'projectNum', label: 'Project #' },
                    { key: 'name', label: 'Milestone Name' },
                    { key: 'status', label: 'Status' },
                    { key: 'percentComplete', label: '%', align: 'number' },
                    { key: 'plannedCompletion', label: 'Planned' },
                    { key: 'forecastedCompletion', label: 'Forecasted' },
                    { key: 'actualCompletion', label: 'Actual' },
                    { key: 'progress', label: 'Progress', style: { minWidth: '120px' } },
                    { key: 'varianceDays', label: 'Var Days', align: 'number' },
                  ].map(({ key, label, align, style }) => {
                    const indicator = formatSortIndicator(milestonesSort, key);
                    return (
                      <th key={key} className={align} style={style}>
                        <button
                          type="button"
                          onClick={() => setMilestonesSort(prev => getNextSortState(prev, key))}
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
                {sortedMilestones.map((m, idx) => (
                  <tr key={idx}>
                    <td>{m.customer}</td>
                    <td>{m.site}</td>
                    <td>{m.projectNum}</td>
                    <td>{m.name}</td>
                    <td>
                      <span
                        className={`badge badge-${m.status === 'Completed'
                          ? 'success'
                          : m.status === 'In Progress'
                            ? 'warning'
                            : m.status === 'At Risk'
                              ? 'critical'
                              : 'secondary'
                          }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="number">{m.percentComplete}%</td>
                    <td>{formatDate(m.plannedCompletion)}</td>
                    <td>{formatDate(m.forecastedCompletion)}</td>
                    <td>{formatDate(m.actualCompletion) || '-'}</td>
                    <td>
                      <div
                        style={{
                          width: '100%',
                          height: '16px',
                          background: 'var(--bg-tertiary)',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            width: `${m.percentComplete}%`,
                            height: '100%',
                            background:
                              m.percentComplete >= 75
                                ? 'var(--color-success)'
                                : m.percentComplete >= 50
                                  ? 'var(--color-warning)'
                                  : 'var(--color-error)',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </td>
                    <td className={`number ${m.varianceDays < 0 ? 'status-good' : m.varianceDays > 0 ? 'status-bad' : ''}`}>
                      {m.varianceDays > 0 ? '+' : ''}{m.varianceDays}
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
