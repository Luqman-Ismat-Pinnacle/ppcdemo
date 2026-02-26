'use client';
import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function CooPeriodReviewPage() {
  return (
    <RoleWorkstationShell role="coo" title="Period Review" subtitle="Executive period review with portfolio and project deltas.">
      <EmbeddedAppSurface title="Mo's Page" src="/insights/mos-page" />
    </RoleWorkstationShell>
  );
}
