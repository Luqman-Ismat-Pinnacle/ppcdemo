'use client';

import React from 'react';

export default function CommandCenterSection({
  title,
  status,
  freshness,
  actions,
  children,
}: {
  title: string;
  status?: string | null;
  freshness?: string | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
      <div style={{ padding: '0.55rem 0.7rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-primary)', fontWeight: 700 }}>{title}</span>
          {status ? <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{status}</span> : null}
          {freshness ? <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{freshness}</span> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div style={{ padding: '0.65rem' }}>
        {children}
      </div>
    </section>
  );
}
