'use client';

/**
 * @fileoverview PCA plan upload/parser/publish workstation route.
 */

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleWorkflowActionBar from '@/components/role-workstations/RoleWorkflowActionBar';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function PcaPlanUploadsPage() {
  return (
    <RoleWorkstationShell
      role="pca"
      title="Plan Uploads"
      subtitle="Operational MPP upload -> parser preview -> publish flow with full project plan controls."
      actions={(
        <RoleWorkflowActionBar
          actions={[
            { label: 'Upload + Parser + Publish', href: '/project-controls/project-plans', permission: 'publishPlans' },
            { label: 'Project Documents', href: '/role-views/project-lead/documents', permission: 'manageDocuments' },
          ]}
        />
      )}
    >
      <EmbeddedAppSurface title="Project Plans" src="/project-controls/project-plans" />
    </RoleWorkstationShell>
  );
}
