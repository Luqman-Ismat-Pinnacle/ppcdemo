'use client';

import React from 'react';
import RoleScopedWbsWorkspace from '@/components/role-workstations/RoleScopedWbsWorkspace';

export default function ClientPortalWbsPage() {
  return (
    <div className="page-panel" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client Portal</div>
        <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.42rem' }}>WBS Gantt</h1>
        <div style={{ marginTop: '0.25rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Client-safe schedule visibility with milestone and completion context.
        </div>
      </div>
      <RoleScopedWbsWorkspace role="client_portal" />
    </div>
  );
}
