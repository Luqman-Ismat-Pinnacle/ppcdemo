'use client';

/**
 * @fileoverview Client/project health grid for leadership workstations.
 */

import React from 'react';

type ClientHealthRow = {
  id: string;
  name: string;
  spi: number;
  cpi: number;
  variance: number;
  percentComplete: number;
};

export default function ClientHealthGrid({ rows }: { rows: ClientHealthRow[] }) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px 90px', gap: '0.4rem 0.55rem', padding: '0.5rem 0.65rem', fontSize: '0.68rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
        <span>Project</span><span>SPI</span><span>CPI</span><span>Variance</span><span>Complete</span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '0.7rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No rows in scope.</div>
      ) : rows.map((row) => (
        <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 80px 90px', gap: '0.4rem 0.55rem', padding: '0.5rem 0.65rem', fontSize: '0.74rem', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
          <span style={{ color: row.spi < 0.9 ? '#EF4444' : 'var(--text-secondary)' }}>{row.spi.toFixed(2)}</span>
          <span style={{ color: row.cpi < 0.9 ? '#EF4444' : 'var(--text-secondary)' }}>{row.cpi.toFixed(2)}</span>
          <span style={{ color: Math.abs(row.variance) > 20 ? '#EF4444' : 'var(--text-secondary)' }}>{row.variance}%</span>
          <span>{Math.round(row.percentComplete)}%</span>
        </div>
      ))}
    </div>
  );
}

