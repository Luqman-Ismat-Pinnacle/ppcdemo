'use client';

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';

export default function RdaHomePage() {
  return (
    <RoleWorkstationShell role="rda" title="RDA Workstation" subtitle="Task-level execution lane with hours, work queue, and schedule progress updates.">
      <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
        Use Hours, Work, and Schedule tabs for scoped execution updates.
      </div>
    </RoleWorkstationShell>
  );
}
