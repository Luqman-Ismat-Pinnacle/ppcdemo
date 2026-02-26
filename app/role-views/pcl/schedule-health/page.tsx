'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function PclScheduleHealthPage() {
  return (
    <RoleWorkstationShell role="pcl" title="Schedule Health" subtitle="Portfolio schedule health and risk indicators.">
      <EmbeddedAppSurface title="Overview" src="/insights/overview" />
    </RoleWorkstationShell>
  );
}
