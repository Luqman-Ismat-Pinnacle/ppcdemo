'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function SeniorManagerDocumentsPage() {
  return (
    <RoleWorkstationShell role="senior_manager" title="Documents" subtitle="Portfolio documentation status, ownership, and signoff progress.">
      <EmbeddedAppSurface title="Documentation" src="/project-management/documentation" />
    </RoleWorkstationShell>
  );
}
