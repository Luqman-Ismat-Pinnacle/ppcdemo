'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function PclResourcingPage() {
  return (
    <RoleWorkstationShell role="pcl" title="Resourcing" subtitle="Cross-project staffing and assignment posture.">
      <EmbeddedAppSurface title="Resourcing" src="/project-controls/resourcing" />
    </RoleWorkstationShell>
  );
}
