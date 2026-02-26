'use client';

/**
 * @fileoverview PCA workstation home.
 */

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';

export default function PcaRoleHomePage() {
  return (
    <RoleWorkstationShell
      role="pca"
      title="PCA Workstation"
      subtitle="Assigned-project operations: mapping, data quality, MPP parser publish, and scoped WBS edits."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Open Upload + Parser', href: '/role-views/pca/plan-uploads', permission: 'uploadPlans' },
            { label: 'Open Mapping Queue', href: '/role-views/pca/mapping', permission: 'editMapping' },
            { label: 'Open Data Quality', href: '/role-views/pca/data-quality', permission: 'editMapping' },
            { label: 'Open WBS', href: '/role-views/pca/wbs', permission: 'editWbs' },
          ]}
        />
      )}
    >
      <div style={{ fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
        Workflows in this workstation are operational. Use the action bar to upload MPPs, run parser preview, publish updates,
        triage mapping/data quality issues, and edit assigned schedules.
      </div>
    </RoleWorkstationShell>
  );
}
