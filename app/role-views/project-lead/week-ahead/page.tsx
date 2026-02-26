'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function ProjectLeadWeekAheadPage() {
  return (
    <RoleWorkstationShell role="project_lead" title="Week Ahead" subtitle="Upcoming work and execution queue from current task scope.">
      <EmbeddedAppSurface title="Tasks" src="/insights/tasks" />
    </RoleWorkstationShell>
  );
}
