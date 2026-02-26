'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function PclWbsPage() {
  return (
    <RoleWorkstationShell
      role="pcl"
      title="Portfolio WBS Risk Queue"
      subtitle="Cross-project schedule intervention and escalation controls."
    >
      <RoleScopedWbsWorkspace role="pcl" />
    </RoleWorkstationShell>
  );
}
