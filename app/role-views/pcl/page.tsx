'use client';

/**
 * @fileoverview PCL command center workstation page.
 */

import React, { useEffect, useState } from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';

type ComplianceMatrixRow = {
  projectId: string;
  projectName: string;
  openIssues: number;
  overdueTasks: number;
  healthScore: number;
};

export default function PclHomePage() {
  const [rows, setRows] = useState<ComplianceMatrixRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await fetch('/api/compliance/matrix?limit=20', { cache: 'no-store' });
      const payload = await res.json().catch(() => ({}));
      if (!cancelled && res.ok && payload.success) {
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  return (
    <RoleWorkstationShell
      role="pcl"
      title="PCL Command Center"
      subtitle="Compliance posture, schedule exceptions, and portfolio intervention queue."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Exceptions', href: '/role-views/pcl/exceptions', permission: 'triageExceptions' },
            { label: 'Plans + Mapping', href: '/role-views/pcl/plans-mapping', permission: 'editMapping' },
            { label: 'WBS Risk Queue', href: '/role-views/pcl/wbs', permission: 'editWbs' },
          ]}
        />
      )}
    >
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px', padding: '0.5rem 0.7rem', fontSize: '0.68rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
          <span>Project</span><span>Open Issues</span><span>Overdue</span><span>Health</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '0.7rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No compliance rows returned.</div>
        ) : rows.map((row) => (
          <div key={row.projectId} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px', padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.76rem' }}>
            <span>{row.projectName}</span>
            <span>{row.openIssues}</span>
            <span>{row.overdueTasks}</span>
            <span>{row.healthScore}%</span>
          </div>
        ))}
      </div>
    </RoleWorkstationShell>
  );
}
