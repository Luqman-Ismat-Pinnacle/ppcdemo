'use client';

/**
 * @fileoverview Reusable same-origin embedded surface for workstation routes.
 */

import React from 'react';

export default function EmbeddedAppSurface({
  title,
  src,
  height = 820,
}: {
  title: string;
  src: string;
  height?: number;
}) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
      <iframe title={title} src={src} style={{ width: '100%', height, border: 'none' }} />
    </div>
  );
}
