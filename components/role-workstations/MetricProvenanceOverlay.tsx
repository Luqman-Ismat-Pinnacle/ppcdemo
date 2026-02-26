'use client';

/**
 * @fileoverview Always-visible provenance overlay for role workstation metrics.
 */

import React from 'react';

export interface WorkstationMetricProvenance {
  metric: string;
  formulaId: string;
  formula: string;
  sources: string[];
  scope: string;
  window: string;
}

export default function MetricProvenanceOverlay({
  title = 'Metric Provenance',
  entries,
}: {
  title?: string;
  entries: WorkstationMetricProvenance[];
}) {
  if (!entries.length) return null;

  return (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-card)', padding: '0.65rem' }}>
      <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: '0.45rem' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.45rem' }}>
        {entries.map((entry) => (
          <div key={`${entry.metric}-${entry.formulaId}`} style={{ border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', padding: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', alignItems: 'center' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 700 }}>{entry.metric}</div>
              <span style={{ fontSize: '0.62rem', border: '1px solid var(--border-color)', borderRadius: 999, padding: '1px 7px', color: 'var(--text-muted)' }}>{entry.formulaId}</span>
            </div>
            <div style={{ marginTop: 3, fontSize: '0.67rem', color: 'var(--text-secondary)' }}>{entry.formula}</div>
            <div style={{ marginTop: 4, fontSize: '0.64rem', color: 'var(--text-muted)' }}>
              Sources: {entry.sources.join(', ')}
            </div>
            <div style={{ marginTop: 2, fontSize: '0.64rem', color: 'var(--text-muted)' }}>
              Scope: {entry.scope} | Window: {entry.window}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
