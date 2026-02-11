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
      className="page-panel"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: 'var(--pinnacle-teal, #40E0D0)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem',
          }}
        />
        <div style={{ color: 'var(--text-muted, #888)', fontSize: '0.9rem' }}>{message}</div>
      </div>
    </div>
  );
}
