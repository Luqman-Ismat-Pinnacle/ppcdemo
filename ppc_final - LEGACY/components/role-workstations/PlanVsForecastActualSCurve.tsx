'use client';

/**
 * @fileoverview Lightweight S-curve summary card for plan vs forecast vs actual.
 */

import React from 'react';

export default function PlanVsForecastActualSCurve({
  planned,
  actual,
  forecast,
}: {
  planned: number;
  actual: number;
  forecast: number;
}) {
  const max = Math.max(1, planned, actual, forecast);
  const toPct = (value: number) => Math.round((value / max) * 100);
  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.75rem' }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.55rem' }}>Plan vs Forecast vs Actual</div>
      {[
        { label: 'Planned', value: planned, color: '#64748b' },
        { label: 'Actual', value: actual, color: '#2ed3c6' },
        { label: 'Forecast', value: forecast, color: '#f59e0b' },
      ].map((row) => (
        <div key={row.label} style={{ marginBottom: 7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.69rem', color: 'var(--text-muted)' }}>
            <span>{row.label}</span>
            <span>{row.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          </div>
          <div style={{ marginTop: 3, height: 7, borderRadius: 999, background: 'rgba(148,163,184,0.25)', overflow: 'hidden' }}>
            <div style={{ width: `${toPct(row.value)}%`, height: '100%', background: row.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

