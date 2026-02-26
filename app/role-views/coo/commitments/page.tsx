'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function CooCommitmentsPage() {
  return (
    <RoleWorkstationShell role="coo" title="Commitments" subtitle="Executive view of portfolio commitments and follow-through risk.">
      <EmbeddedAppSurface title="Senior Manager Commitments" src="/role-views/senior-manager/commitments" height={760} />
    </RoleWorkstationShell>
  );
}
