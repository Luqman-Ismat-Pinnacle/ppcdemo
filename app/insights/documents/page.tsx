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
import GaugeChart from '@/components/charts/GaugeChart';
import DeliverableStatusPie from '@/components/charts/DeliverableStatusPie';

export default function DocumentsPage() {
  const { filteredData } = useData();
  const data = filteredData;

  return (
    <div className="page-panel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portfolio PMF Document Tracker</h1>
        </div>
      </div>

      {/* Gauge Row */}
      <div className="dashboard-grid">
        {data.documentSignoffGauges.map((gauge, idx) => (
          <div key={idx} className="chart-card grid-quarter">
            <div className="chart-card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px' }}>
              <GaugeChart value={gauge.value} label={gauge.name} color={gauge.color} height="150px" />
            </div>
          </div>
        ))}

        {/* Pie Charts Row */}
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">DRD Status</h3></div>
          <div className="chart-card-body">
            <DeliverableStatusPie data={data.deliverableByStatus.drd} title="" height="250px" />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">Workflow Status</h3></div>
          <div className="chart-card-body">
            <DeliverableStatusPie data={data.deliverableByStatus.workflow} title="" height="250px" />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">SOP Status</h3></div>
          <div className="chart-card-body">
            <DeliverableStatusPie data={data.deliverableByStatus.sop} title="" height="250px" />
          </div>
        </div>
        <div className="chart-card grid-quarter">
          <div className="chart-card-header"><h3 className="chart-card-title">QMP Status</h3></div>
          <div className="chart-card-body">
            <DeliverableStatusPie data={data.deliverableByStatus.qmp} title="" height="250px" />
          </div>
        </div>

        {/* Deliverables Table */}
        <div className="chart-card grid-full">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Detailed Deliverable Matrix</h3>
          </div>
          <div className="chart-card-body no-padding" style={{ minHeight: '400px', overflow: 'auto' }}>
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
