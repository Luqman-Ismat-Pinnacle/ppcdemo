'use client';

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';

type CommitmentRecord = {
  id: string;
  projectId: string;
  periodKey: string;
  ownerRole: string;
  commitmentText: string;
  followthroughText: string | null;
  status: string;
  updatedAt: string;
};

export default function SeniorManagerCommitmentsPage() {
  const [rows, setRows] = useState<CommitmentRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await fetch('/api/commitments?limit=200', { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && payload.success) {
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <RoleWorkstationShell role="senior_manager" title="Commitments" subtitle="Cross-project commitment tracking and follow-through review.">
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 120px 100px 1fr 120px', padding: '0.5rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Project</span><span>Period</span><span>Role</span><span>Commitment</span><span>Status</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.7rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No commitments found.</div>
        ) : rows.map((row) => (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '110px 120px 100px 1fr 120px', gap: '0.5rem', padding: '0.55rem 0.65rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem' }}>
            <span>{row.projectId}</span>
            <span>{row.periodKey}</span>
            <span>{row.ownerRole}</span>
            <span>{row.commitmentText}</span>
            <span>{row.status}</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
