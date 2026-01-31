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

import React from 'react';
import { useData } from '@/lib/data-context';
import DeliverableStatusPie from '@/components/charts/DeliverableStatusPie';

export default function DocumentsPage() {
  const { filteredData } = useData();
  const data = filteredData;

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

      {/* Gauge Row - Large KPI cards for glanceability */}
      <div className="dashboard-grid">
        {data.documentSignoffGauges.map((gauge, idx) => (
          <div key={idx} className="chart-card grid-quarter">
            <div className="chart-card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', padding: '1.5rem' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: gauge.color }}>{gauge.value}%</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '4px', textAlign: 'center' }}>{gauge.name}</div>
            </div>
          </div>
        ))}

        {/* Pie Charts Row */}
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">DRD Status</h3></div>
          <div className="chart-card-body" style={{ minHeight: '300px', padding: '1.5rem' }}>
            <DeliverableStatusPie data={data.deliverableByStatus.drd} title="" height="280px" />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">Workflow Status</h3></div>
          <div className="chart-card-body" style={{ minHeight: '300px', padding: '1.5rem' }}>
            <DeliverableStatusPie data={data.deliverableByStatus.workflow} title="" height="280px" />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">SOP Status</h3></div>
          <div className="chart-card-body" style={{ minHeight: '300px', padding: '1.5rem' }}>
            <DeliverableStatusPie data={data.deliverableByStatus.sop} title="" height="280px" />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">QMP Status</h3></div>
          <div className="chart-card-body" style={{ minHeight: '300px', padding: '1.5rem' }}>
            <DeliverableStatusPie data={data.deliverableByStatus.qmp} title="" height="280px" />
          </div>
        </div>

        {/* Deliverables Table */}
        <div className="chart-card grid-full">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Detailed Deliverable Matrix</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '420px', overflow: 'auto', padding: '1rem' }}>
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
                {(data.deliverablesTracker || data.deliverables || []).map((d: any, idx: number) => {
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
