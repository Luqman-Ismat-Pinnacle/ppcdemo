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

export default function QCDashboardPage() {
  const { filteredData } = useData();
  const data = filteredData;
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

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
          <div className="chart-card-header">
            <h3 className="chart-card-title">QC Transaction by QC Gate</h3>
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
          <div className="chart-card-header">
            <h3 className="chart-card-title">QC Transaction by Project</h3>
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
          <div className="chart-card-header">
            <h3 className="chart-card-title">QC Pass/Fail Distribution</h3>
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
          <div className="chart-card-header">
            <h3 className="chart-card-title">Analyst Performance: Records vs Pass Rate</h3>
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
          <div className="chart-card-header">
            <h3 className="chart-card-title">Subproject Quality Analysis</h3>
          </div>
          <div className="chart-card-body" style={{ minHeight: '400px' }}>
            <QCScatterChart
              data={data.qcBySubproject.map((s) => ({
                name: s.name,
                role: 'Subproject',
                records: s.records,
                passRate: s.passRate,
                hours: 10,
              }))}
              labelField="name"
              height="400px"
              onPointClick={handleScatterClick}
              activeFilters={activeFilters}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
