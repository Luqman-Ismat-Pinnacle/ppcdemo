'use client';

import React from 'react';

export default function ClientRiskCard({
  name,
  projects,
  health,
  issue,
  trend,
}: {
  name: string;
  projects: number;
  health: number;
  issue?: string;
  trend?: string;
}) {
  const tone = health >= 80 ? '#10B981' : health >= 65 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem', display: 'grid', gap: '0.2rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{projects} projects</div>
      <div style={{ fontSize: '0.78rem', color: tone, fontWeight: 700 }}>Health {health}%</div>
      {issue ? <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{issue}</div> : null}
      {trend ? <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{trend}</div> : null}
    </div>
  );
}
