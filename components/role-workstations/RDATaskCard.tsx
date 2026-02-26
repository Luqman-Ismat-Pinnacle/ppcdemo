'use client';

/**
 * @fileoverview Compact RDA task card for daily work lanes.
 */

import React from 'react';

export default function RDATaskCard({
  title,
  due,
  progress,
}: {
  title: string;
  due: string;
  progress: number;
}) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem' }}>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-primary)', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginTop: 2 }}>Due: {due}</div>
      <div style={{ marginTop: 5, height: 6, borderRadius: 999, background: 'rgba(148,163,184,0.25)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, progress))}%`, height: '100%', background: 'var(--pinnacle-teal)' }} />
      </div>
    </div>
  );
}

