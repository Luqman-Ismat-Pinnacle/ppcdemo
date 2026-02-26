'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { getWbsCapabilities } from '@/lib/wbs-role-adapter';

export default function SeniorManagerWbsPage() {
  const capabilities = useMemo(() => getWbsCapabilities('senior_manager'), []);

  return (
    <RoleWorkstationShell
      role="senior_manager"
      title="WBS Portfolio Lens"
      subtitle="Read/annotate/escalate schedule operations across portfolio scope."
    >
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.8rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        WBS scope: <strong>{capabilities.scope}</strong>. Edit structure/dependencies/progress is restricted; annotations and escalation remain available.
      </div>
      <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Open WBS/Gantt Engine</Link>
    </RoleWorkstationShell>
  );
}
