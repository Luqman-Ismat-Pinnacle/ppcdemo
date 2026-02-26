'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function PclExceptionsNestedPage() {
  return (
    <RoleWorkstationShell role="pcl" title="Exceptions" subtitle="Acknowledge, resolve, or escalate operational exceptions.">
      <EmbeddedAppSurface title="PCL Exceptions" src="/role-views/pcl-exceptions" height={760} />
    </RoleWorkstationShell>
  );
}
