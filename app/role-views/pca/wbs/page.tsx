'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function PcaWbsPage() {
  return (
    <RoleWorkstationShell
      role="pca"
      title="WBS Workspace"
      subtitle="Assigned-project WBS controls for structure, mapping support, and progress updates."
    >
      <RoleScopedWbsWorkspace role="pca" />
    </RoleWorkstationShell>
  );
}
