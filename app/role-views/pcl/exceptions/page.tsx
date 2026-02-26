'use client';

import React from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';

export default function PclExceptionsPage() {
  return (
    <RoleWorkstationShell
      role="pcl"
      title="Exceptions"
      subtitle="Operational exception triage lane for acknowledgements, escalations, and closure."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Open Exception Queue', href: '/role-views/pcl-exceptions', permission: 'triageExceptions' },
            { label: 'Schedule Health', href: '/role-views/pcl/schedule-health', permission: 'viewPortfolioCompliance' },
          ]}
        />
      )}
    >
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Use the dedicated exception queue to action alerts and publish escalation events.
      </div>
      <Link href="/role-views/pcl-exceptions" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open PCL Exception Queue</Link>
    </RoleWorkstationShell>
  );
}
