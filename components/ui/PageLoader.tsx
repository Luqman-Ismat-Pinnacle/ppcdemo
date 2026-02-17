'use client';

/**
 * @fileoverview Full-page loading overlay shown while data loads.
 * Usage: if (isLoading) return <PageLoader message="Loading data..." />;
 */

import React from 'react';

interface PageLoaderProps {
  message?: string;
}

export default function PageLoader({ message = 'Loading data...' }: PageLoaderProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 19999,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        background: 'rgba(7, 10, 16, 0.2)',
        backdropFilter: 'blur(1px)',
        WebkitBackdropFilter: 'blur(1px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(0, 0, 0, 0.78)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 999,
          padding: '10px 14px',
          color: '#d1d5db',
          fontSize: '0.76rem',
          fontWeight: 600,
          boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: 'var(--pinnacle-teal)',
            animation: 'spin 0.75s linear infinite',
          }}
        />
        {message}
      </div>
    </div>
  );
}
