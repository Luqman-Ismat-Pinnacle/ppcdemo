'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { useData } from '@/lib/data-context';

export default function SeniorManagerDocumentsPage() {
  const { filteredData, data: fullData } = useData();
  const summary = useMemo(() => {
    const records = (filteredData?.projectDocumentRecords?.length ? filteredData.projectDocumentRecords : fullData?.projectDocumentRecords) || [];
    const pendingClient = records.filter((record) => {
      const status = String((record as unknown as Record<string, unknown>).status || '').toLowerCase();
      return status.includes('pending client');
    }).length;
    return { total: records.length, pendingClient };
  }, [filteredData?.projectDocumentRecords, fullData?.projectDocumentRecords]);

  return (
    <RoleWorkstationShell
      role="senior_manager"
      title="Documents"
      subtitle="Portfolio documentation completeness and client-signoff visibility."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.65rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Document Records</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800 }}>{summary.total}</div>
        </div>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pending Client Signoff</div>
          <div style={{ marginTop: 4, fontSize: '1.25rem', fontWeight: 800, color: summary.pendingClient > 0 ? '#F59E0B' : 'var(--text-primary)' }}>{summary.pendingClient}</div>
        </div>
      </div>
      <Link href="/insights/documents" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open Documents Insights</Link>
    </RoleWorkstationShell>
  );
}
