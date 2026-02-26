'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function RdaSchedulePage() {
  return (
    <RoleWorkstationShell role="rda" title="Schedule" subtitle="Limited schedule lane for task progress and status updates.">
      <RoleScopedWbsWorkspace />
    </RoleWorkstationShell>
  );
}
