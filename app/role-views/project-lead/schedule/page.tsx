'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function ProjectLeadSchedulePage() {
  return (
    <RoleWorkstationShell
      role="project_lead"
      title="Schedule"
      subtitle="Embedded WBS with scoped schedule editing, progress, and dependency operations."
    >
      <RoleScopedWbsWorkspace />
    </RoleWorkstationShell>
  );
}
