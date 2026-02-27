'use client';

/**
 * @fileoverview Canonical WBS/Gantt entry.
 *
 * Uses role-scoped workstation wrappers to keep WBS access functional without
 * duplicating heavy renderer dependencies in this shell route.
 */

import React from 'react';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';
import { useRoleView } from '@/lib/role-view-context';

export default function WbsGanttPage() {
  const { activeRole } = useRoleView();

  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.85rem' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project Controls</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.45rem' }}>WBS / Gantt</h1>
        <div style={{ marginTop: '0.3rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Role-scoped schedule workspace with capability controls and workflow links.
        </div>
      </div>

      <RoleScopedWbsWorkspace role={activeRole.key} />
    </div>
  );
}
