'use client';

/**
 * @fileoverview Canonical WBS/Gantt entry.
 *
 * Uses role-scoped workstation wrappers to keep WBS access functional without
 * duplicating heavy renderer dependencies in this shell route.
 */

import React from 'react';
import Link from 'next/link';
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

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
        <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          Role WBS Routes
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.45rem', padding: '0.7rem' }}>
          {[
            { label: 'PCL WBS Queue', href: '/role-views/pcl/wbs' },
            { label: 'PCA WBS Workspace', href: '/role-views/pca/wbs' },
            { label: 'Project Lead Schedule', href: '/role-views/project-lead/schedule' },
            { label: 'Senior Manager WBS', href: '/role-views/senior-manager/wbs' },
            { label: 'COO WBS Lens', href: '/role-views/coo/wbs' },
            { label: 'RDA Schedule Lane', href: '/role-views/rda/schedule' },
          ].map((item) => (
            <Link key={item.href} href={item.href} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.56rem 0.62rem', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.76rem', textDecoration: 'none' }}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
