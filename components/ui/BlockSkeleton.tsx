'use client';

import React from 'react';

export default function BlockSkeleton({
  rows = 3,
  showHeader = true,
}: {
  rows?: number;
  showHeader?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: '0.45rem' }}>
      {showHeader ? (
        <div className="skeleton-shimmer" style={{ width: 170, height: 12, borderRadius: 6 }} />
      ) : null}
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton-shimmer" style={{ height: 38, borderRadius: 10 }} />
      ))}
    </div>
  );
}
