'use client';

/**
 * @fileoverview Phase 7 role-view placeholder page.
 *
 * This route reserves the role view path and rollout intent while the full
 * implementation is in progress.
 */

import React from 'react';
import Link from 'next/link';

export default function RoleViewPlaceholderPage() {
  return (
    <div className="page-panel" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxWidth: 760 }}>
      <h1 style={{ margin: 0, fontSize: '1.45rem' }}>Role View In Progress</h1>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        This Phase 7 role workspace is reserved and queued for implementation in locked rollout order.
      </p>
      <div>
        <Link href="/role-views" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Back to role views</Link>
      </div>
    </div>
  );
}
