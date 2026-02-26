'use client';

/**
 * @fileoverview Lightweight animated ambient background keyed by active role lens.
 */

import React from 'react';
import { useRoleView } from '@/lib/role-view-context';

export default function AmbientBackground() {
  const { activeRole } = useRoleView();

  return (
    <div className="ambient-bg" data-role={activeRole.key} aria-hidden>
      <span className="ambient-blob ambient-blob-a" />
      <span className="ambient-blob ambient-blob-b" />
      <span className="ambient-blob ambient-blob-c" />
      <span className="ambient-vignette" />
      <span className="ambient-grid" />
    </div>
  );
}
