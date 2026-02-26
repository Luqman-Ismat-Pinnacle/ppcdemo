'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import RoleWorkstationShell from '@/components/role-workstations/RoleWorkstationShell';
import { getWbsCapabilities } from '@/lib/wbs-role-adapter';

export default function PcaWbsPage() {
  const capabilities = useMemo(() => getWbsCapabilities('pca'), []);
  const items = [
    ['Edit Structure', capabilities.canEditStructure],
    ['Edit Dependencies', capabilities.canEditDependencies],
    ['Edit Progress', capabilities.canEditProgress],
    ['Edit Assignments', capabilities.canEditAssignments],
    ['Annotate', capabilities.canAnnotate],
    ['Escalate', capabilities.canEscalate],
  ] as const;

  return (
    <RoleWorkstationShell
      role="pca"
      title="WBS Workspace"
      subtitle="Assigned-project WBS controls for structure, mapping support, and progress updates."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.55rem' }}>
        {items.map(([label, enabled]) => (
          <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ marginTop: 3, fontSize: '0.84rem', fontWeight: 700, color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {enabled ? 'Enabled' : 'Read-only'}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: '0.6rem' }}>
        <Link href="/project-controls/wbs-gantt" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
          Open WBS/Gantt Engine
        </Link>
      </div>
    </RoleWorkstationShell>
  );
}
