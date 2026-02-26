'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function SeniorManagerProjectsPage() {
  return (
    <RoleWorkstationShell role="senior_manager" title="Projects" subtitle="Portfolio project posture and key execution deltas.">
      <EmbeddedAppSurface title="Mo's Page" src="/insights/mos-page" />
    </RoleWorkstationShell>
  );
}
