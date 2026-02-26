'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';

export default function PclPlansMappingPage() {
  return (
    <RoleWorkstationShell
      role="pcl"
      title="Plans + Mapping Supervision"
      subtitle="Portfolio-level plan upload and mapping control surfaces."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Project Plans', href: '/project-controls/project-plans', permission: 'uploadPlans' },
            { label: 'PCA Mapping', href: '/role-views/pca/mapping', permission: 'editMapping' },
          ]}
        />
      )}
    >
      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        Use Project Plans for parser/publish actions and PCA Mapping for suggestion governance.
      </div>
    </RoleWorkstationShell>
  );
}
