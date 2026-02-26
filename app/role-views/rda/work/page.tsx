'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function RdaWorkPage() {
  return (
    <RoleWorkstationShell role="rda" title="Work" subtitle="Current assigned work and execution progress view.">
      <EmbeddedAppSurface title="Project Health" src="/project-controls/project-health" />
    </RoleWorkstationShell>
  );
}
