'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function CooWbsPage() {
  return (
    <RoleWorkstationShell
      role="coo"
      title="Executive WBS Lens"
      subtitle="High-level schedule visibility with annotation/escalation support."
    >
      <RoleScopedWbsWorkspace role="coo" />
    </RoleWorkstationShell>
  );
}
