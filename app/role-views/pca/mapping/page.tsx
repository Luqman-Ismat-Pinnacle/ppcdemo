'use client';

import React from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';

export default function PcaMappingPage() {
  return (
    <RoleWorkstationShell
      role="pca"
      title="Mapping Workflow"
      subtitle="Review, apply, and dismiss parser mapping suggestions with audit coverage."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Open Mapping Workspace', href: '/role-views/pca-workspace', permission: 'editMapping' },
            { label: 'Plan Uploads', href: '/role-views/pca/plan-uploads', permission: 'uploadPlans' },
          ]}
        />
      )}
    >
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Mapping actions are role-guarded and write audit events. Use the workspace for queue triage, confidence filtering, and bulk application.
        <div style={{ marginTop: 8 }}>
          <Link href="/role-views/pca-workspace" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            Open PCA Mapping Workspace
          </Link>
        </div>
      </div>
    </RoleWorkstationShell>
  );
}
