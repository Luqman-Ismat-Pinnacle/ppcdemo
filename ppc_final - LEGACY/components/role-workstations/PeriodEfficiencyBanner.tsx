'use client';

/**
 * @fileoverview Compact period efficiency summary banner for executive role views.
 */

import React from 'react';

export default function PeriodEfficiencyBanner({
  health,
  spi,
  cpi,
  variancePct,
}: {
  health: number;
  spi: number;
  cpi: number;
  variancePct: number;
}) {
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem', display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Period Efficiency</span>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>Health: <strong>{Math.round(health)}%</strong></span>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>SPI: <strong>{spi.toFixed(2)}</strong></span>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>CPI: <strong>{cpi.toFixed(2)}</strong></span>
      <span style={{ fontSize: '0.78rem', color: Math.abs(variancePct) > 20 ? '#EF4444' : 'var(--text-primary)' }}>
        Hours Variance: <strong>{variancePct}%</strong>
      </span>
    </div>
  );
}

