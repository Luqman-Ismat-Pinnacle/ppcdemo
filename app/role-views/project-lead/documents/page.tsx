'use client';

/**
 * @fileoverview Project Lead documents workstation page.
 *
 * Exposes role-scoped document status and quick navigation into document ops.
 */

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function ProjectLeadDocumentsPage() {
  const { filteredData, data: fullData } = useData();

  const summary = useMemo(() => {
    const records = (filteredData?.projectDocumentRecords?.length
      ? filteredData.projectDocumentRecords
      : fullData?.projectDocumentRecords) || [];
    const byStatus = new Map<string, number>();
    records.forEach((record) => {
      const row = record as unknown as Record<string, unknown>;
      const status = String(row.status || 'Not Started');
      byStatus.set(status, (byStatus.get(status) || 0) + 1);
    });
    const total = records.length;
    return {
      total,
      notStarted: byStatus.get('Not Started') || 0,
      inProgress: byStatus.get('In Progress') || 0,
      pendingClient: byStatus.get('Pending Client') || 0,
      complete: byStatus.get('Complete') || 0,
    };
  }, [filteredData?.projectDocumentRecords, fullData?.projectDocumentRecords]);

  return (
    <RoleWorkstationShell
      role="project_lead"
      title="Documents Workspace"
      subtitle="Role-scoped project documentation workflow and signoff readiness."
      actions={(
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href="/project-management/documentation" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Open Documentation</Link>
          <Link href="/insights/documents" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Document Insights</Link>
        </div>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.65rem' }}>
        {[
          { label: 'Total Docs', value: summary.total },
          { label: 'Not Started', value: summary.notStarted },
          { label: 'In Progress', value: summary.inProgress },
          { label: 'Pending Client', value: summary.pendingClient },
          { label: 'Complete', value: summary.complete },
        ].map((card) => (
          <div key={card.label} style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{card.label}</div>
            <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>{card.value}</div>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
