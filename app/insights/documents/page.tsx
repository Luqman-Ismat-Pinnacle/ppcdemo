'use client';

/**
 * @fileoverview Document Tracker Page for PPC V3 Insights.
 * 
 * Tracks project deliverables and documentation status:
 * - Document signoff gauges (approval rates)
 * - Deliverable status pie charts by type (DRD, QMP, SOP, Workflow)
 * - Deliverable tracker table with status indicators
 * 
 * @module app/insights/documents/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import DeliverableStatusPie from '@/components/charts/DeliverableStatusPie';
import InsightsFilterBar, { type FilterChip } from '@/components/insights/InsightsFilterBar';

export default function DocumentsPage() {
  const { filteredData } = useData();
  const data = filteredData;
  const [pageFilters, setPageFilters] = useState<FilterChip[]>([]);
  const statusFilterValues = useMemo(() => pageFilters.filter((f) => f.dimension === 'status').map((f) => f.value), [pageFilters]);

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

  const filteredDeliverables = useMemo(() => {
    const list = data.deliverablesTracker || data.deliverables || [];
    if (statusFilterValues.length === 0) return list;
    return list.filter((d: any) => {
      const drd = (d.drdStatus || d.status || '').toString();
      const workflow = (d.workflowStatus || '').toString();
      const sop = (d.sopStatus || '').toString();
      const qmp = (d.qmpStatus || '').toString();
      return statusFilterValues.some((s) => [drd, workflow, sop, qmp].includes(s));
    });
  }, [data.deliverablesTracker, data.deliverables, statusFilterValues]);

  return (
    <div className="page-panel insights-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Document Tracker</h1>
          <p style={{ marginTop: '4px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Deliverable approval status by type
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <InsightsFilterBar
          filters={pageFilters}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearFilters}
          emptyMessage="Click any pie slice to filter the page"
        />
      </div>

      {/* Gauge Row - Large KPI cards for glanceability */}
      <div className="dashboard-grid">
        {data.documentSignoffGauges.map((gauge, idx) => (
          <div key={idx} className="chart-card grid-quarter">
            <div className="chart-card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: gauge.color }}>{gauge.value}%</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'center' }}>{gauge.name}</div>
            </div>
          </div>
        ))}

        {/* Pie Charts Row */}
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">DRD Status</h3></div>
          <div className="chart-card-body" style={{ padding: '1.5rem' }}>
            <DeliverableStatusPie data={data.deliverableByStatus.drd} title="" height="280px" onSliceClick={(p) => handleFilterClick('status', p.name, p.name)} activeFilters={statusFilterValues} />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">Workflow Status</h3></div>
          <div className="chart-card-body" style={{ padding: '1.5rem' }}>
            <DeliverableStatusPie data={data.deliverableByStatus.workflow} title="" height="280px" onSliceClick={(p) => handleFilterClick('status', p.name, p.name)} activeFilters={statusFilterValues} />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">SOP Status</h3></div>
          <div className="chart-card-body" style={{ padding: '1.5rem' }}>
            <DeliverableStatusPie data={data.deliverableByStatus.sop} title="" height="280px" onSliceClick={(p) => handleFilterClick('status', p.name, p.name)} activeFilters={statusFilterValues} />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">QMP Status</h3></div>
          <div className="chart-card-body" style={{ padding: '1.5rem' }}>
            <DeliverableStatusPie data={data.deliverableByStatus.qmp} title="" height="280px" onSliceClick={(p) => handleFilterClick('status', p.name, p.name)} activeFilters={statusFilterValues} />
          </div>
        </div>

        {/* Deliverables Table */}
        <div className="chart-card grid-full">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Detailed Deliverable Matrix</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ overflow: 'auto', padding: '1rem' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Project</th>
                  <th>Deliverable</th>
                  <th>DRD Status</th>
                  <th>Workflow Status</th>
                  <th>SOP Status</th>
                  <th>QMP Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeliverables.map((d: any, idx: number) => {
                  const customer = d.customer || '-';
                  const projectNum = d.projectNum || d.projectId || '-';
                  const name = d.name || '-';
                  const drdStatus = d.drdStatus || d.status || 'Not Started';
                  const workflowStatus = d.workflowStatus || '-';
                  const sopStatus = d.sopStatus || '-';
                  const qmpStatus = d.qmpStatus || '-';

                  const getStatusBadge = (status: string) => {
                    if (status === 'Customer Signed Off' || status === 'Approved' || status === 'Complete') {
                      return 'success';
                    }
                    if (status === 'In Progress' || status === 'In Review') {
                      return 'warning';
                    }
                    return 'secondary';
                  };

                  return (
                    <tr key={idx}>
                      <td>{customer}</td>
                      <td>{projectNum}</td>
                      <td>{name}</td>
                      <td>
                        <span className={`badge badge-${getStatusBadge(drdStatus)}`}>{drdStatus}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${getStatusBadge(workflowStatus)}`}>{workflowStatus}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${getStatusBadge(sopStatus)}`}>{sopStatus}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${getStatusBadge(qmpStatus)}`}>{qmpStatus}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
