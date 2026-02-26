'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function ProjectLeadForecastPage() {
  return (
    <RoleWorkstationShell role="project_lead" title="Forecast" subtitle="Full forecast operations, scenario edits, and snapshot decisions.">
      <EmbeddedAppSurface title="Forecast" src="/project-management/forecast" />
    </RoleWorkstationShell>
  );
}
