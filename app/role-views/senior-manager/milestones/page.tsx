'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function SeniorManagerMilestonesPage() {
  return (
    <RoleWorkstationShell role="senior_manager" title="Milestones" subtitle="Milestone status and late-path indicators.">
      <EmbeddedAppSurface title="Overview" src="/insights/overview" />
    </RoleWorkstationShell>
  );
}
