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

import React, { useMemo, useState, useRef, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import InsightsFilterBar, { type FilterChip } from '@/components/insights/InsightsFilterBar';
import ChartCard from '@/components/charts/ChartCard';
import MilestoneStatusPie from '@/components/charts/MilestoneStatusPie';
import PlanForecastActualChart from '@/components/charts/PlanForecastActualChart';
import { formatDate } from '@/lib/utils';
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

export default function MilestonesPage() {
  const { filteredData } = useData();
  const data = filteredData;
  const [scoreboardSort, setScoreboardSort] = useState<SortState | null>(null);
  const [milestonesSort, setMilestonesSort] = useState<SortState | null>(null);
  const [pageFilters, setPageFilters] = useState<FilterChip[]>([]);
  const statusFilterValues = useMemo(() => pageFilters.filter((f) => f.dimension === 'status').map((f) => f.value), [pageFilters]);
  const customerFilterValues = useMemo(() => pageFilters.filter((f) => f.dimension === 'customer').map((f) => f.value), [pageFilters]);

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

  const filteredScoreboard = useMemo(() => {
    let list = data.milestoneScoreboard || [];
    if (customerFilterValues.length > 0) list = list.filter((i: any) => customerFilterValues.includes(i.customer));
    return list;
  }, [data.milestoneScoreboard, customerFilterValues]);

  const sortedScoreboard = useMemo(() => {
    return sortByState(filteredScoreboard, scoreboardSort, (item, key) => {
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
  }, [filteredScoreboard, scoreboardSort]);

  const filteredMilestones = useMemo(() => {
    let list = data.milestones || [];
    if (statusFilterValues.length > 0) {
      list = list.filter((m: any) => {
        const s = (m.status || '').toString();
        return statusFilterValues.some((f) => s === f || (f === 'Completed' && (s === 'Complete' || s === 'Completed')));
      });
    }
    if (customerFilterValues.length > 0) list = list.filter((m: any) => customerFilterValues.includes(m.customer));
    return list;
  }, [data.milestones, statusFilterValues, customerFilterValues]);

  const sortedMilestones = useMemo(() => {
    return sortByState(filteredMilestones, milestonesSort, (item, key) => {
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
  }, [filteredMilestones, milestonesSort]);

  return (
    <div className="page-panel insights-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio Milestone Tracker</h1>
          <p style={{ marginTop: '4px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Status, progress, and variance at a glance
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <InsightsFilterBar
          filters={pageFilters}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearFilters}
          emptyMessage="Click any chart slice or table to filter the page"
        />
      </div>

      {/* Top Row: Charts and Scoreboard */}
      <div className="dashboard-grid">
        {/* Milestone Status Pie */}
        <ChartCard title="Milestone Status" gridClass="grid-quarter">
            <MilestoneStatusPie
              data={data.milestoneStatusPie}
              height="240px"
              onSliceClick={(params) => handleFilterClick('status', params.name, params.name)}
              activeFilters={statusFilterValues}
            />
        </ChartCard>

        {/* Plan vs Forecast vs Actual */}
        <ChartCard title="Plan vs Forecast vs Actual" gridClass="grid-full">
          <PlanForecastActualChart data={data.planVsForecastVsActual} height="100%" />
        </ChartCard>

        {/* Scoreboard */}
        <div className="chart-card grid-quarter">
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Scoreboard</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ overflow: 'auto' }}>
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
        <ChartCard title="Detailed Milestones" gridClass="grid-full" noPadding>
            <div style={{ overflow: 'auto' }}>
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
                    <td className="number">{formatPercent(m.percentComplete)}</td>
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
        </ChartCard>
      </div>

    </div>
  );
}
