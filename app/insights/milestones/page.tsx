'use client';

/**
 * @fileoverview Milestone Tracker Page for PPC V3 Insights.
 * 
 * Provides milestone tracking and variance analysis with:
 * - Milestone status pie chart (completed, in progress, etc.)
 * - Plan vs Forecast vs Actual progress chart
 * - Milestone scoreboard by customer
 * - Detailed milestone table with variance indicators
 * 
 * @module app/insights/milestones/page
 */

import React from 'react';
import { useData } from '@/lib/data-context';
import MilestoneStatusPie from '@/components/charts/MilestoneStatusPie';
import PlanForecastActualChart from '@/components/charts/PlanForecastActualChart';
import { formatDate } from '@/lib/utils';

export default function MilestonesPage() {
  const { filteredData } = useData();
  const data = filteredData;

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio Milestone Tracker</h1>
        </div>
      </div>

      {/* Top Row: Charts and Scoreboard */}
      <div className="dashboard-grid">
        {/* Milestone Status Pie */}
        <div className="chart-card grid-quarter">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Milestone Status</h3>
          </div>
          <div className="chart-card-body">
            <MilestoneStatusPie data={data.milestoneStatusPie} height="250px" />
          </div>
        </div>

        {/* Plan vs Forecast vs Actual */}
        <div className="chart-card grid-half">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Plan vs Forecast vs Actual</h3>
          </div>
          <div className="chart-card-body">
            <PlanForecastActualChart data={data.planVsForecastVsActual} height="250px" />
          </div>
        </div>

        {/* Scoreboard */}
        <div className="chart-card grid-quarter">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Scoreboard</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '250px', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th className="number">Planned</th>
                  <th className="number">Actual</th>
                  <th className="number">Var</th>
                </tr>
              </thead>
              <tbody>
                {data.milestoneScoreboard.map((item, idx) => (
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
          <div className="chart-card-header">
            <h3 className="chart-card-title">Detailed Milestones</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '400px', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Site</th>
                  <th>Project #</th>
                  <th>Milestone Name</th>
                  <th>Status</th>
                  <th className="number">%</th>
                  <th>Planned</th>
                  <th>Forecasted</th>
                  <th>Actual</th>
                  <th style={{ minWidth: '120px' }}>Progress</th>
                  <th className="number">Var Days</th>
                </tr>
              </thead>
              <tbody>
                {data.milestones.map((m, idx) => (
                  <tr key={idx}>
                    <td>{m.customer}</td>
                    <td>{m.site}</td>
                    <td>{m.projectNum}</td>
                    <td>{m.name}</td>
                    <td>
                      <span
                        className={`badge badge-${
                          m.status === 'Completed'
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
    </div>
  );
}
