'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function CooWbsPage() {
  return (
    <RoleWorkstationShell role="coo" title="Executive WBS Lens" subtitle="Read/annotate schedule overview for executive escalation decisions.">
      <RoleScopedWbsWorkspace />
    </RoleWorkstationShell>
  );
}
