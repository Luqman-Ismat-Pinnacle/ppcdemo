'use client';

/**
 * @fileoverview Role views index for Phase 7 rollout.
 *
 * Establishes the canonical entrypoint for role-specific dashboards.
 */

import React from 'react';
import Link from 'next/link';

const ROLE_VIEWS = [
  { title: 'Project Lead', href: '/role-views/project-lead', status: 'Active (Phase 7.1)' },
  { title: 'PCA Mapping Workspace', href: '/role-views/pca-workspace', status: 'Planned (Phase 7.2)' },
  { title: 'PCL Exception View', href: '/role-views/pcl-exceptions', status: 'Planned (Phase 7.3)' },
  { title: 'Senior Manager', href: '/role-views/senior-manager', status: 'Planned (Phase 7.4)' },
  { title: 'COO + AI Q&A', href: '/role-views/coo', status: 'Planned (Phase 7.5)' },
  { title: 'Client Portal', href: '/role-views/client-portal', status: 'Planned (Phase 7.6)' },
] as const;

export default function RoleViewsIndexPage() {
  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Role Views</h1>
        <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.86rem' }}>
          Phase 7 rollout hub for role-specific workspaces and decision views.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
        {ROLE_VIEWS.map((role) => (
          <Link
            key={role.href}
            href={role.href}
            style={{
              padding: '0.9rem',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div style={{ fontSize: '0.98rem', fontWeight: 700 }}>{role.title}</div>
            <div style={{ marginTop: '0.35rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{role.status}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
