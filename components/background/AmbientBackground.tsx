'use client';

/**
 * @fileoverview Lightweight animated ambient background keyed by active role lens.
 */

import React from 'react';
import { useRoleView } from '@/lib/role-view-context';

export default function AmbientBackground() {
  const { activeRole } = useRoleView();
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div className={`ambient-bg ${hidden ? 'is-paused' : ''}`} data-role={activeRole.key} aria-hidden>
      <span className="ambient-image" />
      <span className="ambient-blob ambient-blob-a" />
      <span className="ambient-blob ambient-blob-b" />
      <span className="ambient-blob ambient-blob-c" />
      <span className="ambient-vignette" />
      <span className="ambient-grid" />
    </div>
  );
}
