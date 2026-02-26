'use client';

/**
 * @fileoverview PCA role-scoped WBS page.
 */

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function PcaWbsPage() {
  return (
    <RoleWorkstationShell
      role="pca"
      title="PCA WBS Workspace"
      subtitle="Assigned-project schedule structure, dependency, and mapping support edits."
    >
      <RoleScopedWbsWorkspace />
    </RoleWorkstationShell>
  );
}
