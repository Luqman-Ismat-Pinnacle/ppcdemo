'use client';

/**
 * @fileoverview Shared role-scoped WBS workspace card.
 */

import React from 'react';
import Link from 'next/link';
import { getWbsCapabilities } from '@/lib/wbs-role-adapter';
import type { RoleViewKey } from '@/types/role-workstation';

const CAP_LABELS: Array<[keyof ReturnType<typeof getWbsCapabilities>, string]> = [
  ['canEditStructure', 'Edit Structure'],
  ['canEditDependencies', 'Edit Dependencies'],
  ['canEditProgress', 'Edit Progress'],
  ['canEditAssignments', 'Edit Assignments'],
  ['canAnnotate', 'Annotate'],
  ['canEscalate', 'Escalate'],
];

export default function RoleScopedWbsWorkspace({ role }: { role: RoleViewKey }) {
  const capabilities = getWbsCapabilities(role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.7rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
        Scope: <strong>{capabilities.scope}</strong>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.55rem' }}>
        {CAP_LABELS.map(([key, label]) => {
          const enabled = Boolean(capabilities[key]);
          return (
            <div key={label} style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-card)', padding: '0.6rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
              <div style={{ marginTop: 3, fontSize: '0.84rem', fontWeight: 700, color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {enabled ? 'Enabled' : 'Read-only'}
              </div>
            </div>
          );
        })}
      </div>
      <Link href="/shared/wbs-gantt-v2" style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
        Open WBS/Gantt Engine
      </Link>
    </div>
  );
}

