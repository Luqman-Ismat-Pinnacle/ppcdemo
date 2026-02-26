'use client';

/**
 * @fileoverview PCA mapping workflow page.
 */

import React from 'react';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import EmbeddedAppSurface from '@/components/role-workstations/EmbeddedAppSurface';

export default function PcaMappingPage() {
  return (
    <RoleWorkstationShell
      role="pca"
      title="Mapping Queue"
      subtitle="Review, apply, or dismiss mapping suggestions on assigned projects."
    >
      <EmbeddedAppSurface title="PCA Mapping Workspace" src="/role-views/pca-workspace" />
    </RoleWorkstationShell>
  );
}
