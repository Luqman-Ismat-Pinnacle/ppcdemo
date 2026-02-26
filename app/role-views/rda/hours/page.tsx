'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function RdaHoursPage() {
  return (
    <RoleWorkstationShell role="rda" title="Hours" subtitle="Task-level hours and efficiency lane for assigned work.">
      <EmbeddedAppSurface title="Tasks" src="/insights/tasks" />
    </RoleWorkstationShell>
  );
}
