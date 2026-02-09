'use client';

/**
 * @fileoverview Documents Page for PPC V3 Insights.
 * 
 * Tracks project deliverables, documentation status, and project health:
 * - Project health scores and status
 * - Document signoff gauges (approval rates)
 * - Deliverable status pie charts by type (DRD, QMP, SOP, Workflow)
 * - Deliverable tracker table with status indicators
 * 
 * @module app/insights/documents/page
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useData } from '@/lib/data-context';
import ChartCard from '@/components/charts/ChartCard';
import TableCompareExport from '@/components/ui/TableCompareExport';
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

  // Calculate project health metrics from projects data
  const projectHealthMetrics = useMemo(() => {
    const projects = data.projects || [];
    const projectHealth = data.projectHealth || [];
    
    // Get health scores from project health records
    const healthMap = new Map<string, any>();
    projectHealth.forEach((h: any) => {
      const projId = h.projectId || h.project_id;
      if (projId) healthMap.set(projId, h);
    });

    // Build project health summary
    const projectsWithHealth = projects.map((p: any) => {
      const projectId = p.id || p.projectId;
      const health = healthMap.get(projectId);
      return {
        id: projectId,
        name: p.name || p.projectName || projectId,
        status: p.status || 'Active',
        healthScore: health?.healthScore ?? health?.score ?? null,
        approvalStatus: health?.approvalStatus || 'Pending',
        passedChecks: health?.passedChecks || 0,
        totalChecks: health?.totalChecks || 0,
      };
    }).slice(0, 8); // Show top 8 projects

    // Calculate overall metrics
    const withScores = projectsWithHealth.filter((p: any) => p.healthScore !== null);
    const avgHealth = withScores.length > 0 
      ? Math.round(withScores.reduce((sum: number, p: any) => sum + p.healthScore, 0) / withScores.length)
      : null;
    
    const atRisk = projectsWithHealth.filter((p: any) => p.healthScore !== null && p.healthScore < 70).length;
    const healthy = projectsWithHealth.filter((p: any) => p.healthScore !== null && p.healthScore >= 80).length;

    return { projects: projectsWithHealth, avgHealth, atRisk, healthy, total: projects.length };
  }, [data.projects, data.projectHealth]);

  return (
    <div className="page-panel insights-page">
      {/* Project Health Summary */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Avg Health Score</div>
          <div style={{ 
            fontSize: '2rem', 
            fontWeight: 700, 
            color: projectHealthMetrics.avgHealth !== null 
              ? projectHealthMetrics.avgHealth >= 80 ? '#10B981' 
              : projectHealthMetrics.avgHealth >= 60 ? '#F59E0B' 
              : '#EF4444'
              : 'var(--text-muted)'
          }}>
            {projectHealthMetrics.avgHealth !== null ? `${projectHealthMetrics.avgHealth}%` : '-'}
          </div>
        </div>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Healthy Projects</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10B981' }}>
            {projectHealthMetrics.healthy}
          </div>
        </div>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>At Risk</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#EF4444' }}>
            {projectHealthMetrics.atRisk}
          </div>
        </div>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid var(--border-color)',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Projects</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {projectHealthMetrics.total}
          </div>
        </div>
      </div>

      {/* Project Health Table */}
      {projectHealthMetrics.projects.length > 0 && (
        <ChartCard title="Project Health Overview" gridClass="grid-full" noPadding style={{ marginBottom: '1.5rem' }}>
          <table className="data-table" style={{ fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th className="number">Health Score</th>
                <th className="number">Checks Passed</th>
                <th>Approval</th>
              </tr>
            </thead>
            <tbody>
              {projectHealthMetrics.projects.map((p: any, idx: number) => (
                <tr key={idx}>
                  <td>{p.name}</td>
                  <td>
                    <span className={`badge badge-${p.status === 'Active' ? 'success' : p.status === 'On Hold' ? 'warning' : 'default'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="number">
                    {p.healthScore !== null ? (
                      <span style={{ 
                        color: p.healthScore >= 80 ? '#10B981' : p.healthScore >= 60 ? '#F59E0B' : '#EF4444',
                        fontWeight: 600
                      }}>
                        {p.healthScore}%
                      </span>
                    ) : '-'}
                  </td>
                  <td className="number">
                    {p.totalChecks > 0 ? `${p.passedChecks}/${p.totalChecks}` : '-'}
                  </td>
                  <td>
                    <span className={`badge badge-${
                      p.approvalStatus === 'Approved' ? 'success' : 
                      p.approvalStatus === 'Pending' ? 'warning' : 'default'
                    }`}>
                      {p.approvalStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      )}

      {/* Filter Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <InsightsFilterBar
          filters={pageFilters}
          onRemove={handleRemoveFilter}
          onClearAll={handleClearFilters}
          emptyMessage="Click any pie slice to filter the page"
        />
      </div>

      {/* Combined Percent + Pie cards (DRD, Workflow, SOP, QMP) */}
      <div className="dashboard-grid">
        {['drd', 'workflow', 'sop', 'qmp'].map((key, idx) => {
          const gauge = data.documentSignoffGauges?.[idx] || { name: key.charAt(0).toUpperCase() + key.slice(1), value: 0, color: '#40E0D0' };
          const pieData = (data.deliverableByStatus as Record<string, { name: string; value: number; color: string }[]>)[key] || [];
          return (
            <ChartCard key={key} title={`${gauge.name} Status`} gridClass="grid-quarter">
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <div style={{ flexShrink: 0, textAlign: 'center', padding: '0.75rem 0' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: gauge.color }}>{gauge.value}%</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{gauge.name} signoff</div>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <DeliverableStatusPie data={pieData} title="" height="100%" onSliceClick={(p) => handleFilterClick('status', p.name, p.name)} activeFilters={statusFilterValues} />
                </div>
              </div>
            </ChartCard>
          );
        })}

        {/* Deliverables Table */}
        <ChartCard title="Detailed Deliverable Matrix" gridClass="grid-full" noPadding>
          <TableCompareExport
            visualId="detailed-deliverable-matrix"
            visualTitle="Detailed Deliverable Matrix"
            data={filteredDeliverables}
          >
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
          </TableCompareExport>
        </ChartCard>
      </div>
    </div>
  );
}
