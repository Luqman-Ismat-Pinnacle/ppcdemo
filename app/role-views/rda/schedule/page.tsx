'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { getWbsCapabilities } from '@/lib/wbs-role-adapter';

export default function RdaSchedulePage() {
  const capabilities = useMemo(() => getWbsCapabilities('rda'), []);

  return (
    <RoleWorkstationShell role="rda" title="Schedule Lane" subtitle="Task-level schedule lane with limited progress updates.">
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        WBS scope: <strong>{capabilities.scope}</strong>. Progress updates are enabled; structural edits and dependency edits are restricted for RDA role.
      </div>
      <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open WBS/Gantt Engine</Link>
    </RoleWorkstationShell>
  );
}
