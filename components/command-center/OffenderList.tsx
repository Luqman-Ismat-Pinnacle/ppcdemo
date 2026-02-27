'use client';

import React from 'react';

export type OffenderRow = {
  id: string;
  label: string;
  value: string | number;
  href?: string;
};

export default function OffenderList({
  rows,
  empty,
}: {
  rows: OffenderRow[];
  empty: string;
}) {
  if (!rows.length) {
    return <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{empty}</div>;
  }
  return (
    <div style={{ display: 'grid', gap: '0.25rem' }}>
      {rows.map((row) => (
        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.45rem', fontSize: '0.73rem' }}>
          {row.href ? (
            <a href={row.href} style={{ color: 'var(--text-primary)' }}>{row.label}</a>
          ) : (
            <span style={{ color: 'var(--text-primary)' }}>{row.label}</span>
          )}
          <span style={{ color: 'var(--text-secondary)' }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
