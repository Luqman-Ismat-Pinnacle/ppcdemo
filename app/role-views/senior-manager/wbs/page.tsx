'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function SeniorManagerWbsPage() {
  return (
    <RoleWorkstationShell role="senior_manager" title="WBS Triage" subtitle="Read/annotate portfolio WBS lens for escalation decisions.">
      <RoleScopedWbsWorkspace />
    </RoleWorkstationShell>
  );
}
