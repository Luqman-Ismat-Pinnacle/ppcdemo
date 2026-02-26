'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function CooMilestonesPage() {
  return (
    <RoleWorkstationShell role="coo" title="Milestones" subtitle="Executive milestone health and cross-project schedule risk scan.">
      <EmbeddedAppSurface title="Overview" src="/insights/overview" />
    </RoleWorkstationShell>
  );
}
