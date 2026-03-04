'use client';

/**
 * Inline container loading - shows a subtle loading state within a section.
 * Use instead of full-page PageLoader for per-container lazy loading.
 */

import React from 'react';

interface ContainerLoaderProps {
  message?: string;
  minHeight?: string | number;
}

export default function ContainerLoader({ message = 'Loading...', minHeight = 120 }: ContainerLoaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
        color: 'var(--text-muted)',
        fontSize: '0.8rem',
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.2)',
          borderTopColor: 'var(--pinnacle-teal)',
          animation: 'spin 0.75s linear infinite',
        }}
      />
      {message}
    </div>
  );
}
