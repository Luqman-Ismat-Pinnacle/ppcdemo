'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function RdaSchedulePage() {
  return (
    <RoleWorkstationShell role="rda" title="Schedule Lane" subtitle="Task-level schedule lane with limited progress updates.">
      <RoleScopedWbsWorkspace role="rda" />
    </RoleWorkstationShell>
  );
}
