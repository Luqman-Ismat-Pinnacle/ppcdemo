'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { getWbsCapabilities } from '@/lib/wbs-role-adapter';

export default function CooWbsPage() {
  const capabilities = useMemo(() => getWbsCapabilities('coo'), []);

  return (
    <RoleWorkstationShell
      role="coo"
      title="Executive WBS Lens"
      subtitle="High-level schedule visibility with annotation/escalation support."
    >
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        WBS scope: <strong>{capabilities.scope}</strong>. Editing is restricted for COO role; use annotate/escalate pathways for governance interventions.
      </div>
      <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open WBS/Gantt Engine</Link>
    </RoleWorkstationShell>
  );
}
