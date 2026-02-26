'use client';

/**
 * @fileoverview PCL plans and mapping oversight lane.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function PclPlansMappingPage() {
  const { filteredData, data: fullData } = useData();

  const rows = useMemo(() => {
    const projects = (filteredData?.projects?.length ? filteredData.projects : fullData?.projects) || [];
    const docs = (filteredData?.projectDocumentRecords?.length ? filteredData.projectDocumentRecords : fullData?.projectDocumentRecords)
      || (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments)
      || [];
    const hours = (filteredData?.hours?.length ? filteredData.hours : fullData?.hours) || [];

    const latestByProject = new Map<string, number>();
    for (const doc of docs) {
      const row = asRecord(doc);
      const projectId = String(row.projectId || row.project_id || '');
      if (!projectId) continue;
      const date = new Date(String(row.lastUploadedAt || row.last_uploaded_at || row.updatedAt || row.updated_at || row.createdAt || row.created_at || ''));
      if (!Number.isFinite(date.getTime())) continue;
      latestByProject.set(projectId, Math.max(latestByProject.get(projectId) || 0, date.getTime()));
    }

    const mappingByProject = new Map<string, { total: number; mapped: number }>();
    for (const hour of hours) {
      const row = asRecord(hour);
      const projectId = String(row.projectId || row.project_id || '');
      if (!projectId) continue;
      const rec = mappingByProject.get(projectId) || { total: 0, mapped: 0 };
      rec.total += 1;
      if (String(row.taskId || row.task_id || '').trim()) rec.mapped += 1;
      mappingByProject.set(projectId, rec);
    }

    return projects.map((project) => {
      const row = asRecord(project);
      const projectId = String(row.id || row.projectId || '');
      const latest = latestByProject.get(projectId) || null;
      const days = latest ? Math.floor((Date.now() - latest) / 86400000) : null;
      const mapping = mappingByProject.get(projectId) || { total: 0, mapped: 0 };
      const coverage = mapping.total > 0 ? Math.round((mapping.mapped / mapping.total) * 100) : 0;
      const unmapped = Math.max(0, mapping.total - mapping.mapped);
      return {
        projectId,
        projectName: String(row.name || row.projectName || projectId || 'Project'),
        customer: String(row.customer || row.customerName || row.customer_name || 'Unknown'),
        daysSinceUpload: days,
        coverage,
        unmapped,
      };
    });
  }, [filteredData?.hours, filteredData?.projectDocumentRecords, filteredData?.projectDocuments, filteredData?.projects, fullData?.hours, fullData?.projectDocumentRecords, fullData?.projectDocuments, fullData?.projects]);

  const summary = useMemo(() => {
    const totalUnmapped = rows.reduce((sum, row) => sum + row.unmapped, 0);
    const overduePlans = rows.filter((row) => row.daysSinceUpload == null || row.daysSinceUpload > 14).length;
    const avgCoverage = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length) : 0;
    return { totalUnmapped, overduePlans, avgCoverage, totalProjects: rows.length };
  }, [rows]);

  return (
    <RoleWorkstationShell
      role="pcl"
      title="Plans + Mapping Supervision"
      subtitle="Portfolio-level plan freshness and mapping coverage oversight."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Projects in Scope', value: summary.totalProjects },
          { label: 'Total Unmapped Hours', value: summary.totalUnmapped, danger: summary.totalUnmapped > 0 },
          { label: 'Plans Overdue (>14d)', value: summary.overduePlans, danger: summary.overduePlans > 0 },
          { label: 'Avg Mapping Coverage', value: `${summary.avgCoverage}%` },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.2rem', fontWeight: 800, color: card.danger ? '#EF4444' : 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 120px 120px 130px 140px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Customer</span><span>Upload Age</span><span>Coverage</span><span>Unmapped</span><span>Actions</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No projects available.</div>
        ) : rows.map((row) => (
          <div key={row.projectId} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 120px 120px 130px 140px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', alignItems: 'center' }}>
            <span>{row.projectName}</span>
            <span style={{ color: 'var(--text-secondary)' }}>{row.customer}</span>
            <span>{row.daysSinceUpload == null ? 'Never' : `${row.daysSinceUpload}d`}</span>
            <span>{row.coverage}%</span>
            <span>{row.unmapped}</span>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <Link href="/role-views/pca/plan-uploads" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Plans</Link>
              <Link href="/role-views/pca/mapping" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Mapping</Link>
            </div>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
