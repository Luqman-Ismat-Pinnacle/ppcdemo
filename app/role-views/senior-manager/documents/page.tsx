'use client';

import React, { useMemo } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export default function SeniorManagerDocumentsPage() {
  const { filteredData, data: fullData } = useData();

  const rows = useMemo(() => {
    const records = (filteredData?.projectDocumentRecords?.length ? filteredData.projectDocumentRecords : fullData?.projectDocumentRecords)
      || (filteredData?.projectDocuments?.length ? filteredData.projectDocuments : fullData?.projectDocuments)
      || [];
    return records.slice(0, 120).map((item) => {
      const row = asRecord(item);
      return {
        id: String(row.id || row.documentId || Math.random()),
        projectId: String(row.projectId || row.project_id || 'unknown'),
        documentName: String(row.documentName || row.name || row.fileName || row.file_name || 'Document'),
        status: String(row.status || row.documentStatus || 'unknown'),
        version: String(row.version || row.revision || '-'),
        updatedAt: String(row.updatedAt || row.updated_at || row.createdAt || row.created_at || ''),
      };
    });
  }, [filteredData?.projectDocumentRecords, filteredData?.projectDocuments, fullData?.projectDocumentRecords, fullData?.projectDocuments]);

  const summary = useMemo(() => ({
    total: rows.length,
    pendingClient: rows.filter((row) => row.status.toLowerCase().includes('pending client')).length,
    inReview: rows.filter((row) => row.status.toLowerCase().includes('review')).length,
  }), [rows]);

  return (
    <RoleWorkstationShell
      role="senior_manager"
      title="Documents"
      subtitle="Portfolio documentation completeness and client-signoff visibility."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Records in Scope</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.total}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pending Client</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: summary.pendingClient > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{summary.pendingClient}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>In Review</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.inReview}</div>
        </div>
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1.4fr 1fr 120px 130px 140px', padding: '0.5rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Document</span><span>Status</span><span>Version</span><span>Updated</span><span>Action</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No document records found.</div>
        ) : rows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '120px 1.4fr 1fr 120px 130px 140px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem' }}>
            <span>{row.projectId}</span>
            <span>{row.documentName}</span>
            <span>{row.status}</span>
            <span>{row.version}</span>
            <span>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : '-'}</span>
            <span style={{ color: 'var(--text-secondary)' }}>Open in Documents</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
