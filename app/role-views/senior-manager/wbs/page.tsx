'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function SeniorManagerWbsPage() {
  return (
    <RoleWorkstationShell
      role="senior_manager"
      title="WBS Portfolio Lens"
      subtitle="Read/annotate/escalate schedule operations across portfolio scope."
    >
      <RoleScopedWbsWorkspace role="senior_manager" />
    </RoleWorkstationShell>
  );
}
