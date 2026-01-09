'use client';

/**
 * @fileoverview Overview Page for PPC V3 Insights.
 * 
 * Provides a high-level portfolio summary with:
 * - Key performance metrics (KPIs)
 * - S-Curve chart (planned vs actual progress)
 * - Budget variance waterfall chart
 * - Milestone status pie chart
 * - Percent complete donut charts
 * 
 * This is the main executive dashboard for project status.
 * 
 * @module app/insights/overview/page
 */

import React, { Suspense, useMemo, useState } from 'react';
import { useData } from '@/lib/data-context';
import SCurveChart from '@/components/charts/SCurveChart';
import BudgetVarianceChart from '@/components/charts/BudgetVarianceChart';
import MilestoneStatusPie from '@/components/charts/MilestoneStatusPie';
import PercentCompleteDonut from '@/components/charts/PercentCompleteDonut';

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
      <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
    </div>
  );
}

export default function OverviewPage() {
  const { filteredData } = useData();
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

  // Calculate metrics
  const totalHours = useMemo(() => {
    return data.sCurve.actual.reduce((sum, val) => sum + val, 0);
  }, [data.sCurve.actual]);

  const efficiency = useMemo(() => {
    const planned = data.sCurve.planned[data.sCurve.planned.length - 1] || 0;
    const actual = data.sCurve.actual[data.sCurve.actual.length - 1] || 0;
    return planned > 0 ? Math.round((actual / planned) * 100 * 10) / 10 : 0;
  }, [data.sCurve]);

  const budgetForecast = useMemo(() => {
    return data.budgetVariance.reduce((sum, item) => sum + Math.abs(item.value), 0);
  }, [data.budgetVariance]);

  const qcPassRate = useMemo(() => {
    const total = data.milestoneStatus.reduce((sum, item) => sum + item.value, 0);
    const completed = data.milestoneStatus.find((item) => item.name === 'Complete')?.value || 0;
    return total > 0 ? Math.round((completed / total) * 100 * 10) / 10 : 0;
  }, [data.milestoneStatus]);

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio Overview</h1>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-row-compact">
        <div className="metric-card">
          <div className="metric-label">Total Hours</div>
          <div className="metric-value">{totalHours.toLocaleString()}</div>
          <div className="metric-change up">+12.5%</div>
        </div>
        <div className="metric-card accent-lime">
          <div className="metric-label">Efficiency</div>
          <div className="metric-value">{efficiency}%</div>
          <div className="metric-change down">-2.1%</div>
        </div>
        <div className="metric-card accent-orange">
          <div className="metric-label">Budget Forecast</div>
          <div className="metric-value">${(budgetForecast / 1000).toFixed(0)}K</div>
          <div className="metric-change up">+22%</div>
        </div>
        <div className="metric-card accent-pink">
          <div className="metric-label">QC Pass Rate</div>
          <div className="metric-value">{qcPassRate}%</div>
          <div className="metric-change up">+1.2%</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="dashboard-grid">
        {/* S-Curve Chart - Full Width */}
        <div className="chart-card grid-full" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-card-header">
            <h3 className="chart-card-title">S-Curve: Planned vs Actual</h3>
          </div>
          <div className="chart-card-body" style={{ height: '400px' }}>
            <Suspense fallback={<LoadingSpinner />}>
              <SCurveChart
                dates={data.sCurve.dates}
                planned={data.sCurve.planned}
                actual={data.sCurve.actual}
                height="370px"
              />
            </Suspense>
          </div>
        </div>

        {/* Budget Variance Bridge - Full Width */}
        <div className="chart-card grid-full" style={{ gridColumn: '1 / -1' }}>
          <div className="chart-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="chart-card-title">Budget Variance Bridge</h3>
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
          <div className="chart-card-header">
            <h3 className="chart-card-title">Count/Metrics Analysis</h3>
            <span className="chart-card-subtitle">Hours defensibility</span>
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '400px', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Task</th>
                  <th className="number">Rem Hrs</th>
                  <th className="number">Count</th>
                  <th className="number">Metric</th>
                  <th className="number">Def</th>
                  <th className="number">Var</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.countMetricsAnalysis.slice(0, 10).map((item, idx) => (
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
            <h3 className="chart-card-title">Projects: Efficiency vs Metrics</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '400px', overflow: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="number">Eff %</th>
                  <th className="number">Metrics</th>
                  <th className="number">Rem Hrs</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {data.projectsEfficiencyMetrics.slice(0, 10).map((project, idx) => (
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
    </div>
  );
}
