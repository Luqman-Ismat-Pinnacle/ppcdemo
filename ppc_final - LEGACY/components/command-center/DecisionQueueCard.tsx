'use client';

import React from 'react';

export default function DecisionQueueCard({
  title,
  detail,
  severity,
  age,
  actions,
}: {
  title: string;
  detail: string;
  severity?: 'info' | 'warning' | 'critical' | string;
  age?: string;
  actions?: Array<{ label: string; href: string }>;
}) {
  const color = severity === 'critical' ? '#EF4444' : severity === 'warning' ? '#F59E0B' : 'var(--text-primary)';
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, background: 'var(--bg-secondary)', padding: '0.55rem', display: 'grid', gap: '0.25rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{title}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{detail}</div>
      {age ? <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{age}</div> : null}
      {actions?.length ? (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {actions.map((action) => (
            <a key={action.label} href={action.href} style={{ fontSize: '0.67rem', color: 'var(--text-secondary)' }}>{action.label}</a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
