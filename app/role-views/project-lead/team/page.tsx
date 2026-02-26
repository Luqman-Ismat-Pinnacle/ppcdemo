'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function ProjectLeadTeamPage() {
  return (
    <RoleWorkstationShell role="project_lead" title="Team" subtitle="Resource assignments and workload posture for owned projects.">
      <EmbeddedAppSurface title="Resourcing" src="/project-controls/resourcing" />
    </RoleWorkstationShell>
  );
}
