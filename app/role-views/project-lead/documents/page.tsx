'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function ProjectLeadDocumentsPage() {
  return (
    <RoleWorkstationShell role="project_lead" title="Project Documents" subtitle="Upload, version, and manage project documentation with signoff status.">
      <EmbeddedAppSurface title="Documentation" src="/project-management/documentation" />
    </RoleWorkstationShell>
  );
}
