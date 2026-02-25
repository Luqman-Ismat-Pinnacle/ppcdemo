'use client';

import React from 'react';
import { METRIC_DEFINITIONS } from '@/lib/calculations/registry';

export default function MetricProvenanceIndexPage() {
  return (
    <div className="page-panel insights-page" style={{ padding: '1rem 0 2rem' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: 6 }}>Metric Provenance Index</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 14 }}>
        Canonical formulas and data sources used by KPI chips across the app.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {METRIC_DEFINITIONS.map(def => (
          <section
            key={def.id}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              background: 'var(--bg-card)',
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <strong>{def.label}</strong>
              <code style={{ fontSize: '0.72rem' }}>{def.id}</code>
            </div>
            <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
              <div>Expression: <code>{def.expression}</code></div>
              <div>Sources: {def.dataSources.join(', ')}</div>
              <div style={{ color: 'var(--text-muted)' }}>{def.notes}</div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
